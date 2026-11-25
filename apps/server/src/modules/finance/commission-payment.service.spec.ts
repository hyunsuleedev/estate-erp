import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CashflowService } from './cashflow.service';
import { CommissionAdjustmentService, nextAdjustmentCode } from './commission-adjustment.service';
import { uuidParam } from './finance-params';
import { partnerShareCalcRows, type ShareDistributionRow } from './partner-shares';
import { computeSettlement, monthRange } from './settlement-calc';
import { SettlementService } from './settlement.service';
import {
  CommissionPaymentService,
  refreshPaymentFromReceipts,
  paymentScopeFor,
  seesAllPayments,
  shareAmountsFor,
} from './commission-payment.service';

const PID = '11111111-1111-4111-8111-111111111111';
const OWNER = { userId: 'u-owner', role: 'owner' };
const MANAGER = { userId: 'u-manager', role: 'manager' };
const AGENT = { userId: 'u-agent', role: 'agent' };

const agentScope = {
  deal: { participants: { some: { userId: 'u-agent', sharePercent: { not: null } } } },
};

const row = {
  id: 'p1',
  dealId: 'd1',
  expectedAmount: 660,
  payerContact: { id: 'c1', name: '강수연', phones: [{ number: '010-1234-5678' }] },
};

function makeService() {
  const findMany = jest.fn().mockResolvedValue([row]);
  const prisma = { commissionPayment: { findMany } };
  return { service: new CommissionPaymentService(prisma as never), findMany };
}

describe('직원에게 보이는 수수료 청구', () => {
  it('대표·실장은 사무소 전체, 직원과 모르는 역할은 담당으로 배정된 거래만 본다', () => {
    expect(seesAllPayments(OWNER)).toBe(true);
    expect(seesAllPayments(MANAGER)).toBe(true);
    expect(seesAllPayments(AGENT)).toBe(false);
    expect(seesAllPayments({ userId: 'x', role: 'unknown' })).toBe(false);
    expect(paymentScopeFor(OWNER)).toEqual({});
    expect(paymentScopeFor(AGENT)).toEqual(agentScope);
    // 정산 계산처럼 사람을 넘기지 않는 내부 호출은 좁히지 않는다
    expect(paymentScopeFor(undefined)).toEqual({});
  });

  it('사무소 전체 목록(캘린더)은 직원에게 담당 거래만, 전화번호 없이 준다', async () => {
    const { service, findMany } = makeService();
    const rows = await service.listByOffice('o1', {}, AGENT);
    expect(findMany.mock.calls[0][0].where).toEqual({ officeId: 'o1', ...agentScope });
    expect(rows[0].payerContact).toEqual({ id: 'c1', name: '강수연' });
  });

  it('대표에게는 전체를 전화번호와 함께 준다', async () => {
    const { service, findMany } = makeService();
    const rows = await service.listByOffice('o1', { status: 'pending' }, OWNER);
    expect(findMany.mock.calls[0][0].where).toEqual({ officeId: 'o1', status: 'pending' });
    expect(rows[0].payerContact).toEqual(row.payerContact);
  });

  it('거래별 청구도 같은 기준으로 좁힌다 (목록만 막고 상세가 열려 있지 않게)', async () => {
    const { service, findMany } = makeService();
    const rows = await service.listByDeal('o1', 'd1', AGENT);
    expect(findMany.mock.calls[0][0].where).toEqual({ officeId: 'o1', dealId: 'd1', ...agentScope });
    expect(rows[0].payerContact).toEqual({ id: 'c1', name: '강수연' });
  });
});

describe('직원의 조정 요청', () => {
  it('담당이 아닌 거래의 청구는 없는 것으로 본다', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { commissionPayment: { findFirst } };
    const service = new CommissionAdjustmentService(prisma as never);
    await expect(
      service.request('o1', 'u-agent', { paymentId: PID, type: 'discount', amount: -10, reason: '협의' }, AGENT),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: PID, officeId: 'o1', ...agentScope });
  });
});

