import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  List,
  MoreVertical,
  PanelsTopLeft,
  Phone,
  Search,
} from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  dealDisplayGroups,
  getDealAmountValue,
  getDealDisplayGroupKey,
  getDealProgressStep,
  getDealNotionListGroups,
  getNextDealPaymentSummary,
  summarizeDealGroup,
  sortDealsForDisplay,
  type DealDisplayGroup,
  type DealNotionListRow,
} from './-deal-view-utils';

const dealStageMeta: Record<string, { label: string; badgeClassName: string }> = {
  selection: {
    label: '매물 선정',
    badgeClassName: 'bg-slate-100 text-slate-700',
  },
  negotiating: {
    label: '조건 협상',
    badgeClassName: 'bg-slate-100 text-slate-700',
  },
  preContract: {
    label: '가계약',
    badgeClassName: 'bg-sky-50 text-sky-700',
  },
  contracted: {
    label: '본계약',
    badgeClassName: 'bg-violet-50 text-violet-700',
  },
  settling: {
    label: '잔금',
    badgeClassName: 'bg-emerald-50 text-emerald-700',
  },
  completed: {
    label: '정산',
    badgeClassName: 'bg-slate-100 text-slate-600',
  },
  closed: {
    label: '종료',
    badgeClassName: 'bg-zinc-100 text-zinc-600',
  },
};

const dealPipelineStages = [
  'selection',
  'negotiating',
  'preContract',
  'contracted',
  'settling',
  'completed',
] as const;
const dealStageOrder = [...dealPipelineStages, 'closed'] as const;
const transactionTypeOptions = ['all', 'sale', 'jeonse', 'monthly'] as const;

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-blue-50 text-blue-700' },
  jeonse: { label: '전세', className: 'bg-emerald-50 text-emerald-700' },
  monthly: { label: '월세', className: 'bg-amber-50 text-amber-700' },
};

type DealPipelineStage = (typeof dealPipelineStages)[number];
type DealTransactionFilter = (typeof transactionTypeOptions)[number];
type DealViewMode = 'board' | 'list';

export const Route = createFileRoute('/_authenticated/deals/')({
  component: DealsPage,
});

function DealsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<DealTransactionFilter>('all');
  const [viewMode, setViewMode] = useState<DealViewMode>('board');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [showClosedDeals, setShowClosedDeals] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);
  const referenceDate = useMemo(() => new Date(), []);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.deals.updateStage(id, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const filteredDeals = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return deals.filter((deal) => {
      const transactionType = deal.transactionType ?? deal.listing?.transactionType;
      if (transactionTypeFilter !== 'all' && transactionType !== transactionTypeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        getDealTitle(deal),
        getDealLocationLine(deal),
        deal.buyerContact?.name,
        deal.buyerContact?.phone,
        deal.sellerContact?.name,
        deal.sellerContact?.phone,
        deal.partnerBroker?.name,
        deal.partnerBroker?.phone,
        deal.memo,
        deal.specialTerms,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deals, deferredSearch, transactionTypeFilter]);

  const activeDeals = useMemo(
    () => filteredDeals.filter((deal) => deal.stage !== 'closed'),
    [filteredDeals],
  );
  const closedDeals = useMemo(
    () => filteredDeals.filter((deal) => deal.stage === 'closed'),
    [filteredDeals],
  );
  const selectedDeal = useMemo(
    () => filteredDeals.find((deal) => deal.id === selectedDealId) ?? null,
    [filteredDeals, selectedDealId],
  );

  useEffect(() => {
    if (selectedDealId && !filteredDeals.some((deal) => deal.id === selectedDealId)) {
      setSelectedDealId(null);
    }
  }, [filteredDeals, selectedDealId]);

  const totalAmount = activeDeals.reduce((sum, deal) => sum + getDealAmountValue(deal), 0);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>거래</span>
            <span>/</span>
            <span className="font-medium text-foreground">전체 거래</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">거래 파이프라인</h1>
            <Badge variant="secondary">{filteredDeals.length}건</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            매칭에서 이관된 거래부터 정산 완료까지 5단계로 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>진행 합계</span>
          <span className="font-semibold text-foreground">{totalAmount ? formatPrice(totalAmount) : '-'}</span>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-[10px] border border-slate-200 bg-background px-3.5 py-3 lg:flex-row lg:items-center">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="매물·고객·주소 검색..."
            className="h-9 rounded-lg border-slate-200 pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {transactionTypeOptions.map((value) => (
            <Button
              key={value}
              type="button"
              variant={transactionTypeFilter === value ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setTransactionTypeFilter(value)}
              className={cn(
                'h-7 rounded-md',
                transactionTypeFilter === value && 'bg-slate-100 text-foreground hover:bg-slate-100',
              )}
            >
              {value === 'all' ? '전체' : transactionTypeMeta[value].label}
            </Button>
          ))}
        </div>

        <div className="hidden flex-1 lg:block" />

        <div className="flex w-fit items-center rounded-lg bg-slate-100 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('board')}
            className={cn(
              'h-7 rounded-md px-2',
              viewMode === 'board' && 'bg-background text-foreground shadow-xs hover:bg-background',
            )}
          >
            <PanelsTopLeft className="size-3.5" />
            보드
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('list')}
            className={cn(
              'h-7 rounded-md px-2',
              viewMode === 'list' && 'bg-background text-foreground shadow-xs hover:bg-background',
            )}
          >
            <List className="size-3.5" />
            리스트
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-[10px] border border-slate-200 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          거래를 불러오는 중입니다.
        </div>
      ) : viewMode === 'board' ? (
        <DealBoard
          deals={activeDeals}
          selectedDealId={selectedDeal?.id ?? null}
          referenceDate={referenceDate}
          onSelectDeal={setSelectedDealId}
          onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
          isUpdating={stageMutation.isPending}
        />
      ) : (
        <DealListView
          deals={activeDeals}
          selectedDealId={selectedDeal?.id ?? null}
          referenceDate={referenceDate}
          onSelectDeal={setSelectedDealId}
          onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
          isUpdating={stageMutation.isPending}
        />
      )}

      <DealDetailSheet
        deal={selectedDeal}
        open={selectedDeal !== null}
        referenceDate={referenceDate}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDealId(null);
          }
        }}
        onStageChange={(stage) => {
          if (selectedDeal) {
            stageMutation.mutate({ id: selectedDeal.id, stage });
          }
        }}
        isUpdating={stageMutation.isPending}
      />

      {!isLoading && activeDeals.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-muted-foreground">
          조건에 맞는 진행 거래가 없습니다.
        </div>
      )}

      <ClosedDealArchive
        deals={closedDeals}
        showClosedDeals={showClosedDeals}
        setShowClosedDeals={setShowClosedDeals}
        onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
        isUpdating={stageMutation.isPending}
      />
    </div>
  );
}

