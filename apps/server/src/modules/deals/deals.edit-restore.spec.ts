import { BadRequestException, ConflictException } from '@nestjs/common';
import { DealsService } from './deals.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * 거래 조건 고치기 · 수수료 정하기 · 되살리기 · 지우기 가드.
 * - 금액을 나중에 넣으면 자동 수수료 청구가 생기고, 손대지 않은 청구는 새 금액에 맞춘다
 * - 사람이 정한 수수료는 금액이 바뀌어도 그대로 둔다
 * - 법정 상한을 넘는 수수료는 거절한다
 * - 취소한 거래를 되살리면 원래 매칭을 다시 거래 전환으로 돌린다
 * - 계약서·수수료 입금이 있는 거래는 지우지 않는다
 */

const baseDeal = {
  id: 'deal-1',
  officeId: 'office-1',
  listingId: null,
  matchId: null,
  listing: null,
  stage: 'preparing',
  isCancelled: false,
  transactionType: 'sale',
  agreedPrice: null as number | null,
  agreedDeposit: null,
  agreedMonthlyRent: null,
  isJointBrokerage: false,
  ourSide: 'both',
  buyerContactId: null,
  sellerContactId: null,
  buyerContact: null,
  sellerContact: null,
  partnerBroker: null,
  participants: [],
  payments: [],
  commissionPayments: [],
};

