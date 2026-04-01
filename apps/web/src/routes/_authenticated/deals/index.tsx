import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { LayoutGrid, List, Building, X, Users, TrendingUp, CreditCard } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Deal } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import {
  DataTable,
  ViewBar,
  StatusBadgeCell,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
} from '@/components/data-table';

// ── Stage config ────────────────────────────────────────────────

const stages = [
  { key: 'selection', label: '매물선정', color: 'border-t-slate-400', barColor: 'bg-slate-400' },
  { key: 'deposit', label: '계약금', color: 'border-t-amber-400', barColor: 'bg-amber-400' },
  { key: 'contract', label: '계약', color: 'border-t-blue-400', barColor: 'bg-blue-400' },
  { key: 'completed', label: '완료', color: 'border-t-emerald-400', barColor: 'bg-emerald-400' },
  { key: 'closed', label: '종료', color: 'border-t-gray-300', barColor: 'bg-gray-300' },
];

const stageLabels: Record<string, string> = Object.fromEntries(stages.map((s) => [s.key, s.label]));

const stageColors: Record<string, string> = {
  selection: 'bg-gray-100 text-gray-700',
  deposit: 'bg-amber-50 text-amber-700',
  contract: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-50 text-gray-400',
};

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'stage',
    field: 'stage',
    label: '거래 단계',
    type: 'select',
    operators: ['is'],
    options: stages.map(({ key, label, barColor }) => ({
      value: key,
      label,
      color: barColor,
    })),
  },
];

// ── Deal detail panel ───────────────────────────────────────────

