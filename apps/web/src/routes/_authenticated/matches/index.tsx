import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Match } from '@estate-erp/api-client';
import {
  DataTable,
  ViewBar,
  StatusBadgeCell,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
} from '@/components/data-table';

const stageLabels: Record<string, string> = {
  suggested: '제안',
  buyerContacted: '매수자 연락',
  viewing: '임장',
  ownerContacted: '소유주 연락',
  negotiating: '협상',
  dealCreated: '거래 생성',
  closed: '완료',
};

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
    options: Object.entries(stageLabels).map(([value, label]) => ({
      value,
      label,
      color: stageColors[value]?.split(' ')[0],
    })),
  },
];

export const Route = createFileRoute('/_authenticated/matches/')({
  component: MatchesPage,
});

function MatchesPage() {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

  const filteredData = useMemo(() => {
    let items = data ?? [];
    for (const filter of activeFilters) {
      if (filter.field === 'stage') {
        items = items.filter((m) => m.stage === filter.value);
      }
    }
    return items;
  }, [data, activeFilters]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">매칭</h1>
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
          isLoading={isLoading}
          emptyMessage="매칭이 없습니다."
        />
      </div>
    </div>
  );
}