function buildMocks(existingDeal: Record<string, unknown>, options: {
  commissionPayments?: unknown[];
  receiptCount?: number;
  contract?: { id: string } | null;
} = {}) {
  let current = { ...existingDeal };
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const tx = {
    deal: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
        current = { ...current, ...defined };
        return current;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(async () => current),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(current),
    },
    commissionPayment: {
      // 분배 다시 나누기(recomputeShareAmounts)가 읽는 청구: 마지막으로 고친 금액을 돌려준다
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }): Promise<Record<string, any>> => {
        const found = ((options.commissionPayments ?? []) as Array<Record<string, any>>).find((p) => p.id === where.id) ?? {
          id: where.id,
          distributions: [],
        };
        const calls = paymentUpdate.mock.calls as Array<[{ where: { id: string }; data: Record<string, any> }]>;
        const lastUpdate: { data: Record<string, any> } | undefined = [...calls]
          .reverse()
          .find(([arg]) => arg.where.id === where.id)?.[0];
        return {
          ...found,
          expectedAmount: lastUpdate?.data.expectedAmount ?? found.expectedAmount,
          distributions: (found.distributions ?? []).map((d: Record<string, any>) => ({ shareAmount: 0, status: 'pending', ...d })),
        };
      }),
      findMany: jest.fn().mockResolvedValue(options.commissionPayments ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `payment-${data.clientSide}`, ...data })),
      update: paymentUpdate,
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    dealPayment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    commissionDistribution: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    commissionReceipt: { count: jest.fn().mockResolvedValue(options.receiptCount ?? 0) },
    contract: { findUnique: jest.fn().mockResolvedValue(options.contract ?? null) },
    dealParticipant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    task: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    calendarEvent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    match: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    listingIntake: {
      findUnique: jest.fn().mockResolvedValue({ lifecycleStatus: 'open' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    deal: { findFirst: jest.fn(async () => current) },
    contact: { count: jest.fn().mockResolvedValue(0) },
    partnerBroker: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  return { prisma, tx };
}

describe('DealsService 거래 조건 고치기', () => {
  it('금액 없이 만든 거래에 금액을 넣으면 법정 상한으로 양쪽 수수료 청구를 만든다', async () => {
    const { prisma, tx } = buildMocks(baseDeal);
    const service = new DealsService(prisma);

    const result = await service.update('deal-1', 'office-1', { agreedPrice: 90000 });

    expect(result.commissionNotice).toBe('synced');
    expect(tx.commissionPayment.create).toHaveBeenCalledTimes(2);
    expect(tx.commissionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientSide: 'seller', baseAmount: 90000, expectedAmount: 450, status: 'draft' }),
      }),
    );
  });

  it('손대지 않은 자동 청구는 새 금액에 맞춘다', async () => {
    const autoPayment = (side: string) => ({
      id: `p-${side}`,
      clientSide: side,
      status: 'draft',
      actualAmount: null,
      baseAmount: 90000,
      rate: '0.5',
      expectedAmount: 450,
      dueDate: null,
      distributions: [{ id: `d-${side}`, recipientType: 'our_office', shareRatio: '100' }],
      _count: { receipts: 0, adjustments: 0 },
    });
    const { prisma, tx } = buildMocks(
      { ...baseDeal, agreedPrice: 90000 },
      { commissionPayments: [autoPayment('seller'), autoPayment('buyer')] },
    );
    const service = new DealsService(prisma);

    const result = await service.update('deal-1', 'office-1', { agreedPrice: 130000 });

    expect(result.commissionNotice).toBe('synced');
    expect(tx.commissionPayment.update).toHaveBeenCalledWith({
      where: { id: 'p-seller' },
      data: expect.objectContaining({ baseAmount: 130000, expectedAmount: 780 }),
    });
    expect(tx.commissionDistribution.update).toHaveBeenCalledWith({
      where: { id: 'd-seller' },
      data: { shareAmount: 780 },
    });
  });

  it('내림으로 바꾸기 전에 반올림으로 만든 자동 청구도 자동 청구로 보고 새 금액에 맞춘다', async () => {
    // 30,125만 × 0.4% = 120.5만. 예전 계산은 121만(반올림), 지금은 120만(법정 상한 이내로 내림).
    const legacyAuto = (side: string) => ({
      id: `p-${side}`,
      clientSide: side,
      status: 'draft',
      actualAmount: null,
      baseAmount: 30125,
      rate: '0.4',
      expectedAmount: 121,
      dueDate: null,
      distributions: [{ id: `d-${side}`, recipientType: 'our_office', shareRatio: '100' }],
      _count: { receipts: 0, adjustments: 0 },
    });
    const { prisma, tx } = buildMocks(
      { ...baseDeal, agreedPrice: 30125 },
      { commissionPayments: [legacyAuto('seller'), legacyAuto('buyer')] },
    );
    const service = new DealsService(prisma);

    const result = await service.update('deal-1', 'office-1', { agreedPrice: 40000 });

    // 121만을 "사람이 정한 금액"으로 굳히지 않는다
    expect(result.commissionNotice).toBe('synced');
    expect(tx.commissionPayment.update).toHaveBeenCalledWith({
      where: { id: 'p-seller' },
      data: expect.objectContaining({ baseAmount: 40000, expectedAmount: 160 }),
    });
    expect(tx.commissionPayment.update).toHaveBeenCalledWith({
      where: { id: 'p-buyer' },
      data: expect.objectContaining({ baseAmount: 40000, expectedAmount: 160 }),
    });
  });

  it('반올림도 내림도 아닌 금액은 여전히 사람이 정한 금액으로 본다', async () => {
    const manual = {
      id: 'p-seller',
      clientSide: 'seller',
      status: 'draft',
      actualAmount: null,
      baseAmount: 30125,
      rate: '0.4',
      expectedAmount: 122,
      dueDate: null,
      distributions: [{ id: 'd-seller', recipientType: 'our_office', shareRatio: '100' }],
      _count: { receipts: 0, adjustments: 0 },
    };
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 30125 }, { commissionPayments: [manual] });
    const service = new DealsService(prisma);

    const result = await service.update('deal-1', 'office-1', { agreedPrice: 40000 });

    expect(result.commissionNotice).toBe('kept');
    expect(tx.commissionPayment.update).not.toHaveBeenCalled();
  });

  it('사람이 정한 수수료는 금액이 바뀌어도 그대로 둔다', async () => {
    const manual = {
      id: 'p-seller',
      clientSide: 'seller',
      status: 'draft',
      actualAmount: null,
      baseAmount: 90000,
      rate: '0.4',
      expectedAmount: 360,
      dueDate: null,
      distributions: [{ id: 'd-seller', recipientType: 'our_office', shareRatio: '100' }],
      _count: { receipts: 0, adjustments: 0 },
    };
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 90000 }, { commissionPayments: [manual] });
    const service = new DealsService(prisma);

    const result = await service.update('deal-1', 'office-1', { agreedPrice: 130000 });

    expect(result.commissionNotice).toBe('kept');
    expect(tx.commissionPayment.update).not.toHaveBeenCalled();
    expect(tx.commissionPayment.create).not.toHaveBeenCalled();
  });

  it('소수·음수 금액은 저장 전에 거절한다', async () => {
    const { prisma } = buildMocks(baseDeal);
    const service = new DealsService(prisma);

    await expect(service.update('deal-1', 'office-1', { agreedPrice: -1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update('deal-1', 'office-1', { agreedPrice: 10.5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('DealsService 수수료 정하기', () => {
  it('법정 상한보다 많이 받을 수 없다', async () => {
    const { prisma } = buildMocks({ ...baseDeal, agreedPrice: 90000 });
    const service = new DealsService(prisma);

    await expect(
      service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 451 }),
    ).rejects.toThrow('법정 상한(450만원)보다 많이 받을 수 없습니다.');
  });

  it('공동중개에서 우리 담당이 아닌 쪽은 정할 수 없다', async () => {
    const { prisma } = buildMocks({ ...baseDeal, agreedPrice: 90000, isJointBrokerage: true, ourSide: 'seller' });
    const service = new DealsService(prisma);

    await expect(
      service.setCommission('deal-1', 'office-1', { side: 'buyer', amount: 300 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('본계약으로 확정된 청구는 바로 고치지 않고 조정 요청으로 보낸다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 90000, stage: 'contracted' });
    tx.commissionPayment.findFirst.mockResolvedValue({
      id: 'p-seller',
      status: 'pending',
      actualAmount: null,
      distributions: [],
      _count: { receipts: 0 },
    });
    const service = new DealsService(prisma);

    await expect(
      service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 300 }),
    ).rejects.toThrow('조정 요청');
    expect(tx.commissionPayment.update).not.toHaveBeenCalled();
  });

  it('청구가 없으면 정한 금액으로 만든다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 90000 });
    const service = new DealsService(prisma);

    await service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 360 });

    expect(tx.commissionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientSide: 'seller', expectedAmount: 360, baseAmount: 90000 }),
      }),
    );
  });
});

