import type { Deal } from '@estate-erp/api-client';
import { normalizeDealStage } from '@estate-erp/shared';
import { formatMoney, formatRent } from '@/lib/format';

export type DealListItem = Deal;

export type DealPayment = NonNullable<Deal['payments']>[number];

/** Deal.cancelledBy(취소 주체) 표시 라벨 */
export const cancelledByLabels: Record<string, string> = {
  buyer: '매수인',
  seller: '매도인',
  mutual: '상호 합의',
  office: '우리 사무소',
  partner: '공동중개사',
  other: '기타',
};

export function formatCancelledBy(value: string | null | undefined) {
  if (!value) return '미기록';
  return cancelledByLabels[value] ?? value;
}

/** ourSide(공동중개 시 우리 담당 측) 라벨 */
export const ourSideLabels: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
  both: '양측',
};

export const dealPipelineStages = [
  'preparing',
  'preContract',
  'contracted',
  'settling',
  'completed',
] as const;

export const dealStageOrder = [...dealPipelineStages, 'closed'] as const;

export type DealPipelineStage = (typeof dealPipelineStages)[number];

export type DealDisplayGroupKey =
  | 'preparing'
  | 'preContract'
  | 'contracted'
  | 'settling'
  | 'completed'
  | 'closed';

export interface DealDisplayGroup {
  key: DealDisplayGroupKey;
  label: string;
  stages: string[];
  dotClassName: string;
}

export interface DealNotionListRow {
  rowNumber: number;
  deal: DealListItem;
}

export interface DealNotionListGroup {
  group: DealDisplayGroup;
  rows: DealNotionListRow[];
  summary: {
    count: number;
    amountTotal: number;
  };
}

export const dealDisplayGroups: DealDisplayGroup[] = [
  {
    key: 'preparing',
    label: '계약 준비',
    stages: ['preparing'],
    dotClassName: 'bg-slate-500',
  },
  {
    key: 'preContract',
    label: '가계약',
    stages: ['preContract'],
    dotClassName: 'bg-sky-600',
  },
  {
    key: 'contracted',
    label: '본계약',
    stages: ['contracted'],
    dotClassName: 'bg-violet-600',
  },
  {
    key: 'settling',
    label: '중도금·잔금',
    stages: ['settling'],
    dotClassName: 'bg-emerald-600',
  },
  {
    key: 'completed',
    label: '잔금 완료',
    stages: ['completed'],
    dotClassName: 'bg-slate-400',
  },
];

const stageToGroup = new Map<string, DealDisplayGroupKey>(
  dealDisplayGroups.flatMap((group) =>
    group.stages.map((stage) => [stage, group.key] as const),
  ),
);

const stageProgress: Record<string, number> = {
  preparing: 1,
  preContract: 2,
  contracted: 3,
  settling: 4,
  completed: 5,
  closed: 5,
};

export const dealStageTargetDays: Record<DealDisplayGroupKey, number> = {
  preparing: 7,
  preContract: 5,
  contracted: 14,
  settling: 7,
  completed: 10,
  closed: 0,
};

const dealStageProbability: Record<string, number> = {
  preparing: 0.55,
  preContract: 0.7,
  contracted: 0.8,
  settling: 0.95,
  completed: 1,
  closed: 1,
};

export type DealPipelineHealthState = 'overdue' | 'stale' | 'unscheduled' | 'healthy';

export type DealPipelineHealth = {
  state: DealPipelineHealthState;
  label: string;
  description: string;
  stageAgeDays: number;
  targetDays: number;
  isAtRisk: boolean;
};

export const paymentKindLabels: Record<string, string> = {
  pre_contract: '가계약금',
  contract: '계약금',
  interim: '중도금',
  balance: '잔금',
  refund: '환불',
};

/** kind + sequence → "중도금 2차" 표기 (interim 외에는 차수 생략) */
export function formatPaymentKind(kind: string, sequence?: number) {
  const base = paymentKindLabels[kind] ?? kind;
  if (kind === 'interim' && sequence && sequence > 1) return `${base} ${sequence}차`;
  return base;
}

export function getDealDisplayGroupKey(stage: string): DealDisplayGroupKey {
  const normalizedStage = normalizeDealStage(stage);
  if (normalizedStage === 'closed') return 'closed';
  return stageToGroup.get(normalizedStage) ?? 'preparing';
}

export function getDealProgressStep(stage: string): number {
  return stageProgress[normalizeDealStage(stage)] ?? 1;
}

