import { BadRequestException } from '@nestjs/common';
import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Deal 단계 전이의 의뢰 배타성 + Intake 생명주기 동기화 테스트.
 *
 * - 같은 ListingIntake에 미취소 Deal은 거래유형과 무관하게 하나만 허용
 * - "이 의뢰가 거래중" 은 점유 Deal 에서 파생 — 단계 진입/취소 시 상태 쓰기 없음
 * - completed 진입 시 해당 Intake → closed
 */

interface MockTx {
  deal: {
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  listing: { updateMany: jest.Mock; count: jest.Mock };
  listingIntake: { updateMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
  contract: { findUnique: jest.Mock };
  commissionPayment: { updateMany: jest.Mock };
  /** 매칭 자동 종료·되살리기 (match-lifecycle-sync) */
  match: { findMany: jest.Mock; update: jest.Mock };
  /** advisory lock (pg_advisory_xact_lock) 호출 */
  $executeRaw: jest.Mock;
}

function buildMocks(options: {
  existingDeal: Record<string, unknown>;
  conflictingDeal?: Record<string, unknown> | null;
  contractExists?: boolean;
  remainingDoneDeals?: number;
  /** 트랜잭션 안에서 다시 읽는 의뢰 상태 */
  intakeStatus?: string;
}) {
  const tx: MockTx = {
    deal: {
      findFirst: jest.fn().mockResolvedValue(options.conflictingDeal ?? null),
      count: jest.fn().mockResolvedValue(options.remainingDoneDeals ?? 0),
      update: jest
        .fn()
        .mockResolvedValue({ ...options.existingDeal, listing: null }),
      delete: jest.fn().mockResolvedValue({ ...options.existingDeal }),
    },
    listing: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    listingIntake: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      // 잠금 안에서 다시 읽는 의뢰 상태 (매칭 되살리기 판단)
      findUnique: jest
        .fn()
        .mockResolvedValue({ lifecycleStatus: options.intakeStatus ?? 'open' }),
      findFirst: jest
        .fn()
        // 1st: intake row (propertyId/officeId), 2nd: other open intake (없음)
        .mockResolvedValueOnce({
          propertyId: 'property-1',
          officeId: 'office-1',
        })
        .mockResolvedValueOnce(null),
    },
    contract: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.contractExists
            ? { id: 'contract-1', statedBalanceDate: null }
            : null,
        ),
    },
    commissionPayment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    match: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const prisma = {
    deal: {
      // findOne(존재 확인)용. 배타 가드는 tx.deal.findFirst 로 트랜잭션 안에서 수행.
      findFirst: jest.fn().mockResolvedValue({ ...options.existingDeal }),
    },
    contract: tx.contract,
    $transaction: jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  return { prisma, tx };
}

const baseDeal = {
  id: 'deal-1',
  officeId: 'office-1',
  listingId: 'listing-1',
  listing: { id: 'listing-1', intakeId: 'intake-1' },
  stage: 'preparing',
  isCancelled: false,
  buyerContact: null,
  sellerContact: null,
  partnerBroker: null,
  participants: [],
  payments: [],
  commissionPayments: [],
};

describe('DealsService 의뢰 단위 Deal 가드', () => {
  it('같은 의뢰의 다른 Listing에 미취소 Deal이 있으면 단계 전이 거부', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: baseDeal,
      conflictingDeal: { id: 'deal-2', stage: 'contracted' },
    });
    const service = new DealsService(prisma);

    await expect(
      service.updateStage('deal-1', 'office-1', { stage: 'preContract' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'deal-1' },
          listing: { intakeId: 'intake-1' },
        }),
      }),
    );
  });

  it('중복 검사는 트랜잭션 안에서 의뢰 advisory lock 을 잡은 뒤 수행된다', async () => {
    const { prisma, tx } = buildMocks({ existingDeal: baseDeal });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preContract' });

    // 락(tx.$executeRaw) → 충돌 검사(tx.deal.findFirst) 순서
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.deal.findFirst).toHaveBeenCalled();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('경쟁 Deal 이 없으면 preContract 진입 허용 — 상태 쓰기는 없다 (파생)', async () => {
    const { prisma, tx } = buildMocks({ existingDeal: baseDeal });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preContract' });

    // "거래중" 은 점유 Deal 에서 파생 — listing/intake 에 아무것도 쓰지 않는다
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('계약 준비 단계의 조건 수정은 가드/동기화 없이 통과', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: baseDeal,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preparing' });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('가계약 없이 계약 준비에서 본계약으로 바로 이동할 수 있다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: baseDeal,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'contracted' });

    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'contracted' }),
      }),
    );
  });

  it('가계약에서 계약서 없이 본계약으로 이동할 수 있다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'preContract' },
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'contracted' });

    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'contracted' }),
      }),
    );
  });

  it('계약서 없이 본계약에서 중도금·잔금 단계로 이동할 수 없다', async () => {
    const { prisma } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'contracted' },
    });
    const service = new DealsService(prisma);

    await expect(
      service.updateStage('deal-1', 'office-1', { stage: 'settling' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('계약서가 있으면 본계약에서 중도금·잔금 단계로 이동할 수 있다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'contracted' },
      contractExists: true,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'settling' });

    expect(tx.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'settling' }),
      }),
    );
  });

  it('거래 파이프라인에 없는 단계는 거부한다', async () => {
    const { prisma } = buildMocks({ existingDeal: baseDeal });
    const service = new DealsService(prisma);

    await expect(
      service.updateStage('deal-1', 'office-1', { stage: 'viewing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DealsService completed 동기화', () => {
  it('본계약 진입 시 같은 거래 조건의 다른 손님 매칭을 자동 종료한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, matchId: 'match-source' },
    });
    tx.match.findMany.mockResolvedValueOnce([
      { id: 'match-other', stage: 'negotiating' },
    ]);
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'contracted' });

    expect(tx.match.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        listingId: 'listing-1',
        stage: { notIn: ['closed', 'dealCreated'] },
        id: { not: 'match-source' },
      },
      select: { id: true, stage: true },
    });
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 'match-other' },
      data: {
        stage: 'closed',
        closedFromStage: 'negotiating',
        closedReason: 'other_buyer_contracted',
        closedByDealId: 'deal-1',
      },
    });
  });

  it('본계약 전 단계 이동은 다른 손님 매칭을 건드리지 않는다', async () => {
    const { prisma, tx } = buildMocks({ existingDeal: { ...baseDeal } });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preContract' });

    expect(tx.match.findMany).not.toHaveBeenCalled();
    expect(tx.match.update).not.toHaveBeenCalled();
  });

  it('거래 취소 시 거래를 만든 매칭은 종료하고 이 거래가 닫은 매칭은 되살린다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: {
        ...baseDeal,
        stage: 'contracted',
        matchId: 'match-source',
        listing: { id: 'listing-1', intakeId: 'intake-1', intake: { lifecycleStatus: 'open' } },
      },
    });
    tx.match.findMany
      // 1) 거래를 만든 매칭 (거래 전환 상태)
      .mockResolvedValueOnce([{ id: 'match-source', stage: 'dealCreated' }])
      // 2) 이 거래가 자동 종료한 매칭 id
      .mockResolvedValueOnce([{ id: 'match-other' }])
      // 3) 되살릴 매칭의 종료 직전 단계
      .mockResolvedValueOnce([{ id: 'match-other', closedFromStage: 'negotiating' }]);
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', { cancelledBy: 'buyer' });

    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 'match-source' },
      data: {
        stage: 'closed',
        closedFromStage: 'dealCreated',
        closedReason: 'deal_cancelled',
        closedByDealId: 'deal-1',
      },
    });
    expect(tx.match.findMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        closedByDealId: 'deal-1',
        stage: 'closed',
        buyerRequirement: { status: 'active' },
      }),
      select: { id: true },
    });
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 'match-other' },
      data: {
        stage: 'negotiating',
        closedFromStage: null,
        closedReason: null,
        closedByDealId: null,
      },
    });
  });

  it('이미 취소된 거래를 다시 취소해도 매칭을 건드리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, isCancelled: true, matchId: 'match-source' },
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.match.findMany).not.toHaveBeenCalled();
    expect(tx.match.update).not.toHaveBeenCalled();
  });

  describe('매칭 되살리기 경계', () => {
    interface StoredMatch {
      id: string;
      officeId: string;
      listingId: string;
      intakeId: string;
      stage: string;
      closedFromStage: string | null;
      closedReason: string | null;
      closedByDealId: string | null;
      buyerStatus: string;
    }

    /** tx.match 를 메모리 표로 바꿔 실제 where 조건으로 거른다. */
    function attachMatchStore(tx: MockTx, rows: StoredMatch[]) {
      const fits = (row: StoredMatch, where: Record<string, unknown>) =>
        Object.entries(where).every(([key, condition]) => {
          if (key === 'listing') return (condition as { intakeId: string }).intakeId === row.intakeId;
          if (key === 'buyerRequirement') return (condition as { status: string }).status === row.buyerStatus;
          const value = row[key as keyof StoredMatch];
          if (condition && typeof condition === 'object') {
            const ops = condition as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
            if (ops.in && !ops.in.includes(value)) return false;
            if (ops.notIn && ops.notIn.includes(value)) return false;
            if ('not' in ops && ops.not === value) return false;
            return true;
          }
          return value === condition;
        });
      tx.match.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((row) => fits(row, where)).map((row) => ({ ...row })),
      );
      tx.match.update.mockImplementation(
        async ({ where, data }: { where: { id: string }; data: Partial<StoredMatch> }) => {
          const row = rows.find((candidate) => candidate.id === where.id)!;
          Object.assign(row, data);
          return { ...row };
        },
      );
      return (id: string) => rows.find((row) => row.id === id)!;
    }

    const stored = (overrides: Partial<StoredMatch> & { id: string }): StoredMatch => ({
      officeId: 'office-1',
      listingId: 'listing-1',
      intakeId: 'intake-1',
      stage: 'viewing',
      closedFromStage: null,
      closedReason: null,
      closedByDealId: null,
      buyerStatus: 'active',
      ...overrides,
    });

    it('가계약 → 완료 → 본계약으로 되돌려도 같은 거래 조건의 경쟁 매칭은 닫혀 있다', async () => {
      const rows = [
        stored({ id: 'source', stage: 'dealCreated' }),
        stored({ id: 'competitor', stage: 'negotiating' }),
        stored({ id: 'jeonse-buyer', listingId: 'listing-2', stage: 'viewing' }),
      ];
      const deal = {
        ...baseDeal,
        matchId: 'source',
        listing: { id: 'listing-1', intakeId: 'intake-1', intake: { lifecycleStatus: 'open' } },
      };

      // 1) 가계약 → 완료 (건너뛰기)
      const first = buildMocks({ existingDeal: { ...deal, stage: 'preContract' }, contractExists: true });
      const get = attachMatchStore(first.tx, rows);
      await new DealsService(first.prisma).updateStage('deal-1', 'office-1', { stage: 'completed' });

      expect(get('competitor')).toMatchObject({ stage: 'closed', closedReason: 'other_buyer_contracted' });
      expect(get('jeonse-buyer')).toMatchObject({ stage: 'closed', closedReason: 'intake_closed' });

      // 2) 완료 → 본계약 (의뢰는 다시 열린다)
      const second = buildMocks({ existingDeal: { ...deal, stage: 'completed' }, contractExists: true });
      attachMatchStore(second.tx, rows);
      await new DealsService(second.prisma).updateStage('deal-1', 'office-1', { stage: 'contracted' });

      expect(get('competitor')).toMatchObject({ stage: 'closed', closedReason: 'other_buyer_contracted' });
      expect(get('jeonse-buyer')).toMatchObject({ stage: 'viewing', closedReason: null });
      expect(get('source').stage).toBe('dealCreated');
    });

    it('완료 → 본계약 → 가계약으로 내려오면 본계약 중 남겨 둔 매칭도 되살린다', async () => {
      // 본계약 이후에 같은 거래 조건에 추가됐다가, 완료 때 "의뢰 종료"로 닫힌 매칭
      const rows = [
        stored({ id: 'source', stage: 'dealCreated' }),
        stored({ id: 'late-buyer', stage: 'closed', closedFromStage: 'buyerInterested', closedReason: 'intake_closed', closedByDealId: 'deal-1' }),
      ];
      const deal = {
        ...baseDeal,
        matchId: 'source',
        listing: { id: 'listing-1', intakeId: 'intake-1', intake: { lifecycleStatus: 'closed' } },
      };

      const toContracted = buildMocks({ existingDeal: { ...deal, stage: 'completed' }, contractExists: true });
      const get = attachMatchStore(toContracted.tx, rows);
      await new DealsService(toContracted.prisma).updateStage('deal-1', 'office-1', { stage: 'contracted' });
      // 본계약 중에는 닫혀 있다
      expect(get('late-buyer').stage).toBe('closed');

      const toPreContract = buildMocks({
        existingDeal: { ...deal, stage: 'contracted', listing: { ...deal.listing, intake: { lifecycleStatus: 'open' } } },
      });
      attachMatchStore(toPreContract.tx, rows);
      await new DealsService(toPreContract.prisma).updateStage('deal-1', 'office-1', { stage: 'preContract' });

      expect(get('late-buyer')).toMatchObject({ stage: 'buyerInterested', closedReason: null, closedByDealId: null });
    });

    it('취소와 의뢰 종료가 겹쳐 의뢰가 닫혔으면 잠금 안의 최신 상태를 보고 되살리지 않는다', async () => {
      const rows = [
        stored({ id: 'source', stage: 'dealCreated' }),
        stored({ id: 'competitor', stage: 'closed', closedFromStage: 'negotiating', closedReason: 'other_buyer_contracted', closedByDealId: 'deal-1' }),
      ];
      const { prisma, tx } = buildMocks({
        existingDeal: {
          ...baseDeal,
          stage: 'contracted',
          matchId: 'source',
          // 트랜잭션 전에 읽은 값은 열려 있었다
          listing: { id: 'listing-1', intakeId: 'intake-1', intake: { lifecycleStatus: 'open' } },
        },
        // 그 사이 의뢰가 닫혔다
        intakeStatus: 'closed',
      });
      const get = attachMatchStore(tx, rows);

      await new DealsService(prisma).cancel('deal-1', 'office-1', {});

      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.listingIntake.findUnique.mock.invocationCallOrder[0],
      );
      expect(get('source')).toMatchObject({ stage: 'closed', closedReason: 'deal_cancelled' });
      expect(get('competitor')).toMatchObject({ stage: 'closed', closedReason: 'other_buyer_contracted' });
    });
  });

  it('completed 진입 시 intake 전체를 closed 처리한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    // listing 에는 상태 컬럼이 없다 — 쓰기 없음
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    // 의뢰 lock 후 생명주기를 바꾼다.
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.listingIntake.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'intake-1' }),
        data: {
          lifecycleStatus: 'closed',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'system:deal',
          closedReason: 'deal_completed',
        },
      }),
    );
  });

  it('다중 Listing 의뢰도 하나의 Deal이 completed면 intake 전체를 closed 처리한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'intake-1' }),
        data: expect.objectContaining({
          lifecycleStatus: 'closed',
          closedReason: 'deal_completed',
        }),
      }),
    );
  });

  it('이미 취소된 Deal의 completed 변경은 intake를 종결하지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: {
        ...baseDeal,
        stage: 'settling',
        isCancelled: true,
      },
      contractExists: true,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });
});