function DealBoard({
  deals,
  selectedDealId,
  referenceDate,
  onSelectDeal,
  onStageChange,
  isUpdating,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  onSelectDeal: (id: string) => void;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  return (
    <section className="rounded-[10px] border border-slate-200 bg-background">
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
            onSelectDeal={onSelectDeal}
            onStageChange={onStageChange}
            isUpdating={isUpdating}
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
  onSelectDeal,
  onStageChange,
  isUpdating,
}: {
  group: DealDisplayGroup;
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  onSelectDeal: (id: string) => void;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  const summary = summarizeDealGroup(deals, group.key);

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col gap-2.5 rounded-[10px] border border-slate-200 bg-slate-50 px-2 py-2.5 xl:min-h-[556px]">
      <div className="flex items-center gap-1.5 px-1">
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-xs font-semibold text-slate-900">{group.label}</h2>
        <Badge variant="outline" className="h-5 rounded-lg bg-background px-1.5 text-[10px] text-slate-500">
          {summary.count}
        </Badge>
        <span className="ml-auto text-[10px] text-slate-400">
          {summary.amountTotal ? formatPrice(summary.amountTotal).replace(/만$/, '') : '-'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {deals.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-background/70 px-3 text-center text-xs text-muted-foreground">
            해당 단계의 거래가 없습니다.
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              selected={deal.id === selectedDealId}
              referenceDate={referenceDate}
              onSelect={() => onSelectDeal(deal.id)}
              onStageChange={(stage) => onStageChange(deal.id, stage)}
              isUpdating={isUpdating}
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
  onSelect,
  onStageChange,
  isUpdating,
}: {
  deal: Deal;
  selected: boolean;
  referenceDate: Date;
  onSelect: () => void;
  onStageChange: (stage: string) => void;
  isUpdating: boolean;
}) {
  const transactionType = deal.transactionType ?? deal.listing?.transactionType;
  const nextStage = getNextDealStage(deal.stage);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const progress = getDealProgressStep(deal.stage);
  const urgent = nextPayment?.isUrgent;

  return (
    <article
      className={cn(
        'relative rounded-[7px] border bg-background p-2 shadow-xs transition-colors',
        selected ? 'border-violet-500 ring-1 ring-violet-400' : 'border-slate-200',
        urgent && !selected && 'border-red-200 bg-red-50/30',
      )}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-0.5 rounded-l-[7px] bg-red-600" /> : null}

      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-center gap-1.5">
            {transactionType ? (
              <Badge className={cn('h-5 rounded px-1.5 text-[10px] leading-none', transactionTypeMeta[transactionType]?.className)}>
                {transactionTypeMeta[transactionType]?.label ?? transactionType}
              </Badge>
            ) : null}
            <span className="font-mono text-[10px] text-slate-400">{getDealShortCode(deal.id)}</span>
          </div>

          <div className="mt-1.5 space-y-0.5">
            <p className="truncate text-[13px] font-medium leading-4 text-slate-900">{getDealTitle(deal)}</p>
            <p className="truncate text-[11px] leading-3.5 text-slate-500">{getDealLocationLine(deal)}</p>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <AssigneeStack deal={deal} size="sm" />
          <DealActionsMenu
            currentStage={deal.stage}
            onStageChange={onStageChange}
            disabled={isUpdating}
          />
        </div>
      </div>

      <div className="mt-2 text-[15px] font-semibold leading-5 text-slate-950">{formatDealAmount(deal)}</div>

      <ProgressBars progress={progress} muted={deal.stage === 'completed'} />

      <div className={cn('mt-2 flex items-center gap-1 text-[11px]', urgent ? 'font-medium text-red-600' : 'text-slate-500')}>
        <CalendarClock className="size-3" />
        <span>{formatNextPaymentLabel(nextPayment)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge className={cn('rounded px-1.5 text-[10px]', dealStageMeta[deal.stage]?.badgeClassName)}>
          {dealStageMeta[deal.stage]?.label ?? deal.stage}
        </Badge>
        {deal.isJointBrokerage ? (
          <Badge className="rounded bg-violet-50 px-1.5 text-[10px] text-violet-700">공동</Badge>
        ) : null}
      </div>

      {nextStage ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2 h-6 w-full justify-between rounded-md px-2 text-[11px] text-muted-foreground"
          onClick={() => onStageChange(nextStage)}
          disabled={isUpdating}
        >
          다음 단계
          <ArrowRight className="size-3" />
        </Button>
      ) : null}
    </article>
  );
}

function DealListView({
  deals,
  selectedDealId,
  referenceDate,
  onSelectDeal,
  onStageChange,
  isUpdating,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  onSelectDeal: (id: string) => void;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
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
              selectedDealId={selectedDealId}
              referenceDate={referenceDate}
              onSelectDeal={onSelectDeal}
              onStageChange={onStageChange}
              isUpdating={isUpdating}
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
  selectedDealId,
  referenceDate,
  onSelectDeal,
  onStageChange,
  isUpdating,
}: {
  group: DealDisplayGroup;
  rows: DealNotionListRow[];
  summary: {
    count: number;
    amountTotal: number;
  };
  selectedDealId: string | null;
  referenceDate: Date;
  onSelectDeal: (id: string) => void;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="mb-6">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded py-2 text-left hover:bg-muted/30"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('text-xs text-slate-400 transition-transform', !isCollapsed && 'rotate-90')}>▶</span>
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-sm font-medium text-foreground">{group.label}</h2>
        <span className="text-sm text-muted-foreground">{summary.count}</span>
        <span className="ml-auto pr-2 text-xs text-muted-foreground">
          합계 {summary.amountTotal ? formatPrice(summary.amountTotal) : '-'}
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
                  selected={row.deal.id === selectedDealId}
                  referenceDate={referenceDate}
                  onSelect={() => onSelectDeal(row.deal.id)}
                  onStageChange={(stage) => onStageChange(row.deal.id, stage)}
                  isUpdating={isUpdating}
                />
              ))
            )}
          </div>

          <div className="py-2 text-center text-xs text-muted-foreground">
            거래 {rows.length}건
          </div>
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
      <div className="w-[88px] shrink-0 px-3 py-2 font-medium">담당</div>
      <div className="flex-1 px-3 py-2 font-medium">태그</div>
      <div className="w-10 shrink-0" />
    </div>
  );
}