describe('DealsService 되살리기', () => {
  it('취소 때 닫은 원래 매칭을 다시 거래 전환으로 돌린다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, isCancelled: true, matchId: 'match-1' });
    const service = new DealsService(prisma);

    await service.restore('deal-1', 'office-1');

    expect(tx.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1', officeId: 'office-1', isCancelled: true },
        data: expect.objectContaining({ isCancelled: false, cancelReason: null }),
      }),
    );
    expect(tx.match.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'match-1', closedReason: 'deal_cancelled', closedByDealId: 'deal-1' }),
        data: expect.objectContaining({ stage: 'dealCreated' }),
      }),
    );
  });

  it('같은 매물에 진행 중인 다른 거래가 있으면 되살리지 않는다', async () => {
    const { prisma, tx } = buildMocks({
      ...baseDeal,
      isCancelled: true,
      listingId: 'listing-1',
      listing: { id: 'listing-1', intakeId: 'intake-1' },
    });
    tx.deal.findFirst.mockResolvedValue({ stage: 'contracted' });
    const service = new DealsService(prisma);

    await expect(service.restore('deal-1', 'office-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deal.updateMany).not.toHaveBeenCalled();
  });

  it('취소되지 않은 거래는 되살릴 것이 없다', async () => {
    const { prisma } = buildMocks(baseDeal);
    const service = new DealsService(prisma);

    await expect(service.restore('deal-1', 'office-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('DealsService 지우기', () => {
  it('계약서가 연결된 거래는 지우지 않는다', async () => {
    const { prisma, tx } = buildMocks(baseDeal, { contract: { id: 'contract-1' } });
    const service = new DealsService(prisma);

    await expect(service.remove('deal-1', 'office-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deal.delete).not.toHaveBeenCalled();
  });

  it('수수료 입금 기록이 있는 거래는 지우지 않는다', async () => {
    const { prisma, tx } = buildMocks(baseDeal, { receiptCount: 1 });
    const service = new DealsService(prisma);

    await expect(service.remove('deal-1', 'office-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deal.delete).not.toHaveBeenCalled();
  });

  it('입금 전 수수료 청구와 담당 배정은 함께 지우고, 업무·일정은 연결만 끊는다', async () => {
    const { prisma, tx } = buildMocks(baseDeal);
    const service = new DealsService(prisma);

    await service.remove('deal-1', 'office-1');

    expect(tx.commissionPayment.deleteMany).toHaveBeenCalledWith({ where: { dealId: 'deal-1', officeId: 'office-1' } });
    expect(tx.dealParticipant.deleteMany).toHaveBeenCalled();
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { dealId: 'deal-1', officeId: 'office-1' },
      data: { dealId: null },
    });
    expect(tx.deal.delete).toHaveBeenCalledWith({ where: { id: 'deal-1' } });
  });
});

describe('DealsService 계약서 값으로 대금 일정 맞추기', () => {
  function buildMatchMocks(
    contract: Record<string, unknown> | null,
    payments: Array<Record<string, unknown>>,
    documentFields?: Record<string, string>,
  ) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'deal-1' }]),
      deal: {
        findFirst: jest.fn().mockResolvedValue({
          isCancelled: false,
          contract: contract ? { id: 'contract-1', ...contract } : null,
          payments: [...payments],
        }),
      },
      contractDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValue(documentFields ? { metadata: { documentEngine: { fields: documentFields } } } : null),
      },
      dealPayment: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', status: 'pending', ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      deal: { findFirst: jest.fn().mockResolvedValue({ ...baseDeal }) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return { prisma, tx };
  }

  const contract = {
    contractDate: new Date('2026-11-22T00:00:00Z'),
    statedDeposit: 9000,
    statedInterimPayment: null,
    statedInterimDate: null,
    statedBalance: 81000,
    statedBalanceDate: new Date('2027-03-20T00:00:00Z'),
  };

  it('거래 줄을 잠근 뒤 다른 칸만 계약서 값으로 고치고, 없는 줄은 만든다', async () => {
    const { prisma, tx } = buildMatchMocks(contract, [
      { id: 'pay-balance', kind: 'balance', sequence: 1, status: 'pending', scheduledAmount: 81000, scheduledDate: new Date('2027-03-15T00:00:00Z') },
    ]);
    const service = new DealsService(prisma);

    const result = await service.matchPaymentsToContract('deal-1', 'office-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.dealPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'contract', sequence: 1, scheduledAmount: 9000, scheduledDate: contract.contractDate }),
      }),
    );
    expect(tx.dealPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay-balance' },
      data: { scheduledAmount: undefined, scheduledDate: contract.statedBalanceDate },
    });
    expect(result.changed).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('한국 시간으로 같은 날이면 다르다고 보지 않는다', async () => {
    const { prisma, tx } = buildMatchMocks(
      { ...contract, statedDeposit: null },
      [{ id: 'pay-balance', kind: 'balance', sequence: 1, status: 'pending', scheduledAmount: 81000, scheduledDate: new Date('2027-03-19T15:00:00Z') }],
    );
    const service = new DealsService(prisma);

    const result = await service.matchPaymentsToContract('deal-1', 'office-1');

    expect(tx.dealPayment.update).not.toHaveBeenCalled();
    expect(result.changed).toBe(0);
  });

  it('문서에 2차 중도금이 있으면 합치지 않고 차수별로 맞춘다', async () => {
    const { prisma, tx } = buildMatchMocks(
      { ...contract, statedDeposit: null, statedBalance: null, statedBalanceDate: null, statedInterimPayment: 20000, statedInterimDate: new Date('2026-12-01T00:00:00Z') },
      [],
      { interimPayment: '10000', interimPaymentDate: '2026-12-01', interimPayment2: '10000', interimPayment2Date: '2027-01-01' },
    );
    const service = new DealsService(prisma);

    await service.matchPaymentsToContract('deal-1', 'office-1');

    expect(tx.dealPayment.create).toHaveBeenCalledTimes(2);
    expect(tx.dealPayment.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ kind: 'interim', sequence: 1, scheduledAmount: 10000, scheduledDate: new Date('2026-12-01') }),
    }));
    expect(tx.dealPayment.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ kind: 'interim', sequence: 2, scheduledAmount: 10000, scheduledDate: new Date('2027-01-01') }),
    }));
  });

  it('이미 받은 줄과 여러 차수의 중도금(문서는 한 번)은 그대로 두고 알린다', async () => {
    const { prisma, tx } = buildMatchMocks(
      { ...contract, statedInterimPayment: 30000, statedInterimDate: new Date('2026-12-10T00:00:00Z') },
      [
        { id: 'pay-contract', kind: 'contract', sequence: 1, status: 'paid', scheduledAmount: 8000, scheduledDate: null },
        { id: 'i1', kind: 'interim', sequence: 1, status: 'pending', scheduledAmount: 20000, scheduledDate: null },
        { id: 'i2', kind: 'interim', sequence: 2, status: 'pending', scheduledAmount: 5000, scheduledDate: null },
        { id: 'pay-balance', kind: 'balance', sequence: 1, status: 'pending', scheduledAmount: 81000, scheduledDate: new Date('2027-03-20T00:00:00Z') },
      ],
    );
    const service = new DealsService(prisma);

    const result = await service.matchPaymentsToContract('deal-1', 'office-1');

    expect(tx.dealPayment.update).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      '계약금은 이미 받아서 그대로 두었습니다.',
      '중도금이 여러 번으로 나뉘어 있어 그대로 두었습니다.',
    ]);
  });

  it('계약서가 없으면 맞출 수 없다', async () => {
    const { prisma } = buildMatchMocks(null, []);
    const service = new DealsService(prisma);

    await expect(service.matchPaymentsToContract('deal-1', 'office-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('DealsService 담당', () => {
  function buildCreateMocks(activeUserIds: string[]) {
    const tx = {
      deal: {
        create: jest.fn().mockResolvedValue({ id: 'deal-new' }),
        findUnique: jest.fn().mockResolvedValue({ ...baseDeal, id: 'deal-new' }),
      },
      dealParticipant: { create: jest.fn().mockResolvedValue({}) },
      commissionPayment: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'p' }) },
      commissionDistribution: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          activeUserIds.includes(where.id) ? { id: where.id } : null,
        ),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return { prisma, tx };
  }
  const AGENT = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';

  it('거래를 만든 사람이 담당(맡은 비중 100)이 된다', async () => {
    const { prisma, tx } = buildCreateMocks([AGENT]);
    const service = new DealsService(prisma);

    await service.create('office-1', { transactionType: 'sale' }, { userId: AGENT, role: 'agent' });

    expect(tx.dealParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dealId: 'deal-new', userId: AGENT, sharePercent: 100 }),
    });
  });

  it('직원은 다른 사람을 담당으로 넣지 못하고 자기가 담당이 된다', async () => {
    const { prisma, tx } = buildCreateMocks([AGENT, OTHER]);
    const service = new DealsService(prisma);

    await service.create('office-1', { transactionType: 'sale', assigneeUserId: OTHER }, { userId: AGENT, role: 'agent' });

    expect(tx.dealParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: AGENT }),
    });
  });

  it('대표·매니저는 다른 직원을 담당으로 고를 수 있다', async () => {
    const { prisma, tx } = buildCreateMocks([AGENT, OTHER]);
    const service = new DealsService(prisma);

    await service.create('office-1', { transactionType: 'sale', assigneeUserId: OTHER }, { userId: AGENT, role: 'manager' });

    expect(tx.dealParticipant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: OTHER }),
    });
  });
});

