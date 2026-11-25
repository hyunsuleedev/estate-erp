/**
 * 직원 정산 계산. DB를 모르는 순수 함수라 규칙을 여기서만 읽으면 된다.
 *
 * 고정 규칙 (사무소가 고르지 않는다):
 *  - 부가세를 뺀 금액(supplyWon)을 나눈다.
 *  - 공동중개 상대 사무소 몫을 먼저 뺀다(ourRatio).
 *  - 깎아 준 수수료는 실제로 들어온 돈을 나누므로 사무소와 직원이 비율대로 부담한다.
 *  - 정산한 뒤 돌려준 돈(refund)은 지난 정산을 고치지 않고 이번 정산에서 뺀다.
 *  - 뺄 돈이 받을 돈보다 크면 남은 만큼 다음 달로 넘긴다. 기본급에서는 빼지 않는다.
 *  - 3.3%는 프리랜서의 기본급 + 몫에서 뗀다. 근로자는 세금 떼기 전 성과급까지만 계산한다.
 *
 * 사무소가 고르는 것은 정산 시점(timing) 하나다.
 */

export type SettlementTiming = 'closed' | 'received';
export type EmploymentType = 'freelancer' | 'employee';

export interface CalcReceipt {
  id: string;
  /** 어느 청구의 줄인지. 돌려준 돈은 같은 청구의 입금과 맞비긴다. */
  paymentId: string;
  dealId: string;
  dealTitle: string;
  kind: 'receipt' | 'refund';
  receivedAt: Date;
  /** 실제로 오간 돈 (원, 부가세 포함). 환불은 음수. */
  amountWon: number;
  /** 부가세를 뺀 금액 (원). 환불은 음수. */
  supplyWon: number;
  /** 이 청구에서 우리 사무소가 갖는 비율 (0~100) */
  ourRatio: number;
  /** 거래의 잔금이 끝났는지와 그 시각. 시각을 모르면 null. */
  balanceDone: boolean;
  /**
   * 거래가 취소됐는지. 취소한 거래의 입금은 정산에 넣지 않고 따로 알린다(잔금을 영원히 기다리는 목록에 두지 않는다).
   * 대표가 돌려줄지(돌려준 돈 기록) 위약금으로 남길지 정한다. 없으면 취소되지 않은 것으로 본다.
   */
  dealCancelled?: boolean;
  /** partner_share: 공동중개 상대가 수금한 청구에서 받은 우리 몫(받음 기록). 없으면 우리가 수금한 입금. */
  source?: 'partner_share';
  balanceDoneAt: Date | null;
  /**
   * 돌려준 돈(refund)에만 쓴다. 이 청구에서 이미 정산해 준 몫을 직원별로 되돌리는 비율
   * (그 직원이 받은 몫 ÷ 정산한 금액). 있으면 지금의 담당 배분·직원 몫 대신 이것으로 뺀다.
   * 정산한 뒤 직원 몫을 바꿨더라도 준 만큼만 돌려받기 위해서다.
   */
  reversal?: Array<{ userId: string; fraction: number }>;
}

export interface CalcParticipant {
  dealId: string;
  userId: string;
  /** 이 거래의 사무소 몫 가운데 이 직원이 맡은 비중 (0~100) */
  sharePercent: number;
  /** 이 거래에서만 쓰는 직원 몫 (%). 없으면 직원의 기본 몫. */
  ratioOverride: number | null;
}

export interface CalcStaff {
  userId: string;
  name: string;
  employmentType: EmploymentType;
  withholdTax: boolean;
  /** 직원 몫 (%). 정해지지 않았으면 null. */
  ratio: number | null;
  /** 월 기본급 (원) */
  baseWon: number;
  /** 지난 정산에서 넘어온 뺄 돈 (원, 0 이상) */
  carryInWon: number;
}

export interface SettlementDetailItem {
  receiptId: string;
  /** partner_share: 공동중개 받은 몫 (금액은 부가세 별도로 본 값) */
  source?: 'partner_share';
  dealId: string;
  dealTitle: string;
  kind: 'receipt' | 'refund';
  receivedAt: string;
  amountWon: number;
  supplyWon: number;
  ourRatio: number;
  sharePercent: number;
  ratio: number;
  shareWon: number;
}

export interface SettlementCalcLine {
  userId: string;
  name: string;
  employmentType: EmploymentType;
  withholdTax: boolean;
  targetWon: number;
  shareWon: number;
  baseWon: number;
  adjustWon: number;
  carryInWon: number;
  withholdingWon: number;
  netWon: number;
  carryOutWon: number;
  detail: SettlementDetailItem[];
}

