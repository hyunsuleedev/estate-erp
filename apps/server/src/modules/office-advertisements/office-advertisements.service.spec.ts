import {
  OfficeAdvertisementsService,
  diffComparisonChanges,
  toComparisonSet,
} from './office-advertisements.service';

describe('OfficeAdvertisementsService', () => {
  const advertisement = {
    id: 'ad-1',
    naverArticleNo: 'N1',
    transactionType: 'sale',
    advertisedPrice: 320000,
    advertisedDeposit: null,
    advertisedMonthlyRent: null,
    listing: { transactionType: 'sale' },
  };

  const row = (articleNo: string, extra: Record<string, unknown> = {}) => ({
    id: `row-${articleNo}`,
    articleNo,
    isMine: false,
    isActive: true,
    price: 320000,
    deposit: null,
    monthlyRent: null,
    ranking: null,
    sameAddrCnt: null,
    floorInfo: '12/25',
    floorExposureMode: 'exact',
    ...extra,
  });

  function createService(storedRows: ReturnType<typeof row>[] = []) {
    const prisma: any = {
      listingAdvertisement: {
        findFirst: jest.fn().mockResolvedValue(advertisement),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      advertisementComparison: {
        // 첫 번째는 저장 전의 줄(만든 것 · 고친 것을 세려고), 두 번째는 저장 뒤의 전체 줄
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValue(storedRows),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      advertisementComparisonRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    prisma.listingAdvertisement.findMany.mockResolvedValue([]);
    prisma.$transaction = jest.fn(async (work: (tx: any) => unknown) =>
      work(prisma),
    );
    const notifications = { notify: jest.fn() };
    return {
      prisma,
      notifications,
      service: new OfficeAdvertisementsService(prisma, notifications as never),
    };
  }

  it('saves one advertisement’s comparison as a whole and records what the market looked like', async () => {
    const rows = [
      row('N1', { isMine: true, ranking: 3, price: 320000 }),
      row('C1', { ranking: 1, price: 315000 }),
      row('C2', { ranking: 2, price: 330000 }),
    ];
    const { prisma, service } = createService(rows);

    const result = await service.saveComparisons('office-1', {
      comparisons: [
        {
          listingAdvertisementId: 'ad-1',
          advertisements: [
            { articleNo: 'N1', ranking: 3, price: 320000 },
            { articleNo: 'C1', ranking: 1, price: 315000 },
            { articleNo: 'C2', ranking: 2, price: 330000 },
          ],
        },
      ],
    });

    // 한 광고의 저장은 한 트랜잭션이고(그 광고 줄에 줄을 세운다), 알림 묶기가 또 한 트랜잭션이다
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    // 비교 줄은 묶음이 아니라 내 광고에 바로 붙는다
    expect(prisma.advertisementComparison.upsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: {
          advertisementId_articleNo: { advertisementId: 'ad-1', articleNo: 'N1' },
        },
        // isMine은 읽어 온 그대로 저장한다. "바로 이 광고"인지는 저장하지 않는다
        create: expect.objectContaining({ advertisementId: 'ad-1', isMine: false }),
      }),
    );
    // 이번 목록에 없는 줄은 내려간 것이다
    expect(prisma.advertisementComparison.deleteMany).toHaveBeenCalledWith({
      where: { advertisementId: 'ad-1', articleNo: { notIn: ['N1', 'C1', 'C2'] } },
    });
    // 그때의 요약 한 줄
    expect(prisma.advertisementComparisonRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        advertisementId: 'ad-1',
        ownVisible: true,
        ownRanking: 3,
        totalCount: 3,
        ownPrice: 320000,
        lowestCompetitorAmount: 315000,
        lowerPricedCount: 1,
        signal: 'lower_price_competitor',
        // 첫 기록은 견줄 것이 없다
        changes: [],
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        comparisonsCreated: 1,
        rowsCreated: 3,
        errors: [],
      }),
    );
  });

  it('refuses a list that is missing my own article, repeats a row, or is shorter than the stated total', async () => {
    const { prisma, service } = createService();
    const result = await service.saveComparisons('office-1', {
      comparisons: [
        { listingAdvertisementId: 'ad-1', advertisements: [{ articleNo: 'C1' }] },
        {
          listingAdvertisementId: 'ad-1',
          advertisements: [{ articleNo: 'N1' }, { articleNo: 'N1' }],
        },
        {
          listingAdvertisementId: 'ad-1',
          totalCount: 5,
          advertisements: [{ articleNo: 'N1' }, { articleNo: 'C1' }],
        },
      ],
    });

    expect(result.errors.map((error) => error.message)).toEqual([
      expect.stringContaining('exact naverArticleNo'),
      expect.stringContaining('more than once'),
      expect.stringContaining('incomplete'),
    ]);
    // 틀린 건은 아무것도 바꾸지 않는다
    expect(prisma.advertisementComparison.upsert).not.toHaveBeenCalled();
    expect(prisma.advertisementComparison.deleteMany).not.toHaveBeenCalled();
    expect(prisma.advertisementComparisonRecord.create).not.toHaveBeenCalled();
  });

  it('marks what changed since the last record and sends one summary when the upload ends', async () => {
    const rows = [
      row('N1', { isMine: true, ranking: 4, price: 320000 }),
      row('C1', { ranking: 1, price: 315000 }),
    ];
    const { prisma, notifications, service } = createService(rows);
    prisma.advertisementComparisonRecord.findFirst.mockResolvedValue({
      ownVisible: true,
      ownRanking: 2,
      lowerPricedCount: 0,
      ownFloorExposure: 'exact',
      exactFloorCompetitorCount: 1,
    });
    prisma.advertisementComparisonRecord.findMany.mockResolvedValue([
      { id: 'record-2', advertisementId: 'ad-1', changes: ['cheaper_appeared', 'rank_changed'] },
    ]);

    const result = await service.saveComparisons('office-1', {
      comparisons: [
        {
          listingAdvertisementId: 'ad-1',
          advertisements: [{ articleNo: 'N1' }, { articleNo: 'C1' }],
        },
      ],
    });

    expect(
      prisma.advertisementComparisonRecord.create.mock.calls[0][0].data.changes,
    ).toEqual(['cheaper_appeared', 'rank_changed']);
    // 아직 알리지 않은 변화 중 알릴 것만 고른다
    expect(prisma.advertisementComparisonRecord.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        notifiedAt: null,
        changes: {
          hasSome: ['cheaper_appeared', 'own_hidden', 'floor_disadvantage'],
        },
      },
      select: { id: true, advertisementId: true, changes: true },
    });
    // 보낸 뒤에 "알렸음"으로 표시한다 (먼저 표시하면 실패했을 때 다시 나가지 않는다)
    expect(prisma.advertisementComparisonRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['record-2'] } },
      data: { notifiedAt: expect.any(Date) },
    });
    expect(notifications.notify.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.advertisementComparisonRecord.updateMany.mock.invocationCallOrder[0],
    );
    // 같은 사무소의 올리기 둘이 동시에 끝나도 한 번만 알린다
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        officeId: 'office-1',
        title: '네이버 비교에서 달라진 광고 1건',
        content: '더 싼 광고가 생김 1건',
      }),
    );
    expect(result.changesNotified).toBe(1);
  });

  it('puts the change back for the next upload when the notification cannot be sent', async () => {
    const { prisma, notifications, service } = createService([
      row('N1', { isMine: true, ranking: 2 }),
    ]);
    prisma.advertisementComparisonRecord.findMany.mockResolvedValue([
      { id: 'record-1', advertisementId: 'ad-1', changes: ['own_hidden'] },
    ]);
    notifications.notify.mockRejectedValue(new Error('realtime down'));

    const result = await service.saveComparisons('office-1', {
      comparisons: [{ listingAdvertisementId: 'ad-1', advertisements: [{ articleNo: 'N1' }] }],
    });

    // 비교는 저장됐으므로 올리기는 실패가 아니다
    expect(result.errors).toEqual([]);
    expect(result.changesNotified).toBe(0);
    // "알렸음" 표시를 하지 않는다 — 다음 올리기가 끝날 때 다시 묶여 나간다
    expect(prisma.advertisementComparisonRecord.updateMany).not.toHaveBeenCalled();

    // 변화 목록을 읽다가 실패해도 마찬가지다 (표시가 먼저 남는 단계가 없다)
    prisma.advertisementComparisonRecord.findMany.mockRejectedValue(new Error('db hiccup'));
    const again = await service.saveComparisons('office-1', {
      comparisons: [{ listingAdvertisementId: 'ad-1', advertisements: [{ articleNo: 'N1' }] }],
    });
    expect(again.errors).toEqual([]);
    expect(prisma.advertisementComparisonRecord.updateMany).not.toHaveBeenCalled();
  });

  it('does not notify when nothing worth an alert changed', async () => {
    const { notifications, service } = createService([
      row('N1', { isMine: true, ranking: 1 }),
    ]);
    await service.saveComparisons('office-1', {
      comparisons: [{ listingAdvertisementId: 'ad-1', advertisements: [{ articleNo: 'N1' }] }],
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('reads changes between two records', () => {
    const base = {
      ownVisible: true,
      ownRanking: 3,
      lowerPricedCount: 0,
      ownFloorExposure: 'band',
      exactFloorCompetitorCount: 0,
    };
    expect(diffComparisonChanges(null, base)).toEqual([]);
    expect(diffComparisonChanges(base, base)).toEqual([]);
    expect(diffComparisonChanges(base, { ...base, ownVisible: false })).toEqual([
      'own_hidden',
    ]);
    expect(
      diffComparisonChanges({ ...base, ownVisible: false }, base),
    ).toEqual(['own_restored']);
    expect(
      diffComparisonChanges({ ...base, lowerPricedCount: 2 }, base),
    ).toEqual(['cheaper_gone']);
    expect(
      diffComparisonChanges(base, { ...base, exactFloorCompetitorCount: 2 }),
    ).toEqual(['floor_disadvantage']);
    // 이미 불리했으면 다시 알리지 않는다
    expect(
      diffComparisonChanges(
        { ...base, exactFloorCompetitorCount: 2 },
        { ...base, exactFloorCompetitorCount: 3 },
      ),
    ).toEqual([]);
  });

  it('builds the comparison set with my row first and no set when never compared', () => {
    expect(toComparisonSet('N1', [], null)).toBeNull();
    const observedAt = new Date('2026-11-18T00:00:00Z');
    const set = toComparisonSet(
      'N1',
      [row('C1', { ranking: 1 }), row('N1', { isMine: true, ranking: 3 })] as never,
      observedAt,
    );
    expect(set?.observedAt).toBe(observedAt);
    expect(set?.ownAdvertisement?.articleNo).toBe('N1');
    expect(set?.advertisements.map((item) => item.articleNo)).toEqual(['N1', 'C1']);

    // 재광고로 번호가 N1 → N2가 됐다: 받아 둔 비교의 N2 줄이 내 광고다 (자기 자신과 견주지 않는다)
    const stored = [
      row('N2', { ranking: 2 }),
      row('N1', { isMine: true, ranking: 4 }),
      row('C1', { ranking: 1 }),
    ] as never;
    const readvertised = toComparisonSet('N2', stored, observedAt);
    expect(readvertised?.ownAdvertisement).toEqual(
      expect.objectContaining({ articleNo: 'N2', isMine: true }),
    );
    expect(
      readvertised?.advertisements.filter((item) => !item.isMine).map((item) => item.articleNo),
    ).toEqual(['C1']);

    // 번호를 잘못 적었다가 바로잡았다: 옛 번호 W는 원래 남의 광고였고, 바로잡은 뒤에는 경쟁 광고로 돌아간다
    const corrected = toComparisonSet('N1', [row('W', { ranking: 1 }), row('N1', { ranking: 2 })] as never, observedAt);
    expect(corrected?.ownAdvertisement?.articleNo).toBe('N1');
    expect(
      corrected?.advertisements.filter((item) => !item.isMine).map((item) => item.articleNo),
    ).toEqual(['W']);
    // 번호 W였을 때는 W가 내 줄이었다 — 같은 저장 값에서 번호에 따라 달라진다
    expect(
      toComparisonSet('W', [row('W', { ranking: 1 }), row('N1', { ranking: 2 })] as never, observedAt)
        ?.advertisements.filter((item) => item.isMine).map((item) => item.articleNo),
    ).toEqual(['W']);

    // 다중 계정 사무소: 다른 계정의 활성 광고 번호(N-SISTER)도 자동으로 isMine=true로 잡힌다
    const sister = toComparisonSet(
      'N1',
      [row('N1', { ranking: 1 }), row('N-SISTER', { ranking: 2 }), row('C1', { ranking: 3 })] as never,
      observedAt,
      new Set(['N1', 'N-SISTER']),
    );
    expect(sister?.advertisements.filter((item) => item.isMine).map((item) => item.articleNo)).toEqual([
      'N1',
      'N-SISTER',
    ]);
  });
});