function DealListRow({
  row,
  selected,
  referenceDate,
  onSelect,
  onStageChange,
  isUpdating,
}: {
  row: DealNotionListRow;
  selected: boolean;
  referenceDate: Date;
  onSelect: () => void;
  onStageChange: (stage: string) => void;
  isUpdating: boolean;
}) {
  const { deal, rowNumber } = row;
  const transactionType = deal.transactionType ?? deal.listing?.transactionType;
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const urgent = nextPayment?.isUrgent;

  return (
    <div
      className={cn(
        'group/row relative flex cursor-pointer items-center border-b border-border/40 text-sm transition-colors hover:bg-muted/30',
        selected && 'bg-muted/40',
        urgent && !selected && 'bg-red-50/30',
      )}
      onClick={onSelect}
    >
      {urgent ? <span className="absolute inset-y-0 left-0 w-0.5 bg-red-600" /> : null}

      <div className="w-[50px] shrink-0 border-r border-border/40 px-3 py-2 text-muted-foreground">
        {rowNumber}
      </div>

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
            onSelect();
          }}
        >
          <ArrowRight className="size-3.5" />
        </Button>
      </div>

      <div className="w-[92px] shrink-0 border-r border-border/40 px-3 py-2">
        <Badge className={cn('h-5 rounded-md px-1.5 text-[10px] leading-none', dealStageMeta[deal.stage]?.badgeClassName)}>
          {dealStageMeta[deal.stage]?.label ?? deal.stage}
        </Badge>
      </div>
      <div className="w-[90px] shrink-0 truncate border-r border-border/40 px-3 py-2 text-xs text-slate-700">
        {deal.sellerContact?.name ?? '미지정'}
      </div>
      <div className="w-[90px] shrink-0 truncate border-r border-border/40 px-3 py-2 text-xs text-slate-700">
        {deal.buyerContact?.name ?? '미지정'}
      </div>
      <div className="w-[120px] shrink-0 border-r border-border/40 px-3 py-2 text-right text-[13px] font-semibold tabular-nums text-slate-950">
        {formatDealAmount(deal)}
      </div>
      <div className="w-[150px] shrink-0 border-r border-border/40 px-3 py-2">
        <div className={cn('truncate text-xs leading-4', urgent ? 'font-medium text-red-600' : 'text-slate-700')}>
          {formatNextPaymentName(nextPayment)}
        </div>
        <div className={cn('mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px]', urgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>
          {formatDaysLabel(nextPayment?.daysUntil ?? null)}
        </div>
      </div>
      <div className="w-[88px] shrink-0 border-r border-border/40 px-3 py-2">
        <AssigneeStack deal={deal} size="md" />
      </div>
      <div className="flex flex-1 flex-wrap gap-1 px-3 py-2">
        {transactionType ? (
          <Badge className={cn('h-5 rounded px-1.5 text-[10px] leading-none', transactionTypeMeta[transactionType]?.className)}>
            {transactionTypeMeta[transactionType]?.label ?? transactionType}
          </Badge>
        ) : null}
        <span className="font-mono text-[10px] leading-5 text-slate-400">{getDealShortCode(deal.id)}</span>
        {deal.isJointBrokerage ? (
          <Badge className="h-5 rounded bg-violet-50 px-1.5 text-[10px] text-violet-700">공동</Badge>
        ) : null}
      </div>
      <div className="w-10 shrink-0 px-1 py-2" onClick={(event) => event.stopPropagation()}>
        <DealActionsMenu currentStage={deal.stage} onStageChange={onStageChange} disabled={isUpdating} />
      </div>
    </div>
  );
}

