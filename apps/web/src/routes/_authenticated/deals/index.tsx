import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Deal } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  DataTable,
  ViewBar,
  StatusBadgeCell,
  PriceCell,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';

const stageLabels: Record<string, string> = {
  selection: '매물선정',
  deposit: '계약금',
  contract: '계약',
  completed: '완료',
  closed: '종료',
};

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
    options: Object.entries(stageLabels).map(([value, label]) => ({
      value,
      label,
      color: stageColors[value]?.split(' ')[0],
    })),
  },
];

export const Route = createFileRoute('/_authenticated/deals/')({
  component: DealsPage,
});

function DealsPage() {
  const navigate = useNavigate();
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  // Client-side filter since API returns Deal[] (not paginated)
  const filteredData = useMemo(() => {
    let items = data ?? [];
    for (const filter of activeFilters) {
      if (filter.field === 'stage') {
        items = items.filter((d) => d.stage === filter.value);
      }
    }
    return items;
  }, [data, activeFilters]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">거래관리</h1>
          <span className="text-xs text-muted-foreground">{filteredData.length}건</span>
        </div>
      </div>

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
          onRowClick={(row) => navigate({ to: '/deals', search: { id: row.id } })}
          isLoading={isLoading}
          emptyMessage="거래가 없습니다."
        />
      </div>
    </div>
  );
}