function DealDetailPanel({ deal, onClose, onStageChange }: {
  deal: Deal;
  onClose: () => void;
  onStageChange: (id: string, stage: string) => void;
}) {
  const property = deal.property as any;
  const stageIdx = stages.findIndex((s) => s.key === deal.stage);
  const nextStage = stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;
  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border/60">
        <div>
          <h3 className="text-sm font-semibold">{property?.site?.name ?? '매물 상세'}</h3>
          {property?.unit && (
            <p className="text-xs text-muted-foreground mt-0.5">{property.unit.name}</p>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Stage progress */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-2">거래 단계</p>
          <div className="flex items-center gap-1">
            {stages.filter((s) => s.key !== 'closed').map((s, i, arr) => (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => onStageChange(deal.id, s.key)}
                  className={cn(
                    'flex-1 h-1.5 rounded-full transition-all',
                    deal.stage === 'closed'
                      ? 'bg-muted'
                      : stages.findIndex((x) => x.key === deal.stage) >= stages.findIndex((x) => x.key === s.key)
                      ? s.barColor
                      : 'bg-muted',
                  )}
                  title={s.label}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              stageColors[deal.stage],
            )}>
              {stageLabels[deal.stage]}
            </span>
            <div className="flex items-center gap-1">
              {prevStage && (
                <button
                  onClick={() => onStageChange(deal.id, prevStage.key)}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
                >
                  ← 이전
                </button>
              )}
              {nextStage && (
                <button
                  onClick={() => onStageChange(deal.id, nextStage.key)}
                  className="text-[11px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/10"
                >
                  {nextStage.label} 진행 →
                </button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Price & Commission */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <TrendingUp className="size-3.5 text-muted-foreground" />
            <p className="text-[12px] font-semibold">거래 금액</p>
          </div>
          <dl className="space-y-2">
            {deal.price && (
              <div className="flex justify-between">
                <dt className="text-[12px] text-muted-foreground">거래가</dt>
                <dd className="text-[12px] font-medium tabular-nums">{formatPrice(deal.price)}</dd>
              </div>
            )}
            {deal.commissionSellerAmount && (
              <div className="flex justify-between">
                <dt className="text-[12px] text-muted-foreground">매도측 수수료</dt>
                <dd className="text-[12px] tabular-nums">{formatPrice(deal.commissionSellerAmount)}</dd>
              </div>
            )}
            {deal.commissionBuyerAmount && (
              <div className="flex justify-between">
                <dt className="text-[12px] text-muted-foreground">매수측 수수료</dt>
                <dd className="text-[12px] tabular-nums">{formatPrice(deal.commissionBuyerAmount)}</dd>
              </div>
            )}
            {deal.commissionTotal ? (
              <div className="flex justify-between border-t border-border/40 pt-2 mt-1">
                <dt className="text-[12px] font-medium">수수료 합계</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-emerald-600">{formatPrice(deal.commissionTotal)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Joint brokerage */}
        {deal.isJointBrokerage && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Users className="size-3.5 text-muted-foreground" />
                <p className="text-[12px] font-semibold">공동중개</p>
              </div>
              <dl className="space-y-2">
                {deal.partnerBrokerName && (
                  <div className="flex justify-between">
                    <dt className="text-[12px] text-muted-foreground">파트너 사무소</dt>
                    <dd className="text-[12px]">{deal.partnerBrokerName}</dd>
                  </div>
                )}
                {deal.partnerBrokerPhone && (
                  <div className="flex justify-between">
                    <dt className="text-[12px] text-muted-foreground">연락처</dt>
                    <dd className="text-[12px] tabular-nums">{deal.partnerBrokerPhone}</dd>
                  </div>
                )}
                {deal.partnerCommission && (
                  <div className="flex justify-between">
                    <dt className="text-[12px] text-muted-foreground">파트너 수수료</dt>
                    <dd className="text-[12px] tabular-nums">{formatPrice(deal.partnerCommission)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}

        {/* Payment schedule (placeholder for contract data) */}
        <Separator />
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <CreditCard className="size-3.5 text-muted-foreground" />
            <p className="text-[12px] font-semibold">계약 일정</p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            계약서가 생성되면 일정이 표시됩니다.
          </p>
        </div>

        {/* Memo */}
        {deal.memo && (
          <>
            <Separator />
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">메모</p>
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{deal.memo}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Deal Kanban Card ────────────────────────────────────────────

function DealCard({ deal, isSelected, onClick }: {
  deal: Deal;
  isSelected: boolean;
  onClick: () => void;
}) {
  const property = deal.property as any;
  const propertyName = property?.site?.name ?? '매물';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border text-left p-3 shadow-sm transition-all',
        isSelected
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/60 bg-background hover:border-border',
      )}
    >
      {/* Property name */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Building className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-medium truncate">{propertyName}</span>
      </div>
      {/* Price */}
      {deal.price && (
        <p className="text-[12px] tabular-nums text-muted-foreground mb-1.5">
          {formatPrice(deal.price)}
        </p>
      )}
      {/* Commission + joint */}
      <div className="flex items-center justify-between">
        {deal.commissionTotal ? (
          <span className="text-[11px] font-medium text-emerald-600 tabular-nums">
            수수료 {formatPrice(deal.commissionTotal)}
          </span>
        ) : (
          <span />
        )}
        {deal.isJointBrokerage && (
          <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full">공동</span>
        )}
      </div>
    </button>
  );
}

// ── Kanban Column ───────────────────────────────────────────────

function DealKanbanColumn({
  stage,
  deals,
  selectedId,
  onSelect,
}: {
  stage: (typeof stages)[number];
  deals: Deal[];
  selectedId: string | null;
  onSelect: (deal: Deal) => void;
}) {
  const totalCommission = deals.reduce((sum, d) => sum + (d.commissionTotal ?? 0), 0);

  return (
    <div className="flex w-52 shrink-0 flex-col">
      <div className={cn('rounded-t-lg border-t-2 border-x border-border/60 bg-muted/30 px-3 py-2', stage.color)}>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold">{stage.label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{deals.length}</span>
        </div>
        {totalCommission > 0 && (
          <p className="text-[10px] text-emerald-600 tabular-nums mt-0.5">{formatPrice(totalCommission)}</p>
        )}
      </div>
      <div className="flex-1 rounded-b-lg border-x border-b border-border/60 bg-muted/10 p-2 space-y-2 min-h-[120px]">
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            isSelected={selectedId === d.id}
            onClick={() => onSelect(d)}
          />
        ))}
        {deals.length === 0 && (
          <p className="py-6 text-center text-[11px] text-muted-foreground">없음</p>
        )}
      </div>
    </div>
  );
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/deals/')({
  component: DealsPage,
});

function DealsPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.deals.updateStage(id, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deals'] }),
  });

  const handleStageChange = (id: string, stage: string) => {
    stageMutation.mutate({ id, stage });
    // Update selected deal if it's the one being changed
    if (selectedDeal?.id === id) {
      setSelectedDeal((d) => d ? { ...d, stage } : d);
    }
  };

  const filteredData = useMemo(() => {
    let items = data ?? [];
    if (!showClosed) items = items.filter((d) => d.stage !== 'closed');
    for (const filter of activeFilters) {
      if (filter.field === 'stage') items = items.filter((d) => d.stage === filter.value);
    }
    return items;
  }, [data, activeFilters, showClosed]);

  const visibleStages = showClosed ? stages : stages.filter((s) => s.key !== 'closed');

  // Total commission across active deals
  const totalCommission = filteredData.reduce((sum, d) => sum + (d.commissionTotal ?? 0), 0);

  // ── Table columns ────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Deal, unknown>[]>(
    () => [
      {
        accessorKey: 'property',
        header: '매물',
        size: 200,
        cell: ({ row }) => (
          <TextCell value={(row.original.property as any)?.site?.name ?? `매물 ${row.original.propertyId.slice(0, 8)}...`} bold />
        ),
      },
      {
        accessorKey: 'stage',
        header: '단계',
        size: 100,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.stage} labels={stageLabels} colors={stageColors} />
        ),
      },
      {
        accessorKey: 'price',
        header: '거래가',
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm font-medium">
            {row.original.price ? formatPrice(row.original.price) : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'commissionTotal',
        header: '수수료 합계',
        size: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.commissionTotal ? formatPrice(row.original.commissionTotal) : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'isJointBrokerage',
        header: '공동중개',
        size: 80,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.isJointBrokerage ? '공동' : '단독'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        size: 80,
        cell: ({ row }) => <DateCell value={row.original.createdAt} relative />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">거래관리</h1>
          <span className="text-xs text-muted-foreground">{filteredData.length}건</span>
          {totalCommission > 0 && (
            <span className="text-[11px] text-emerald-600 font-medium">
              예상 수수료 합계 {formatPrice(totalCommission)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-md border transition-colors',
              showClosed
                ? 'border-border bg-muted text-foreground'
                : 'border-border/50 text-muted-foreground hover:text-foreground',
            )}
          >
            종료 포함
          </button>
          <div className="flex rounded-lg border border-border/60 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 rounded-none px-2.5', viewMode === 'kanban' && 'bg-muted')}
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 rounded-none px-2.5', viewMode === 'table' && 'bg-muted')}
              onClick={() => setViewMode('table')}
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        /* Kanban + detail panel */
        <div className={cn('flex gap-4 transition-all', selectedDeal ? 'items-start' : '')}>
          <div className="flex-1 overflow-x-auto pb-4">
            {isLoading ? (
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-52 shrink-0 h-64 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex gap-3 min-w-max">
                {visibleStages.map((stage) => (
                  <DealKanbanColumn
                    key={stage.key}
                    stage={stage}
                    deals={filteredData.filter((d) => d.stage === stage.key)}
                    selectedId={selectedDeal?.id ?? null}
                    onSelect={(deal) => setSelectedDeal((prev) => prev?.id === deal.id ? null : deal)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail side panel */}
          {selectedDeal && (
            <div className="w-80 shrink-0 rounded-xl border border-border/60 bg-background overflow-hidden">
              <DealDetailPanel
                deal={selectedDeal}
                onClose={() => setSelectedDeal(null)}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </div>
      ) : (
        /* Table view */
        <div className="rounded-xl border border-border/60 bg-background">
          <ViewBar
            filterDefinitions={filterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={(f) => setActiveFilters((prev) => [...prev.filter((p) => p.field !== f.field), f])}
            onFilterRemove={(id) => setActiveFilters((prev) => prev.filter((f) => f.id !== id))}
            onFiltersReset={() => setActiveFilters([])}
          />
          <DataTable
            columns={columns}
            data={filteredData}
            onRowClick={(row) => setSelectedDeal((prev) => prev?.id === row.id ? null : row)}
            isLoading={isLoading}
            emptyMessage="거래가 없습니다."
          />
        </div>
      )}
    </div>
  );
}
