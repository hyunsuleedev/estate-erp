import { BadRequestException } from '@nestjs/common';
import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Deal 단계 전이의 매물 배타성 + Intake 생명주기 동기화 테스트.
 *
 * - preContract 이상(배타 단계) 진입 시 같은 매물의 다른 활성 배타 Deal 이 있으면 거부
 * - "이 옵션이 거래중" 은 점유 Deal 에서 파생 — 배타 단계 진입/취소 시 상태 쓰기 없음
 * - completed 진입 시 의뢰 산하 매물이 전부 종결 Deal 을 가지면 Intake → closed
 */

interface MockTx {
  deal: {
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  listing: { updateMany: jest.Mock; count: jest.Mock };
  listingIntake: { updateMany: jest.Mock; findFirst: jest.Mock };
  contract: { findUnique: jest.Mock };
  commissionPayment: { updateMany: jest.Mock };
  /** advisory lock (pg_advisory_xact_lock) 호출 */
  $queryRaw: jest.Mock;
}

function buildMocks(options: {
  existingDeal: Record<string, unknown>;
  conflictingDeal?: Record<string, unknown> | null;
  contractExists?: boolean;
  remainingNotDone?: number;
}) {
  const tx: MockTx = {
    deal: {
      findFirst: jest.fn().mockResolvedValue(options.conflictingDeal ?? null),
      update: jest
        .fn()
        .mockResolvedValue({ ...options.existingDeal, listing: null }),
      delete: jest.fn().mockResolvedValue({ ...options.existingDeal }),
    },
    listing: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(options.remainingNotDone ?? 0),
    },
    listingIntake: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findFirst: jest
      .fn()
      // 1st: intake row (propertyId/officeId), 2nd: other open intake (없음)
      .mockResolvedValueOnce({ propertyId: 'property-1', officeId: 'office-1' })
      .mockResolvedValueOnce(null),
  },
    contract: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.contractExists ? { id: 'contract-1', statedBalanceDate: null } : null,
        ),
    },
    commissionPayment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
  };

  const prisma = {
    deal: {
      // findOne(존재 확인)용. 배타 가드는 tx.deal.findFirst 로 트랜잭션 안에서 수행.
      findFirst: jest.fn().mockResolvedValue({ ...options.existingDeal }),
    },
    contract: tx.contract,
    $transaction: jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  return { prisma, tx };
}

const baseDeal = {
  id: 'deal-1',
  officeId: 'office-1',
  listingId: 'listing-1',
  listing: { id: 'listing-1', intakeId: 'intake-1' },
  stage: 'negotiating',
  isCancelled: false,
  buyerContact: null,
  sellerContact: null,
  partnerBroker: null,
  participants: [],
  payments: [],
  commissionPayments: [],
};

describe('DealsService 배타 단계 가드', () => {
  it('같은 매물에 배타 단계 활성 Deal 이 있으면 preContract 진입 거부', async () => {
    const { prisma } = buildMocks({
      existingDeal: baseDeal,
      conflictingDeal: { id: 'deal-2', stage: 'contracted' },
    });
    const service = new DealsService(prisma);

    await expect(
      service.updateStage('deal-1', 'office-1', { stage: 'preContract' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('배타 검사는 트랜잭션 안에서 매물 advisory lock 을 잡은 뒤 수행된다', async () => {
    const { prisma, tx } = buildMocks({ existingDeal: baseDeal });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preContract' });

    // 락(tx.$queryRaw) → 충돌 검사(tx.deal.findFirst) 순서
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.deal.findFirst).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
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

  it('selection → negotiating (비배타 전이) 는 가드/동기화 없이 통과', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'selection' },
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'negotiating' });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });
});

describe('DealsService completed 동기화', () => {
  it('completed 진입 시 산하 매물 전부 종결 Deal 보유면 intake → closed', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
      remainingNotDone: 0,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    // listing 에는 상태 컬럼이 없다 — 쓰기 없음
    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    // 서로 다른 Listing의 동시 완료도 직렬화되도록 의뢰 lock 후 판정한다.
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.listing.count.mock.invocationCallOrder[0],
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

  it('의뢰에 종결 Deal 없는 매물이 남아 있으면 intake 는 건드리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
      remainingNotDone: 1,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('이미 취소된 Deal의 completed 변경은 intake를 종결하지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: {
        ...baseDeal,
        stage: 'settling',
        isCancelled: true,
      },
      contractExists: true,
      remainingNotDone: 0,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listing.count).not.toHaveBeenCalled();
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

  it('selection 단계 취소도 상태 쓰기 없이 통과한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'selection' },
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });

  it('종결 단계 Deal 취소로 종결 근거가 무너지면 의뢰를 open으로 되살린다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      // 취소 커밋 후: 종결 Deal 없는 매물 1개 → closed 근거 붕괴
      remainingNotDone: 1,
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', { cancelReason: '잔금 미납 파기' });

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

  it('다중 Listing 의뢰: 다른 매물의 종결 Deal 이 남아도 취소된 매물이 미종결이면 되살린다', async () => {
    // 매매+전세 모두 완료 → 의뢰 closed → 전세 Deal 취소.
    // 매매의 종결 Deal 존재 여부와 무관하게 "종결 Deal 없는 매물" 이 생기면 재개.
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingNotDone: 1, // 전세 매물이 종결 Deal 을 잃음
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

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

  it('모든 매물에 종결 Deal 이 여전히 남아 있으면 취소해도 closed를 유지한다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingNotDone: 0, // 같은 매물에 다른 종결 Deal 존재 등
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('같은 Property 에 새 열린 의뢰가 있으면 종결 취소여도 옛 의뢰를 되살리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'completed' },
      remainingNotDone: 1,
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
      remainingNotDone: 1, // 롤백 커밋 후 종결 Deal 없는 매물 발생
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
      remainingNotDone: 1,
    });
    const service = new DealsService(prisma);

    await service.remove('deal-1', 'office-1');

    expect(tx.deal.delete).toHaveBeenCalledWith({ where: { id: 'deal-1' } });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.delete.mock.invocationCallOrder[0],
    );
    expect(tx.deal.delete.mock.invocationCallOrder[0]).toBeLessThan(
      tx.listing.count.mock.invocationCallOrder[0],
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
