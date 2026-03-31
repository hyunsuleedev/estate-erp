import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Consultation } from '@estate-erp/api-client';
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

const typeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

const typeColors: Record<string, string> = {
  phone: 'bg-blue-50 text-blue-700',
  visit: 'bg-emerald-50 text-emerald-700',
  online: 'bg-violet-50 text-violet-700',
};

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'type',
    field: 'type',
    label: '상담유형',
    type: 'select',
    operators: ['is'],
    options: [
      { label: '전화', value: 'phone', color: 'bg-blue-400' },
      { label: '방문', value: 'visit', color: 'bg-emerald-400' },
      { label: '온라인', value: 'online', color: 'bg-violet-400' },
    ],
  },
];

const sortDefinitions = [
  { field: 'createdAt', label: '등록일' },
];

export const Route = createFileRoute('/_authenticated/consultations/')({
  component: ConsultationsPage,
});

function ConsultationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
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
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
    for (const filter of activeFilters) {
      if (filter.field === 'type') params.type = filter.value;
    }
    return params;
  }, [page, activeFilters, activeSorts]);

  const { data, isLoading } = useQuery({
    queryKey: ['consultations', apiParams],
    queryFn: () => api.consultations.findAll(apiParams as any),
  });

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<Consultation, unknown>[]>(
    () => [
      {
        accessorKey: 'contact.name',
        header: '상담 상대',
        size: 140,
        cell: ({ row }) => (
          <TextCell value={row.original.contact?.name ?? '-'} bold />
        ),
      },
      {
        accessorKey: 'contact.phone',
        header: '전화번호',
        size: 120,
        cell: ({ row }) => (
          <TextCell value={row.original.contact?.phone ?? '-'} muted />
        ),
      },
      {
        accessorKey: 'type',
        header: '유형',
        size: 80,
        cell: ({ row }) => (
          <StatusBadgeCell value={row.original.type} labels={typeLabels} colors={typeColors} />
        ),
      },
      {
        accessorKey: 'content',
        header: '내용',
        size: 300,
        cell: ({ row }) => (
          <span className="line-clamp-1 text-sm text-muted-foreground">
            {row.original.content}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: '일시',
        size: 100,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.createdAt} />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">상담기록</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background">
        <ViewBar
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="이름, 내용..."
          filterDefinitions={filterDefinitions}
          activeFilters={activeFilters}
          onFilterAdd={(f) => { setActiveFilters((prev) => [...prev.filter((p) => p.field !== f.field), f]); setPage(1); }}
          onFilterRemove={(id) => { setActiveFilters((prev) => prev.filter((f) => f.id !== id)); setPage(1); }}
          onFiltersReset={() => { setActiveFilters([]); setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]); setSearch(''); setPage(1); }}
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
            if (s.length > 0) setActiveSorts([{ field: s[0].id, label: '등록일', direction: s[0].desc ? 'desc' : 'asc' }]);
          }}
          isLoading={isLoading}
          emptyMessage="상담 기록이 없습니다."
        />
      </div>
    </div>
  );
}