describe('DealsService 거래 취소 때 돈 처리', () => {
  it('돈이 오가지 않은 청구·일정은 표식을 덧붙여 취소하고, 받은 돈 줄은 원래 메모 뒤에 처리 메모를 붙인다', async () => {
    const { prisma, tx } = buildMocks(baseDeal);
    tx.commissionPayment.findMany.mockResolvedValue([{ id: 'c1', note: null }]);
    tx.dealPayment.findMany.mockResolvedValue([
      { id: 'pre', status: 'paid', paidAmount: 500, memo: '국민은행 123 이체 확인' },
      { id: 'bal', status: 'pending', paidAmount: null, memo: null },
      { id: 'manual', status: 'cancelled', paidAmount: null, memo: '손님 요청으로 뺌' },
    ]);
    const service = new DealsService(prisma);

    await service.cancel('deal-1', 'office-1', { cancelledBy: 'buyer', paidMoneyNote: '위약금으로 남김' });

    expect(tx.commissionPayment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'cancelled', note: '거래 취소로 함께 취소됨' },
    });
    expect(tx.dealPayment.update).toHaveBeenCalledWith({
      where: { id: 'pre' },
      data: { memo: '국민은행 123 이체 확인\n거래 취소: 위약금으로 남김' },
    });
    expect(tx.dealPayment.update).toHaveBeenCalledWith({
      where: { id: 'bal' },
      data: { status: 'cancelled', memo: '거래 취소로 함께 취소됨' },
    });
    // 사람이 미리 취소해 둔 줄은 건드리지 않는다
    expect(tx.dealPayment.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'manual' } }));
  });

  it('되살리면 표식이 붙은 줄만 되돌리고 덧붙인 메모만 뗀다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, isCancelled: true, stage: 'contracted' });
    tx.commissionPayment.findMany.mockResolvedValue([
      { id: 'c1', status: 'cancelled', note: '거래 취소로 함께 취소됨' },
    ]);
    tx.dealPayment.findMany.mockResolvedValue([
      { id: 'pre', status: 'paid', paidAmount: 500, memo: '국민은행 123 이체 확인\n거래 취소: 위약금으로 남김' },
      { id: 'bal', status: 'cancelled', paidAmount: null, memo: '거래 취소로 함께 취소됨' },
    ]);
    const service = new DealsService(prisma);

    await service.restore('deal-1', 'office-1');

    expect(tx.commissionPayment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'pending', note: null },
    });
    expect(tx.dealPayment.update).toHaveBeenCalledWith({
      where: { id: 'pre' },
      data: { status: undefined, memo: '국민은행 123 이체 확인' },
    });
    expect(tx.dealPayment.update).toHaveBeenCalledWith({
      where: { id: 'bal' },
      data: { status: 'pending', memo: null },
    });
  });
});