export function summarizeDealGroup(
  deals: DealListItem[],
  groupKey: DealDisplayGroupKey,
) {
  const groupDeals = deals.filter(
    (deal) => getDealDisplayGroupKey(deal.stage) === groupKey,
  );

  return {
    count: groupDeals.length,
    amountTotal: groupDeals.reduce(
      (sum, deal) => sum + getDealAmountValue(deal),
      0,
    ),
  };
}

export function getDealAmountValue(deal: DealListItem): number {
  return (
    deal.agreedPrice ??
    deal.agreedDeposit ??
    deal.listing?.price ??
    deal.listing?.deposit ??
    0
  );
}

export function getDealCommissionValue(deal: DealListItem): number {
  return deal.commissionSummary?.ourShare ?? 0;
}

export function getWeightedCommissionValue(deal: DealListItem): number {
  const probability = dealStageProbability[normalizeDealStage(deal.stage)] ?? 0;
  return Math.round(getDealCommissionValue(deal) * probability);
}

export function getDealStageAgeDays(
  deal: DealListItem,
  referenceDate = new Date(),
) {
  return Math.max(
    0,
    differenceInCalendarDays(referenceDate, new Date(deal.stageChangedAt)),
  );
}

export function getDealPipelineHealth(
  deal: DealListItem,
  referenceDate = new Date(),
): DealPipelineHealth {
  const groupKey = getDealDisplayGroupKey(deal.stage);
  const targetDays = dealStageTargetDays[groupKey];
  const stageAgeDays = getDealStageAgeDays(deal, referenceDate);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);

  if (
    nextPayment?.daysUntil !== null &&
    nextPayment?.daysUntil !== undefined &&
    nextPayment.daysUntil < 0
  ) {
    return {
      state: 'overdue',
      label: '일정 지연',
      description: `${nextPayment.label} ${Math.abs(nextPayment.daysUntil)}일 지연`,
      stageAgeDays,
      targetDays,
      isAtRisk: true,
    };
  }

  if (targetDays > 0 && stageAgeDays > targetDays) {
    return {
      state: 'stale',
      label: '단계 정체',
      description: `목표 ${targetDays}일 · 현재 ${stageAgeDays}일`,
      stageAgeDays,
      targetDays,
      isAtRisk: true,
    };
  }

  if (
    (groupKey === 'contracted' || groupKey === 'settling') &&
    (!nextPayment || nextPayment.daysUntil === null)
  ) {
    return {
      state: 'unscheduled',
      label: '일정 미정',
      description: '다음 지급일을 등록해 주세요',
      stageAgeDays,
      targetDays,
      isAtRisk: true,
    };
  }

  return {
    state: 'healthy',
    label: '정상',
    description: nextPayment?.daysUntil === 0 ? '오늘 지급 일정' : '진행 상태 양호',
    stageAgeDays,
    targetDays,
    isAtRisk: false,
  };
}

export function getNextDealPaymentSummary(
  deal: DealListItem,
  referenceDate = new Date(),
) {
  const nextPayment = (deal.payments ?? [])
    .filter((payment) => payment.status !== 'paid' && payment.status !== 'cancelled')
    .slice()
    .sort((left, right) => {
      const leftTime = left.scheduledDate
        ? new Date(left.scheduledDate).getTime()
        : Number.POSITIVE_INFINITY;
      const rightTime = right.scheduledDate
        ? new Date(right.scheduledDate).getTime()
        : Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    })[0];

  if (!nextPayment) return null;

  const daysUntil = nextPayment.scheduledDate
    ? differenceInCalendarDays(new Date(nextPayment.scheduledDate), referenceDate)
    : null;

  return {
    payment: nextPayment,
    label: paymentKindLabels[nextPayment.kind] ?? nextPayment.kind,
    daysUntil,
    isUrgent: daysUntil !== null && daysUntil <= 3,
  };
}

