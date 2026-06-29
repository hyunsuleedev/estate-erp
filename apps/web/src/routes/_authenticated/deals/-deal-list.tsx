import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Contract, Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/domain';
import { DealActionsMenu } from './-deal-shared';
import {
  formatCancelledBy,
  formatDaysLabel,
  formatDealAmount,
  formatNextPaymentName,
  getDealAmountValue,
  getDealLocationLine,
  getDealNotionListGroups,
  getDealShortCode,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  type DealDisplayGroup,
  type DealNotionListRow,
  type DealRowActions,
} from './-deal-view-utils';

export function DealListView({
  deals,
  contractByDealId,
  selectedDealId,
  referenceDate,
  actions,
}: {
  deals: Deal[];
  contractByDealId: Map<string, Contract>;
  selectedDealId: string | null;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const groups = getDealNotionListGroups(deals, referenceDate);

  return (
    <section>
      <ScrollArea className="w-full">
        <div className="min-w-[1120px]">
          {groups.map((group) => (
            <DealListGroup
              key={group.group.key}
              group={group.group}
              rows={group.rows}
              summary={group.summary}
              contractByDealId={contractByDealId}
              selectedDealId={selectedDealId}
              referenceDate={referenceDate}
              actions={actions}
            />
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}

function DealListGroup({
  group,
  rows,
  summary,
  contractByDealId,
  selectedDealId,
  referenceDate,
  actions,
}: {
  group: DealDisplayGroup;
  rows: DealNotionListRow[];
  summary: { count: number; amountTotal: number };
  contractByDealId: Map<string, Contract>;
  selectedDealId: string | null;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="mb-6">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded py-2 text-left hover:bg-muted/30"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('text-xs text-muted-foreground/70 transition-transform', !isCollapsed && 'rotate-90')}>
          ▶
        </span>
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-sm font-medium text-foreground">{group.label}</h2>
        <span className="text-sm text-muted-foreground">{summary.count}</span>
        <span className="ml-auto pr-2 text-xs tabular-nums text-muted-foreground">
          합계 {summary.amountTotal ? formatMoney(summary.amountTotal) : '—'}
        </span>
      </button>

      {!isCollapsed ? (
        <>
          <DealListHeader />

          <div className="min-h-10 rounded transition-colors">
            {rows.length === 0 ? (
              <div className="border-b border-border/40 py-4 text-center text-xs text-muted-foreground">
                이 단계로 거래를 이동하면 여기에 표시됩니다.
              </div>
            ) : (
              rows.map((row) => (
                <DealListRow
                  key={row.deal.id}
                  row={row}
                  contract={contractByDealId.get(row.deal.id) ?? null}
                  selected={row.deal.id === selectedDealId}
                  referenceDate={referenceDate}
                  actions={actions}
                />
              ))
            )}
          </div>

          <div className="py-2 text-center text-xs text-muted-foreground">거래 {rows.length}건</div>
        </>
      ) : null}
    </section>
  );
}

function DealListHeader() {
  return (
    <div className="flex items-center border-b border-border/40 text-xs text-muted-foreground">
      <div className="w-[50px] shrink-0 px-3 py-2 font-medium">No</div>
      <div className="w-[280px] shrink-0 px-3 py-2 font-medium">매물</div>
      <div className="w-[92px] shrink-0 px-3 py-2 font-medium">단계</div>
      <div className="w-[90px] shrink-0 px-3 py-2 font-medium">매도</div>
      <div className="w-[90px] shrink-0 px-3 py-2 font-medium">매수</div>
      <div className="w-[120px] shrink-0 px-3 py-2 text-right font-medium">금액</div>
      <div className="w-[150px] shrink-0 px-3 py-2 font-medium">다음 일정</div>
      <div className="w-[96px] shrink-0 px-3 py-2 font-medium">계약</div>
      <div className="flex-1 px-3 py-2 font-medium">태그</div>
      <div className="w-10 shrink-0" />
    </div>
  );
}

function DealListRow({
  row,
  contract,
  selected,
  referenceDate,
  actions,
}: {
  row: DealNotionListRow;
  contract: Contract | null;
  selected: boolean;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const { deal, rowNumber } = row;
  const transactionType = getDealTransactionType(deal);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const urgent = nextPayment?.isUrgent;

  return (
    <div
      className={cn(
        'group/row relative flex cursor-pointer items-center border-b border-border/40 text-sm transition-colors hover:bg-muted/30',
        selected && 'bg-muted/40',
        urgent && !selected && 'bg-destructive-soft/30',
      )}
      onClick={() => actions.onSelect(deal.id)}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-0.5 bg-destructive" /> : null}

      <div className="w-[50px] shrink-0 border-r border-border/40 px-3 py-2 text-muted-foreground">{rowNumber}</div>

      <div className="flex w-[280px] shrink-0 items-center gap-2 border-r border-border/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{getDealTitle(deal)}</p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">{getDealLocationLine(deal)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="opacity-0 transition-opacity group-hover/row:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            actions.onSelect(deal.id);
          }}
        >
          <ArrowRight className="size-3.5" />
        </Button>
      </div>

      <div className="w-[92px] shrink-0 border-r border-border/40 px-3 py-2">
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
      </div>
      <div className="w-[90px] shrink-0 truncate border-r border-border/40 px-3 py-2 text-xs text-foreground">
        {deal.sellerContact?.name ?? '미지정'}
      </div>
      <div className="w-[90px] shrink-0 truncate border-r border-border/40 px-3 py-2 text-xs text-foreground">
        {deal.buyerContact?.name ?? '미지정'}
      </div>
      <div className="w-[120px] shrink-0 border-r border-border/40 px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-foreground">
        {formatDealAmount(deal)}
      </div>
      <div className="w-[150px] shrink-0 border-r border-border/40 px-3 py-2">
        <div className={cn('truncate text-xs leading-4', urgent ? 'font-medium text-destructive' : 'text-foreground')}>
          {formatNextPaymentName(nextPayment)}
        </div>
        <div
          className={cn(
            'mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px]',
            urgent ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          {formatDaysLabel(nextPayment?.daysUntil ?? null)}
        </div>
      </div>
      <div className="w-[96px] shrink-0 border-r border-border/40 px-3 py-2">
        {contract ? (
          <StatusBadge kind="contractStatus" status={contract.status} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">없음</span>
        )}
      </div>
      <div className="flex flex-1 flex-wrap gap-1 px-3 py-2">
        {transactionType ? <StatusBadge kind="transactionType" status={transactionType} size="sm" /> : null}
        <span className="font-mono text-[10px] leading-5 text-muted-foreground/70">{getDealShortCode(deal.id)}</span>
        {deal.isJointBrokerage ? (
          <Badge className="h-5 rounded bg-violet-soft px-1.5 text-[10px] text-violet">공동</Badge>
        ) : null}
      </div>
      <div className="w-10 shrink-0 px-1 py-2" onClick={(event) => event.stopPropagation()}>
        <DealActionsMenu deal={deal} actions={actions} />
      </div>
    </div>
  );
}

/** 종료(closed) 거래 접이식 아카이브 */
export function ClosedDealArchive({
  deals,
  open,
  onToggle,
  actions,
}: {
  deals: Deal[];
  open: boolean;
  onToggle: () => void;
  actions: DealRowActions;
}) {
  const summary = deals.reduce((sum, deal) => sum + getDealAmountValue(deal), 0);

  return (
    <section className={cn('overflow-hidden rounded-lg border bg-background', !open && 'opacity-90')}>
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-muted/50 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <span className="text-[10px] text-muted-foreground/70">{open ? '▼' : '▶'}</span>
        <span className="size-2 rounded-full bg-muted-foreground/50" />
        <h2 className="text-sm font-semibold text-foreground">종료 거래</h2>
        <Badge variant="outline" className="rounded-md bg-background text-[11px] text-muted-foreground">
          {deals.length}건
        </Badge>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          합계 {summary ? formatMoney(summary) : '—'} · {open ? '펼침' : '접힘'}
        </span>
      </button>

      {open ? (
        <div className="border-t">
          {deals.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">종료된 거래가 없습니다.</div>
          ) : (
            deals.map((deal) => <ArchiveDealRow key={deal.id} deal={deal} actions={actions} />)
          )}
        </div>
      ) : null}
    </section>
  );
}

/** 취소(isCancelled) 거래 접이식 아카이브 — 단계와 무관하게 별도 표시 */
export function CancelledDealArchive({
  deals,
  open,
  onToggle,
  actions,
}: {
  deals: Deal[];
  open: boolean;
  onToggle: () => void;
  actions: DealRowActions;
}) {
  if (deals.length === 0) return null;

  return (
    <section className={cn('overflow-hidden rounded-lg border bg-background', !open && 'opacity-90')}>
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-destructive-soft/40 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <span className="text-[10px] text-muted-foreground/70">{open ? '▼' : '▶'}</span>
        <span className="size-2 rounded-full bg-destructive" />
        <h2 className="text-sm font-semibold text-foreground">취소 거래</h2>
        <Badge variant="outline" className="rounded-md bg-background text-[11px] text-muted-foreground">
          {deals.length}건
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{open ? '펼침' : '접힘'}</span>
      </button>

      {open ? (
        <div className="border-t">
          {deals.map((deal) => (
            <ArchiveDealRow key={deal.id} deal={deal} actions={actions} cancelled />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ArchiveDealRow({
  deal,
  actions,
  cancelled = false,
}: {
  deal: Deal;
  actions: DealRowActions;
  cancelled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => actions.onSelect(deal.id)}>
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{getDealTitle(deal)}</p>
          {cancelled ? (
            <Badge className="rounded bg-destructive-soft px-1.5 text-[10px] text-destructive">취소</Badge>
          ) : (
            <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cancelled
            ? `${deal.cancelledAt ? formatDate(deal.cancelledAt) : '—'} · ${formatCancelledBy(deal.cancelledBy)}${deal.cancelReason ? ` · ${deal.cancelReason}` : ''}`
            : `매수 ${deal.buyerContact?.name ?? '미지정'} · 매도 ${deal.sellerContact?.name ?? '미지정'}`}
        </p>
      </button>
      <div className="text-right">
        <p className="text-sm font-medium tabular-nums">{formatDealAmount(deal)}</p>
        <p className="text-xs text-muted-foreground">
          수수료 {deal.commissionSummary?.billed ? formatMoney(deal.commissionSummary.billed) : '—'}
        </p>
      </div>
      <DealActionsMenu deal={deal} actions={actions} />
    </div>
  );
}
