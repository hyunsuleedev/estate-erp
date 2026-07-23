import { BadRequestException } from '@nestjs/common';
import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Deal 단계 전이의 매물 배타성 + Listing/Intake 상태 동기화 테스트.
 *
 * - preContract 이상(배타 단계) 진입 시 같은 매물의 다른 활성 배타 Deal 이 있으면 거부
 * - 배타 단계 진입 시 Listing.checkStatus → in_contract, Intake.status → in_contract
 * - completed 진입 시 Listing → done, 의뢰 산하 매물 전부 done 이면 Intake → done
 * - 배타 단계 Deal 취소 시 (다른 점유 Deal 없으면) in_contract → verified/active 복귀
 */

interface MockTx {
  deal: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  listing: { updateMany: jest.Mock; count: jest.Mock };
  listingIntake: { updateMany: jest.Mock };
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
    },
    listing: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(options.remainingNotDone ?? 0),
    },
    listingIntake: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  it('경쟁 Deal 이 없으면 preContract 진입 허용 + listing/intake 동기화', async () => {
    const { prisma, tx } = buildMocks({ existingDeal: baseDeal });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'preContract' });

    expect(tx.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'listing-1' }),
        data: expect.objectContaining({ checkStatus: 'in_contract' }),
      }),
    );
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'intake-1' }),
        data: { status: 'in_contract' },
      }),
    );
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
  it('completed 진입 시 listing → done, 산하 매물 전부 done 이면 intake → done', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
      remainingNotDone: 0,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkStatus: 'done' }),
      }),
    );
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'done' } }),
    );
  });

  it('의뢰에 미완료 매물이 남아 있으면 intake 는 건드리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'settling' },
      contractExists: true,
      remainingNotDone: 1,
    });
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'completed' });

    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });
});

describe('DealsService 취소 복귀', () => {
  it('배타 단계 Deal 취소 시 in_contract → verified/active 복귀', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'preContract' },
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', { cancelReason: '매수자 변심' });

    expect(tx.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'listing-1', checkStatus: 'in_contract' },
        data: expect.objectContaining({ checkStatus: 'verified' }),
      }),
    );
    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'intake-1', status: 'in_contract' },
        data: { status: 'active' },
      }),
    );
  });

  it('같은 매물을 점유한 다른 활성 Deal 이 있으면 복귀하지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'preContract' },
      conflictingDeal: { id: 'deal-2', stage: 'contracted' },
    });
    // cancel 경로: tx 내 deal.findFirst 가 점유 Deal 조회
    tx.deal.findFirst.mockResolvedValue({ id: 'deal-2' });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listingIntake.updateMany).not.toHaveBeenCalled();
  });

  it('selection 단계 취소는 상태 복귀를 시도하지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      existingDeal: { ...baseDeal, stage: 'selection' },
    });
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', {});

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
  });
});
