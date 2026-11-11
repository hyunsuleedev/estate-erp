import { ExternalListingsService } from './external-listings.service';

describe('ExternalListingsService', () => {
  function createService() {
    const prisma = {
      externalListingGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      externalListing: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      externalListingSnapshotSession: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      site: {
        findFirst: jest.fn(),
      },
      officeAdvertisement: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
      run(prisma),
    );

    return {
      prisma,
      service: new ExternalListingsService(prisma as never),
    };
  }

  it('adds the latest own-ad publication date and ranking to each group', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        transactionType: 'sale',
        mainExternalListing: {
          ranking: 8,
          verificationTypeCode: 'OWNER',
        },
        listings: [
          {
            id: 'listing-1',
            source: 'naver',
            articleNo: '100',
            price: 210000,
            deposit: null,
            monthlyRent: null,
            transactionType: 'sale',
            articleConfirmYmd: '20260710',
            verificationTypeCode: 'OWNER',
            ranking: 8,
            seango: false,
            epju: false,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      {
        source: 'naver',
        articleNo: '100',
        articleConfirmYmd: '20260721',
        ranking: 2,
      },
    ]);

    const [group] = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(group).toMatchObject({
      id: 'group-1',
      ownAdvertisementYmd: '20260721',
      offerRanking: 2,
      ownerVerified: true,
    });
    expect(prisma.officeAdvertisement.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isMine: true,
        isActive: true,
        articleNo: { in: ['100'] },
      },
      select: {
        articleNo: true,
        articleConfirmYmd: true,
        ranking: true,
      },
    });
  });

  it('keeps the demo ranking when no own advertisement is linked', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-demo',
        transactionType: 'sale',
        mainExternalListing: {
          ranking: 4,
          verificationTypeCode: null,
        },
        listings: [
          {
            id: 'listing-demo',
            source: 'naver',
            articleNo: 'demo-1',
            price: 180000,
            deposit: null,
            monthlyRent: null,
            transactionType: 'sale',
            articleConfirmYmd: '20260710',
            verificationTypeCode: null,
            ranking: 4,
            seango: false,
            epju: false,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([]);

    const [group] = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(group).toMatchObject({
      id: 'group-demo',
      ownAdvertisementYmd: null,
      offerRanking: 4,
    });
  });

  it('classifies groups as new, added, or existing against the latest collection session', async () => {
    const { prisma, service } = createService();
    const sessionStartedAt = new Date('2026-07-31T09:00:00.000Z');
    const beforeSession = new Date('2026-07-30T09:00:00.000Z');
    const duringSession = new Date('2026-07-31T09:05:00.000Z');
    const listingBase = {
      source: 'naver',
      price: 180000,
      deposit: null,
      monthlyRent: null,
      transactionType: 'sale',
      articleConfirmYmd: '20260731',
      verificationTypeCode: null,
      ranking: null,
      seango: false,
      epju: false,
    };

    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-new',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: duringSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-new',
            articleNo: 'new-1',
            firstSeenAt: duringSession,
          },
        ],
        _count: { listings: 1 },
      },
      {
        id: 'group-added',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: beforeSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-old-sibling',
            articleNo: 'old-1',
            firstSeenAt: beforeSession,
          },
          {
            ...listingBase,
            id: 'listing-added',
            articleNo: 'added-1',
            firstSeenAt: duringSession,
          },
        ],
        _count: { listings: 2 },
      },
      {
        id: 'group-existing',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: beforeSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-existing',
            articleNo: 'existing-1',
            firstSeenAt: beforeSession,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.externalListingSnapshotSession.findMany.mockResolvedValue([
      {
        siteId: 'site-1',
        transactionType: 'sale',
        startedAt: sessionStartedAt,
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([]);

    const groups = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(groups.map((group) => [group.id, group.discoveryStatus])).toEqual([
      ['group-new', 'new'],
      ['group-added', 'added'],
      ['group-existing', 'existing'],
    ]);
    expect(
      prisma.externalListingSnapshotSession.findMany,
    ).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        status: { in: ['active', 'completed'] },
        OR: [{ siteId: 'site-1', transactionType: 'sale' }],
      },
      select: {
        siteId: true,
        transactionType: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  });

  it('bases price change display on the completion before the latest snapshot', async () => {
    const { prisma, service } = createService();
    const group = {
      id: 'group-1',
      siteId: 'site-1',
      transactionType: 'sale',
      firstSeenAt: new Date('2026-10-01T00:00:00.000Z'),
      mainExternalListing: null,
      listings: [],
      _count: { listings: 0 },
    };
    prisma.externalListingGroup.findMany.mockResolvedValue([group]);
    const previousCompletedAt = new Date('2026-11-02T00:10:00.000Z');
    const session = {
      siteId: 'site-1',
      transactionType: 'sale',
    };

    prisma.externalListingSnapshotSession.findMany.mockResolvedValueOnce([
      {
        ...session,
        startedAt: new Date('2026-11-03T00:00:00.000Z'),
        completedAt: null,
      },
      {
        ...session,
        startedAt: new Date('2026-11-02T00:00:00.000Z'),
        completedAt: previousCompletedAt,
      },
      {
        ...session,
        startedAt: new Date('2026-11-01T00:00:00.000Z'),
        completedAt: new Date('2026-11-01T00:10:00.000Z'),
      },
    ]);
    const [withHistory] = await service.findAllGroups('office-1', {});
    expect(withHistory.priceChangeSince).toEqual(previousCompletedAt);

    // 비교할 이전 완료 스냅샷이 없으면 닫기 결과처럼 변경으로 보지 않는다.
    prisma.externalListingSnapshotSession.findMany.mockResolvedValueOnce([
      {
        ...session,
        startedAt: new Date('2026-11-02T00:00:00.000Z'),
        completedAt: previousCompletedAt,
      },
    ]);
    const [baseline] = await service.findAllGroups('office-1', {});
    expect(baseline.priceChangeSince).toBeNull();
  });

  it('stores a trimmed ho string without resolving a Unit', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      siteId: 'site-1',
    });
    prisma.externalListingGroup.update.mockResolvedValue({
      id: 'group-1',
      ho: '1503호',
    });

    await service.updateGroup('group-1', 'office-1', { ho: ' 1503호 ' });

    expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { ho: '1503호' },
      include: {
        site: true,
        mainExternalListing: true,
      },
    });
  });

  it('rejects the removed matched status', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      siteId: 'site-1',
    });

    await expect(
      service.updateGroup('group-1', 'office-1', { status: 'matched' }),
    ).rejects.toThrow('Invalid status');
  });

  describe('batchUpsert', () => {
    const startedAt = new Date('2026-11-03T00:00:00.000Z');
    const earlier = new Date('2026-11-01T00:00:00.000Z');
    const previousCompletedAt = new Date('2026-11-02T00:00:00.000Z');
    const session = {
      id: 'session-1',
      siteId: 'site-1',
      transactionType: 'sale',
      startedAt,
    };

    function existing(
      articleNo: string,
      groupId: string,
      overrides: {
        price?: number | null;
        previousPrice?: number | null;
        priceChangedAt?: Date | null;
        siteId?: string;
        lastSeenAt?: Date;
        mainArticleNo?: string;
      } = {},
    ) {
      return {
        id: `listing-${articleNo}`,
        articleNo,
        groupId,
        price: overrides.price ?? 100000,
        deposit: null,
        monthlyRent: null,
        previousPrice: overrides.previousPrice ?? null,
        previousDeposit: null,
        previousMonthlyRent: null,
        priceChangedAt: overrides.priceChangedAt ?? null,
        group: {
          siteId: overrides.siteId ?? 'site-1',
          transactionType: 'sale',
          lastSeenAt: overrides.lastSeenAt ?? earlier,
          mainExternalListing: { articleNo: overrides.mainArticleNo ?? '100' },
        },
      };
    }

    function setup(existingListings: ReturnType<typeof existing>[] = []) {
      const context = createService();
      const { prisma } = context;
      // id로 찾으면 잠근 세션, 아니면 직전 완료 스냅샷 조회다.
      prisma.externalListingSnapshotSession.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) =>
          where.id ? session : { completedAt: previousCompletedAt },
      );
      prisma.externalListing.findMany.mockResolvedValue(existingListings);
      prisma.externalListing.create.mockImplementation(
        async ({ data }: { data: { articleNo: string } }) => ({
          id: `listing-${data.articleNo}`,
        }),
      );
      prisma.externalListing.update.mockResolvedValue({});
      prisma.externalListingGroup.create.mockResolvedValue({ id: 'group-new' });
      prisma.externalListingGroup.update.mockResolvedValue({});
      return context;
    }

    const group = (representativeArticleNo: string, ...articleNos: string[]) => ({
      representativeArticleNo,
      listings: articleNos.map((articleNo) => ({ articleNo, price: 100000 })),
    });

    it('keeps the same group and follows the new representative when it changes', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1'),
        existing('102', 'group-1'),
      ]);

      const result = await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('103', '103', '101', '102')],
      });

      expect(prisma.externalListingGroup.create).not.toHaveBeenCalled();
      expect(prisma.externalListing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          articleNo: '103',
          groupId: 'group-1',
          representativeArticleNo: '103',
        }),
      });
      expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: expect.objectContaining({
          mainExternalListingId: 'listing-103',
        }),
      });
      expect(result).toMatchObject({
        received: 3,
        created: 1,
        updated: 2,
        groupsCreated: 0,
        groupsReused: 1,
      });
    });

    it('creates a group with hints from the representative when nothing overlaps', async () => {
      const { prisma, service } = setup();

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'manual',
        groups: [
          {
            representativeArticleNo: 'ad-1',
            listings: [{ articleNo: 'ad-1', ho: ' 1503호 ' }],
          },
        ],
      });

      expect(prisma.externalListingGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          siteId: 'site-1',
          transactionType: 'sale',
          ho: '1503호',
          status: 'verified',
        }),
      });
    });

    it('records the previous price only when the price changes', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1', { price: 90000 }),
        existing('102', 'group-1', { price: 100000 }),
      ]);

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('101', '101', '102')],
      });

      const updates = prisma.externalListing.update.mock.calls.map(
        ([call]: [{ data: Record<string, unknown> }]) => call,
      );
      expect(updates[0].data).toMatchObject({
        price: 100000,
        previousPrice: 90000,
        priceChangedAt: expect.any(Date),
      });
      expect(updates[1].data).not.toHaveProperty('priceChangedAt');
    });

    it('keeps the last completed price when a cancelled input already changed it', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1', {
          price: 110000,
          previousPrice: 100000,
          priceChangedAt: new Date('2026-11-02T12:00:00.000Z'),
        }),
      ]);

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [
          {
            representativeArticleNo: '101',
            listings: [{ articleNo: '101', price: 120000 }],
          },
        ],
      });

      expect(prisma.externalListing.update.mock.calls[0][0].data).toMatchObject({
        price: 120000,
        previousPrice: 100000,
        priceChangedAt: expect.any(Date),
      });
    });

    it('clears the price change when the price returns to the last completed value', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1', {
          price: 110000,
          previousPrice: 100000,
          priceChangedAt: new Date('2026-11-02T12:00:00.000Z'),
        }),
      ]);

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('101', '101')],
      });

      expect(prisma.externalListing.update.mock.calls[0][0].data).toMatchObject({
        price: 100000,
        previousPrice: null,
        priceChangedAt: null,
      });
    });

    it('overwrites a price change recorded before the last completed snapshot', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1', {
          price: 90000,
          previousPrice: 80000,
          priceChangedAt: earlier,
        }),
      ]);

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('101', '101')],
      });

      expect(prisma.externalListing.update.mock.calls[0][0].data).toMatchObject({
        price: 100000,
        previousPrice: 90000,
      });
    });

    it('locks the session before reading existing listings', async () => {
      const { prisma, service } = setup();

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('101', '101')],
      });

      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.externalListing.findMany.mock.invocationCallOrder[0],
      );
    });

    it.each([
      ['대표가 listings에 없음', [group('999', '101')], [], '대표 999'],
      ['같은 번호가 두 묶음에 있음', [group('101', '101'), group('102', '102', '101')], [], '두 번'],
      [
        '묶음 하나가 기존 그룹 둘과 겹침',
        [group('101', '101', '201')],
        [existing('101', 'group-1'), existing('201', 'group-2')],
        '둘 이상',
      ],
      [
        '묶음 둘이 기존 그룹 하나와 겹침',
        [group('101', '101'), group('102', '102')],
        [existing('101', 'group-1'), existing('102', 'group-1')],
        '기존 그룹 하나',
      ],
      [
        '다른 단지의 광고와 겹침',
        [group('101', '101')],
        [existing('101', 'group-1', { siteId: 'site-2' })],
        '다른 단지',
      ],
      [
        '같은 스냅샷에서 다른 대표로 이미 입력됨',
        [group('101', '101')],
        [existing('101', 'group-1', { lastSeenAt: startedAt, mainArticleNo: '102' })],
        '기존 그룹 하나',
      ],
    ])('rejects without writing: %s', async (_name, groups, listings, message) => {
      const { prisma, service } = setup(listings);

      await expect(
        service.batchUpsert('office-1', {
          sessionId: 'session-1',
          source: 'agent',
          groups,
        }),
      ).rejects.toThrow(message);

      expect(prisma.externalListing.create).not.toHaveBeenCalled();
      expect(prisma.externalListing.update).not.toHaveBeenCalled();
      expect(prisma.externalListingGroup.create).not.toHaveBeenCalled();
    });

    it('accepts a retry of the same group in the same snapshot', async () => {
      const { prisma, service } = setup([
        existing('101', 'group-1', { lastSeenAt: startedAt, mainArticleNo: '101' }),
      ]);

      await service.batchUpsert('office-1', {
        sessionId: 'session-1',
        source: 'agent',
        groups: [group('101', '101')],
      });

      expect(prisma.externalListing.update).toHaveBeenCalledTimes(1);
    });

    it('requires an active session', async () => {
      const { prisma, service } = setup();
      prisma.externalListingSnapshotSession.findFirst.mockReset();
      prisma.externalListingSnapshotSession.findFirst.mockResolvedValue(null);

      await expect(
        service.batchUpsert('office-1', {
          sessionId: 'closed',
          source: 'agent',
          groups: [group('101', '101')],
        }),
      ).rejects.toThrow('active session not found');
    });
  });

  describe('open snapshot edits', () => {
    const startedAt = new Date('2026-11-03T00:00:00.000Z');
    const earlier = new Date('2026-11-01T00:00:00.000Z');
    const entered = new Date('2026-11-03T00:05:00.000Z');
    const session = {
      id: 'session-1',
      siteId: 'site-1',
      transactionType: 'sale',
      startedAt,
    };

    function setup() {
      const context = createService();
      context.prisma.externalListingSnapshotSession.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) =>
          where.id ? session : { completedAt: earlier },
      );
      context.prisma.externalListing.update.mockImplementation(
        async ({ where }: { where: { id: string } }) => ({ id: where.id }),
      );
      return context;
    }

    function storedListing(overrides: Record<string, unknown> = {}) {
      return {
        id: 'listing-1',
        groupId: 'group-1',
        isActive: true,
        firstSeenAt: earlier,
        lastSeenAt: entered,
        price: 100000,
        deposit: null,
        monthlyRent: null,
        previousPrice: null,
        previousDeposit: null,
        previousMonthlyRent: null,
        priceChangedAt: null,
        group: {
          siteId: 'site-1',
          transactionType: 'sale',
          mainExternalListing: { id: 'listing-2', lastSeenAt: entered },
        },
        ...overrides,
      };
    }

    describe('addSnapshotListing', () => {
      function setupGroup(lastSeenAt = entered) {
        const context = setup();
        context.prisma.externalListingGroup.findFirst.mockResolvedValue({
          id: 'group-1',
          siteId: 'site-1',
          transactionType: 'sale',
          lastSeenAt,
          mainExternalListing: { articleNo: 'rep-1' },
        });
        context.prisma.externalListing.findUnique.mockResolvedValue(null);
        context.prisma.externalListing.create.mockResolvedValue({ id: 'new-1' });
        return context;
      }

      it('adds a listing to a group entered in this snapshot, keeping the representative', async () => {
        const { prisma, service } = setupGroup();

        await service.addSnapshotListing('office-1', 'session-1', 'group-1', {
          source: 'manual',
          listing: { articleNo: 'dup-1', price: 90000 },
        });

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.externalListing.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            articleNo: 'dup-1',
            groupId: 'group-1',
            representativeArticleNo: 'rep-1',
          }),
        });
        const groupUpdate =
          prisma.externalListingGroup.update.mock.calls[0][0].data;
        expect(groupUpdate).not.toHaveProperty('mainExternalListingId');
      });

      it('rejects a group not entered in this snapshot', async () => {
        const { prisma, service } = setupGroup(earlier);

        await expect(
          service.addSnapshotListing('office-1', 'session-1', 'group-1', {
            source: 'manual',
            listing: { articleNo: 'dup-1' },
          }),
        ).rejects.toThrow('이번 스냅샷에 입력한 매물에만');
        expect(prisma.externalListing.create).not.toHaveBeenCalled();
      });

      it('rejects a number already in another group', async () => {
        const { prisma, service } = setupGroup();
        prisma.externalListing.findUnique.mockResolvedValue({
          id: 'other',
          groupId: 'group-2',
        });

        await expect(
          service.addSnapshotListing('office-1', 'session-1', 'group-1', {
            source: 'manual',
            listing: { articleNo: 'dup-1' },
          }),
        ).rejects.toThrow('다른 매물에 이미');
      });

      it('rejects once the snapshot is closed', async () => {
        const { prisma, service } = setupGroup();
        prisma.externalListingSnapshotSession.findFirst.mockReset();
        prisma.externalListingSnapshotSession.findFirst.mockResolvedValue(null);

        await expect(
          service.addSnapshotListing('office-1', 'closed', 'group-1', {
            source: 'manual',
            listing: { articleNo: 'dup-1' },
          }),
        ).rejects.toThrow('active session not found');
      });
    });

    describe('updateSnapshotListing', () => {
      it('keeps only editable fields and records the price change', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(storedListing());

        await service.updateSnapshotListing(
          'office-1',
          'session-1',
          'listing-1',
          { price: 95000, realtorName: '새 중개사', isActive: false } as never,
        );

        const data = prisma.externalListing.update.mock.calls[0][0].data;
        expect(data).toMatchObject({
          price: 95000,
          realtorName: '새 중개사',
          previousPrice: 100000,
          lastSeenAt: expect.any(Date),
        });
        expect(data).not.toHaveProperty('isActive');
      });

      it('moves the representative when the current one is not entered yet', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(
          storedListing({
            lastSeenAt: earlier,
            group: {
              siteId: 'site-1',
              transactionType: 'sale',
              mainExternalListing: { id: 'listing-2', lastSeenAt: earlier },
            },
          }),
        );

        await service.updateSnapshotListing(
          'office-1',
          'session-1',
          'listing-1',
          {},
        );

        expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
          where: { id: 'group-1' },
          data: expect.objectContaining({
            mainExternalListingId: 'listing-1',
          }),
        });
      });

      it('rejects an ended listing and one outside the snapshot scope', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValueOnce(
          storedListing({ isActive: false }),
        );
        await expect(
          service.updateSnapshotListing('office-1', 'session-1', 'listing-1', {}),
        ).rejects.toThrow('내려간 광고는');

        prisma.externalListing.findFirst.mockResolvedValueOnce(
          storedListing({
            group: {
              siteId: 'site-2',
              transactionType: 'sale',
              mainExternalListing: null,
            },
          }),
        );
        await expect(
          service.updateSnapshotListing('office-1', 'session-1', 'listing-1', {}),
        ).rejects.toThrow('이 스냅샷의 단지');
      });
    });

    describe('keepSnapshotListings', () => {
      it('marks every not-entered listing of the kept groups as entered', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findMany.mockResolvedValue([
          { id: 'listing-1', groupId: 'group-1' },
          { id: 'listing-2', groupId: 'group-1' },
          { id: 'listing-3', groupId: 'group-2' },
        ]);

        await expect(
          service.keepSnapshotListings('office-1', 'session-1', {
            groupIds: ['group-1', 'group-2'],
          }),
        ).resolves.toEqual({ keptGroupCount: 2, keptListingCount: 3 });

        const { where } = prisma.externalListing.findMany.mock.calls[0][0];
        expect(where).toMatchObject({
          officeId: 'office-1',
          groupId: { in: ['group-1', 'group-2'] },
          transactionType: 'sale',
          isActive: true,
          lastSeenAt: { lt: startedAt },
          group: { siteId: 'site-1' },
        });
        const { data } = prisma.externalListing.updateMany.mock.calls[0][0];
        expect(data.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
          startedAt.getTime(),
        );
        expect(prisma.externalListingGroup.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['group-1', 'group-2'] } },
          data: { lastSeenAt: data.lastSeenAt },
        });
      });

      it('skips groups that already have an entered listing', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findMany.mockResolvedValue([]);

        await expect(
          service.keepSnapshotListings('office-1', 'session-1', {
            groupIds: ['group-1'],
          }),
        ).resolves.toEqual({ keptGroupCount: 0, keptListingCount: 0 });

        const { where } = prisma.externalListing.findMany.mock.calls[0][0];
        expect(where.group.listings).toEqual({
          none: { isActive: true, lastSeenAt: { gte: startedAt } },
        });
        expect(prisma.externalListing.updateMany).not.toHaveBeenCalled();
      });

      it.each([[undefined], [[]], [[1]]])(
        'rejects invalid group ids %j',
        async (groupIds) => {
          const { prisma, service } = setup();

          await expect(
            service.keepSnapshotListings('office-1', 'session-1', {
              groupIds: groupIds as unknown as string[],
            }),
          ).rejects.toThrow('유지할 매물을 선택해 주세요.');
          expect(prisma.$transaction).not.toHaveBeenCalled();
        },
      );
    });

    describe('removeSnapshotListing', () => {
      it('deletes a listing first entered in this snapshot and its empty group', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(
          storedListing({ firstSeenAt: entered }),
        );
        prisma.externalListing.findMany.mockResolvedValue([]);

        await expect(
          service.removeSnapshotListing('office-1', 'session-1', 'listing-1'),
        ).resolves.toEqual({ id: 'listing-1', result: 'deleted' });

        expect(prisma.externalListing.delete).toHaveBeenCalledWith({
          where: { id: 'listing-1' },
        });
        expect(prisma.externalListingGroup.delete).toHaveBeenCalledWith({
          where: { id: 'group-1' },
        });
      });

      it('excludes an existing listing so it ends when the snapshot closes', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(storedListing());
        prisma.externalListing.findMany.mockResolvedValue([]);

        await expect(
          service.removeSnapshotListing('office-1', 'session-1', 'listing-1'),
        ).resolves.toEqual({ id: 'listing-1', result: 'excluded' });

        expect(prisma.externalListing.delete).not.toHaveBeenCalled();
        const before = new Date(startedAt.getTime() - 1);
        expect(prisma.externalListing.update).toHaveBeenCalledWith({
          where: { id: 'listing-1' },
          data: { lastSeenAt: before },
        });
        expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
          where: { id: 'group-1' },
          data: { lastSeenAt: before },
        });
      });

      it('moves the representative to another entered listing', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(
          storedListing({
            group: {
              siteId: 'site-1',
              transactionType: 'sale',
              mainExternalListing: { id: 'listing-1', lastSeenAt: entered },
            },
          }),
        );
        prisma.externalListing.findMany.mockResolvedValue([
          { id: 'listing-3', lastSeenAt: entered, isActive: true },
        ]);

        await service.removeSnapshotListing(
          'office-1',
          'session-1',
          'listing-1',
        );

        expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
          where: { id: 'group-1' },
          data: { mainExternalListingId: 'listing-3' },
        });
      });

      it('leaves a listing that was not entered as it is', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(
          storedListing({ lastSeenAt: earlier }),
        );

        await expect(
          service.removeSnapshotListing('office-1', 'session-1', 'listing-1'),
        ).resolves.toEqual({ id: 'listing-1', result: 'unchanged' });
        expect(prisma.externalListing.update).not.toHaveBeenCalled();
      });

      it('rejects a listing of another office', async () => {
        const { prisma, service } = setup();
        prisma.externalListing.findFirst.mockResolvedValue(null);

        await expect(
          service.removeSnapshotListing('office-1', 'session-1', 'other'),
        ).rejects.toThrow('ExternalListing not found');
      });
    });
  });

  describe('findAllGroups after a snapshot closes', () => {
    it('returns the plain active list instead of failing on a stale bucket', async () => {
      const { prisma, service } = createService();
      prisma.externalListingSnapshotSession.findFirst.mockResolvedValue(null);
      prisma.externalListingGroup.findMany.mockResolvedValue([]);

      await expect(
        service.findAllGroups('office-1', {
          siteId: 'site-1',
          transactionType: 'sale',
          bucket: 'new',
        }),
      ).resolves.toEqual([]);

      expect(prisma.externalListingGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listings: { some: { isActive: true } },
          }),
        }),
      );
    });
  });

  describe('getActiveSession', () => {
    it('reports how many listings stay and how many will end', async () => {
      const { prisma, service } = createService();
      const startedAt = new Date('2026-11-03T00:00:00.000Z');
      prisma.externalListingSnapshotSession.findFirst.mockResolvedValue({
        id: 'session-1',
        siteId: 'site-1',
        transactionType: 'sale',
        startedAt,
      });
      prisma.externalListing.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);

      await expect(
        service.getActiveSession('office-1', 'site-1', 'sale'),
      ).resolves.toMatchObject({
        id: 'session-1',
        receivedListingCount: 2,
        pendingRemovalCount: 5,
      });
      const [received, pending] = prisma.externalListing.count.mock.calls;
      expect(received[0].where.lastSeenAt).toEqual({ gte: startedAt });
      expect(pending[0].where).toMatchObject({
        lastSeenAt: { lt: startedAt },
        isActive: true,
      });
    });

    it('returns null without an open snapshot', async () => {
      const { prisma, service } = createService();
      prisma.externalListingSnapshotSession.findFirst.mockResolvedValue(null);

      await expect(
        service.getActiveSession('office-1', 'site-1', 'sale'),
      ).resolves.toBeNull();
      expect(prisma.externalListing.count).not.toHaveBeenCalled();
    });
  });

  describe('findAllGroups snapshot buckets', () => {
    function setup() {
      const context = createService();
      context.prisma.externalListingSnapshotSession.findFirst.mockResolvedValue({
        startedAt: new Date('2026-11-03T00:00:00.000Z'),
        transactionType: 'sale',
      });
      context.prisma.externalListingGroup.findMany.mockResolvedValue([]);
      context.prisma.officeAdvertisement.findMany.mockResolvedValue([]);
      return context;
    }

    it.each([
      ['new', { some: expect.objectContaining({ isActive: true }) }],
      [
        'old',
        {
          none: expect.objectContaining({ isActive: true }),
          some: { isActive: true },
        },
      ],
    ] as const)('hides groups without an active listing: %s', async (bucket, listings) => {
      const { prisma, service } = setup();

      await service.findAllGroups('office-1', {
        siteId: 'site-1',
        transactionType: 'sale',
        bucket,
      });

      expect(prisma.externalListingGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ listings }),
        }),
      );
    });
  });

  describe('completeSession', () => {
    const startedAt = new Date('2026-11-03T00:00:00.000Z');
    const previousCompletedAt = new Date('2026-11-02T00:00:00.000Z');
    const earlier = new Date('2026-11-01T00:00:00.000Z');

    function receivedListing(
      articleNo: string,
      groupId: string,
      overrides: Record<string, unknown> = {},
    ) {
      return {
        groupId,
        articleNo,
        firstSeenAt: earlier,
        priceChangedAt: null,
        price: 100000,
        deposit: null,
        monthlyRent: null,
        previousPrice: null,
        previousDeposit: null,
        previousMonthlyRent: null,
        group: {
          firstSeenAt: earlier,
          mainExternalListing: { articleNo },
        },
        ...overrides,
      };
    }

    function setup(options: {
      received: ReturnType<typeof receivedListing>[];
      stale?: Array<{ id: string; groupId: string; articleNo: string }>;
      stillActive?: Array<{ groupId: string }>;
      hasPrevious?: boolean;
    }) {
      const context = createService();
      const { prisma } = context;
      prisma.externalListingSnapshotSession.findFirst
        .mockResolvedValueOnce({
          id: 'session-1',
          siteId: 'site-1',
          transactionType: 'sale',
          startedAt,
          startedById: 'user-1',
        })
        .mockResolvedValueOnce(
          options.hasPrevious === false
            ? null
            : { completedAt: previousCompletedAt },
        );
      prisma.externalListing.findMany
        .mockResolvedValueOnce(options.received)
        .mockResolvedValueOnce(options.stale ?? [])
        .mockResolvedValueOnce(options.stillActive ?? []);
      prisma.externalListingSnapshotSession.update.mockImplementation(
        async ({ data }: { data: unknown }) => data,
      );
      return context;
    }

    it('summarizes the differences from the previous completed snapshot', async () => {
      const newAt = new Date('2026-11-03T00:05:00.000Z');
      const { prisma, service } = setup({
        received: [
          receivedListing('new-1', 'group-new', {
            firstSeenAt: newAt,
            group: {
              firstSeenAt: newAt,
              mainExternalListing: { articleNo: 'new-1' },
            },
          }),
          receivedListing('added-1', 'group-1', { firstSeenAt: newAt }),
          receivedListing('changed-1', 'group-1', {
            priceChangedAt: newAt,
            previousPrice: 90000,
          }),
        ],
        stale: [
          { id: 'l1', groupId: 'group-1', articleNo: 'gone-1' },
          { id: 'l2', groupId: 'group-2', articleNo: 'gone-2' },
          { id: 'l3', groupId: 'group-2', articleNo: 'gone-3' },
        ],
        stillActive: [{ groupId: 'group-1' }],
      });

      const result = await service.completeSession(
        'office-1',
        'user-1',
        'agent',
        'session-1',
        { expectedListingCount: 3 },
      );

      expect(prisma.externalListing.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['l1', 'l2', 'l3'] } },
        data: { isActive: false },
      });
      expect(result.staleListingsMarked).toBe(3);
      expect(result.receivedListingCount).toBe(3);
      expect(result.comparison).toEqual({
        isBaseline: false,
        newGroups: [
          {
            groupId: 'group-new',
            representativeArticleNo: 'new-1',
            articleNos: ['new-1'],
          },
        ],
        addedListings: [{ groupId: 'group-1', articleNo: 'added-1' }],
        removedGroups: [
          { groupId: 'group-2', articleNos: ['gone-2', 'gone-3'] },
        ],
        removedListings: [{ groupId: 'group-1', articleNo: 'gone-1' }],
        priceChanges: [
          {
            groupId: 'group-1',
            articleNo: 'changed-1',
            before: { price: 90000, deposit: null, monthlyRent: null },
            after: { price: 100000, deposit: null, monthlyRent: null },
          },
        ],
      });
    });

    it('reports a listing first seen in a cancelled attempt only as new', async () => {
      const newAt = new Date('2026-11-02T12:00:00.000Z');
      const { service } = setup({
        received: [
          receivedListing('101', 'group-1', {
            firstSeenAt: newAt,
            priceChangedAt: newAt,
            previousPrice: 90000,
          }),
        ],
      });

      const result = await service.completeSession(
        'office-1',
        'user-1',
        'agent',
        'session-1',
      );

      expect(result.comparison.addedListings).toEqual([
        { groupId: 'group-1', articleNo: '101' },
      ]);
      expect(result.comparison.priceChanges).toEqual([]);
    });

    it('counts and deactivates listings regardless of their source', async () => {
      const { prisma, service } = setup({
        received: [receivedListing('101', 'group-1')],
      });

      await service.completeSession('office-1', 'user-1', 'agent', 'session-1');

      const [receivedQuery, staleQuery] =
        prisma.externalListing.findMany.mock.calls;
      expect(receivedQuery[0].where).not.toHaveProperty('source');
      expect(staleQuery[0].where).not.toHaveProperty('source');
    });

    it('marks the first snapshot of a scope as the baseline', async () => {
      const { service } = setup({
        received: [receivedListing('101', 'group-1')],
        hasPrevious: false,
      });

      const result = await service.completeSession(
        'office-1',
        'user-1',
        'agent',
        'session-1',
      );

      expect(result.comparison.isBaseline).toBe(true);
      expect(result.comparison.newGroups).toHaveLength(1);
    });

    it('keeps the snapshot open when the declared count differs', async () => {
      const { prisma, service } = setup({
        received: [receivedListing('101', 'group-1')],
      });

      await expect(
        service.completeSession('office-1', 'user-1', 'agent', 'session-1', {
          expectedListingCount: 2,
        }),
      ).rejects.toThrow('선언 2건, 실제 1건');

      expect(prisma.externalListing.updateMany).not.toHaveBeenCalled();
      expect(prisma.externalListingSnapshotSession.update).not.toHaveBeenCalled();
    });

    it('refuses to deactivate everything unless zero is declared', async () => {
      const { prisma, service } = setup({ received: [] });

      await expect(
        service.completeSession('office-1', 'user-1', 'agent', 'session-1'),
      ).rejects.toThrow('입력된 광고가 없습니다');

      expect(prisma.externalListing.updateMany).not.toHaveBeenCalled();
    });

    it('ends every listing when zero is declared', async () => {
      const { prisma, service } = setup({
        received: [],
        stale: [{ id: 'l1', groupId: 'group-1', articleNo: 'gone-1' }],
      });

      const result = await service.completeSession(
        'office-1',
        'user-1',
        'agent',
        'session-1',
        { expectedListingCount: 0 },
      );

      expect(prisma.externalListing.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['l1'] } },
        data: { isActive: false },
      });
      expect(result.comparison.removedGroups).toEqual([
        { groupId: 'group-1', articleNos: ['gone-1'] },
      ]);
    });
  });
});