export interface SettlementWaitingItem {
  receiptId: string;
  /** partner_share: 공동중개 받은 몫 (금액은 부가세 별도로 본 값) */
  source?: 'partner_share';
  dealId: string;
  dealTitle: string;
  receivedAt: string;
  amountWon: number;
  /** balance: 잔금을 기다림 / participants: 담당 배분이 없음 / ratio: 직원 몫이 정해지지 않음 / cancelled: 취소한 거래 */
  reason: 'balance' | 'participants' | 'ratio' | 'cancelled';
}

export interface SettlementCalcResult {
  lines: SettlementCalcLine[];
  waiting: SettlementWaitingItem[];
  /** 취소한 거래의 입금. 정산에 넣지 않는다 (기다리는 것도 아니다). */
  cancelled: SettlementWaitingItem[];
  /** 이 정산에 들어간 입금 기록. 확정할 때 이 줄들에 정산을 표시한다. */
  includedReceiptIds: string[];
}

/** 소득세 3%(10원 미만 버림) + 지방소득세(소득세의 10%, 10원 미만 버림) */
export function withholdingWon(payableWon: number): number {
  const base = Math.max(0, payableWon);
  const incomeTax = Math.floor((base * 3) / 100 / 10) * 10;
  const localTax = Math.floor(incomeTax / 10 / 10) * 10;
  return incomeTax + localTax;
}

