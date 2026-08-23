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
  listingIntake: { updateMany: jest.Mock; findFirst: jest.Mock };
  contract: { findUnique: jest.Mock };
  commissionPayment: { updateMany: jest.Mock };
  /** advisory lock (pg_advisory_xact_lock) 호출 */
  $executeRaw: jest.Mock;
}

function buildMocks(options: {
  existingDeal: Record<string, unknown>;
  conflictingDeal?: Record<string, unknown> | null;
  contractExists?: boolean;
  remainingDoneDeals?: number;
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
