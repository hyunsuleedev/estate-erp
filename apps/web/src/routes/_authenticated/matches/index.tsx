import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { LayoutGrid, List, Building, User } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Match } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  { key: 'suggested', label: '제안', color: 'border-t-slate-400' },
  { key: 'buyerContacted', label: '매수자 연락', color: 'border-t-sky-400' },
  { key: 'viewing', label: '임장', color: 'border-t-violet-400' },
  { key: 'ownerContacted', label: '소유주 연락', color: 'border-t-amber-400' },
  { key: 'negotiating', label: '협상', color: 'border-t-orange-400' },
  { key: 'dealCreated', label: '거래 생성', color: 'border-t-emerald-400' },
  { key: 'closed', label: '완료', color: 'border-t-gray-300' },
];

const stageLabels: Record<string, string> = Object.fromEntries(stages.map((s) => [s.key, s.label]));

const stageColors: Record<string, string> = {
  suggested: 'bg-gray-100 text-gray-700',
  buyerContacted: 'bg-sky-50 text-sky-700',
  viewing: 'bg-violet-50 text-violet-700',
  ownerContacted: 'bg-amber-50 text-amber-700',
  negotiating: 'bg-orange-50 text-orange-700',
  dealCreated: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-50 text-gray-400',
};

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'stage',
    field: 'stage',
    label: '매칭 단계',
    type: 'select',
    operators: ['is'],
    options: stages.map(({ key, label, color }) => ({
      value: key,
      label,
      color: color.replace('border-t-', 'bg-').replace('-400', '-400'),
    })),
  },
];

// ── Kanban Card ─────────────────────────────────────────────────

function MatchCard({ match, onStageChange }: { match: Match; onStageChange: (id: string, stage: string) => void }) {
  const propertyName = (match.property as any)?.site?.name ?? '매물';
  const contactName = (match.buyerRequirement as any)?.contact?.name ?? '고객';
  const stageIdx = stages.findIndex((s) => s.key === match.stage);
  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;
  const nextStage = stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;

  return (
    <div className="rounded-lg border border-border/60 bg-background p-3 shadow-sm hover:border-border transition-colors">
      {/* Property */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Building className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-medium truncate">{propertyName}</span>
      </div>
      {/* Contact */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <User className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground truncate">{contactName}</span>
      </div>
      {/* Memo */}
      {match.memo && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5">{match.memo}</p>
      )}
      {/* Stage nav */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {new Date(match.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
        </span>
        <div className="flex items-center gap-1">
          {prevStage && (
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted"
              onClick={() => onStageChange(match.id, prevStage.key)}
            >
              ← {prevStage.label}
            </button>
          )}
          {nextStage && (
            <button
              className="text-[10px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-primary/10"
              onClick={() => onStageChange(match.id, nextStage.key)}
            >
              {nextStage.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban Column ───────────────────────────────────────────────

function KanbanColumn({
  stage,
  matches,
  onStageChange,
}: {
  stage: (typeof stages)[number];
  matches: Match[];
  onStageChange: (id: string, stage: string) => void;
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col">
      {/* Column header */}
      <div className={cn('rounded-t-lg border-t-2 border-x border-border/60 bg-muted/30 px-3 py-2', stage.color)}>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold">{stage.label}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{matches.length}</span>
        </div>
      </div>
      {/* Cards */}
      <div className="flex-1 rounded-b-lg border-x border-b border-border/60 bg-muted/10 p-2 space-y-2 min-h-[120px]">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} onStageChange={onStageChange} />
        ))}
        {matches.length === 0 && (
          <p className="py-6 text-center text-[11px] text-muted-foreground">없음</p>
        )}
      </div>
    </div>
  );
}

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/matches/')({
  component: MatchesPage,
});

function MatchesPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matches'] }),
  });

  const handleStageChange = (id: string, stage: string) => {
    stageMutation.mutate({ id, stage });
  };

  const filteredData = useMemo(() => {
    let items = data ?? [];
    if (!showClosed) items = items.filter((m) => m.stage !== 'closed');
    for (const filter of activeFilters) {
      if (filter.field === 'stage') {
        items = items.filter((m) => m.stage === filter.value);
      }
    }
    return items;
  }, [data, activeFilters, showClosed]);

  // Visible stages for kanban (hide closed unless toggled)
  const visibleStages = showClosed ? stages : stages.filter((s) => s.key !== 'closed');

  // ── Table columns (fallback view) ────────────────────────────
  const columns = useMemo<ColumnDef<Match, unknown>[]>(
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
        accessorKey: 'buyerRequirement',
        header: '구매고객',
        size: 160,
        cell: ({ row }) => (
          <TextCell value={(row.original.buyerRequirement as any)?.contact?.name ?? `고객 ${row.original.buyerReqId.slice(0, 8)}...`} />
        ),
      },
      {
        accessorKey: 'stage',
        header: '단계',
        size: 120,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.stage} labels={stageLabels} colors={stageColors} />
        ),
      },
      {
        accessorKey: 'memo',
        header: '메모',
        size: 200,
        cell: ({ row }) => <TextCell value={row.original.memo} muted />,
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
          <h1 className="text-lg font-semibold tracking-tight">매칭</h1>
          <span className="text-xs text-muted-foreground">{filteredData.length}건</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Show closed toggle */}
          <button
            onClick={() => setShowClosed((v) => !v)}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-md border transition-colors',
              showClosed
                ? 'border-border bg-muted text-foreground'
                : 'border-border/50 text-muted-foreground hover:text-foreground',
            )}
          >
            완료 포함
          </button>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/60 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 rounded-none px-2.5',
                viewMode === 'kanban' && 'bg-muted',
              )}
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 rounded-none px-2.5',
                viewMode === 'table' && 'bg-muted',
              )}
              onClick={() => setViewMode('table')}
            >
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        /* Kanban board */
        <div className="overflow-x-auto pb-4">
          {isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-56 shrink-0 h-64 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 min-w-max">
              {visibleStages.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  matches={filteredData.filter((m) => m.stage === stage.key)}
                  onStageChange={handleStageChange}
                />
              ))}
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
            isLoading={isLoading}
            emptyMessage="매칭이 없습니다."
          />
        </div>
      )}
    </div>
  );
}