export function computeSettlement(input: {
  /** 이 달의 끝 (다음 달 1일 0시, 포함하지 않음) */
  monthEnd: Date;
  timing: SettlementTiming;
  receipts: CalcReceipt[];
  participants: CalcParticipant[];
  staff: CalcStaff[];
}): SettlementCalcResult {
  const { monthEnd, timing } = input;
  const staffById = new Map(input.staff.map((s) => [s.userId, s]));
  const byDeal = new Map<string, CalcParticipant[]>();
  for (const p of input.participants) {
    if (!(p.sharePercent > 0)) continue;
    const list = byDeal.get(p.dealId) ?? [];
    list.push(p);
    byDeal.set(p.dealId, list);
  }

  const acc = new Map<string, { target: number; share: number; adjust: number; detail: SettlementDetailItem[] }>();
  const waiting: SettlementWaitingItem[] = [];
  const includedReceiptIds: string[] = [];
  const wait = (r: CalcReceipt, reason: SettlementWaitingItem['reason']) =>
    waiting.push({
      receiptId: r.id,
      ...(r.source ? { source: r.source } : {}),
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      receivedAt: r.receivedAt.toISOString(),
      amountWon: r.amountWon,
      reason,
    });

  // 이 달까지의 줄만 본다
  const ordered = [...input.receipts]
    .filter((r) => r.receivedAt.getTime() < monthEnd.getTime())
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id));

  /*
   * 1. 같은 청구 안에서, 돌려준 돈을 아직 정산하지 않은 입금과 먼저 맞비긴다 (나중에 들어온 입금부터).
   *    직원에게 준 적 없는 돈을 돌려줬다고 직원 몫을 깎으면 안 되기 때문이다.
   *    맞비기고도 남은 환불만 "이미 정산해 준 몫"에서 뺀다.
   *    neutral: 금액에는 영향이 없고 정산했다는 표시만 받는 줄.
   */
  const effective = new Map(ordered.map((r) => [r.id, { supplyWon: r.supplyWon, amountWon: r.amountWon }]));
  const neutral = new Set<string>();
  /** 환불이 있는 청구마다: 환불이 건드린 줄 가운데 금액이 남은 줄(일부만 맞비긴 입금, 남은 환불) */
  const touchedByPayment = new Map<string, { rows: CalcReceipt[]; neutralIds: string[] }>();
  const byPayment = new Map<string, CalcReceipt[]>();
  for (const r of ordered) {
    const list = byPayment.get(r.paymentId) ?? [];
    list.push(r);
    byPayment.set(r.paymentId, list);
  }
  for (const [paymentId, group] of byPayment) {
    const refunds = group.filter((r) => r.kind === 'refund');
    if (refunds.length === 0) continue;
    const refundSupply = refunds.reduce((sum, r) => sum - r.supplyWon, 0);
    const refundAmount = refunds.reduce((sum, r) => sum - r.amountWon, 0);
    let left = refundSupply;
    const touched: CalcReceipt[] = [];
    const neutralIds: string[] = [];
    const newestFirst = group.filter((r) => r.kind === 'receipt').reverse();
    for (const receipt of newestFirst) {
      if (left <= 0) break;
      const take = Math.min(left, receipt.supplyWon);
      const remain = receipt.supplyWon - take;
      effective.set(receipt.id, {
        supplyWon: remain,
        amountWon: Math.round((receipt.amountWon * remain) / receipt.supplyWon),
      });
      left -= take;
      if (remain === 0) neutralIds.push(receipt.id);
      else touched.push(receipt);
    }
    // 환불 여러 줄은 하나로 합쳐 마지막 줄에 싣는다
    const last = refunds[refunds.length - 1];
    for (const r of refunds.slice(0, -1)) neutralIds.push(r.id);
    if (left <= 0) neutralIds.push(last.id);
    else {
      effective.set(last.id, { supplyWon: -left, amountWon: -Math.round((refundAmount * left) / refundSupply) });
      touched.push(last);
    }
    neutralIds.forEach((id) => neutral.add(id));
    touchedByPayment.set(paymentId, { rows: touched, neutralIds });
  }

  /* 2. 줄마다 이번 정산에 넣을 수 있는지 본다 */
  const reasonFor = (r: CalcReceipt): SettlementWaitingItem['reason'] | null => {
    // 취소한 거래에 들어온 돈은 나누지 않는다. 돌려준 돈(환불)은 아래 규칙대로 지난 몫에서 뺀다.
    if (r.kind === 'receipt' && r.dealCancelled) return 'cancelled';
    // 돌려준 돈은 정산 시점과 상관없이 바로 뺀다. 들어온 돈만 잔금을 기다린다.
    if (r.kind === 'receipt' && timing === 'closed') {
      const doneInTime = r.balanceDone && (!r.balanceDoneAt || r.balanceDoneAt.getTime() < monthEnd.getTime());
      if (!doneInTime) return 'balance';
    }
    if (r.kind === 'refund' && r.reversal && r.reversal.length > 0) return null;
    const parts = byDeal.get(r.dealId) ?? [];
    if (parts.length === 0) return 'participants';
    if (parts.some((p) => (p.ratioOverride ?? staffById.get(p.userId)?.ratio ?? null) == null)) return 'ratio';
    return null;
  };
  // 환불과 맞비긴 줄 가운데 하나라도 이번에 넣을 수 없으면, 그 환불 묶음 전체를 다음으로 미룬다.
  // 일부만 정산 표시를 하면 다음 달에 맞비긴 금액이 사라져 입금이 통째로 다시 계산된다.
  const held = new Set<string>();
  for (const { rows, neutralIds } of touchedByPayment.values()) {
    if (rows.some((r) => reasonFor(r) !== null)) {
      rows.forEach((r) => held.add(r.id));
      neutralIds.forEach((id) => held.add(id));
    }
  }

  /* 3. 직원별로 더한다 */
  const add = (userId: string, r: CalcReceipt, eff: { supplyWon: number; amountWon: number }, sharePercent: number, ratio: number, ourRatio: number, shareWon: number, target: number) => {
    const row = acc.get(userId) ?? { target: 0, share: 0, adjust: 0, detail: [] };
    if (r.kind === 'refund') row.adjust += shareWon;
    else {
      row.share += shareWon;
      row.target += Math.round(target);
    }
    row.detail.push({
      receiptId: r.id,
      ...(r.source ? { source: r.source } : {}),
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      kind: r.kind,
      receivedAt: r.receivedAt.toISOString(),
      amountWon: eff.amountWon,
      supplyWon: eff.supplyWon,
      ourRatio,
      sharePercent,
      ratio,
      shareWon,
    });
    acc.set(userId, row);
  };
  for (const r of ordered) {
    const eff = effective.get(r.id) as { supplyWon: number; amountWon: number };
    if (held.has(r.id)) {
      if (r.kind === 'receipt' && eff.supplyWon > 0) {
        waiting.push({
          receiptId: r.id,
          ...(r.source ? { source: r.source } : {}),
          dealId: r.dealId,
          dealTitle: r.dealTitle,
          receivedAt: r.receivedAt.toISOString(),
          amountWon: eff.amountWon,
          reason: reasonFor(r) ?? 'balance',
        });
      }
      continue;
    }
    if (neutral.has(r.id)) {
      includedReceiptIds.push(r.id);
      continue;
    }
    const reason = reasonFor(r);
    if (reason) {
      wait(r, reason);
      continue;
    }
    includedReceiptIds.push(r.id);
    if (r.kind === 'refund' && r.reversal && r.reversal.length > 0) {
      // 이미 정산해 준 몫을 그때 준 비율로 되돌린다
      for (const back of r.reversal) {
        const shareWon = Math.round(eff.supplyWon * back.fraction);
        add(back.userId, r, eff, 100, Math.round(back.fraction * 10000) / 100, 100, shareWon, 0);
      }
      continue;
    }
    for (const p of byDeal.get(r.dealId) ?? []) {
      const ratio = (p.ratioOverride ?? staffById.get(p.userId)?.ratio) as number;
      const target = (eff.supplyWon * r.ourRatio * p.sharePercent) / 10000;
      add(p.userId, r, eff, p.sharePercent, ratio, r.ourRatio, Math.round((target * ratio) / 100), target);
    }
  }

  const lines: SettlementCalcLine[] = [];
  for (const s of input.staff) {
    const row = acc.get(s.userId);
    const baseWon = s.employmentType === 'freelancer' ? Math.max(0, s.baseWon) : 0;
    const carryInWon = Math.max(0, s.carryInWon);
    if (!row && baseWon === 0 && carryInWon === 0) continue;
    const shareWon = row?.share ?? 0;
    const adjustWon = Math.min(0, row?.adjust ?? 0);
    const before = shareWon + adjustWon - carryInWon;
    const payable = baseWon + Math.max(0, before);
    const withholding = s.employmentType === 'freelancer' && s.withholdTax ? withholdingWon(payable) : 0;
    lines.push({
      userId: s.userId,
      name: s.name,
      employmentType: s.employmentType,
      withholdTax: s.withholdTax,
      targetWon: row?.target ?? 0,
      shareWon,
      baseWon,
      adjustWon,
      carryInWon,
      withholdingWon: withholding,
      netWon: payable - withholding,
      carryOutWon: before < 0 ? -before : 0,
      detail: row?.detail ?? [],
    });
  }
  return {
    lines,
    waiting: waiting.filter((item) => item.reason !== 'cancelled'),
    cancelled: waiting.filter((item) => item.reason === 'cancelled'),
    includedReceiptIds,
  };
}

