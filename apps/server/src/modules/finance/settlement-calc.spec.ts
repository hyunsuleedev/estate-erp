import {
  computeSettlement,
  monthRange,
  reversalFractions,
  withholdingWon,
  type CalcReceipt,
} from './settlement-calc';

const NOV = monthRange('2026-11');
const day = (d: string) => new Date(`${d}T10:00:00+09:00`);
const receipt = (over: Partial<CalcReceipt> & Pick<CalcReceipt, 'id' | 'dealId' | 'amountWon'>): CalcReceipt => ({
  // 따로 적지 않으면 거래마다 청구가 하나라고 본다
  paymentId: `p-${over.dealId}`,
  dealTitle: over.dealId,
  kind: over.amountWon < 0 ? 'refund' : 'receipt',
  receivedAt: day('2026-11-10'),
  supplyWon: Math.round(over.amountWon / 1.1),
  ourRatio: 100,
  balanceDone: true,
  balanceDoneAt: day('2026-11-10'),
  ...over,
});
const staff = (userId: string, ratio: number | null, over: Record<string, unknown> = {}) => ({
  userId,
  name: userId,
  employmentType: 'freelancer' as const,
  withholdTax: true,
  ratio,
  baseWon: 0,
  carryInWon: 0,
  ...over,
});

describe('withholdingWon', () => {
  it('3.3%를 소득세와 지방소득세로 나눠 10원 미만을 버린다', () => {
    expect(withholdingWon(3_000_000)).toBe(99_000);
    expect(withholdingWon(1_860_000)).toBe(61_380);
    expect(withholdingWon(2_360_000)).toBe(77_880);
    expect(withholdingWon(-1)).toBe(0);
  });
});