describe('DealsService 취소', () => {
  it('배타 단계 Deal 취소 시 상태 복귀 쓰기가 없다 — isCancelled 로 점유가 자동 해제 (파생)', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'preContract' },
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', { cancelReason: '매수자 변심' });

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('계약 준비 단계 취소도 상태 쓰기 없이 통과한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: baseDeal,
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  it('종결 단계 Deal 취소로 종결 근거가 무너지면 의뢰를 open으로 되살린다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      // 취소 커밋 후: 이 의뢰에 미취소 종결 Deal 없음 → closed 근거 붕괴
      remainingDoneDeals: 0,
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {
      cancelReason: '잔금 미납 파기',
    });

    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Deal 자동화가 closed 처리한 의뢰만 되살린다 (수동 종료 보호)
        where: {
          id: 'intake-1',
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'system:deal',
          closedReason: 'deal_completed',
        },
        data: {
          lifecycleStatus: 'open',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'system:deal',
          closedReason: null,
        },
      }),
    );
  });

  it('종결 근거 재평가는 의뢰 전체의 Deal을 기준으로 한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingDoneDeals: 0,
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.deal.count).toHaveBeenCalledWith({
      where: {
        isCancelled: false,
        stage: { in: ['completed', 'closed'] },
        listing: { intakeId: 'intake-1' },
      },
    });
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'intake-1',
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'system:deal',
          closedReason: 'deal_completed',
        },
        data: expect.objectContaining({ lifecycleStatus: 'open' }),
      }),
    );
  });

  it('다른 미취소 종결 Deal이 남아 있으면 closed를 유지한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingDoneDeals: 1,
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('같은 Property 에 새 열린 의뢰가 있으면 종결 취소여도 옛 의뢰를 되살리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingDoneDeals: 0,
    });
    tx.listingIntake.findFirst
      .mockReset()
      .mockResolvedValueOnce({ propertyId: 'property-1', officeId: 'office-1' })
      // 같은 Property 의 다른 열린 의뢰 존재
      .mockResolvedValueOnce({ id: 'intake-2' });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('completed → settling 단계 롤백 시에도 의뢰 closed 근거를 재평가해 되살린다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      contractExists: true, // settling 전이는 Contract 존재가 전제
      remainingDoneDeals: 0, // 롤백 커밋 후 의뢰의 종결 Deal 없음
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'settling' });

    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Deal 자동화가 closed 처리한 의뢰만 되살린다 (수동 종료 보호)
        where: {
          id: 'intake-1',
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'system:deal',
          closedReason: 'deal_completed',
        },
        data: {
          lifecycleStatus: 'open',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'system:deal',
          closedReason: null,
        },
      }),
    );
  });

  it('종결 Deal 삭제로 종결 근거가 무너지면 의뢰를 open으로 되살린다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingDoneDeals: 0,
    });
    const service = new DealsService(prisma);

    await service.remove('deal-1', 'office-1');

    expect(tx.deal.delete).toHaveBeenCalledWith({ where: { id: 'deal-1' } });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.delete.mock.invocationCallOrder[0],
    );
    expect(tx.deal.delete.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.count.mock.invocationCallOrder[0],
    );
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'intake-1',
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'system:deal',
          closedReason: 'deal_completed',
        },
        data: expect.objectContaining({ lifecycleStatus: 'open' }),
      }),
    );
  });
});
