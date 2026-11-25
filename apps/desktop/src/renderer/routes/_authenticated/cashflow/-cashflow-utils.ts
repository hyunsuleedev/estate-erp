/**
 * 수수료/정산 화면의 계산 규칙. 화면 부품과 분리해 테스트한다.
 * 금액은 만원 단위, 날짜는 사용자 현지 날짜 기준으로 비교한다.
 */
import { formatPlaceLabel } from '@estate-erp/shared';
import { formatRelativeDay } from '@/lib/format';
import { parseManwon } from '@/lib/manwon';
import type {
  CommissionPaymentStatus,
  LedgerDeal,
  LedgerDealGroup,
  LedgerPayment,
  MonthlyTrend,
} from '@estate-erp/api-client';

type DateInput = string | Date | null | undefined;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function toDayKey(value: DateInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const monthKeyOf = (year: number, month: number) =>
  `${year}-${pad2(month)}`;

export function stepMonth(
  { year, month }: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function daysFromToday(value: DateInput, now = new Date()): number | null {
  const d = toDate(value);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
}

/** 오늘 / D-8 / 7일 경과 */
export function relativeDueLabel(value: DateInput, now = new Date()): string {
  const days = daysFromToday(value, now);
  if (days === null) return '';
  if (days === 0) return '오늘';
  return days > 0 ? `D-${days}` : `${-days}일 경과`;
}

/** 11.12 — 예정일처럼 날짜 자체를 보여 줄 자리. 앱 공통 표기(formatRelativeDay)와 같이 앞자리 0을 붙이지 않는다. */
export function shortDate(value: DateInput): string {
  const d = toDate(value);
  return d ? `${d.getMonth() + 1}.${d.getDate()}` : '—';
}

/** 11.12 (목) */
export function shortDateWithDay(value: DateInput): string {
  const d = toDate(value);
  return d ? `${shortDate(d)} (${WEEKDAYS[d.getDay()]})` : '—';
}

/**
 * 이미 지난 일(입금·확정·지급·발행)의 날짜. 앱 공통 표기를 따른다: "오늘" · "어제" · "11.19 (목)".
 * withWeekday=false 면 좁은 칸용("11.19"). 빈 값이면 "—".
 */
export function dayLabel(value: DateInput, withWeekday = true): string {
  const d = toDate(value);
  return d ? formatRelativeDay(d, new Date(), { withWeekday }) : '—';
}

/**
 * "고덕그라시움 102동 2203호" — 화면 공통 표기(STANDARDS 주소·호수, @estate-erp/shared formatPlaceLabel).
 * 서버가 만든 placeLabel 이 있으면 그것을, 없으면 이름 조각으로 같은 함수를 부른다.
 */
export function dealLocation(deal: {
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
  placeLabel?: string | null;
}): string {
  if (deal.placeLabel) return deal.placeLabel;
  return (
    formatPlaceLabel({
      siteName: deal.siteName,
      dongName: deal.dongName,
      dongIsPlaceholder: deal.dongName === '-',
      unit: deal.unitName ? { name: deal.unitName } : null,
    }) || '매물 미지정'
  );
}

/** 단지가 문맥에 있는 자리(캘린더 칸 등): "102동 2203호". 없으면 전체 표기. */
export function dealLocationShort(deal: {
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
  placeLabel?: string | null;
  placeShort?: string | null;
}): string {
  if (deal.placeShort) return deal.placeShort;
  const short = formatPlaceLabel({
    dongName: deal.dongName,
    dongIsPlaceholder: deal.dongName === '-',
    unit: deal.unitName ? { name: deal.unitName } : null,
  });
  return short || dealLocation(deal);
}

const RENT_TYPES = new Set(['jeonse', 'monthly']);

/** 청구의 쪽. 매매는 매도측·매수측, 전세·월세는 임대인측·임차인측(STANDARDS 낱말). */
export const clientSideLabel = (side: string, transactionType?: string | null) =>
  transactionType && RENT_TYPES.has(transactionType)
    ? side === 'seller'
      ? '임대인측'
      : '임차인측'
    : side === 'seller'
      ? '매도측'
      : '매수측';

/**
 * 수수료 계산식 문구. 법정 요율로 계산한 금액 그대로일 때만 "거래가 13억 2,000만 × 0.5%"를 보여 주고,
 * 할인했거나 사람이 금액을 정했으면(요율이 0.46153… 같은 값) "협의 금액"이라고 쓴다.
 */
export function commissionBasisLabel(
  p: { baseAmount: number | null; rate: number | null; expectedAmount: number },
  formatMoney: (manwon: number) => string,
): string | null {
  if (p.baseAmount == null || p.rate == null) return null;
  const rate = Number(p.rate);
  const plainRate = Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-6;
  const matches = Math.abs(Math.round((p.baseAmount * rate) / 100) - p.expectedAmount) <= 1;
  return plainRate && matches ? `거래가 ${formatMoney(p.baseAmount)} × ${rate}%` : '협의 금액';
}

export function payerName(
  deal: Pick<LedgerDeal, 'sellerContactName' | 'buyerContactName'>,
  payment: Pick<LedgerPayment, 'clientSide'>,
): string | null {
  return payment.clientSide === 'seller'
    ? deal.sellerContactName
    : deal.buyerContactName;
}

// ── 청구 한 건 ────────────────────────────────────────────

interface PaymentAmounts {
  status: string;
  expectedAmount: number;
  actualAmount?: number | null;
  /** 입금 기록 합계 (원, 부가세 뺀 금액). 원장 응답에만 있다. */
  receivedSupplyWon?: number;
  /** us: 우리가 수금 / partner: 공동중개 상대가 수금 */
  collectedByOffice?: string;
  /** 우리 통장에 들어온 돈 합계 (원). 원장 응답에만 있다 (서버 loadOurCollections). */
  ourCollectedWon?: number;
  distributions?: Array<{
    recipientType: string;
    shareAmount: number;
    status: string;
  }>;
}
type PaymentSchedule = Pick<
  LedgerPayment,
  'status' | 'dueDate' | 'agreedRemainingDate'
> & { collectedByOffice?: string };

/**
 * 우리가 손님에게서 받을 돈인가. 공동중개에서 상대 사무소가 수금하는 청구(collectedByOffice='partner')는
 * 우리가 독촉할 돈이 아니다. 그 안의 우리 몫은 공동중개 수수료 화면의 '받을 몫'으로만 본다.
 * 연체·독촉·받을 돈·예정·미수에서 모두 이 기준으로 뺀다.
 */
export const isOurReceivable = (p: { collectedByOffice?: string | null }) =>
  p.collectedByOffice !== 'partner';

export const isClosedPayment = (p: { status: string }) =>
  p.status === 'waived' || p.status === 'cancelled';

const hasOpenStatus = (p: { status: string }) =>
  p.status === 'pending' || p.status === 'partial' || p.status === 'overdue';

/**
 * 다 받은 청구. 서버는 할인을 승인할 때 청구액만 줄이고 상태를 바꾸지 않으므로,
 * 상태가 부분수금이어도 남은 돈이 없으면 다 받은 것으로 본다.
 */
export const isPaymentDone = (p: PaymentAmounts) =>
  p.status === 'collected' ||
  (hasOpenStatus(p) && p.expectedAmount - (p.actualAmount ?? 0) <= 0);

/** 수금 처리를 할 수 있는, 아직 돈이 다 안 들어온 청구 */
export const isOpenPayment = (p: PaymentAmounts) =>
  hasOpenStatus(p) && !isPaymentDone(p);

/** 실제로 들어온 돈. 수금완료인데 금액이 없으면 서버 원장처럼 청구액으로 보고, 취소는 없던 일로 본다. */
export function receivedAmount(p: PaymentAmounts): number {
  if (p.status === 'cancelled') return 0;
  if (p.status === 'collected') return p.actualAmount ?? p.expectedAmount;
  return p.actualAmount ?? 0;
}

/** 청구로 남는 금액. 면제·대손은 그때까지 받은 돈까지만 남는다. */
export function billableAmount(p: PaymentAmounts): number {
  if (p.status === 'waived') return receivedAmount(p);
  return p.status === 'cancelled' ? 0 : p.expectedAmount;
}

/** 합계와 건수에 넣는 청구. 받은 돈 없이 면제·취소된 청구만 뺀다. */
export const countsAsBilled = (p: PaymentAmounts) =>
  !isClosedPayment(p) || receivedAmount(p) > 0;

export function paymentRemaining(p: PaymentAmounts): number {
  if (isClosedPayment(p) || p.status === 'collected') return 0;
  return Math.max(0, p.expectedAmount - (p.actualAmount ?? 0));
}

// ── 원 단위 (입금 기록) ───────────────────────────────────

export const WON_PER_MANWON = 10_000;
/** 부가세 10%. 서버(commission-payment.service)와 같은 반올림이다. */
export const withVatWon = (supplyWon: number) => Math.round(supplyWon * 1.1);
export const withoutVatWon = (amountWon: number) => Math.round(amountWon / 1.1);

/**
 * 더 받을 수 있는 수수료 (원, 부가세 뺀 금액). 입금 기록 합계로 세므로 만원으로 반올림한
 * actualAmount 보다 정확하다. 일부만 받은 뒤의 남은 돈을 1원까지 맞춰 다 받음으로 닫으려면 이 값이 필요하다.
 */
export function remainingSupplyWon(
  p: Pick<LedgerPayment, 'status' | 'expectedAmount' | 'receivedSupplyWon'>,
): number {
  if (isClosedPayment(p) || p.status === 'collected') return 0;
  return Math.max(0, p.expectedAmount * WON_PER_MANWON - (p.receivedSupplyWon ?? 0));
}

/** 1,234,000원 */
export const formatWon = (won: number) => `${Math.round(won).toLocaleString('ko-KR')}원`;

/**
 * 원 단위 입력칸의 글을 원으로 읽는다. 숫자가 아니면 NaN.
 *   "13,244,000" · "13244000원"           → 숫자만은 지금처럼 원 (13,244,000원)
 *   "1324만 4천" · "1,324만 4천원"        → "만" 앞은 만원(앱 공통 읽기 parseManwon), 뒤는 원 → 13,244,000원
 *   "1억 324만" · "1324.4만" · "4천5백"   → 103,240,000원 · 13,244,000원 · 4,500원
 *   "1억 5천"(만 없이 억이 있음)          → 만원으로 읽는 앱 공통 규칙 그대로 (1억 5천만 = 150,000,000원)
 * 헷갈릴 수 있어 화면은 읽은 값을 늘 "= 13,244,000원"으로 되비춘다.
 */
export function parseWonInput(text: string): number {
  const cleaned = String(text ?? '')
    .normalize('NFKC')
    .replace(/[,\s]/g, '')
    .replace(/원$/, '');
  if (!cleaned) return Number.NaN;
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  /** "4천5백" · "4500" → 원 (만원 아래 자리) */
  const smallWon = (part: string): number => {
    if (!part) return 0;
    const m = /^(?:(\d+)천)?(?:(\d+)백)?(\d+)?$/.exec(part);
    if (!m || (!m[1] && !m[2] && !m[3])) return Number.NaN;
    const won = Number(m[1] ?? 0) * 1000 + Number(m[2] ?? 0) * 100 + Number(m[3] ?? 0);
    return won < WON_PER_MANWON ? won : Number.NaN;
  };
  const at = cleaned.lastIndexOf('만');
  if (at < 0) {
    // 억이 있으면 만원 규칙("1억 5천" = 1억 5천만), 없으면 원("4천5백" = 4,500원)
    if (cleaned.includes('억') || cleaned.includes('조')) {
      const parsed = parseManwon(cleaned);
      return parsed.valid && parsed.value !== null ? parsed.value * WON_PER_MANWON : Number.NaN;
    }
    return smallWon(cleaned);
  }
  const head = cleaned.slice(0, at);
  const tail = cleaned.slice(at + 1);
  let headWon: number;
  if (/^\d+(\.\d+)?$/.test(head)) {
    headWon = Math.round(Number(head) * WON_PER_MANWON);
    if (Math.abs(headWon - Number(head) * WON_PER_MANWON) > 1e-6) return Number.NaN;
  } else {
    const parsed = parseManwon(head);
    if (!parsed.valid || parsed.value === null) return Number.NaN;
    headWon = parsed.value * WON_PER_MANWON;
  }
  const tailWon = smallWon(tail);
  return Number.isFinite(tailWon) ? headWon + tailWon : Number.NaN;
}

export type ReceiptInputProblem = 'empty' | 'over';

/** 받은 금액(원)을 검사한다. 부가세를 포함해 받았으면 부가세를 뺀 금액을 남은 금액과 비교한다. */
export function checkReceiptInput(
  amountWon: number,
  vatIncluded: boolean,
  leftSupplyWon: number,
): ReceiptInputProblem | null {
  if (!Number.isFinite(amountWon) || amountWon <= 0) return 'empty';
  if (!vatIncluded) return amountWon > leftSupplyWon ? 'over' : null;
  // 부가세를 포함해 받은 돈은 반올림 때문에 1원 차이가 날 수 있어 서버가 남은 금액에 맞춰 준다
  return withoutVatWon(amountWon) > leftSupplyWon + 1 ? 'over' : null;
}

export type ReceivedAmountProblem = 'empty' | 'fraction' | 'over';

/** 금액 칸은 만원 단위 정수이고, 남은 금액을 넘으면 수금 합계가 청구액보다 커진다. */
export function checkReceivedAmount(
  received: number,
  remaining: number,
): ReceivedAmountProblem | null {
  if (!Number.isFinite(received) || received <= 0) return 'empty';
  if (!Number.isInteger(received)) return 'fraction';
  return received > remaining ? 'over' : null;
}

export function collectPercent(collected: number, billed: number): number {
  return billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : 0;
}

/** 부분수금은 약속일, 그 외는 예정일, 예정일이 없으면 거래 잔금일을 따른다. */
export function effectiveDueDate(
  p: PaymentSchedule,
  balanceDueDate?: string | null,
): string | null {
  if (p.status === 'partial' && p.agreedRemainingDate) {
    return p.agreedRemainingDate;
  }
  return p.dueDate ?? balanceDueDate ?? null;
}

export function isPaymentOverdue(
  p: PaymentAmounts & PaymentSchedule,
  balanceDueDate?: string | null,
  now = new Date(),
): boolean {
  if (!isOpenPayment(p)) return false;
  // 상대가 수금하는 청구는 우리 연체가 아니다
  if (!isOurReceivable(p)) return false;
  if (p.status === 'overdue') return true;
  const days = daysFromToday(effectiveDueDate(p, balanceDueDate), now);
  return days !== null && days < 0;
}

/** 서버 상태가 아직 pending이어도 기한이 지났으면 연체, 남은 돈이 없으면 수금완료로 보여 준다. */
export function displayStatus(
  p: PaymentAmounts & PaymentSchedule,
  balanceDueDate?: string | null,
  now = new Date(),
): CommissionPaymentStatus {
  if (isPaymentDone(p)) return 'collected';
  if (isPaymentOverdue(p, balanceDueDate, now)) return 'overdue';
  // 서버에 연체로 적혀 있어도 상대가 수금하는 청구는 수금 대기로 보인다
  return p.status === 'overdue' && !isOurReceivable(p) ? 'pending' : p.status;
}

// ── 수수료 조정 ──────────────────────────────────────────

export type AdjustmentProblem = 'nothing-left' | 'over-remaining';

/**
 * 승인 시점에 조정을 적용할 수 있는지 본다. 요청 뒤 돈이 들어오면 남은 금액이 줄어드는데,
 * 남은 금액을 넘는 할인을 승인하면 청구액이 받은 돈보다 작아져 돌려줄 돈이 생기고 분배 합계도 맞지 않는다.
 */
export function adjustmentProblem(
  adjustment: { type: string; amount: number },
  payment: PaymentAmounts,
): AdjustmentProblem | null {
  const left = paymentRemaining(payment);
  if (left <= 0) return 'nothing-left';
  return adjustment.type === 'discount' && Math.abs(adjustment.amount) > left
    ? 'over-remaining'
    : null;
}

/** 조정이 속한 청구. 조정 ID로 찾으므로 청구번호가 비었거나 겹쳐도 다른 청구로 오인하지 않는다. */
export function paymentWithAdjustment<
  T extends { adjustments?: Array<{ id: string }> },
>(payments: T[], adjustmentId: string): T | null {
  return (
    payments.find((p) => p.adjustments?.some((a) => a.id === adjustmentId)) ??
    null
  );
}

/**
 * 목록에 어떤 버튼을 보여 줄지 고르는 힌트. 원장 응답의 청구 ID로 찾고, ID가 없는 예전 응답이면 청구번호로 찾는다.
 * 승인 여부는 이 값이 아니라 승인을 누를 때 서버에서 다시 읽어 정한다.
 */
export function paymentOfAdjustment(
  groups: LedgerDealGroup[],
  adjustment: { dealId: string; paymentCode: string | null; paymentId?: string },
): LedgerPayment | null {
  const group = groups.find((g) => g.deal.id === adjustment.dealId);
  if (adjustment.paymentId) {
    return group?.payments.find((p) => p.id === adjustment.paymentId) ?? null;
  }
  if (!adjustment.paymentCode) return null;
  return (
    group?.payments.find(
      (p) => p.code === adjustment.paymentCode && p.pendingAdjustments > 0,
    ) ?? null
  );
}

/**
 * 취소한 거래의 청구는 받을 돈이 아니다. 원장 응답을 화면에 쓰기 전에 그 청구들을 '취소' 상태로 바꿔 둔다
 * (받을 돈·연체·예정·미수·수금 처리에서 빠진다). 이미 받은 돈(ourCollectedWon·collections)은 그대로 두어
 * 수금 합계와 캘린더의 입금에는 남는다 — 캐시플로우의 통장 기준과 같다.
 */
export function markCancelledDeals<T extends { deal: { isCancelled: boolean }; payments: LedgerPayment[] }>(
  groups: T[],
): T[] {
  return groups.map((group) =>
    group.deal.isCancelled
      ? { ...group, payments: group.payments.map((p) => ({ ...p, status: 'cancelled' as const })) }
      : group,
  );
}

/** 고른 달('YYYY-MM')에 우리 통장에 들어온 돈 (만원). 원장의 '월' 보기 수금 합계 — 캐시플로우 월 수금과 같은 범위. */
export function collectedInMonth(payments: Array<Pick<LedgerPayment, 'collections'>>, monthKey: string): number {
  let won = 0;
  for (const p of payments) {
    for (const c of p.collections ?? []) {
      if (toDayKey(c.at)?.startsWith(monthKey)) won += c.won;
    }
  }
  return Math.round(won / WON_PER_MANWON);
}

// ── 거래 묶음 ─────────────────────────────────────────────

/**
 * 받은 돈 (원, 부가세 뺀 금액). 입금 기록 합계가 있으면 그것을, 없으면 만원 값에서 구한다.
 * 합계를 낼 때 청구마다 만원으로 반올림해 더하면 캐시플로우(원으로 모아 마지막에 반올림)와 1만원씩 어긋난다.
 */
export function receivedSupplyWonOf(p: PaymentAmounts): number {
  if (p.status === 'cancelled') return 0;
  return p.receivedSupplyWon ? p.receivedSupplyWon : receivedAmount(p) * WON_PER_MANWON;
}

/**
 * 우리 통장에 들어온 돈 (원, 부가세 뺀 금액). 캐시플로우의 수금과 같은 기준이다:
 * 우리가 수금한 청구는 입금 기록, 상대가 수금한 청구는 '받음 기록'한 우리 몫만.
 * 원장 응답이면 서버가 센 값(ourCollectedWon)을, 거래 응답이면 같은 규칙으로 센다.
 */
export function ourCollectedWonOf(p: PaymentAmounts): number {
  if (typeof p.ourCollectedWon === 'number') return p.ourCollectedWon;
  if (isOurReceivable(p)) return receivedSupplyWonOf(p);
  return (p.distributions ?? [])
    .filter((d) => d.recipientType === 'our_office' && d.status === 'settled')
    .reduce((sum, d) => sum + d.shareAmount * WON_PER_MANWON, 0);
}

/**
 * 거래·화면 합계. collected 는 우리 통장에 들어온 돈(캐시플로우 수금과 같은 기준),
 * claimCollected 는 청구가 얼마나 받아졌는지(상대가 받은 돈 포함) — 진행 막대·% 에만 쓴다.
 */
export function rollupPayments(payments: PaymentAmounts[]) {
  const totals = payments.reduce(
    (acc, p) => {
      acc.billed += billableAmount(p);
      acc.collectedWon += ourCollectedWonOf(p);
      acc.claimWon += receivedSupplyWonOf(p);
      // 미수는 우리가 받을 돈만 (상대가 수금하는 청구의 잔여는 공동중개 화면의 받을 몫으로 본다)
      if (isOurReceivable(p)) acc.remaining += paymentRemaining(p);
      return acc;
    },
    { billed: 0, collectedWon: 0, claimWon: 0, remaining: 0 },
  );
  return {
    billed: totals.billed,
    collected: Math.round(totals.collectedWon / WON_PER_MANWON),
    claimCollected: Math.round(totals.claimWon / WON_PER_MANWON),
    remaining: totals.remaining,
  };
}

export function worstStatus(
  group: LedgerDealGroup,
  now = new Date(),
): CommissionPaymentStatus {
  const { payments, deal } = group;
  if (payments.some((p) => isPaymentOverdue(p, deal.balanceDueDate, now))) {
    return 'overdue';
  }
  if (payments.some((p) => isOpenPayment(p) && p.status === 'partial')) {
    return 'partial';
  }
  if (payments.length > 0 && payments.every(isClosedPayment)) return 'waived';
  if (
    payments.length > 0 &&
    payments.every((p) => isPaymentDone(p) || isClosedPayment(p))
  ) {
    return 'collected';
  }
  return 'pending';
}

/** 우리가 받을 돈이 남은 청구의 가장 빠른 예정일. 남은 청구가 없으면 null. */
export function nextDueDate(group: LedgerDealGroup): string | null {
  return (
    group.payments
      // 상대가 수금하는 청구의 기한은 우리가 셀 기한이 아니다
      .filter((p) => isOpenPayment(p) && isOurReceivable(p))
      .map((p) => effectiveDueDate(p, group.deal.balanceDueDate))
      .filter((d): d is string => d !== null)
      .sort((a, b) => (toDayKey(a) ?? '').localeCompare(toDayKey(b) ?? ''))[0] ?? null
  );
}

/** 더 받을 돈이 없는 거래 */
export const isFullyCollected = (group: LedgerDealGroup) => {
  const status = worstStatus(group);
  return status === 'collected' || status === 'waived';
};

// ── 캐시플로우 ───────────────────────────────────────────

export interface QueueItem {
  group: LedgerDealGroup;
  payment: LedgerPayment;
  due: string | null;
  remaining: number;
}

function eachPayment(
  groups: LedgerDealGroup[],
  visit: (group: LedgerDealGroup, payment: LedgerPayment) => void,
) {
  for (const group of groups) {
    for (const payment of group.payments) visit(group, payment);
  }
}

/** 고른 달의 받을 돈. 연체는 지금 받아야 하는 돈이라 이번 달에 모은다. */
export function monthlyOwed(
  groups: LedgerDealGroup[],
  year: number,
  month: number,
  now = new Date(),
) {
  const key = monthKeyOf(year, month);
  const isCurrent = key === monthKeyOf(now.getFullYear(), now.getMonth() + 1);
  let pending = 0;
  let overdue = 0;
  let dueSoon = 0;
  eachPayment(groups, (group, p) => {
    if (!isOpenPayment(p) || !isOurReceivable(p)) return;
    const balance = group.deal.balanceDueDate;
    const dueKey = toDayKey(effectiveDueDate(p, balance));
    const amount = paymentRemaining(p);
    if (isPaymentOverdue(p, balance, now)) {
      if (isCurrent || dueKey?.startsWith(key)) overdue += amount;
      return;
    }
    if (dueKey ? dueKey.startsWith(key) : isCurrent) pending += amount;
    const days = daysFromToday(effectiveDueDate(p, balance), now);
    if (days !== null && days >= 0 && days <= 7) dueSoon += amount;
  });
  return { pending, overdue, dueSoon };
}

/** 오늘 처리할 일은 고른 달과 상관없이 항상 지금 기준이다. */
export function buildTodayQueue(groups: LedgerDealGroup[], now = new Date()) {
  const overdue: QueueItem[] = [];
  const dueSoon: QueueItem[] = [];
  const taxInvoice: QueueItem[] = [];
  eachPayment(groups, (group, payment) => {
    const balance = group.deal.balanceDueDate;
    const due = effectiveDueDate(payment, balance);
    const item = { group, payment, due, remaining: paymentRemaining(payment) };
    // 상대가 수금하는 청구는 우리가 독촉하거나 받을 돈이 아니다
    if (isOpenPayment(payment) && isOurReceivable(payment)) {
      if (isPaymentOverdue(payment, balance, now)) {
        overdue.push(item);
      } else {
        const days = daysFromToday(due, now);
        if (days !== null && days >= 0 && days <= 7) dueSoon.push(item);
      }
    }
    // 파트너가 받은 돈의 계산서는 파트너가 끊는다. 오래된 건은 할 일로 쌓지 않는다.
    const paidDays = daysFromToday(payment.paidAt, now);
    if (
      (payment.status === 'collected' || payment.status === 'partial') &&
      payment.taxInvoiceStatus === 'none' &&
      payment.collectedByOffice === 'us' &&
      paidDays !== null &&
      paidDays >= -30
    ) {
      taxInvoice.push(item);
    }
  });
  const byDue = (a: QueueItem, b: QueueItem) =>
    (toDayKey(a.due) ?? '9999').localeCompare(toDayKey(b.due) ?? '9999');
  overdue.sort(byDue);
  dueSoon.sort(byDue);
  taxInvoice.sort((a, b) =>
    (toDayKey(b.payment.paidAt) ?? '').localeCompare(
      toDayKey(a.payment.paidAt) ?? '',
    ),
  );
  return { overdue, dueSoon, taxInvoice };
}

const CONTRACTED_STAGES = new Set([
  'contracted',
  'settling',
  'completed',
  'closed',
]);

/** 그달에 계약 이후 단계로 넘어간 거래 */
export function monthContracts(
  groups: LedgerDealGroup[],
  year: number,
  month: number,
): LedgerDealGroup[] {
  const key = monthKeyOf(year, month);
  return groups
    .filter(
      (g) =>
        // 취소한 거래는 그 달의 계약 수수료가 아니다 (받은 돈은 수금에 남는다)
        !g.deal.isCancelled &&
        CONTRACTED_STAGES.has(g.deal.stage) &&
        toDayKey(g.deal.stageChangedAt)?.startsWith(key),
    )
    .sort((a, b) =>
      (toDayKey(b.deal.stageChangedAt) ?? '').localeCompare(
        toDayKey(a.deal.stageChangedAt) ?? '',
      ),
    );
}

export interface TrendBar {
  key: string;
  year: number;
  month: number;
  label: string;
  collected: number;
  /** 그 달 수금 가운데 공동중개 상대에게 넘겨줄 몫 (만원) */
  partnerShare: number;
  forecast: number;
}

/** 지난 달까지는 실제 수금, 이번 달부터는 앞으로 들어올 돈을 함께 쌓는다. */
export function buildTrendBars(
  trend: MonthlyTrend[],
  groups: LedgerDealGroup[],
  now = new Date(),
  futureMonths = 2,
): TrendBar[] {
  const currentKey = monthKeyOf(now.getFullYear(), now.getMonth() + 1);
  const forecast = new Map<string, number>();
  eachPayment(groups, (group, p) => {
    if (!isOpenPayment(p) || !isOurReceivable(p)) return;
    const balance = group.deal.balanceDueDate;
    const dueKey = toDayKey(effectiveDueDate(p, balance))?.slice(0, 7);
    const key =
      !dueKey || isPaymentOverdue(p, balance, now) || dueKey < currentKey
        ? currentKey
        : dueKey;
    forecast.set(key, (forecast.get(key) ?? 0) + paymentRemaining(p));
  });

  const months = trend.map((t) => t.month);
  const last = months[months.length - 1] ?? currentKey;
  const [lastYear, lastMonth] = last.split('-').map(Number);
  for (let i = 1; i <= futureMonths; i += 1) {
    const next = stepMonth({ year: lastYear, month: lastMonth }, i);
    months.push(monthKeyOf(next.year, next.month));
  }

  return months.map((key) => {
    const [year, month] = key.split('-').map(Number);
    const row = trend.find((t) => t.month === key);
    const collected = row?.collected ?? 0;
    const partnerShare = row?.partnerShare ?? 0;
    return {
      key,
      year,
      month,
      label: `${year === now.getFullYear() ? '' : `'${String(year).slice(2)}.`}${month}월`,
      collected,
      partnerShare,
      forecast: key >= currentKey ? (forecast.get(key) ?? 0) : 0,
    };
  });
}

// ── 공동중개 ─────────────────────────────────────────────

interface DistributionRow {
  recipientType: string;
  shareRatio: number | string;
  shareAmount: number;
  status: string;
}

interface BalancePayment {
  status: string;
  expectedAmount: number;
  actualAmount: number | null;
  collectedByOffice: string;
  distributions?: DistributionRow[];
}

type DistributionPayment = PaymentAmounts & {
  distributions?: DistributionRow[];
};

/** 서버 computeDistributionRows와 같은 규칙: 파트너는 내림하고 나머지는 우리 사무소 몫이다. */
export function splitAmount(amount: number, partnerRatio: number) {
  const partner = Math.floor((amount * partnerRatio) / 100);
  return { our: amount - partner, partner };
}

export const partnerRatioOf = (rows: DistributionRow[] = []) =>
  rows
    .filter((d) => d.recipientType === 'partner_broker')
    .reduce((sum, d) => sum + Number(d.shareRatio), 0);

/** 분배에 들어 있는 파트너. 파트너 몫이 없으면 null이다. */
export function partnerIdOf(rows: Array<{ recipientType: string; partnerBrokerId?: string | null }> = []) {
  return rows.find((d) => d.recipientType === 'partner_broker')?.partnerBrokerId ?? null;
}

/**
 * 화면에서 분배를 바꿀 수 있는 청구. 화면은 파트너를 하나만 입력받으므로
 * 파트너가 둘 이상인 청구를 고치면 한쪽이 사라진다.
 */
export function isDistributionEditable(p: DistributionPayment) {
  const rows = p.distributions ?? [];
  return (
    (p.status === 'draft' || isOpenPayment(p)) &&
    rows.every((d) => d.status !== 'settled') &&
    rows.filter((d) => d.recipientType === 'partner_broker').length <= 1
  );
}

const SERVER_EDITABLE_STATUSES = ['draft', 'pending', 'partial', 'overdue'];

/**
 * 거래 전체 분배 변경의 대상. 서버 일괄 API는 상태와 정산 여부만 보므로, 화면에서 바꾸면
 * 안 되는 청구까지 건드리게 되면 일괄 API를 쓰지 않고 대상만 하나씩 바꾼다.
 */
export function planDealDistribution<T extends DistributionPayment>(payments: T[]) {
  const targets = payments.filter(isDistributionEditable);
  const serverWouldChange = payments.filter(
    (p) =>
      SERVER_EDITABLE_STATUSES.includes(p.status) &&
      (p.distributions ?? []).every((d) => d.status !== 'settled'),
  );
  return {
    useServerBulk: serverWouldChange.length === targets.length,
    targets,
    skipped: payments.filter((p) => !isDistributionEditable(p)),
  };
}

/** 소수 비율의 부동소수점 오차를 없앤다 (100 - 70.1 = 29.900000000000006) */
export const ourRatioFrom = (partnerRatio: number) =>
  Math.round((100 - partnerRatio) * 100) / 100;

/**
 * 분배 행별 금액. 서버 computeDistributionRows와 같이 행마다 내림하고 나머지를
 * 우리 몫(없으면 첫 행)에 준다. 저장된 shareAmount는 할인을 승인해도 바뀌지 않아
 * 지금 금액으로 다시 계산하되, 이미 정산한 행은 실제로 주고받은 금액이라 그대로 둔다.
 */
export function shareRowAmounts(
  amount: number,
  rows: DistributionRow[] = [],
): number[] {
  const amounts = rows.map((row) =>
    row.status === 'settled'
      ? row.shareAmount
      : Math.floor((amount * Number(row.shareRatio)) / 100),
  );
  const remainder = amount - amounts.reduce((sum, value) => sum + value, 0);
  if (remainder !== 0) {
    const isOpen = (row: DistributionRow) => row.status !== 'settled';
    const ourIndex = rows.findIndex(
      (row) => row.recipientType === 'our_office' && isOpen(row),
    );
    const target = ourIndex >= 0 ? ourIndex : rows.findIndex(isOpen);
    if (target >= 0) amounts[target] = Math.max(0, amounts[target] + remainder);
  }
  return amounts;
}

/** 지금 청구액 기준의 우리 몫과 파트너 몫. 분배가 아직 없으면 전부 우리 몫이다. */
export function currentShares(p: {
  expectedAmount: number;
  distributions?: DistributionRow[];
}) {
  const rows = p.distributions ?? [];
  if (rows.length === 0) return { our: p.expectedAmount, partner: 0 };
  const amounts = shareRowAmounts(p.expectedAmount, rows);
  return rows.reduce(
    (acc, row, i) => {
      if (row.recipientType === 'our_office') acc.our += amounts[i];
      else acc.partner += amounts[i];
      return acc;
    },
    { our: 0, partner: 0 },
  );
}

/** 청구로 남는 금액 기준의 우리 몫과 파트너 몫 합계 */
export function shareTotals(payments: DistributionPayment[]) {
  return payments.reduce(
    (acc, p) => {
      const { our, partner } = currentShares({
        expectedAmount: billableAmount(p),
        distributions: p.distributions,
      });
      acc.our += our;
      acc.partner += partner;
      return acc;
    },
    { our: 0, partner: 0 },
  );
}

/**
 * 들어온 돈 기준으로, 우리가 받은 건 파트너 몫을, 파트너가 받은 건 우리 몫을 더한다.
 * 할인으로 청구액이 받은 돈보다 작아지면 청구액까지만 나눈다.
 * 일부 받은 뒤 면제·대손한 청구는 이미 받은 돈이 있으니 나누고, 정산 완료로 표시된 행은 뺀다.
 */
export function partnerBalance(payments: BalancePayment[]) {
  let receivable = 0;
  let payable = 0;
  for (const p of payments) {
    const received = Math.min(receivedAmount(p), p.expectedAmount);
    if (received <= 0) continue;
    const rows = p.distributions ?? [];
    // 정산 여부와 상관없이 비율대로 나눈 뒤, 아직 정산하지 않은 행만 더한다.
    const amounts = shareRowAmounts(
      received,
      rows.map((row) => ({ ...row, status: 'pending' })),
    );
    const held = p.collectedByOffice === 'us';
    rows.forEach((row, i) => {
      if (row.status === 'settled') return;
      if (held && row.recipientType === 'partner_broker') payable += amounts[i];
      if (!held && row.recipientType === 'our_office') receivable += amounts[i];
    });
  }
  return { receivable, payable };
}

export interface PartnerSettleRow {
  distributionId: string;
  /** pay: 우리가 받은 돈에서 상대 몫을 보냄 / receive: 상대가 받은 돈에서 우리 몫을 받음 */
  direction: 'pay' | 'receive';
  /** 만원 */
  amount: number;
  /** 다 받은 청구라 지금 정산을 기록할 수 있는지. 일부만 받았으면 다 받은 뒤에 한다. */
  ready: boolean;
  settledAt: string | null;
}

/**
 * 공동중개 상대와 주고받을 몫을 분배 줄마다 펼친다 (partnerBalance와 같은 계산).
 * 정산을 기록한 줄은 기록할 때 굳힌 금액(shareAmount)을 쓴다.
 */
type SettleDistributionRow = DistributionRow & { id?: string; settledAt?: string | null };

export function partnerSettleRows(
  payments: Array<Omit<BalancePayment, 'distributions'> & { distributions?: SettleDistributionRow[] }>,
): PartnerSettleRow[] {
  const rows: PartnerSettleRow[] = [];
  for (const p of payments) {
    const received = Math.min(receivedAmount(p), p.expectedAmount);
    const list = p.distributions ?? [];
    const held = p.collectedByOffice === 'us';
    const amounts = shareRowAmounts(
      Math.max(0, received),
      list.map((row) => ({ ...row, status: 'pending' })),
    );
    const ready = (p.status === 'collected' || p.status === 'waived') && received > 0;
    list.forEach((row, i) => {
      if (!row.id) return;
      const direction =
        held && row.recipientType === 'partner_broker'
          ? 'pay'
          : !held && row.recipientType === 'our_office'
            ? 'receive'
            : null;
      if (!direction) return;
      const settled = row.status === 'settled';
      const amount = settled ? row.shareAmount : amounts[i];
      if (!settled && amount <= 0) return;
      rows.push({
        distributionId: row.id,
        direction,
        amount,
        ready: settled || ready,
        settledAt: settled ? (row.settledAt ?? null) : null,
      });
    });
  }
  return rows;
}

// ── 직원 정산 ────────────────────────────────────────────

export type SettlementState = 'settled' | 'ready' | 'waiting';

/** 그 직원 쪽 청구가 다 들어와야 정산 가능으로 본다. */
export function participantSettlement(
  participant: { side: string; settlementStatus?: string },
  payments: Array<{
    clientSide: string;
    status: string;
    expectedAmount: number;
    actualAmount: number | null;
  }>,
) {
  const mine = payments.filter(
    (p) =>
      countsAsBilled(p) &&
      (participant.side === 'both' || p.clientSide === participant.side),
  );
  const billed = mine.reduce((sum, p) => sum + billableAmount(p), 0);
  const collected = mine.reduce((sum, p) => sum + receivedAmount(p), 0);
  let state: SettlementState = 'waiting';
  if (participant.settlementStatus === 'settled') state = 'settled';
  else if (mine.length > 0 && mine.every((p) => isPaymentDone(p) || isClosedPayment(p))) {
    state = 'ready';
  }
  return { state, billed, collected, percent: collectPercent(collected, billed) };
}

// ── CSV ─────────────────────────────────────────────────

export function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return `\uFEFF${rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')}`;
}

export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number | null | undefined>>,
) {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