/** 조정 요청이 쓰는 가짜 DB. 청구 줄 잠금($queryRaw)과 입금 합계·대기 조정 수를 흉내 낸다. */
function adjustmentDb({ waiting = 0, receivedSupplyWon = 0 } = {}) {
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data }));
  const tx = {
    // 첫 번째는 청구 줄 잠금, 두 번째는 조정 번호(가장 큰 번호)
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ id: PID, office_id: 'o1', status: 'pending', expected_amount: 900 }])
      .mockResolvedValueOnce([{ max: 3 }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    commissionAdjustment: { count: jest.fn().mockResolvedValue(waiting), create },
    commissionReceipt: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountWon: 0, supplyWon: receivedSupplyWon } }) },
  };
  const prisma = {
    commissionPayment: { findFirst: jest.fn().mockResolvedValue({ id: PID, status: 'pending', expectedAmount: 900 }) },
    commissionAdjustment: { count: jest.fn().mockResolvedValue(3) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  return { service: new CommissionAdjustmentService(prisma as never), create };
}

describe('조정 요청 중복', () => {
  it('승인을 기다리는 조정이 있으면 같은 청구에 또 받지 않는다', async () => {
    const { service, create } = adjustmentDb({ waiting: 1 });
    await expect(
      service.request('o1', 'u-owner', { paymentId: PID, type: 'discount', amount: -50, reason: '협의' }, OWNER),
    ).rejects.toThrow(new ConflictException('이 청구에는 승인을 기다리는 조정 요청이 이미 있습니다.'));
    expect(create).not.toHaveBeenCalled();
  });

  it('대기 중인 조정이 없으면 남은 금액 안에서 만든다 (면제는 남은 금액 전부)', async () => {
    // 900만 청구에 부가세 뺀 300만원을 받았으면 남은 금액은 600만
    const { service, create } = adjustmentDb({ receivedSupplyWon: 3_000_000 });
    await service.request('o1', 'u-owner', { paymentId: PID, type: 'waive', amount: 0, reason: '서비스' }, OWNER);
    expect(create.mock.calls[0][0].data).toMatchObject({ code: 'ADJ-004', type: 'waive', amount: -600 });
  });
});

describe('분배 금액 다시 계산', () => {
  const row = (recipientType: string, shareRatio: number, shareAmount = 0, status = 'pending') => ({
    recipientType,
    shareRatio,
    shareAmount,
    status,
  });

  it('할인한 청구액을 비율대로 나눈다: 줄마다 내림, 남는 만원은 우리 몫', () => {
    // 900 → 850 할인. 반반이면 425 / 425
    expect(shareAmountsFor(850, [row('our_office', 50, 450), row('partner_broker', 50, 450)])).toEqual([425, 425]);
    // 33.3 / 66.7 이면 283.05 → 283, 566.95 → 566, 남는 1만은 우리 몫 → 284 / 566
    expect(shareAmountsFor(850, [row('our_office', 33.3), row('partner_broker', 66.7)])).toEqual([284, 566]);
    // 단독중개는 청구액 그대로
    expect(shareAmountsFor(850, [row('our_office', 100, 900)])).toEqual([850]);
  });

  it('정산을 기록한 줄은 실제로 주고받은 금액이라 그대로 두고 나머지를 맞춘다', () => {
    expect(
      shareAmountsFor(850, [row('our_office', 50, 450), row('partner_broker', 50, 450, 'settled')]),
    ).toEqual([400, 450]);
  });
});

describe('공동중개 상대가 수금하는 청구', () => {
  it('캐시플로우의 받을 돈·연체에 넣지 않는다 (우리가 받을 돈만)', async () => {
    const past = new Date('2026-11-01T00:00:00Z');
    const payment = (id: string, collectedByOffice: string, status: string) => ({
      id,
      clientSide: 'buyer',
      collectedByOffice,
      expectedAmount: 100,
      actualAmount: null,
      dueDate: past,
      paidAt: null,
      status,
      taxInvoiceStatus: 'none',
    });
    const deal = {
      id: 'd1',
      stage: 'contracted',
      isCancelled: false,
      agreedPrice: 50000,
      transactionType: 'sale',
      listing: null,
      buyerContact: null,
      sellerContact: null,
      payments: [],
      participants: [],
      commissionPayments: [
        payment('ours-overdue', 'us', 'overdue'),
        payment('ours-late', 'us', 'pending'),
        payment('partner-overdue', 'partner', 'overdue'),
        payment('partner-late', 'partner', 'pending'),
      ],
    };
    const prisma = {
      deal: { findMany: jest.fn().mockResolvedValue([deal]) },
      commissionReceipt: { findMany: jest.fn().mockResolvedValue([]) },
      commissionDistribution: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const expenses = { getMonthlyTotal: jest.fn().mockResolvedValue(0) };
    const service = new CashflowService(prisma as never, expenses as never);
    const summary = await service.getSummary('o1', 2026, 11);
    // 우리 청구 두 건(연체 100 + 기한 지난 수금대기 100)만 연체로 센다
    expect(summary.overdue).toBe(200);
    expect(summary.pending).toBe(0);
  });
});

describe('우리 통장에 들어온 돈 (캐시플로우 수금·원장 수금·캘린더 입금의 한 기준)', () => {
  it('우리가 수금한 청구의 입금 + 상대가 수금한 청구에서 받은 우리 몫만 센다', async () => {
    const nov = new Date('2026-11-22T00:00:00Z');
    const receiptFind = jest.fn().mockResolvedValue([
      // 우리가 수금한 청구(상대 몫 50% 있음): 부가세 포함 7,260,000 → 부가세 빼고 6,600,000
      { id: 'r1', paymentId: 'ours', kind: 'receipt', receivedAt: nov, supplyWon: 6_600_000 },
    ]);
    const distFind = jest.fn().mockResolvedValue([
      // 상대가 수금한 청구(100만)에서 받음 기록한 우리 몫 40%
      { id: 'd1', paymentId: 'theirs', settledAt: nov, shareAmount: 40 },
    ]);
    const prisma = {
      deal: { findMany: jest.fn().mockResolvedValue([]) },
      commissionReceipt: { findMany: receiptFind },
      commissionDistribution: { findMany: distFind },
    };
    const expenses = { getMonthlyTotal: jest.fn().mockResolvedValue(418) };
    const summary = await new CashflowService(prisma as never, expenses as never).getSummary('o1', 2026, 11);
    // 660만 + 40만 = 700만. 상대가 받은 100만(부가세 포함 110만)은 넣지 않는다.
    expect(summary.collected).toBe(700);
    expect(summary.netProfit).toBe(700 - 418);
    // 입금 기록은 우리가 수금한 청구만, 분배는 상대가 수금한 청구의 '받음 기록'한 우리 몫만 읽는다
    expect(receiptFind.mock.calls[0][0].where.payment).toMatchObject({ collectedByOffice: 'us' });
    expect(distFind.mock.calls[0][0].where).toMatchObject({
      recipientType: 'our_office',
      status: 'settled',
      payment: { collectedByOffice: { not: 'us' } },
    });
  });
});

describe('독립 검토에서 나온 결함', () => {
  it('순이익 = 수금 − 공동중개 줄 몫(그 달 수금의 비례 몫) − 고정비, 취소한 거래의 입금도 통장 기준으로 넣는다', async () => {
    const nov = new Date('2026-11-10T00:00:00Z');
    const receiptFind = jest.fn().mockResolvedValue([
      // 우리 50 : 상대 50 청구 200만을 우리가 받음 → 줄 몫 100만 (보냈는지와 상관없이)
      { id: 'r1', paymentId: 'p1', kind: 'receipt', receivedAt: nov, supplyWon: 2_000_000,
        payment: { distributions: [{ shareRatio: 50 }] } },
      // 취소한 거래에 받은 돈 150만 (돌려주기 전까지 통장에 있다)
      { id: 'r2', paymentId: 'p2', kind: 'receipt', receivedAt: nov, supplyWon: 1_500_000,
        payment: { distributions: [] } },
    ]);
    const prisma = {
      deal: { findMany: jest.fn().mockResolvedValue([]) },
      commissionReceipt: { findMany: receiptFind },
      commissionDistribution: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const expenses = { getMonthlyTotal: jest.fn().mockResolvedValue(100) };
    const summary = await new CashflowService(prisma as never, expenses as never).getSummary('o1', 2026, 11);
    expect(summary.collected).toBe(350);
    expect(summary.partnerShare).toBe(100);
    expect(summary.netProfit).toBe(350 - 100 - 100);
    // 거래 취소 여부로 거르지 않는다 (돌려주면 '돌려준 돈' 기록으로 빠진다)
    expect(receiptFind.mock.calls[0][0].where.payment.deal).toBeUndefined();
  });

  it('받은 돈이 0이면 수금 대기로 돌아가고, 일부만 돌려준 청구는 수금 완료로 남는다', async () => {
    const run = async (gross: number, net: number) => {
      const update = jest.fn().mockResolvedValue({});
      const tx = {
        commissionPayment: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1', status: 'collected', expectedAmount: 200, paidAt: null, method: null }),
          update,
        },
        commissionReceipt: {
          aggregate: jest
            .fn()
            .mockResolvedValueOnce({ _sum: { amountWon: net * 1.1, supplyWon: net } })
            .mockResolvedValueOnce({ _sum: { supplyWon: gross } }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      await refreshPaymentFromReceipts(tx as never, 'p1');
      return update.mock.calls[0][0].data;
    };
    expect(await run(2_000_000, 0)).toMatchObject({ status: 'pending', actualAmount: 0 });
    expect(await run(2_000_000, 1_000_000)).toMatchObject({ status: 'collected', actualAmount: 100 });
    expect(await run(1_000_000, 1_000_000)).toMatchObject({ status: 'partial', actualAmount: 100 });
  });

  it('돌려준 돈 기록을 취소해 받은 돈이 청구액을 넘으면 막는다', async () => {
    const tx = {
      commissionReceipt: {
        findFirst: jest.fn().mockResolvedValue({ id: 'f1', paymentId: PID, settlementId: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountWon: 2_750_000, supplyWon: 2_500_000 } }),
      },
      commissionPayment: { findUniqueOrThrow: jest.fn().mockResolvedValue({ expectedAmount: 200 }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: PID, office_id: 'o1', status: 'collected', expected_amount: 200 }]),
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const service = new CommissionPaymentService(prisma as never);
    await expect(service.voidReceipt('f1', 'o1', null)).rejects.toThrow(
      new ConflictException('이 기록을 취소하면 받은 돈이 청구액보다 많아집니다.'),
    );
  });

  it('정산 기록을 되돌리면 같은 규칙(내림, 남는 만원은 우리 몫)으로 다시 나눈다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      commissionDistribution: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dp', paymentId: PID, status: 'settled', shareRatio: 33.3 }),
        update,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'dp' }),
      },
      commissionPayment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          expectedAmount: 850,
          distributions: [
            { id: 'do', recipientType: 'our_office', shareRatio: 66.7, shareAmount: 0, status: 'pending' },
            { id: 'dp', recipientType: 'partner_broker', shareRatio: 33.3, shareAmount: 280, status: 'pending' },
          ],
        }),
      },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    await new CommissionPaymentService(prisma as never).unsettleDistribution('dp', 'o1');
    // 850 × 66.7% = 566.95 → 566, × 33.3% = 283.05 → 283, 남는 1만은 우리 몫 → 567 / 283
    expect(update.mock.calls.map((c) => [c[0].where.id, c[0].data.shareAmount ?? c[0].data.status])).toEqual([
      ['dp', 'pending'],
      ['do', 567],
      ['dp', 283],
    ]);
  });

  it('조정 번호는 가장 큰 번호 + 1 (건수 + 1이 아니다)', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ max: 12 }]),
    };
    expect(await nextAdjustmentCode(tx as never, 'o1')).toBe('ADJ-013');
    expect(tx.$executeRaw).toHaveBeenCalled(); // 사무소 단위 잠금
  });

  it('주소의 id 형식이 틀리면 한국어 400', async () => {
    await expect(uuidParam('청구').transform('not-a-uuid', { type: 'param' } as never)).rejects.toThrow(
      new BadRequestException('잘못된 청구 주소입니다.'),
    );
  });
});