/** 'YYYY-MM' 달의 시작과 끝(다음 달 1일)을 한국 시각 기준으로 돌려준다. */
export function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error(`잘못된 달 형식: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]); // 1~12
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return { start: new Date(`${month}-01T00:00:00+09:00`), end: new Date(`${next}-01T00:00:00+09:00`) };
}

/**
 * 청구마다 "이미 정산해 준 몫"을 직원별 비율로 구한다: 직원이 실제로 받은 몫 ÷ 정산에 들어간 금액.
 * 나중에 돌려준 돈은 이 비율로 직원 몫에서 뺀다.
 *
 * 둘 다 **순액**으로 센다. 앞서 일부를 돌려줘 정산에 반영된 것이 있으면 금액에서도, 몫에서도 빼야 한다.
 * 입금의 원래 금액으로 나누면(예: 200만원 중 50만원을 맞비기고 150만원만 나눈 경우) 비율이 작게 나와
 * 다음 환불에서 덜 빼게 된다.
 *
 * @param settledRows 확정 정산에 들어간 입금·환불 줄 (환불의 supplyWon 은 음수)
 * @param details 확정 정산에 굳혀 둔 계산 근거 (직원별, 환불로 뺀 몫은 음수)
 */
export function reversalFractions(
  settledRows: Array<{ id: string; paymentId: string; supplyWon: number }>,
  details: Array<{ userId: string; receiptId: string; shareWon: number }>,
): Map<string, Array<{ userId: string; fraction: number }>> {
  const paymentOf = new Map(settledRows.map((row) => [row.id, row.paymentId]));
  const supplyByPayment = new Map<string, number>();
  for (const row of settledRows) {
    supplyByPayment.set(row.paymentId, (supplyByPayment.get(row.paymentId) ?? 0) + row.supplyWon);
  }
  const paid = new Map<string, Map<string, number>>(); // 청구 → 직원 → 받은 몫(순액)
  for (const item of details) {
    const paymentId = paymentOf.get(item.receiptId);
    if (!paymentId) continue;
    const byUser = paid.get(paymentId) ?? new Map<string, number>();
    byUser.set(item.userId, (byUser.get(item.userId) ?? 0) + item.shareWon);
    paid.set(paymentId, byUser);
  }
  const result = new Map<string, Array<{ userId: string; fraction: number }>>();
  for (const [paymentId, byUser] of paid) {
    const supply = supplyByPayment.get(paymentId) ?? 0;
    if (supply <= 0) continue; // 정산해 준 것이 남아 있지 않다
    const fractions = [...byUser]
      .filter(([, shareWon]) => shareWon > 0)
      .map(([userId, shareWon]) => ({ userId, fraction: shareWon / supply }));
    if (fractions.length > 0) result.set(paymentId, fractions);
  }
  return result;
}