describe('monthRange', () => {
  it('한국 시각으로 달의 경계를 잡는다', () => {
    expect(NOV.start.toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(NOV.end.toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(monthRange('2026-12').end.toISOString()).toBe('2026-12-31T15:00:00.000Z');
    expect(() => monthRange('2026-13')).toThrow();
  });
});

describe('computeSettlement', () => {
  it('부가세를 빼고, 담당 배분과 직원 몫을 곱하고, 3.3%를 뗀다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [receipt({ id: 'r1', dealId: 'd2', amountWon: 3_300_000 })],
      participants: [
        { dealId: 'd2', userId: 'park', sharePercent: 40, ratioOverride: null },
        { dealId: 'd2', userId: 'kim', sharePercent: 60, ratioOverride: null },
      ],
      staff: [staff('kim', 60), staff('park', 50)],
    });
    const kim = result.lines.find((l) => l.userId === 'kim')!;
    const park = result.lines.find((l) => l.userId === 'park')!;
    expect(kim).toMatchObject({ targetWon: 1_800_000, shareWon: 1_080_000, withholdingWon: 35_640, netWon: 1_044_360 });
    expect(park).toMatchObject({ targetWon: 1_200_000, shareWon: 600_000 });
    expect(result.includedReceiptIds).toEqual(['r1']);
  });

  it('공동중개 상대 몫을 먼저 뺀다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [receipt({ id: 'r5', dealId: 'd5', amountWon: 4_400_000, ourRatio: 50 })],
      participants: [{ dealId: 'd5', userId: 'choi', sharePercent: 100, ratioOverride: null }],
      staff: [staff('choi', 70)],
    });
    expect(result.lines[0]).toMatchObject({ targetWon: 2_000_000, shareWon: 1_400_000, withholdingWon: 46_200, netWon: 1_353_800 });
  });

  it("'잔금이 끝난 뒤'면 잔금 전 입금은 기다리고, '돈이 들어온 달'이면 바로 넣는다", () => {
    const base = {
      monthEnd: NOV.end,
      receipts: [receipt({ id: 'r6', dealId: 'd6', amountWon: 2_750_000, balanceDone: false, balanceDoneAt: null })],
      participants: [{ dealId: 'd6', userId: 'park', sharePercent: 100, ratioOverride: null }],
      staff: [staff('park', 50)],
    };
    const closed = computeSettlement({ ...base, timing: 'closed' });
    expect(closed.lines).toEqual([]);
    expect(closed.waiting).toMatchObject([{ receiptId: 'r6', reason: 'balance' }]);
    expect(closed.includedReceiptIds).toEqual([]);

    const received = computeSettlement({ ...base, timing: 'received' });
    expect(received.lines[0].shareWon).toBe(1_250_000);
    expect(received.waiting).toEqual([]);
  });

  it('잔금이 다음 달에 끝난 거래는 이번 달 정산에 넣지 않는다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [receipt({ id: 'r1', dealId: 'd1', amountWon: 1_100_000, balanceDoneAt: day('2026-12-03') })],
      participants: [{ dealId: 'd1', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      staff: [staff('kim', 60)],
    });
    expect(result.waiting).toMatchObject([{ reason: 'balance' }]);
  });

  it('다음 달에 들어온 돈은 건드리지 않는다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'received',
      receipts: [receipt({ id: 'r1', dealId: 'd1', amountWon: 1_100_000, receivedAt: day('2026-12-01') })],
      participants: [{ dealId: 'd1', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      staff: [staff('kim', 60)],
    });
    expect(result).toEqual({ lines: [], waiting: [], includedReceiptIds: [] });
  });

  it('돌려준 돈은 잔금과 상관없이 빼고, 뺄 돈이 더 크면 다음 달로 넘긴다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [
        receipt({ id: 'r2', dealId: 'd2', amountWon: 1_980_000 }),
        receipt({ id: 'x1', dealId: 'd9', amountWon: -2_200_000, balanceDone: false, balanceDoneAt: null }),
      ],
      participants: [
        { dealId: 'd2', userId: 'kim', sharePercent: 100, ratioOverride: null },
        { dealId: 'd9', userId: 'kim', sharePercent: 100, ratioOverride: null },
      ],
      staff: [staff('kim', 60)],
    });
    expect(result.lines[0]).toMatchObject({
      shareWon: 1_080_000,
      adjustWon: -1_200_000,
      withholdingWon: 0,
      netWon: 0,
      carryOutWon: 120_000,
    });
    expect(result.includedReceiptIds).toEqual(['r2', 'x1']);
  });

  it('이미 정산한 돈을 돌려주면 지금 몫이 아니라 그때 준 비율로 뺀다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [
        receipt({
          id: 'x1',
          dealId: 'd9',
          amountWon: -2_200_000,
          // 정산할 때는 60%를 줬다
          reversal: [{ userId: 'kim', fraction: 0.6 }],
        }),
      ],
      participants: [{ dealId: 'd9', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      // 그 뒤 몫을 10%로 내렸다
      staff: [staff('kim', 10)],
    });
    expect(result.lines[0]).toMatchObject({ adjustWon: -1_200_000, carryOutWon: 1_200_000 });
  });

  it('정산해 준 적 없는 입금을 돌려줬으면 직원 몫을 깎지 않는다', () => {
    // 계약 때 받은 110만원은 잔금 전이라 정산에 들어간 적이 없다. 계약이 깨져 그대로 돌려줬다.
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [
        receipt({ id: 'r1', dealId: 'd1', amountWon: 1_100_000, balanceDone: false, balanceDoneAt: null, receivedAt: day('2026-11-05') }),
        receipt({ id: 'x1', dealId: 'd1', amountWon: -1_100_000, balanceDone: false, balanceDoneAt: null, receivedAt: day('2026-11-20') }),
      ],
      participants: [{ dealId: 'd1', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      staff: [staff('kim', 60)],
    });
    expect(result.lines).toEqual([]);
    expect(result.waiting).toEqual([]);
    // 두 줄 모두 정산한 것으로 표시해 다음 달에 다시 나오지 않게 한다
    expect(result.includedReceiptIds.sort()).toEqual(['r1', 'x1']);
  });

  it('정산한 입금과 정산 전 입금이 섞인 청구를 전부 돌려주면, 정산해 준 몫만 뺀다', () => {
    // 1차 220만원은 지난달에 60%로 정산해 줬고(reversal), 2차 110만원은 아직 정산 전이다. 330만원을 모두 돌려줬다.
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'closed',
      receipts: [
        receipt({ id: 'r2', dealId: 'd1', amountWon: 1_100_000, balanceDone: false, balanceDoneAt: null, receivedAt: day('2026-11-05') }),
        receipt({ id: 'x1', dealId: 'd1', amountWon: -3_300_000, receivedAt: day('2026-11-20'), reversal: [{ userId: 'kim', fraction: 0.6 }] }),
      ],
      participants: [{ dealId: 'd1', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      staff: [staff('kim', 60)],
    });
    // 300만원 중 100만원은 정산 전 입금과 맞비기고, 남은 200만원의 60%만 뺀다
    expect(result.lines[0]).toMatchObject({ shareWon: 0, adjustWon: -1_200_000, carryOutWon: 1_200_000 });
    expect(result.includedReceiptIds.sort()).toEqual(['r2', 'x1']);
  });

  it('일부만 돌려줬고 남은 입금이 잔금을 기다리면, 환불과 그 입금을 함께 다음으로 미룬다', () => {
    const input = {
      monthEnd: NOV.end,
      receipts: [
        receipt({ id: 'r1', dealId: 'd1', amountWon: 2_200_000, balanceDone: false, balanceDoneAt: null, receivedAt: day('2026-11-05') }),
        receipt({ id: 'x1', dealId: 'd1', amountWon: -550_000, balanceDone: false, balanceDoneAt: null, receivedAt: day('2026-11-20') }),
      ],
      participants: [{ dealId: 'd1', userId: 'kim', sharePercent: 100, ratioOverride: null }],
      staff: [staff('kim', 60)],
    };
    const closed = computeSettlement({ ...input, timing: 'closed' });
    expect(closed.lines).toEqual([]);
    expect(closed.includedReceiptIds).toEqual([]);
    // 남은 금액으로 기다린다
    expect(closed.waiting).toMatchObject([{ receiptId: 'r1', amountWon: 1_650_000, reason: 'balance' }]);

    // 돈이 들어온 달에 정산하면 남은 150만원만 나눈다
    const received = computeSettlement({ ...input, timing: 'received' });
    expect(received.lines[0]).toMatchObject({ targetWon: 1_500_000, shareWon: 900_000, adjustWon: 0 });
    expect(received.includedReceiptIds.sort()).toEqual(['r1', 'x1']);
  });

  it('넘어온 뺄 돈은 기본급에서 빼지 않고 몫에서만 뺀다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'received',
      receipts: [],
      participants: [],
      staff: [staff('kim', 60, { baseWon: 1_000_000, carryInWon: 120_000 })],
    });
    expect(result.lines[0]).toMatchObject({ baseWon: 1_000_000, carryInWon: 120_000, netWon: 967_000, carryOutWon: 120_000 });
  });

  it('프리랜서의 기본급은 몫에 더해 3.3%를 떼고, 3.3%를 끄면 전액 지급한다', () => {
    const input = {
      monthEnd: NOV.end,
      timing: 'received' as const,
      receipts: [receipt({ id: 'r1', dealId: 'd1', amountWon: 4_092_000 })],
      participants: [{ dealId: 'd1', userId: 'park', sharePercent: 100, ratioOverride: null }],
    };
    const on = computeSettlement({ ...input, staff: [staff('park', 50, { baseWon: 500_000 })] });
    expect(on.lines[0]).toMatchObject({ shareWon: 1_860_000, baseWon: 500_000, withholdingWon: 77_880, netWon: 2_282_120 });
    const off = computeSettlement({ ...input, staff: [staff('park', 50, { baseWon: 500_000, withholdTax: false })] });
    expect(off.lines[0]).toMatchObject({ withholdingWon: 0, netWon: 2_360_000 });
  });

  it('근로자는 기본급과 세금을 계산하지 않고 세금 떼기 전 성과급만 낸다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'received',
      receipts: [receipt({ id: 'r4', dealId: 'd4', amountWon: 1_540_000 })],
      participants: [{ dealId: 'd4', userId: 'lee', sharePercent: 100, ratioOverride: null }],
      staff: [staff('lee', 30, { employmentType: 'employee', baseWon: 2_200_000 })],
    });
    expect(result.lines[0]).toMatchObject({ baseWon: 0, shareWon: 420_000, withholdingWon: 0, netWon: 420_000 });
  });

  it('담당 배분이 없거나 직원 몫이 정해지지 않은 입금은 정산에 넣지 않고 따로 알려 준다', () => {
    const result = computeSettlement({
      monthEnd: NOV.end,
      timing: 'received',
      receipts: [
        receipt({ id: 'r1', dealId: 'd1', amountWon: 1_100_000 }),
        receipt({ id: 'r2', dealId: 'd2', amountWon: 1_100_000 }),
        receipt({ id: 'r3', dealId: 'd3', amountWon: 1_100_000 }),
      ],
      participants: [
        { dealId: 'd2', userId: 'new', sharePercent: 100, ratioOverride: null },
        { dealId: 'd3', userId: 'new', sharePercent: 100, ratioOverride: 40 },
      ],
      staff: [staff('new', null)],
    });
    expect(result.waiting.map((w) => [w.receiptId, w.reason])).toEqual([
      ['r1', 'participants'],
      ['r2', 'ratio'],
    ]);
    // 거래에서 따로 정한 몫이 있으면 그것을 쓴다
    expect(result.lines[0]).toMatchObject({ shareWon: 400_000 });
    expect(result.includedReceiptIds).toEqual(['r3']);
  });
});