export function sortDealsForDisplay(
  deals: DealListItem[],
  referenceDate = new Date(),
) {
  return deals.slice().sort((left, right) => {
    const healthPriority: Record<DealPipelineHealthState, number> = {
      overdue: 0,
      stale: 1,
      unscheduled: 2,
      healthy: 3,
    };
    const leftHealth = getDealPipelineHealth(left, referenceDate);
    const rightHealth = getDealPipelineHealth(right, referenceDate);
    const healthDifference =
      healthPriority[leftHealth.state] - healthPriority[rightHealth.state];
    if (healthDifference !== 0) return healthDifference;

    const leftPayment = getNextDealPaymentSummary(left, referenceDate);
    const rightPayment = getNextDealPaymentSummary(right, referenceDate);
    const leftDays = leftPayment?.daysUntil ?? Number.POSITIVE_INFINITY;
    const rightDays = rightPayment?.daysUntil ?? Number.POSITIVE_INFINITY;

    if (leftDays !== rightDays) return leftDays - rightDays;
    if (leftHealth.stageAgeDays !== rightHealth.stageAgeDays) {
      return rightHealth.stageAgeDays - leftHealth.stageAgeDays;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function getDealNotionListGroups(
  deals: DealListItem[],
  referenceDate = new Date(),
): DealNotionListGroup[] {
  return dealDisplayGroups.map((group) => {
    const groupDeals = sortDealsForDisplay(
      deals.filter((deal) => getDealDisplayGroupKey(deal.stage) === group.key),
      referenceDate,
    );

    return {
      group,
      rows: groupDeals.map((deal, index) => ({
        rowNumber: index + 1,
        deal,
      })),
      summary: {
        count: groupDeals.length,
        amountTotal: groupDeals.reduce((sum, deal) => sum + getDealAmountValue(deal), 0),
      },
    };
  });
}

function differenceInCalendarDays(target: Date, reference: Date) {
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  return Math.round((targetDay - referenceDay) / 86_400_000);
}

export function getDaysUntil(target: Date, reference: Date) {
  return differenceInCalendarDays(target, reference);
}

// ============================================================
// 표시 헬퍼 (보드/리스트/상세 공용)
// ============================================================

export function getDealTitle(deal: Deal) {
  const siteName = deal.property?.site?.name?.trim();
  const dong = deal.property?.unit?.dong;
  const dongName = dong?.name?.trim();
  const dongLabel =
    dongName && dongName !== '-' && !dong?.isPlaceholder
      ? withSuffix(dongName, '동')
      : null;
  const unitName = deal.property?.unit?.name?.trim();
  const unitLabel = unitName && unitName !== '-' ? withSuffix(unitName, '호') : null;

  return [siteName, dongLabel, unitLabel].filter(Boolean).join(' ') || '매물 정보 없음';
}

function withSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

export function getDealLocationLine(deal: Deal) {
  const address = deal.property?.site?.roadAddress ?? deal.property?.site?.jibunAddress ?? '주소 정보 없음';
  const area = deal.property?.unit?.exclusiveAreaM2;
  return area ? `${address} · 전용 ${Math.round(Number(area))}㎡` : address;
}

export function getDealShortCode(id: string) {
  return `D${id.replaceAll('-', '').slice(0, 3).toUpperCase()}`;
}

export function getNextDealStage(stage: string) {
  const currentIndex = dealPipelineStages.indexOf(
    normalizeDealStage(stage) as DealPipelineStage,
  );
  if (currentIndex < 0 || currentIndex >= dealPipelineStages.length - 1) {
    return null;
  }
  return dealPipelineStages[currentIndex + 1];
}

export function getDealTransactionType(deal: Deal): string | undefined {
  return deal.transactionType ?? deal.listing?.transactionType ?? undefined;
}

/** 거래유형별 대표 금액 문자열 (월세 "1억 / 120") */
export function formatDealAmount(deal: Deal) {
  const type = getDealTransactionType(deal);

  if (type === 'monthly') {
    const deposit = deal.agreedDeposit ?? deal.listing?.deposit;
    const monthlyRent = deal.agreedMonthlyRent ?? deal.listing?.monthlyRent;
    return formatRent(deposit, monthlyRent);
  }

  const price = deal.agreedPrice ?? deal.agreedDeposit ?? deal.listing?.price ?? deal.listing?.deposit;
  return formatMoney(price);
}

export function formatDaysLabel(daysUntil: number | null) {
  if (daysUntil === null) return '미정';
  if (daysUntil < 0) return `D+${Math.abs(daysUntil)}`;
  if (daysUntil === 0) return 'D-Day';
  return `D-${daysUntil}`;
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatNextPaymentLabel(summary: ReturnType<typeof getNextDealPaymentSummary>) {
  if (!summary) return '일정 미정';
  if (!summary.payment.scheduledDate) return `${summary.label} · 일정 미정`;
  return `${summary.label} ${formatShortDate(summary.payment.scheduledDate)} · ${formatDaysLabel(summary.daysUntil)}`;
}

export function formatNextPaymentName(summary: ReturnType<typeof getNextDealPaymentSummary>) {
  if (!summary) return '일정 미정';
  if (!summary.payment.scheduledDate) return `${summary.label} 일정 미정`;
  return `${summary.label} ${formatShortDate(summary.payment.scheduledDate)}`;
}

/** 보드/리스트가 공유하는 거래 행 액션 핸들러 묶음 */
export interface DealRowActions {
  onSelect: (id: string) => void;
  onRequestStage: (deal: Deal, stage: string) => void;
  onRequestCancel: (deal: Deal) => void;
  onRequestDelete: (deal: Deal) => void;
  isUpdating: boolean;
}
