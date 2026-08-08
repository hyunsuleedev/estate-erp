import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Contract, Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/domain';
import { DealActionsMenu } from './-deal-shared';
import {
  formatCancelledBy,
  formatDaysLabel,
  formatDealAmount,
  formatNextPaymentName,
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
    <section className="min-w-0">
      <ScrollArea className="w-full">
        <div className="min-w-[1040px]">
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
    <section className="mb-2.5">
      <button
        type="button"
        aria-expanded={!isCollapsed}
        aria-controls={`deal-list-group-${group.key}`}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[#f7f6f3] motion-reduce:transition-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronRight className="size-3 text-muted-foreground/80" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground/80" />
        )}
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-[13px] font-semibold text-foreground">{group.label}</h2>
        <span className="text-xs tabular-nums text-muted-foreground/80">{summary.count}</span>
        <span className="ml-auto pr-1 text-[11.5px] tabular-nums text-muted-foreground/80">
          합계 {summary.amountTotal ? formatMoney(summary.amountTotal) : '—'}
        </span>
      </button>

      {!isCollapsed ? (
        <div id={`deal-list-group-${group.key}`}>
          <DealListHeader />

          <div className="min-h-10 rounded transition-colors">
            {rows.length === 0 ? (
              <div className="border-b border-border/60 py-3.5 text-center text-[11.5px] text-muted-foreground/60">
                이 단계로 거래를 이동하면 여기에 표시됩니다
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

          <div className="pt-1.5 pb-0.5 text-center text-[11px] text-muted-foreground/60">
            거래 {rows.length}건
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DealListHeader() {
  return (
    <div className="flex items-center border-b border-[#e7e5df] bg-[#fbfbfa] text-[11.5px] text-muted-foreground/70">
      <div className="w-10 shrink-0 px-2.5 py-1.5">No</div>
      <div className="w-[250px] shrink-0 px-2.5 py-1.5">매물</div>
      <div className="w-[84px] shrink-0 px-2.5 py-1.5">단계</div>
      <div className="w-[76px] shrink-0 px-2.5 py-1.5">매도</div>
      <div className="w-[76px] shrink-0 px-2.5 py-1.5">매수</div>
      <div className="w-[124px] shrink-0 px-2.5 py-1.5 text-right">금액</div>
      <div className="w-[148px] shrink-0 px-2.5 py-1.5">다음 일정</div>
      <div className="w-[96px] shrink-0 px-2.5 py-1.5">계약</div>
      <div className="flex-1 px-2.5 py-1.5">태그</div>
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
        'relative flex cursor-pointer items-center border-b border-[#eeeeec] transition-colors hover:bg-[#faf9f6] motion-reduce:transition-none',
        selected && 'bg-[#f7f6f3]',
      )}
      onClick={() => actions.onSelect(deal.id)}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-[2.5px] bg-destructive" /> : null}

      <div className="w-10 shrink-0 px-2.5 py-2 text-xs tabular-nums text-muted-foreground/80">
        {rowNumber}
      </div>

      <div className="w-[250px] min-w-0 shrink-0 px-2.5 py-2">
        <p className="truncate text-[12.5px] font-semibold text-foreground">
          {getDealTitle(deal)}
        </p>
        <p className="truncate text-[10.5px] text-muted-foreground/80">
          {getDealLocationLine(deal)}
        </p>
      </div>

      <div className="w-[84px] shrink-0 px-2.5 py-2">
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
      </div>
      <div className="w-[76px] shrink-0 truncate px-2.5 py-2 text-xs text-foreground">
        {deal.sellerContact?.name ?? '미지정'}
      </div>
      <div className="w-[76px] shrink-0 truncate px-2.5 py-2 text-xs text-foreground">
        {deal.buyerContact?.name ?? '미지정'}
      </div>
      <div className="w-[124px] shrink-0 truncate px-2.5 py-2 text-right text-[12.5px] font-semibold tabular-nums text-foreground">
        {formatDealAmount(deal)}
      </div>
      <div className="w-[148px] shrink-0 px-2.5 py-2">
        <div
          className={cn(
            'truncate text-[11.5px] leading-4',
            urgent ? 'font-medium text-destructive' : 'text-foreground',
          )}
        >
          {formatNextPaymentName(nextPayment)}
        </div>
        <div
          className={cn(
            'mt-0.5 inline-flex h-4 items-center rounded px-1.5 text-[9.5px] font-semibold tabular-nums',
            urgent ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground',
          )}
        >
          {formatDaysLabel(nextPayment?.daysUntil ?? null)}
        </div>
      </div>
      <div className="w-[96px] shrink-0 px-2.5 py-2">
        {contract ? (
          <StatusBadge kind="contractStatus" status={contract.status} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground/70">없음</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-2.5 py-2">
        {transactionType ? (
          <StatusBadge kind="transactionType" status={transactionType} size="sm" />
        ) : null}
        <span className="font-mono text-[9.5px] leading-5 text-muted-foreground/60">
          {getDealShortCode(deal.id)}
        </span>
        {deal.isJointBrokerage ? (
          <Badge className="h-[18px] rounded bg-violet-soft px-1.5 text-[10px] font-semibold text-violet">
            공동
          </Badge>
        ) : null}
      </div>
      <div className="w-10 shrink-0 px-1 py-2" onClick={(event) => event.stopPropagation()}>
        <DealActionsMenu deal={deal} actions={actions} />
      </div>
    </div>
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
    <section className="overflow-hidden rounded-lg border border-[#e7e5df] bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="cancelled-deals-archive"
        className="flex w-full items-center gap-2 bg-destructive-soft/25 px-3.5 py-2.5 text-left transition-colors hover:bg-destructive-soft/40 motion-reduce:transition-none"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="size-3 text-muted-foreground/80" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground/80" />
        )}
        <span className="size-2 rounded-full bg-destructive" />
        <h2 className="text-[12.5px] font-bold text-muted-foreground">취소 거래</h2>
        <Badge
          variant="outline"
          className="h-[18px] rounded-full bg-background px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground/80"
        >
          {deals.length}건
        </Badge>
      </button>

      {open ? (
        <div id="cancelled-deals-archive">
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
    <div className="flex items-center gap-3 border-t border-[#eeeeec] px-4 py-2.5 transition-colors hover:bg-[#faf9f6]">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => actions.onSelect(deal.id)}
      >
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[12.5px] font-semibold text-foreground">
            {getDealTitle(deal)}
          </p>
          {cancelled ? (
            <Badge className="shrink-0 rounded bg-destructive-soft px-1.5 text-[10px] font-semibold text-destructive">
              취소
            </Badge>
          ) : (
            <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
          {cancelled
            ? `${deal.cancelledAt ? formatDate(deal.cancelledAt) : '—'} · ${formatCancelledBy(deal.cancelledBy)}${deal.cancelReason ? ` · ${deal.cancelReason}` : ''}`
            : `매도 ${deal.sellerContact?.name ?? '미지정'} · 매수 ${deal.buyerContact?.name ?? '미지정'}${deal.memo ? ` · ${deal.memo}` : ''}`}
        </p>
      </button>
      <div className="shrink-0 text-right">
        <p className="text-[12.5px] font-semibold tabular-nums text-foreground">
          {formatDealAmount(deal)}
        </p>
        <p className="text-[10.5px] text-muted-foreground/80">
          수수료{' '}
          {deal.commissionSummary?.billed
            ? formatMoney(deal.commissionSummary.billed)
            : '—'}
        </p>
      </div>
      <DealActionsMenu deal={deal} actions={actions} />
    </div>
  );
}