function DealDetailSheet({
  deal,
  open,
  referenceDate,
  onOpenChange,
  onStageChange,
  isUpdating,
}: {
  deal: Deal | null;
  open: boolean;
  referenceDate: Date;
  onOpenChange: (open: boolean) => void;
  onStageChange: (stage: string) => void;
  isUpdating: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[calc(100vw-24px)] max-w-none gap-0 overflow-y-auto p-0 sm:w-[760px] sm:max-w-[760px] xl:w-[960px] xl:max-w-[960px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>거래 상세</SheetTitle>
          <SheetDescription>선택한 거래의 일정, 당사자, 지급 스케줄, 수수료 정보를 확인합니다.</SheetDescription>
        </SheetHeader>
        {deal ? (
          <DealDetailPanel
            deal={deal}
            referenceDate={referenceDate}
            onStageChange={onStageChange}
            isUpdating={isUpdating}
            surface="sheet"
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DealDetailPanel({
  deal,
  referenceDate,
  onStageChange,
  isUpdating,
  surface = 'inline',
}: {
  deal: Deal;
  referenceDate: Date;
  onStageChange: (stage: string) => void;
  isUpdating: boolean;
  surface?: 'inline' | 'sheet';
}) {
  const transactionType = deal.transactionType ?? deal.listing?.transactionType;
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const nextStage = getNextDealStage(deal.stage);
  const commission = deal.commissionSummary?.billed ?? 0;
  const halfCommission = commission ? Math.round(commission / 2) : 0;

  return (
    <section
      className={cn(
        'overflow-hidden bg-background',
        surface === 'inline' ? 'rounded-[12px] border border-slate-200' : 'min-h-full',
      )}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-5 pr-12">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={cn('rounded-md px-2 py-1 text-[11px]', dealStageMeta[deal.stage]?.badgeClassName)}>
            <span className="mr-1 size-1.5 rounded-full bg-current" />
            {dealStageMeta[deal.stage]?.label ?? deal.stage}
          </Badge>
          {transactionType ? (
            <Badge className={cn('rounded-md px-2 py-1 text-[11px]', transactionTypeMeta[transactionType]?.className)}>
              {transactionTypeMeta[transactionType]?.label ?? transactionType}
            </Badge>
          ) : null}
          {deal.isJointBrokerage ? (
            <Badge className="rounded-md bg-violet-50 px-2 py-1 text-[11px] text-violet-700">공동중개</Badge>
          ) : null}
          <span className="ml-auto font-mono text-[11px] text-slate-400">{getDealShortCode(deal.id)}</span>
        </div>

        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{getDealTitle(deal)}</h2>
        <p className="mt-1 text-sm text-slate-500">{getDealLocationLine(deal)}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight text-slate-950">{formatDealAmount(deal)}</span>
          {commission ? <span className="text-xs text-slate-400">예상 수수료 {formatPrice(commission)}</span> : null}
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 xl:grid-cols-3">
        <div className="space-y-4">
          <SectionTitle>다음 액션 · {dealStageMeta[deal.stage]?.label ?? deal.stage}</SectionTitle>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <div className="space-y-2">
              {getNextActions(deal.stage).map((action) => (
                <div key={action} className="flex items-start gap-2 text-sm text-indigo-950">
                  <Circle className="mt-1 size-2.5 fill-indigo-500 text-indigo-500" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>

          <SectionTitle>당사자</SectionTitle>
          <PartyDetailRow label="매도" name={deal.sellerContact?.name} phone={deal.sellerContact?.phone} />
          <PartyDetailRow label="매수" name={deal.buyerContact?.name} phone={deal.buyerContact?.phone} />
          {deal.partnerBroker ? (
            <PartyDetailRow
              label="공동"
              name={deal.partnerBroker.name}
              phone={deal.partnerBroker.phone}
              highlight
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>지급 스케줄</SectionTitle>
            <Badge className={cn('rounded-lg px-2 py-0.5 text-[10px]', nextPayment?.isUrgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
              다음: {formatNextPaymentLabel(nextPayment)}
            </Badge>
          </div>

          <div className="space-y-1.5">
            {(deal.payments ?? []).length > 0 ? (
              (deal.payments ?? []).map((payment) => (
                <PaymentRow
                  key={payment.id}
                  label={formatPaymentKind(payment.kind)}
                  amount={payment.scheduledAmount}
                  date={payment.scheduledDate}
                  status={payment.status}
                  daysUntil={
                    payment.scheduledDate
                      ? getDaysUntil(new Date(payment.scheduledDate), referenceDate)
                      : null
                  }
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-muted-foreground">
                등록된 지급 스케줄이 없습니다.
              </div>
            )}
          </div>

          <SectionTitle>계약서 · 특약</SectionTitle>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">특약사항</div>
            <p className="mt-1 line-clamp-4 text-sm leading-6 text-slate-700">
              {deal.specialTerms || '등록된 특약사항이 없습니다.'}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">계약 문서 준비</p>
              <p className="text-xs text-slate-500">계약서 관리 화면에서 상세 문서를 처리합니다.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>수수료 · 정산</SectionTitle>
            <span className="text-[11px] text-indigo-500">수수료 페이지</span>
          </div>
          <div className="flex items-end justify-between rounded-[10px] bg-slate-950 px-4 py-3 text-white">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-slate-400">총 수수료</div>
              <div className="text-[10px] text-slate-500">예상 청구액</div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{commission ? formatPrice(commission) : '-'}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CommissionTile label="매도측" value={halfCommission ? formatPrice(halfCommission) : '-'} />
            <CommissionTile label="매수측" value={halfCommission ? formatPrice(halfCommission) : '-'} />
          </div>

          <SectionTitle>직원 배분</SectionTitle>
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-muted-foreground">
            직원별 배분 데이터는 정산 모듈과 연결 후 표시됩니다.
          </div>

          <SectionTitle>메모</SectionTitle>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="line-clamp-4 text-sm leading-6 text-amber-950">
              {deal.memo || '등록된 메모가 없습니다.'}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            {nextStage ? (
              <Button
                type="button"
                className="flex-1 bg-slate-950 text-white hover:bg-slate-800"
                onClick={() => onStageChange(nextStage)}
                disabled={isUpdating}
              >
                다음 단계
                <ArrowRight className="size-4" />
              </Button>
            ) : null}
            <DealActionsMenu currentStage={deal.stage} onStageChange={onStageChange} disabled={isUpdating} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosedDealArchive({
  deals,
  showClosedDeals,
  setShowClosedDeals,
  onStageChange,
  isUpdating,
}: {
  deals: Deal[];
  showClosedDeals: boolean;
  setShowClosedDeals: (value: boolean) => void;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  const summary = deals.reduce((sum, deal) => sum + getDealAmountValue(deal), 0);

  return (
    <section className={cn('overflow-hidden rounded-[10px] border border-slate-200 bg-background', !showClosedDeals && 'opacity-90')}>
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-slate-50 px-4 py-3 text-left"
        onClick={() => setShowClosedDeals(!showClosedDeals)}
      >
        <span className="text-[10px] text-slate-400">{showClosedDeals ? '▼' : '▶'}</span>
        <span className="size-2 rounded-full bg-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">종료 거래</h2>
        <Badge variant="outline" className="rounded-lg bg-background text-[11px] text-slate-500">
          {deals.length}건
        </Badge>
        <span className="ml-auto text-xs text-slate-500">
          합계 {summary ? formatPrice(summary) : '-'} · {showClosedDeals ? '펼침' : '접힘'}
        </span>
      </button>

      {showClosedDeals ? (
        <div className="border-t border-slate-100">
          {deals.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">종료된 거래가 없습니다.</div>
          ) : (
            deals.map((deal) => (
              <ClosedDealRow
                key={deal.id}
                deal={deal}
                onStageChange={(stage) => onStageChange(deal.id, stage)}
                isUpdating={isUpdating}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function ClosedDealRow({
  deal,
  onStageChange,
  isUpdating,
}: {
  deal: Deal;
  onStageChange: (stage: string) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{getDealTitle(deal)}</p>
          <Badge className={cn('rounded px-1.5 text-[10px]', dealStageMeta.closed.badgeClassName)}>
            {dealStageMeta.closed.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          매수 {deal.buyerContact?.name ?? '미지정'} · 매도 {deal.sellerContact?.name ?? '미지정'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium">{formatDealAmount(deal)}</p>
        <p className="text-xs text-muted-foreground">
          수수료 {deal.commissionSummary?.billed ? formatPrice(deal.commissionSummary.billed) : '-'}
        </p>
      </div>
      <DealActionsMenu currentStage={deal.stage} onStageChange={onStageChange} disabled={isUpdating} />
    </div>
  );
}

function DealActionsMenu({
  currentStage,
  onStageChange,
  disabled,
}: {
  currentStage: string;
  onStageChange: (stage: string) => void;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label="거래 단계 변경">
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
        {dealStageOrder.slice(0, -1).map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => onStageChange(stage)}
            className={cn(stage === currentStage && 'font-medium text-foreground')}
          >
            {dealStageMeta[stage].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onStageChange('closed')}
        >
          <Archive className="size-4" />
          거래 종료
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssigneeStack({ deal, size }: { deal: Deal; size: 'sm' | 'md' }) {
  const names = [deal.sellerContact?.name, deal.buyerContact?.name].filter(Boolean) as string[];
  const displayNames = names.length > 0 ? names.slice(0, deal.isJointBrokerage ? 2 : 1) : ['미정'];

  return (
    <div className="flex items-center">
      {displayNames.map((name, index) => (
        <Avatar
          key={`${name}-${index}`}
          size="sm"
          className={cn(
            size === 'sm' ? 'size-4 border border-background text-[8px]' : 'size-5 border-2 border-background text-[10px]',
            index > 0 && (size === 'sm' ? '-ml-1' : '-ml-1.5'),
          )}
        >
          <AvatarFallback className={cn(index % 2 === 0 ? 'bg-indigo-700 text-white' : 'bg-amber-700 text-white')}>
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

function ProgressBars({ progress, muted = false }: { progress: number; muted?: boolean }) {
  return (
    <div className="mt-2 flex gap-0.5">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-sm',
            index < progress ? (muted ? 'bg-slate-400' : 'bg-slate-950') : 'bg-slate-200',
          )}
        />
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">
      {children}
    </div>
  );
}

function PartyDetailRow({
  label,
  name,
  phone,
  highlight = false,
}: {
  label: string;
  name: string | null | undefined;
  phone: string | null | undefined;
  highlight?: boolean;
}) {
  const displayName = name?.trim() || '미지정';

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5', highlight ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50')}>
      <Badge variant="outline" className={cn('rounded px-1.5 text-[10px]', highlight && 'border-violet-200 bg-background text-violet-700')}>
        {label}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
        <p className="font-mono text-xs text-slate-500">{phone ?? '연락처 없음'}</p>
      </div>
      {phone ? (
        <Button variant="ghost" size="icon-xs" asChild>
          <a href={`tel:${phone}`} aria-label={`${displayName} 전화`}>
            <Phone className="size-3.5" />
          </a>
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="icon-xs" disabled aria-label="연락처 없음">
          <Phone className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function PaymentRow({
  label,
  amount,
  date,
  status,
  daysUntil,
}: {
  label: string;
  amount: number;
  date: string | null;
  status: string;
  daysUntil: number | null;
}) {
  const paid = status === 'paid';
  const urgent = !paid && daysUntil !== null && daysUntil <= 3;

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5', paid ? 'border-emerald-200 bg-emerald-50' : urgent ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
      <div className={cn('flex size-5 items-center justify-center rounded-full', paid ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 bg-slate-50 text-transparent')}>
        {paid ? <CheckCircle2 className="size-3.5" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{date ? formatFullDate(date) : '일정 미정'}</p>
      </div>
      <div className="text-right text-sm font-semibold tabular-nums text-slate-900">{formatPrice(amount)}</div>
      <Badge className={cn('rounded px-1.5 text-[10px]', paid ? 'bg-emerald-100 text-emerald-700' : urgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>
        {paid ? '완료' : formatDaysLabel(daysUntil)}
      </Badge>
    </div>
  );
}

function CommissionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="font-mono text-[10px] text-slate-400">예상</div>
    </div>
  );
}

function getNextActions(stage: string) {
  if (stage === 'selection' || stage === 'negotiating') {
    return ['당사자 조건 재확인', '거래가 조율 기록', '가계약 가능 일정 확인'];
  }
  if (stage === 'preContract') {
    return ['가계약금 입금 확인', '본계약 일정 확정', '계약 필요 서류 안내'];
  }
  if (stage === 'contracted') {
    return ['계약서 서명·날인', '계약금 입금 확인', '중도금 일정 캘린더 등록', '확인설명서 교부'];
  }
  if (stage === 'settling') {
    return ['잔금 일정 재확인', '등기·인도 준비 상태 점검', '수수료 청구 상태 확인'];
  }
  if (stage === 'completed') {
    return ['수수료 수금 확인', '직원 배분 정산', '거래 자료 보관'];
  }
  return ['거래 상태 확인', '후속 업무 정리'];
}

function getDealTitle(deal: Deal) {
  const siteName = deal.property?.site?.name;
  const dongName = deal.property?.unit?.dong?.isPlaceholder ? null : deal.property?.unit?.dong?.name;
  const unitName = deal.property?.unit?.name;
  return [siteName, dongName, unitName].filter(Boolean).join(' ') || '매물 정보 없음';
}

function getDealLocationLine(deal: Deal) {
  const address = deal.property?.site?.roadAddress ?? deal.property?.site?.jibunAddress ?? '주소 정보 없음';
  const area = deal.property?.unit?.exclusiveAreaM2;
  return area ? `${address} · 전용 ${Math.round(area)}㎡` : address;
}

function getDealShortCode(id: string) {
  return `D${id.replaceAll('-', '').slice(0, 3).toUpperCase()}`;
}

function getNextDealStage(stage: string) {
  const currentIndex = dealPipelineStages.indexOf(stage as DealPipelineStage);
  if (currentIndex < 0 || currentIndex >= dealPipelineStages.length - 1) {
    return null;
  }
  return dealPipelineStages[currentIndex + 1];
}

function formatDealAmount(deal: Deal) {
  const type = deal.transactionType ?? deal.listing?.transactionType;

  if (type === 'monthly') {
    const deposit = deal.agreedDeposit ?? deal.listing?.deposit;
    const monthlyRent = deal.agreedMonthlyRent ?? deal.listing?.monthlyRent;
    const depositStr = deposit ? formatPrice(deposit) : '-';
    const rentStr = monthlyRent ? formatPrice(monthlyRent) : '-';
    return `${depositStr} / ${rentStr}`;
  }

  const price = deal.agreedPrice ?? deal.agreedDeposit ?? deal.listing?.price ?? deal.listing?.deposit;
  return price ? formatPrice(price) : '-';
}

function formatNextPaymentLabel(summary: ReturnType<typeof getNextDealPaymentSummary>) {
  if (!summary) return '일정 미정';
  if (!summary.payment.scheduledDate) return `${summary.label} · 일정 미정`;
  return `${summary.label} ${formatShortDate(summary.payment.scheduledDate)} · ${formatDaysLabel(summary.daysUntil)}`;
}

function formatNextPaymentName(summary: ReturnType<typeof getNextDealPaymentSummary>) {
  if (!summary) return '일정 미정';
  if (!summary.payment.scheduledDate) return `${summary.label} 일정 미정`;
  return `${summary.label} ${formatShortDate(summary.payment.scheduledDate)}`;
}

function formatPaymentKind(kind: string) {
  const labels: Record<string, string> = {
    pre_contract: '가계약금',
    contract: '계약금',
    interim: '중도금',
    balance: '잔금',
    refund: '환불',
  };
  return labels[kind] ?? kind;
}

function formatDaysLabel(daysUntil: number | null) {
  if (daysUntil === null) return '미정';
  if (daysUntil < 0) return `D+${Math.abs(daysUntil)}`;
  if (daysUntil === 0) return 'D-0';
  return `D-${daysUntil}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullDate(value: string) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('.');
}

function getDaysUntil(target: Date, reference: Date) {
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  return Math.round((targetDay - referenceDay) / 86_400_000);
}

function getInitials(name: string) {
  return name.slice(0, 1);
}