describe('DealsService 분배·청구번호', () => {
  it('협의 금액을 정하면 수금 화면과 같은 규칙으로 나눈다 (850 → 우리 33.3% 284 · 상대 66.7% 566)', async () => {
    const payment = {
      id: 'p-seller',
      status: 'draft',
      actualAmount: null,
      expectedAmount: 900,
      distributions: [
        { id: 'd-our', recipientType: 'our_office', shareRatio: '33.3', shareAmount: 300, status: 'pending' },
        { id: 'd-partner', recipientType: 'partner_broker', shareRatio: '66.7', shareAmount: 600, status: 'pending' },
      ],
      _count: { receipts: 0 },
    };
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 200000 }, { commissionPayments: [payment] });
    tx.commissionPayment.findFirst.mockResolvedValue(payment);
    const service = new DealsService(prisma);

    await service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 850 });

    expect(tx.commissionDistribution.update).toHaveBeenCalledWith({ where: { id: 'd-our' }, data: { shareAmount: 284 } });
    expect(tx.commissionDistribution.update).toHaveBeenCalledWith({ where: { id: 'd-partner' }, data: { shareAmount: 566 } });
  });

  it('청구번호는 그 달 가장 큰 번호 + 1 (숫자로 비교, 지운 번호가 있어도 겹치지 않음)', async () => {
    const { prisma, tx } = buildMocks(baseDeal);
    const now = new Date();
    const prefix = `P-${String(now.getFullYear() % 100).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
    tx.commissionPayment.findMany.mockResolvedValue([
      { code: `${prefix}-02` },
      { code: `${prefix}-11` },
      { code: `${prefix}-9` },
      { code: `${prefix}-01-02` },
    ]);
    const service = new DealsService(prisma);

    const code = await (service as any).nextCommissionCode(tx, 'office-1');

    expect(code).toBe(`${prefix}-12`);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});

describe('DealsService 수수료를 볼 수 있는 사람', () => {
  const AGENT = 'agent-1';
  const dealWith = (participants: Array<{ userId: string; sharePercent: number | null }>) => ({
    ...baseDeal,
    participants: participants.map((participant) => ({
      ...participant,
      id: `pp-${participant.userId}`,
      commissionRate: '50',
      commissionAmount: 300,
      user: { id: participant.userId, name: participant.userId },
    })),
    commissionPayments: [
      { id: 'p1', expectedAmount: 450, actualAmount: null, status: 'pending', distributions: [], adjustments: [] },
    ],
  });
  function serviceReturning(deal: Record<string, unknown>) {
    const prisma = {
      deal: {
        findFirst: jest.fn().mockResolvedValue(deal),
        findMany: jest.fn().mockResolvedValue([deal]),
      },
    } as unknown as PrismaService;
    return new DealsService(prisma);
  }

  it('중개사는 담당이 아닌 거래의 청구·요약을 받지 않는다', async () => {
    const service = serviceReturning(dealWith([{ userId: 'other', sharePercent: 100 }]));

    const [row] = await service.findAll('office-1', false, { userId: AGENT, role: 'agent' });
    const one = await service.findOne('deal-1', 'office-1', { userId: AGENT, role: 'agent' });

    for (const deal of [row, one]) {
      expect(deal.commissionPayments).toEqual([]);
      expect(deal.commissionSummary).toBeNull();
      expect(deal.commissionHidden).toBe(true);
      // 다른 직원의 몫(%)·배분 금액도 비운다
      expect(deal.participants[0]).toEqual(expect.objectContaining({ commissionRate: null, commissionAmount: null }));
    }
  });

  it('중개사도 자기가 담당인 거래의 수수료는 본다', async () => {
    const service = serviceReturning(dealWith([{ userId: AGENT, sharePercent: 100 }]));

    const deal = await service.findOne('deal-1', 'office-1', { userId: AGENT, role: 'agent' });

    expect(deal.commissionPayments).toHaveLength(1);
    expect(deal.commissionSummary).toEqual(expect.objectContaining({ billed: 450 }));
    expect(deal.commissionHidden).toBeUndefined();
  });

  it('맡은 비중 없이 배정만 된 사람은 담당이 아니다 (수금 화면과 같은 기준)', async () => {
    const service = serviceReturning(dealWith([{ userId: AGENT, sharePercent: null }]));

    const deal = await service.findOne('deal-1', 'office-1', { userId: AGENT, role: 'agent' });

    expect(deal.commissionHidden).toBe(true);
  });

  it('대표·매니저와 내부 호출은 그대로 받는다', async () => {
    const service = serviceReturning(dealWith([{ userId: 'other', sharePercent: 100 }]));

    for (const viewer of [{ userId: 'm', role: 'manager' }, { userId: 'o', role: 'owner' }, undefined]) {
      const deal = await service.findOne('deal-1', 'office-1', viewer);
      expect(deal.commissionPayments).toHaveLength(1);
      expect(deal.commissionHidden).toBeUndefined();
    }
  });
});

describe('DealsService 검토에서 나온 경계', () => {
  it('본계약을 건너뛰고 중도금/잔금으로 가도 작성 중 청구를 수금 대기로 확정한다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, stage: 'preparing' }, { contract: { id: 'contract-1' } });
    (tx as any).commissionPayment.updateMany = jest.fn().mockResolvedValue({ count: 2 });
    (tx.contract.findUnique as jest.Mock).mockResolvedValue({ id: 'contract-1', statedBalanceDate: null });
    (prisma as any).contract = tx.contract;
    const service = new DealsService(prisma);

    await service.updateStage('deal-1', 'office-1', { stage: 'settling' });

    expect((tx as any).commissionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'draft' }), data: expect.objectContaining({ status: 'pending' }) }),
    );
  });

  it('면제·취소된 청구가 있는 쪽에는 setCommission 이 새 청구를 만들지 않는다', async () => {
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 90000, stage: 'contracted' });
    tx.commissionPayment.findFirst
      .mockResolvedValueOnce(null) // 살아 있는 청구 없음
      .mockResolvedValueOnce({ id: 'waived' }); // 면제된 청구 있음
    const service = new DealsService(prisma);

    await expect(
      service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 100 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.commissionPayment.create).not.toHaveBeenCalled();
  });

  it('취소된 거래는 조건(금액)을 고칠 수 없다', async () => {
    const { prisma } = buildMocks({ ...baseDeal, isCancelled: true });
    const service = new DealsService(prisma);

    await expect(service.update('deal-1', 'office-1', { agreedPrice: 90000 })).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateStage('deal-1', 'office-1', { stage: 'preparing', agreedPrice: 90000 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('DealsService 예전 반올림 청구 바로잡기', () => {
  it('수금 대기여도 예전 반올림 금액(121만)을 지금 법정 상한(120만)으로 내리는 것은 허용한다', async () => {
    const payment = {
      id: 'p-seller',
      status: 'pending',
      actualAmount: null,
      expectedAmount: 121,
      distributions: [{ id: 'd1', recipientType: 'our_office', shareRatio: '100', shareAmount: 121, status: 'pending' }],
      _count: { receipts: 0 },
    };
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 30125, stage: 'contracted' }, { commissionPayments: [payment] });
    tx.commissionPayment.findFirst.mockResolvedValue(payment);
    const service = new DealsService(prisma);

    await service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 120 });

    expect(tx.commissionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-seller' }, data: expect.objectContaining({ expectedAmount: 120 }) }),
    );
  });

  it('수금 대기 청구를 다른 금액으로 바꾸는 것은 여전히 조정 요청으로 보낸다', async () => {
    const payment = { id: 'p-seller', status: 'pending', actualAmount: null, expectedAmount: 121, distributions: [], _count: { receipts: 0 } };
    const { prisma, tx } = buildMocks({ ...baseDeal, agreedPrice: 30125, stage: 'contracted' });
    tx.commissionPayment.findFirst.mockResolvedValue(payment);
    const service = new DealsService(prisma);

    await expect(service.setCommission('deal-1', 'office-1', { side: 'seller', amount: 100 })).rejects.toThrow('조정 요청');
  });
});
