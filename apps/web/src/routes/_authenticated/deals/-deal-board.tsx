import { ArrowRight, CalendarClock } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/domain';
import { DealActionsMenu } from './-deal-shared';
import {
  dealDisplayGroups,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealDisplayGroupKey,
  getDealLocationLine,
  getDealProgressStep,
  getDealShortCode,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  getNextDealStage,
  sortDealsForDisplay,
  summarizeDealGroup,
  type DealDisplayGroup,
  type DealRowActions,
} from './-deal-view-utils';

export function DealBoard({
  deals,
  selectedDealId,
  referenceDate,
  actions,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  return (
    <section className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-stretch gap-2.5">
        {dealDisplayGroups.map((group) => (
          <DealColumn
            key={group.key}
            group={group}
            deals={sortDealsForDisplay(
              deals.filter((deal) => getDealDisplayGroupKey(deal.stage) === group.key),
              referenceDate,
            )}
            selectedDealId={selectedDealId}
            referenceDate={referenceDate}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}

function DealColumn({
  group,
  deals,
  selectedDealId,
  referenceDate,
  actions,
}: {
  group: DealDisplayGroup;
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const summary = summarizeDealGroup(deals, group.key);

  return (
    <section className="flex min-h-[460px] w-[222px] shrink-0 flex-col gap-2 rounded-[10px] border bg-muted/50 px-2 py-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className={cn('size-2 shrink-0 rounded-full', group.dotClassName)} />
        <h2 className="text-xs font-bold text-foreground">{group.label}</h2>
        <Badge
          variant="outline"
          className="h-[17px] rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground/80"
        >
          {summary.count}
        </Badge>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {summary.amountTotal ? formatMoney(summary.amountTotal) : '—'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {deals.length === 0 ? (
          <div className="flex min-h-[110px] items-center justify-center break-keep rounded-lg border border-dashed bg-background/70 px-3 text-center text-[11.5px] text-muted-foreground/60">
            해당 단계의 거래가 없습니다
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              selected={deal.id === selectedDealId}
              referenceDate={referenceDate}
              actions={actions}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  selected,
  referenceDate,
  actions,
}: {
  deal: Deal;
  selected: boolean;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const transactionType = getDealTransactionType(deal);
  const nextStage = getNextDealStage(deal.stage);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const progress = getDealProgressStep(deal.stage);
  const urgent = nextPayment?.isUrgent;

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border bg-background px-2.5 py-2.5 shadow-xs transition-shadow hover:shadow-md',
        selected ? 'border-info ring-1 ring-info' : 'border-border',
        urgent && !selected && 'border-destructive/40 bg-destructive-soft/30',
      )}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-[3px] bg-destructive" /> : null}

      <div className="flex items-start gap-1.5">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => actions.onSelect(deal.id)}>
          <div className="flex items-center gap-1.5">
            {transactionType ? (
              <StatusBadge kind="transactionType" status={transactionType} size="sm" />
            ) : null}
            <span className="font-mono text-[9.5px] text-muted-foreground/60">{getDealShortCode(deal.id)}</span>
          </div>

          <div className="mt-1.5 space-y-0.5">
            <p className="truncate text-[12.5px] font-semibold leading-[1.35] text-foreground">{getDealTitle(deal)}</p>
            <p className="truncate text-[10.5px] text-muted-foreground/80">{getDealLocationLine(deal)}</p>
          </div>
        </button>

        <DealActionsMenu deal={deal} actions={actions} />
      </div>

      <div className="mt-2 text-[14.5px] font-bold leading-5 tabular-nums text-foreground">
        {formatDealAmount(deal)}
      </div>

      <ProgressBars progress={progress} muted={deal.stage === 'completed'} />

      <div
        className={cn(
          'mt-2 flex items-center gap-1.5 text-[10.5px]',
          urgent ? 'font-medium text-destructive' : 'text-muted-foreground/80',
        )}
      >
        <CalendarClock className="size-3 shrink-0" />
        <span className="truncate">{formatNextPaymentLabel(nextPayment)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
        {deal.isJointBrokerage ? (
          <Badge className="rounded bg-violet-soft px-1.5 text-[10px] font-semibold text-violet">공동</Badge>
        ) : null}
      </div>

      {nextStage ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2 h-6 w-full justify-between rounded-md px-2 text-[10.5px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => actions.onRequestStage(deal, nextStage)}
          disabled={actions.isUpdating}
        >
          다음 단계
          <ArrowRight className="size-3" />
        </Button>
      ) : null}
    </article>
  );
}

export function ProgressBars({ progress, muted = false }: { progress: number; muted?: boolean }) {
  return (
    <div className="mt-2 flex gap-[3px]">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-[2px]',
            index < progress ? (muted ? 'bg-muted-foreground/50' : 'bg-primary') : 'bg-secondary',
          )}
        />
      ))}
    </div>
  );
}
