import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { BuyerRequirement } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  DataTable,
  ViewBar,
  StatusBadgeCell,
  DateCell,
  TextCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';

const statusLabels: Record<string, string> = {
  active: '활성',
  matched: '매칭됨',
  completed: '완료',
  inactive: '비활성',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  matched: 'bg-blue-50 text-blue-700',
  completed: 'bg-gray-100 text-gray-600',
  inactive: 'bg-gray-50 text-gray-400',
};

const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

const urgencyColors: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700',
  normal: 'bg-gray-100 text-gray-700',
  flexible: 'bg-sky-50 text-sky-700',
};

const txTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'status',
    field: 'status',
    label: '상태',
    type: 'select',
    operators: ['is'],
    options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
  },
  {
    id: 'urgency',
    field: 'urgency',
    label: '긴급도',
    type: 'select',
    operators: ['is'],
    options: Object.entries(urgencyLabels).map(([value, label]) => ({ value, label })),
  },
  {
    id: 'transactionType',
    field: 'transactionType',
    label: '거래유형',
    type: 'select',
    operators: ['is'],
    options: [
      { label: '매매', value: 'sale' },
      { label: '전세', value: 'jeonse' },
      { label: '월세', value: 'monthly' },
    ],
  },
];

const sortDefinitions = [
  { field: 'createdAt', label: '등록일' },
  { field: 'nextContactDate', label: '다음 연락일' },
  { field: 'urgency', label: '긴급도' },
];

export const Route = createFileRoute('/_authenticated/buyer-requirements/')({
  component: BuyerRequirementsPage,
});

function BuyerRequirementsPage() {
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'createdAt', label: '등록일', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      sortBy: activeSorts[0]?.field as any,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
    for (const filter of activeFilters) {
      params[filter.field] = filter.value;
    }
    return params;
  }, [page, activeFilters, activeSorts]);

  const { data, isLoading } = useQuery({
    queryKey: ['buyer-requirements', apiParams],
    queryFn: () => api.buyerRequirements.findAll(apiParams as any),
  });

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<BuyerRequirement, unknown>[]>(
    () => [
      {
        accessorKey: 'contact.name',
        header: '고객명',
        size: 120,
        cell: ({ row }) => <TextCell value={row.original.contact?.name ?? '-'} bold />,
      },
      {
        accessorKey: 'status',
        header: '상태',
        size: 80,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.status} labels={statusLabels} colors={statusColors} />
        ),
      },
      {
        accessorKey: 'urgency',
        header: '긴급',
        size: 70,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.urgency} labels={urgencyLabels} colors={urgencyColors} />
        ),
      },
      {
        accessorKey: 'transactionType',
        header: '거래유형',
        size: 80,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.transactionType ? txTypeLabels[row.original.transactionType] ?? row.original.transactionType : '-'}</span>
        ),
      },
      {
        accessorKey: 'budget',
        header: '예산',
        size: 150,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.priceMin && !r.priceMax) return <TextCell value="-" muted />;
          const min = r.priceMin ? formatPrice(r.priceMin) : '';
          const max = r.priceMax ? formatPrice(r.priceMax) : '';
          return (
            <span className="tabular-nums text-sm">
              {min && max ? `${min} ~ ${max}` : min || `~ ${max}`}
            </span>
          );
        },
      },
      {
        accessorKey: 'regions',
        header: '희망지역',
        size: 160,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.regions.length > 0 ? row.original.regions.join(', ') : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'nextContactDate',
        header: '다음 연락',
        size: 90,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.nextContactDate} />,
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        size: 80,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.createdAt} relative />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">구매고객</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background">
        <ViewBar
          filterDefinitions={filterDefinitions}
          activeFilters={activeFilters}
          onFilterAdd={(f) => { setActiveFilters((prev) => [...prev.filter((p) => p.field !== f.field), f]); setPage(1); }}
          onFilterRemove={(id) => { setActiveFilters((prev) => prev.filter((f) => f.id !== id)); setPage(1); }}
          onFiltersReset={() => { setActiveFilters([]); setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]); setPage(1); }}
          sortDefinitions={sortDefinitions}
          activeSorts={activeSorts}
          onSortAdd={handleSortAdd}
          onSortRemove={() => setActiveSorts([])}
        />
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          totalCount={data?.pagination?.total ?? 0}
          pageCount={data?.pagination?.totalPages ?? 1}
          page={page}
          onPageChange={setPage}
          pageSize={20}
          sorting={sorting}
          onSortingChange={(s) => {
            setSorting(s);
            if (s.length > 0) {
              const def = sortDefinitions.find((d) => d.field === s[0].id);
              setActiveSorts([{ field: s[0].id, label: def?.label ?? s[0].id, direction: s[0].desc ? 'desc' : 'asc' }]);
            }
          }}
          isLoading={isLoading}
          emptyMessage="구매 희망 고객이 없습니다."
        />
      </div>
    </div>
  );
}
