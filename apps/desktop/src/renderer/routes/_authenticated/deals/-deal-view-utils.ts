import type { Deal } from '@estate-erp/api-client';

export type DealListItem = Deal;

export type DealDisplayGroupKey =
  | 'coordination'
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

export const dealDisplayGroups: DealDisplayGroup[] = [
  {
    key: 'coordination',
    label: '조율',
    stages: ['selection', 'negotiating'],
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
    label: '잔금/완료',
    stages: ['settling'],
    dotClassName: 'bg-emerald-600',
  },
  {
    key: 'completed',
    label: '정산',
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
  selection: 1,
  negotiating: 1,
  preContract: 2,
  contracted: 3,
  settling: 4,
  completed: 5,
  closed: 5,
};

const paymentKindLabels: Record<string, string> = {
  pre_contract: '가계약금',
  contract: '계약금',
  interim: '중도금',
  balance: '잔금',
  refund: '환불',
};

export function getDealDisplayGroupKey(stage: string): DealDisplayGroupKey {
  if (stage === 'closed') return 'closed';
  return stageToGroup.get(stage) ?? 'coordination';
}

export function getDealProgressStep(stage: string): number {
  return stageProgress[stage] ?? 1;
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

export function getNextDealPaymentSummary(
  deal: DealListItem,
  referenceDate = new Date(),
) {
  const nextPayment = (deal.payments ?? [])
    .filter((payment) => payment.status !== 'paid' && payment.status !== 'cancelled')
    .slice()
    .sort((left, right) => {
      const leftTime = left.scheduledDate ? new Date(left.scheduledDate).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.scheduledDate ? new Date(right.scheduledDate).getTime() : Number.POSITIVE_INFINITY;
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

function differenceInCalendarDays(target: Date, reference: Date) {
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  return Math.round((targetDay - referenceDay) / 86_400_000);
}
