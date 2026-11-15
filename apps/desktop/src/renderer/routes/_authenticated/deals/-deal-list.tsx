import { useMemo, useState } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  Banknote,
  CalendarClock,
  ChevronDown,
  CircleDot,
  FileText,
  Handshake,
  List,
  Tag,
  Type,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { Contract, Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/domain';
import { DealActionsMenu, DealStageMenu, DealStagePill } from './-deal-shared';
import {
  getDealPropertyCells,
  sortDealTableRows,
} from './-deal-list-table-state';
import {
  formatCancelledBy,
  formatDaysLabel,
  formatDealAmount,
  formatNextPaymentName,
  getDealNotionListGroups,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  type DealDisplayGroup,
  type DealRowActions,
} from './-deal-view-utils';

/** DataTable이 체크박스 열에 쓰는 폭 */
const SELECTION_COLUMN_WIDTH = 36;

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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  // 체크한 거래. 단계마다 표가 따로라서, 체크 상태는 여기서 한 번에 들고 표마다 자기 몫만 준다.
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  // 필터로 목록에서 빠진 거래는 세지 않는다
  const checkedCount = deals.filter((deal) => checkedIds.has(deal.id)).length;
  const groups = getDealNotionListGroups(deals, referenceDate);
  const columns = useMemo(
    () => createDealColumns(contractByDealId, referenceDate, actions, selectedDealId),
    [contractByDealId, referenceDate, actions, selectedDealId],
  );
  // 단계가 달라도 같은 열 경계를 유지하고, 가로 스크롤은 목록 전체에서 한 번만 한다.
  const minWidth = columns.reduce(
    (sum, column) => sum + (columnSizing[column.id!] ?? column.size ?? 150),
    SELECTION_COLUMN_WIDTH,
  );

  return (
    <section className="min-w-0" aria-label="거래 목록">
      <ScrollArea className="w-full">
        <div style={{ minWidth }} className="pb-2">
          {groups.map(({ group, rows }) => (
            <DealListGroup
              key={group.key}
              group={group}
              deals={sortDealTableRows(
                rows.map(({ deal }) => deal),
                sorting,
                referenceDate,
              )}
              columns={columns}
              sorting={sorting}
              onSortingChange={setSorting}
              columnSizing={columnSizing}
              onColumnSizingChange={setColumnSizing}
              checkedIds={checkedIds}
              onCheckedChange={(groupDealIds, nextIds) =>
                setCheckedIds((previous) => {
                  const next = new Set(previous);
                  for (const id of groupDealIds) next.delete(id);
                  for (const id of nextIds) next.add(id);
                  return next;
                })
              }
              actions={actions}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {checkedCount > 0 ? (
        <div className="flex min-h-9 items-center gap-2 border-t border-border/60 bg-white px-3 py-1.5 text-xs">
          <span className="font-medium text-slate-900">{checkedCount}개 거래 선택</span>
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setCheckedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DealListGroup({
  group,
  deals,
  columns,
  sorting,
  onSortingChange,
  columnSizing,
  onColumnSizingChange,
  checkedIds,
  onCheckedChange,
  actions,
}: {
  group: DealDisplayGroup;
  deals: Deal[];
  columns: ColumnDef<Deal, unknown>[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  columnSizing: Record<string, number>;
  onColumnSizingChange: (sizing: Record<string, number>) => void;
  checkedIds: ReadonlySet<string>;
  /** 이 단계 표의 체크가 바뀌었다: (이 표의 거래 id 전체, 그중 체크된 id) */
  onCheckedChange: (groupDealIds: string[], checkedIds: string[]) => void;
  actions: DealRowActions;
}) {
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(
    null,
  );
  const isCollapsed = collapsedOverride ?? deals.length === 0;
  const headingId = `deal-list-heading-${group.key}`;

  return (
    <section className="mb-3 last:mb-0" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={`deal-list-group-${group.key}`}
          className="group/head flex h-8 w-full items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setCollapsedOverride(!isCollapsed)}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground-strong group-hover/head:bg-accent">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-3 transition-transform motion-reduce:transition-none',
                isCollapsed && '-rotate-90',
              )}
            />
          </span>
          <DealStagePill stage={group.key} label={group.label} />
          <span className="pl-1 text-xs font-normal tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </button>
      </h2>
      <div
        id={`deal-list-group-${group.key}`}
        hidden={isCollapsed}
        className="mt-1 border-t border-border"
      >
        <DataTable
          columns={columns}
          data={deals}
          layout="full-height"
          variant="notion"
          propertyListTone
          rowHeight={40}
          activateOnDoubleClick
          onRowClick={(deal) => actions.onSelect(deal.id)}
          enableRowSelection
          getRowSelectionLabel={(deal) => `${getDealTitle(deal)} 거래 선택`}
          selectedRowIds={deals.filter((deal) => checkedIds.has(deal.id)).map((deal) => deal.id)}
          onRowSelectionChange={(nextIds) =>
            onCheckedChange(
              deals.map((deal) => deal.id),
              nextIds,
            )
          }
          sorting={sorting}
          onSortingChange={onSortingChange}
          columnSizing={columnSizing}
          onColumnSizingChange={onColumnSizingChange}
          emptyMessage="이 단계의 거래가 없습니다."
        />
      </div>
    </section>
  );
}

function ColumnHeading({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function createDealColumns(
  contractByDealId: Map<string, Contract>,
  referenceDate: Date,
  actions: DealRowActions,
  selectedDealId: string | null,
): ColumnDef<Deal, unknown>[] {
  return [
    {
      id: 'transactionType',
      size: 74,
      minSize: 64,
      header: () => <ColumnHeading icon={Tag} label="거래" />,
      cell: ({ row: { original: deal } }) => {
        const type = getDealTransactionType(deal);
        return type ? (
          <StatusBadge kind="transactionType" status={type} />
        ) : (
          <EmptyValue />
        );
      },
    },
    {
      id: 'site',
      size: 200,
      minSize: 140,
      header: () => <ColumnHeading icon={Type} label="단지" />,
      cell: ({ row: { original: deal } }) => {
        const isCurrent = selectedDealId === deal.id;
        return (
        <div className="min-w-0">
          <span
            className="block truncate"
            title={getDealPropertyCells(deal).site ?? undefined}
          >
            {getDealPropertyCells(deal).site ?? '매물 정보 없음'}
          </span>
          {/* 매물관리 표의 열기 버튼과 같은 모양·자리: 행에 올리면 칸 오른쪽에 뜬다 */}
          <span
            data-deal-row-open
            className="pointer-events-none absolute right-1 top-1/2 z-[2] -translate-y-1/2 rounded-[6px] bg-white p-0.5 opacity-0 shadow-[0_8px_12px_rgba(25,25,25,0.027),0_2px_6px_rgba(25,25,25,0.027),0_0_0_1px_rgba(42,28,0,0.07)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
          >
            <button
              type="button"
              aria-label={`${getDealTitle(deal)} 상세 ${isCurrent ? '닫기' : '열기'}`}
              aria-expanded={isCurrent}
              aria-controls={isCurrent ? 'deal-inspector' : undefined}
              title={isCurrent ? '사이드 보기 닫기' : '사이드 보기에서 열기'}
              className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1 text-[12px] font-medium leading-[18px] tracking-[0.5px] text-[#7d7a75] transition-[background-color] duration-[20ms] ease-in hover:bg-[rgba(33,27,23,0.051)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
              style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
              onClick={(event) => {
                event.stopPropagation();
                if (isCurrent && actions.onCloseDetail) actions.onCloseDetail();
                else actions.onSelect(deal.id);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <svg aria-hidden="true" viewBox="0 0 16 20" className="h-5 w-[15.25px] shrink-0 text-[#8e8b86]" fill="none">
                <rect x="1" y="4.75" width="14" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                <rect x="7.75" y="6.125" width="5.5" height="7.75" rx="0.5" fill="currentColor" />
              </svg>
              {isCurrent ? '닫기' : '열기'}
            </button>
          </span>
        </div>
        );
      },
    },
    {
      id: 'dong',
      size: 58,
      minSize: 50,
      header: () => <ColumnHeading icon={List} label="동" />,
      cell: ({ row }) => (
        <CellText value={getDealPropertyCells(row.original).dong} />
      ),
    },
    {
      id: 'unit',
      size: 68,
      minSize: 50,
      header: () => <ColumnHeading icon={List} label="호" />,
      cell: ({ row }) => (
        <CellText value={getDealPropertyCells(row.original).unit} />
      ),
    },
    {
      id: 'seller',
      size: 88,
      minSize: 72,
      header: () => <ColumnHeading icon={User} label="매도" />,
      cell: ({ row }) => <CellText value={row.original.sellerContact?.name} />,
    },
    {
      id: 'buyer',
      size: 88,
      minSize: 72,
      header: () => <ColumnHeading icon={User} label="매수" />,
      cell: ({ row }) => <CellText value={row.original.buyerContact?.name} />,
    },
    {
      id: 'amount',
      size: 150,
      minSize: 120,
      header: () => <ColumnHeading icon={Banknote} label="금액" />,
      cell: ({ row }) => (
        <span
          className="block truncate tabular-nums"
          title={formatDealAmount(row.original)}
        >
          {formatDealAmount(row.original)}
        </span>
      ),
    },
    {
      id: 'nextPayment',
      size: 190,
      minSize: 160,
      meta: { fill: true },
      header: () => <ColumnHeading icon={CalendarClock} label="다음 일정" />,
      cell: ({ row }) => (
        <NextPaymentCell deal={row.original} referenceDate={referenceDate} />
      ),
    },
    {
      id: 'stage',
      size: 120,
      minSize: 112,
      enableSorting: false,
      header: () => <ColumnHeading icon={CircleDot} label="단계" />,
      cell: ({ row }) => (
        <div
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DealStageMenu
            deal={row.original}
            actions={actions}
            title={getDealTitle(row.original)}
          />
        </div>
      ),
    },
    {
      id: 'contract',
      size: 104,
      minSize: 88,
      enableSorting: false,
      header: () => <ColumnHeading icon={FileText} label="계약서" />,
      cell: ({ row }) => {
        const contract = contractByDealId.get(row.original.id);
        return contract ? (
          <StatusBadge kind="contractStatus" status={contract.status} />
        ) : (
          <EmptyValue />
        );
      },
    },
    {
      id: 'joint',
      size: 56,
      minSize: 50,
      enableSorting: false,
      header: '공동',
      cell: ({ row }) =>
        row.original.isJointBrokerage ? (
          <span
            className="inline-flex items-center text-muted-foreground-strong"
            title={row.original.partnerBroker?.name ?? '공동중개'}
          >
            <Handshake aria-hidden="true" className="size-4" />
            <span className="sr-only">공동중개</span>
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: 'actions',
      size: 36,
      minSize: 36,
      enableSorting: false,
      enableResizing: false,
      header: () => <span className="sr-only">작업</span>,
      meta: { cellClassName: 'px-1' },
      cell: ({ row }) => (
        <div
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DealActionsMenu deal={row.original} actions={actions} />
        </div>
      ),
    },
  ];
}

function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}

function CellText({ value }: { value: string | null | undefined }) {
  return value ? (
    <span className="block truncate" title={value}>
      {value}
    </span>
  ) : (
    <EmptyValue />
  );
}

function NextPaymentCell({
  deal,
  referenceDate,
}: {
  deal: Deal;
  referenceDate: Date;
}) {
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const daysUntil = nextPayment?.daysUntil ?? null;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          'truncate',
          daysUntil === null && 'text-muted-foreground',
        )}
        title={formatNextPaymentName(nextPayment)}
      >
        {formatNextPaymentName(nextPayment)}
      </span>
      {daysUntil !== null && (
        <span
          className={cn(
            'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] tabular-nums',
            daysUntil < 0
              ? 'bg-destructive-soft text-destructive'
              : nextPayment?.isUrgent
                ? 'bg-warning-soft text-warning'
                : 'bg-neutral-soft text-muted-foreground-strong',
          )}
        >
          {formatDaysLabel(daysUntil)}
        </span>
      )}
    </div>
  );
}

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
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="cancelled-deals-archive"
        className="group/head flex h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left"
        onClick={onToggle}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] transition-colors group-hover/head:bg-[rgba(55,53,47,0.08)] motion-reduce:transition-none">
          <svg
            aria-hidden="true"
            viewBox="0 0 10 10"
            className={cn(
              'size-[9px] fill-[#37352f] transition-transform motion-reduce:transition-none',
              !open && '-rotate-90',
            )}
          >
            <path d="M0 2h10L5 9z" />
          </svg>
        </span>
        <h2 className="inline-flex h-5 items-center gap-[5px] rounded-[10px] bg-[rgba(206,24,0,0.164)] pl-[7px] pr-[9px] text-[13px] leading-5 text-[#6d3531]">
          <span aria-hidden="true" className="size-2 rounded-full bg-[#e56458]" />
          취소 거래
        </h2>
        <span className="pl-1 text-[13px] tabular-nums text-[#e56458]">{deals.length}</span>
      </button>

      {open ? (
        <div id="cancelled-deals-archive" className="mt-1 border-t border-[rgba(42,28,0,0.07)]">
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
    <div className="flex items-center gap-3 border-b border-[rgba(42,28,0,0.07)] px-2.5 py-2 transition-colors hover:bg-[rgba(55,53,47,0.03)]">
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
            <DealStagePill stage={deal.stage} />
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