describe('내 수수료의 확정 전 몫', () => {
  it('다음 정산 달(가장 최근 확정 달의 다음 달)을 정산 화면과 같은 계산으로 구해 본인 줄만 준다', async () => {
    const prisma = { settlement: { findFirst: jest.fn().mockResolvedValue({ month: '2026-11' }) } };
    const service = new SettlementService(prisma as never);
    const line = (userId: string, netWon: number) => ({
      userId, name: userId, employmentType: 'freelancer', withholdTax: true, targetWon: 0, shareWon: netWon,
      baseWon: 0, adjustWon: 0, carryInWon: 0, withholdingWon: 0, netWon, carryOutWon: 0, detail: [],
    });
    const calculate = jest
      .spyOn(service as unknown as { calculate: () => unknown }, 'calculate')
      .mockResolvedValue({ timing: 'closed', result: { lines: [line('kim', 100), line('lee', 200)], waiting: [], cancelled: [], includedReceiptIds: [] } } as never);
    const preview = await service.previewMine('o1', 'lee');
    expect(calculate.mock.calls[0]).toEqual([prisma, 'o1', '2026-12']);
    expect(preview.month).toBe('2026-12');
    expect(preview.line).toMatchObject({ netWon: 200 });
    expect(preview.line).not.toHaveProperty('userId');
    expect((await service.previewMine('o1', 'park')).line).toBeNull();
  });
});

