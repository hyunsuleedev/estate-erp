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
    <section className="rounded-lg border bg-background">
      <div className="grid grid-cols-1 items-start gap-3 p-3 md:grid-cols-2 xl:grid-cols-5">
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
    <section className="flex min-h-[420px] min-w-0 flex-col gap-2.5 rounded-lg border bg-muted/50 px-2 py-2.5 xl:min-h-[556px]">
      <div className="flex items-center gap-1.5 px-1">
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-xs font-semibold text-foreground">{group.label}</h2>
        <Badge variant="outline" className="h-5 rounded-md bg-background px-1.5 text-[10px] text-muted-foreground">
          {summary.count}
        </Badge>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {summary.amountTotal ? formatMoney(summary.amountTotal) : '—'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {deals.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed bg-background/70 px-3 text-center text-xs text-muted-foreground">
            해당 단계의 거래가 없습니다.
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
        'relative rounded-md border bg-background p-2 shadow-xs transition-colors',
        selected ? 'border-info ring-1 ring-info' : 'border-border',
        urgent && !selected && 'border-destructive/40 bg-destructive-soft/30',
      )}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-0.5 rounded-l-md bg-destructive" /> : null}

      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => actions.onSelect(deal.id)}>
          <div className="flex items-center gap-1.5">
            {transactionType ? (
              <StatusBadge kind="transactionType" status={transactionType} size="sm" />
            ) : null}
            <span className="font-mono text-[10px] text-muted-foreground/70">{getDealShortCode(deal.id)}</span>
          </div>

          <div className="mt-1.5 space-y-0.5">
            <p className="truncate text-[13px] font-medium leading-4 text-foreground">{getDealTitle(deal)}</p>
            <p className="truncate text-[11px] leading-3.5 text-muted-foreground">{getDealLocationLine(deal)}</p>
          </div>
        </button>

        <DealActionsMenu deal={deal} actions={actions} />
      </div>

      <div className="mt-2 text-[15px] font-semibold leading-5 tabular-nums text-foreground">
        {formatDealAmount(deal)}
      </div>

      <ProgressBars progress={progress} muted={deal.stage === 'completed'} />

      <div
        className={cn(
          'mt-2 flex items-center gap-1 text-[11px]',
          urgent ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        <CalendarClock className="size-3" />
        <span>{formatNextPaymentLabel(nextPayment)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
        {deal.isJointBrokerage ? (
          <Badge className="rounded bg-violet-soft px-1.5 text-[10px] text-violet">공동</Badge>
        ) : null}
      </div>

      {nextStage ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2 h-6 w-full justify-between rounded-md px-2 text-[11px] text-muted-foreground"
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
    <div className="mt-2 flex gap-0.5">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-sm',
            index < progress ? (muted ? 'bg-muted-foreground/50' : 'bg-primary') : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}