describe('reversalFractions', () => {
  it('정산해 준 몫을 정산에 들어간 금액으로 나눈다', () => {
    const result = reversalFractions(
      [{ id: 'r1', paymentId: 'p1', supplyWon: 2_000_000 }],
      [
        { userId: 'kim', receiptId: 'r1', shareWon: 720_000 },
        { userId: 'park', receiptId: 'r1', shareWon: 400_000 },
      ],
    );
    expect(result.get('p1')).toEqual([
      { userId: 'kim', fraction: 0.36 },
      { userId: 'park', fraction: 0.2 },
    ]);
  });

  it('일부를 맞비기고 정산한 입금은 맞비긴 뒤의 금액으로 나눈다', () => {
    // 200만원을 받았다가 50만원을 돌려줘 맞비겼고, 남은 150만원의 60%인 90만원을 정산해 줬다.
    // 맞비긴 환불 줄은 금액에 영향 없이 정산 표시만 받았으므로 계산 근거에는 없다.
    const fractions = reversalFractions(
      [
        { id: 'r1', paymentId: 'p1', supplyWon: 2_000_000 },
        { id: 'x1', paymentId: 'p1', supplyWon: -500_000 },
      ],
      [{ userId: 'kim', receiptId: 'r1', shareWon: 900_000 }],
    );
    expect(fractions.get('p1')).toEqual([{ userId: 'kim', fraction: 0.6 }]);

    // 그 뒤 남은 150만원(부가세 포함 165만원)을 마저 돌려주면 준 90만원을 그대로 뺀다.
    const result = computeSettlement({
      monthEnd: monthRange('2026-12').end,
      timing: 'received',
      receipts: [
        {
          id: 'x2',
          paymentId: 'p1',
          dealId: 'd1',
          dealTitle: 'd1',
          kind: 'refund',
          receivedAt: new Date('2026-12-05T10:00:00+09:00'),
          amountWon: -1_650_000,
          supplyWon: -1_500_000,
          ourRatio: 100,
          balanceDone: false,
          balanceDoneAt: null,
          reversal: fractions.get('p1'),
        },
      ],
      participants: [],
      staff: [{ userId: 'kim', name: 'kim', employmentType: 'freelancer', withholdTax: true, ratio: 60, baseSalary: 0, baseWon: 0, carryInWon: 0 } as never],
    });
    expect(result.lines[0]).toMatchObject({ adjustWon: -900_000, carryOutWon: 900_000 });
  });

  it('앞서 정산에서 뺀 환불이 있으면 금액과 몫에서 모두 뺀 뒤 나눈다', () => {
    // 200만원을 60%(120만원)로 정산해 준 뒤, 50만원을 돌려줘 30만원을 이미 뺐다.
    const fractions = reversalFractions(
      [
        { id: 'r1', paymentId: 'p1', supplyWon: 2_000_000 },
        { id: 'x1', paymentId: 'p1', supplyWon: -500_000 },
      ],
      [
        { userId: 'kim', receiptId: 'r1', shareWon: 1_200_000 },
        { userId: 'kim', receiptId: 'x1', shareWon: -300_000 },
      ],
    );
    // 남은 150만원에 대해 90만원이 나가 있다
    expect(fractions.get('p1')).toEqual([{ userId: 'kim', fraction: 0.6 }]);
  });

  it('정산해 준 것이 남아 있지 않은 청구는 결과에 없다', () => {
    const fractions = reversalFractions(
      [
        { id: 'r1', paymentId: 'p1', supplyWon: 1_000_000 },
        { id: 'x1', paymentId: 'p1', supplyWon: -1_000_000 },
      ],
      [
        { userId: 'kim', receiptId: 'r1', shareWon: 600_000 },
        { userId: 'kim', receiptId: 'x1', shareWon: -600_000 },
      ],
    );
    expect(fractions.has('p1')).toBe(false);
  });
});