describe('공동중개 받은 몫을 직원 정산에 넣는다 (사용자 결정)', () => {
  const NOV = monthRange('2026-11');
  const DEC = monthRange('2026-12');
  const dist = (over: Partial<ShareDistributionRow> = {}): ShareDistributionRow => ({
    id: 'd1',
    dealId: 'deal1',
    dealTitle: '고덕그라시움 101동 3402호',
    status: 'settled',
    settledAt: new Date('2026-11-22T00:00:00Z'),
    updatedAt: new Date('2026-11-22T00:00:00Z'),
    shareAmount: 40,
    deal: { stage: 'completed', stageChangedAt: new Date('2026-11-01T00:00:00Z'), isCancelled: false, cancelledAt: null },
    ...over,
  });
  const staff = (userId: string, ratio: number) => ({
    userId, name: userId, employmentType: 'freelancer' as const, withholdTax: true, ratio, baseWon: 0, carryInWon: 0,
  });

  it('받음 기록한 몫을 부가세 별도 금액 그대로 원으로 바꿔 입금 한 줄로 넣는다 (공동중개 비율은 다시 곱하지 않음)', () => {
    const rows = partnerShareCalcRows([dist()], [], NOV.end);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `share:d1:${Date.parse('2026-11-22T00:00:00Z')}`,
      kind: 'receipt',
      supplyWon: 400_000,
      amountWon: 400_000,
      ourRatio: 100,
      source: 'partner_share',
      balanceDone: true,
    });
    // 이대리 100% 맡음, 직원 몫 50% → 200,000원, 3.3% = 6,000 + 600 → 지급 193,400원
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: rows,
      participants: [{ dealId: 'deal1', userId: 'lee', sharePercent: 100, ratioOverride: null }],
      staff: [staff('lee', 50)],
    });
    expect(result.lines[0]).toMatchObject({ shareWon: 200_000, withholdingWon: 6_600, netWon: 193_400 });
    expect(result.lines[0].detail[0]).toMatchObject({ source: 'partner_share', supplyWon: 400_000 });
  });

  it('우리가 수금한 입금과 합쳐 같은 규칙으로 나눈다 (60:40 공동 담당)', () => {
    const rows = partnerShareCalcRows([dist({ shareAmount: 100 })], [], NOV.end);
    const receipt = {
      id: 'r1', paymentId: 'p1', dealId: 'deal1', dealTitle: 'x', kind: 'receipt' as const,
      receivedAt: new Date('2026-11-10T00:00:00Z'), amountWon: 2_200_000, supplyWon: 2_000_000, ourRatio: 100,
      balanceDone: true, balanceDoneAt: null,
    };
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [receipt, ...rows],
      participants: [
        { dealId: 'deal1', userId: 'kim', sharePercent: 60, ratioOverride: null },
        { dealId: 'deal1', userId: 'lee', sharePercent: 40, ratioOverride: null },
      ],
      staff: [staff('kim', 50), staff('lee', 40)],
    });
    // 대상 = 2,000,000 + 1,000,000 = 3,000,000. kim 60% × 50% = 900,000 / lee 40% × 40% = 480,000
    const kim = result.lines.find((l) => l.userId === 'kim');
    const lee = result.lines.find((l) => l.userId === 'lee');
    expect(kim).toMatchObject({ targetWon: 1_800_000, shareWon: 900_000, withholdingWon: 29_700, netWon: 870_300 });
    expect(lee).toMatchObject({ targetWon: 1_200_000, shareWon: 480_000, withholdingWon: 15_840, netWon: 464_160 });
  });

  it('담당이 없으면 다른 입금처럼 "담당이 정해지지 않음"으로 기다린다', () => {
    const rows = partnerShareCalcRows([dist()], [], NOV.end);
    const result = computeSettlement({ monthEnd: NOV.end, timing: 'closed', receipts: rows, participants: [], staff: [] });
    expect(result.waiting).toEqual([
      expect.objectContaining({ reason: 'participants', source: 'partner_share', amountWon: 400_000 }),
    ]);
    expect(result.includedReceiptIds).toEqual([]);
  });

  it('확정한 달 뒤에 받으면 다음 달에 들어가고, 이미 정산한 몫은 다시 넣지 않는다', () => {
    const late = dist({ settledAt: new Date('2026-12-02T00:00:00Z') });
    expect(partnerShareCalcRows([late], [], NOV.end)).toHaveLength(0);
    expect(partnerShareCalcRows([late], [], DEC.end)).toHaveLength(1);
    const id = `share:d1:${Date.parse('2026-11-22T00:00:00Z')}`;
    const confirmed = [{
      settlementId: 's11', month: '2026-11', userId: 'lee',
      item: { receiptId: id, source: 'partner_share' as const, dealId: 'deal1', dealTitle: 'x', kind: 'receipt' as const,
        receivedAt: '2026-11-22T00:00:00.000Z', amountWon: 400_000, supplyWon: 400_000, ourRatio: 100, sharePercent: 100, ratio: 50, shareWon: 200_000 },
    }];
    expect(partnerShareCalcRows([dist()], confirmed, DEC.end)).toHaveLength(0);
  });

  it('정산한 뒤 받음 기록을 되돌리면 그때 나눠 준 비율대로 다음 정산에서 뺀다 (정산 전이면 그냥 빠진다)', () => {
    const id = `share:d1:${Date.parse('2026-11-22T00:00:00Z')}`;
    const undone = dist({ status: 'pending', settledAt: null, updatedAt: new Date('2026-12-05T00:00:00Z') });
    // 정산 전에 되돌림 → 아무 줄도 없다
    expect(partnerShareCalcRows([undone], [], DEC.end)).toHaveLength(0);
    const confirmed = [{
      settlementId: 's11', month: '2026-11', userId: 'lee',
      item: { receiptId: id, source: 'partner_share' as const, dealId: 'deal1', dealTitle: 'x', kind: 'receipt' as const,
        receivedAt: '2026-11-22T00:00:00.000Z', amountWon: 400_000, supplyWon: 400_000, ourRatio: 100, sharePercent: 100, ratio: 50, shareWon: 200_000 },
    }];
    const rows = partnerShareCalcRows([undone], confirmed, DEC.end);
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'refund', supplyWon: -400_000, reversal: [{ userId: 'lee', fraction: 0.5 }] }),
    ]);
    const result = computeSettlement({ monthEnd: DEC.end, timing: 'closed', receipts: rows, participants: [], staff: [staff('lee', 50)] });
    // 받은 몫이 없는 달이라 뺄 200,000원은 다음 달로 넘긴다
    expect(result.lines[0]).toMatchObject({ adjustWon: -200_000, netWon: 0, carryOutWon: 200_000 });
    // 되돌림이 확정에 들어갔으면 다시 빼지 않는다
    const undoConfirmed = [...confirmed, {
      settlementId: 's12', month: '2026-12', userId: 'lee',
      item: { ...confirmed[0].item, receiptId: rows[0].id, kind: 'refund' as const, supplyWon: -400_000, shareWon: -200_000 },
    }];
    expect(partnerShareCalcRows([undone], undoConfirmed, DEC.end)).toHaveLength(0);
  });
});
