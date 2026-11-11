/**
 * 수수료/정산 화면의 계산 규칙. 화면 부품과 분리해 테스트한다.
 * 금액은 만원 단위, 날짜는 사용자 현지 날짜 기준으로 비교한다.
 */
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

/** 11.12 */
export function shortDate(value: DateInput): string {
  const d = toDate(value);
  return d ? `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}` : '—';
}

/** 11.12 (목) */
export function shortDateWithDay(value: DateInput): string {
  const d = toDate(value);
  return d ? `${shortDate(d)} (${WEEKDAYS[d.getDay()]})` : '—';
}

export function dealLocation(deal: {
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
}): string {
  // 단일 동 건물의 placeholder 동("-")은 주소에 넣지 않는다.
  const dong = deal.dongName === '-' ? null : deal.dongName;
  return (
    [deal.siteName, dong, deal.unitName].filter(Boolean).join(' ') ||
    '매물 미지정'
  );
}

export const clientSideLabel = (side: string) =>
  side === 'seller' ? '매도측' : '매수측';

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
}
type PaymentSchedule = Pick<
  LedgerPayment,
  'status' | 'dueDate' | 'agreedRemainingDate'
>;

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

/** 서버 collect는 금액을 덮어쓰므로, 이번에 받은 돈을 더한 누적액을 보낸다. */
export function nextCollectedTotal(
  p: Pick<LedgerPayment, 'actualAmount'>,
  received: number,
): number {
  return (p.actualAmount ?? 0) + received;
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
  return isPaymentOverdue(p, balanceDueDate, now) ? 'overdue' : p.status;
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
 * 목록에 어떤 버튼을 보여 줄지 고르는 힌트. 원장 응답에는 조정과 청구를 잇는 ID가 없어 청구번호로 찾는다.
 * 승인 여부는 이 값이 아니라 승인을 누를 때 서버에서 다시 읽어 정한다.
 */
export function paymentOfAdjustment(
  groups: LedgerDealGroup[],
  adjustment: { dealId: string; paymentCode: string | null },
): LedgerPayment | null {
  if (!adjustment.paymentCode) return null;
  const group = groups.find((g) => g.deal.id === adjustment.dealId);
  return (
    group?.payments.find(
      (p) => p.code === adjustment.paymentCode && p.pendingAdjustments > 0,
    ) ?? null
  );
}

// ── 거래 묶음 ─────────────────────────────────────────────

export function rollupPayments(payments: PaymentAmounts[]) {
  return payments.reduce(
    (acc, p) => {
      acc.billed += billableAmount(p);
      acc.collected += receivedAmount(p);
      acc.remaining += paymentRemaining(p);
      return acc;
    },
    { billed: 0, collected: 0, remaining: 0 },
  );
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
    if (!isOpenPayment(p)) return;
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
    if (isOpenPayment(payment)) {
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
  forecast: number;
  expense: number;
  net: number;
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
    if (!isOpenPayment(p)) return;
    const balance = group.deal.balanceDueDate;
    const dueKey = toDayKey(effectiveDueDate(p, balance))?.slice(0, 7);
    const key =
      !dueKey || isPaymentOverdue(p, balance, now) || dueKey < currentKey
        ? currentKey
        : dueKey;
    forecast.set(key, (forecast.get(key) ?? 0) + paymentRemaining(p));
  });

  const expense = trend[trend.length - 1]?.expense ?? 0;
  const months = trend.map((t) => t.month);
  const last = months[months.length - 1] ?? currentKey;
  const [lastYear, lastMonth] = last.split('-').map(Number);
  for (let i = 1; i <= futureMonths; i += 1) {
    const next = stepMonth({ year: lastYear, month: lastMonth }, i);
    months.push(monthKeyOf(next.year, next.month));
  }

  return months.map((key) => {
    const [year, month] = key.split('-').map(Number);
    const collected = trend.find((t) => t.month === key)?.collected ?? 0;
    return {
      key,
      year,
      month,
      label: `${year === now.getFullYear() ? '' : `'${String(year).slice(2)}.`}${month}월`,
      collected,
      forecast: key >= currentKey ? (forecast.get(key) ?? 0) : 0,
      expense,
      net: collected - expense,
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

// ── 고정비 ───────────────────────────────────────────────

export function monthlyExpenseAmount(t: {
  amount: number;
  frequency: string;
}): number {
  if (t.frequency === 'quarterly') return Math.round(t.amount / 3);
  if (t.frequency === 'yearly') return Math.round(t.amount / 12);
  return t.amount;
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
