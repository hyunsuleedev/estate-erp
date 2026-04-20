import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Listing } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  ViewBar,
  PriceCell,
  AreaCell,
  StatusBadgeCell,
  TransactionTypeCell,
  DateCell,
  TextCell,
  HiddenIndicator,
  CellEditProvider,
  EditableCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';

// ── Labels & Colors ─────────────────────────────────────────────

const checkStatusLabels: Record<string, string> = {
  unverified: '미확인',
  verified: '확인',
  in_contract: '계약중',
  hold: '보류',
  done: '완료',
};

const checkStatusColors: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  verified: 'bg-emerald-50 text-emerald-700',
  in_contract: 'bg-blue-50 text-blue-700',
  hold: 'bg-amber-50 text-amber-700',
  done: 'bg-gray-50 text-gray-400',
};

// ── Filter definitions (Twenty-inspired) ────────────────────────

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'transactionType',
    field: 'transactionType',
    label: '거래유형',
    type: 'select',
    operators: ['is'],
    options: [
      { label: '매매', value: 'sale', color: 'bg-rose-400' },
      { label: '전세', value: 'jeonse', color: 'bg-blue-400' },
      { label: '월세', value: 'monthly', color: 'bg-violet-400' },
    ],
  },
  {
    id: 'checkStatus',
    field: 'checkStatus',
    label: '상태',
    type: 'select',
    operators: ['is'],
    options: [
      { label: '미확인', value: 'unverified', color: 'bg-gray-400' },
      { label: '확인', value: 'verified', color: 'bg-emerald-400' },
      { label: '계약중', value: 'in_contract', color: 'bg-blue-400' },
      { label: '보류', value: 'hold', color: 'bg-amber-400' },
      { label: '완료', value: 'done', color: 'bg-gray-300' },
    ],
  },
  {
    id: 'includeHidden',
    field: 'includeHidden',
    label: '숨김 매물 포함',
    type: 'boolean',
    operators: ['is'],
  },
];

const sortDefinitions = [
  { field: 'price', label: '가격' },
  { field: 'createdAt', label: '등록일' },
  { field: 'updatedAt', label: '수정일' },
];

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/properties/')({
  component: PropertiesPage,
});

function PropertiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── State ─────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'createdAt', label: '등록일', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  // ── Derive API params from filters ────────────────────────────
  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      search: search || undefined,
    };

    for (const filter of activeFilters) {
      if (filter.field === 'transactionType') params.transactionType = filter.value;
      if (filter.field === 'checkStatus') params.checkStatus = filter.value;
      if (filter.field === 'includeHidden') params.includeHidden = true;
    }

    if (activeSorts.length > 0) {
      params.sortBy = activeSorts[0].field;
      params.sortOrder = activeSorts[0].direction;
    }

    return params;
  }, [page, search, activeFilters, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['listings', apiParams],
    queryFn: () => api.listings.findAll(apiParams as any),
  });

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: unknown }) =>
      api.listings.update(id, { [field]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
    },
  });

  const handleCellSave = useCallback(
    (recordId: string, field: string, value: unknown) => {
      updateMutation.mutate({ id: recordId, field, value });
    },
    [updateMutation],
  );

  // ── Filter handlers ───────────────────────────────────────────
  const handleFilterAdd = useCallback((filter: ActiveFilter) => {
    setActiveFilters((prev) => {
      // For select filters, replace existing filter on same field
      const filtered = prev.filter((f) => !(f.field === filter.field && f.operator === 'is'));
      return [...filtered, filter];
    });
    setPage(1);
  }, []);

  const handleFilterRemove = useCallback((filterId: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== filterId));
    setPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setActiveFilters([]);
    setActiveSorts([{ field: 'createdAt', label: '등록일', direction: 'desc' }]);
    setSearch('');
    setPage(1);
  }, []);

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]); // single sort for now
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const handleSortRemove = useCallback((_field: string) => {
    setActiveSorts([]);
    setSorting([]);
  }, []);

  const handleSortingChange = useCallback((newSorting: SortingState) => {
    setSorting(newSorting);
    if (newSorting.length > 0) {
      const s = newSorting[0];
      setActiveSorts([{
        field: s.id,
        label: sortDefinitions.find((d) => d.field === s.id)?.label ?? s.id,
        direction: s.desc ? 'desc' : 'asc',
      }]);
    } else {
      setActiveSorts([]);
    }
    setPage(1);
  }, []);

  // ── Column definitions (Twenty-inspired field routing) ────────
  const columns = useMemo<ColumnDef<Listing, unknown>[]>(
    () => [
      {
        accessorKey: 'property.site.name',
        header: '단지/건물',
        size: 200,
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <HiddenIndicator isHidden={l.isHidden} />
              <Link
                to="/properties/$id"
                params={{ id: l.propertyId }}
                className="font-medium text-foreground hover:text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {l.property?.site?.name ?? '-'}
              </Link>
            </div>
          );
        },
      },
      {
        accessorKey: 'property.unit.name',
        header: '호실',
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <TextCell value={row.original.property?.unit?.name ?? null} muted />
        ),
      },
      {
        accessorKey: 'transactionType',
        header: '거래',
        size: 70,
        enableSorting: false,
        cell: ({ row }) => (
          <TransactionTypeCell value={row.original.transactionType} />
        ),
      },
      {
        accessorKey: 'price',
        header: '가격',
        size: 160,
        enableSorting: true,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <EditableCell
              recordId={l.id}
              field="price"
              value={l.price}
              onSave={handleCellSave}
              editType="number"
            >
              <PriceCell
                transactionType={l.transactionType}
                price={l.price}
                deposit={l.deposit}
                monthlyRent={l.monthlyRent}
              />
            </EditableCell>
          );
        },
      },
      {
        accessorKey: 'area',
        header: '면적',
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <AreaCell exclusiveAreaM2={row.original.property?.unit?.exclusiveAreaM2} />
        ),
      },
      {
        accessorKey: 'checkStatus',
        header: '상태',
        size: 80,
        enableSorting: false,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <EditableCell
              recordId={l.id}
              field="checkStatus"
              value={l.checkStatus}
              onSave={handleCellSave}
              editType="select"
              selectOptions={[
                { label: '미확인', value: 'unverified' },
                { label: '확인', value: 'verified' },
                { label: '계약중', value: 'in_contract' },
                { label: '보류', value: 'hold' },
                { label: '완료', value: 'done' },
              ]}
            >
              <StatusBadgeCell
                value={l.checkStatus}
                labels={checkStatusLabels}
                colors={checkStatusColors}
              />
            </EditableCell>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        size: 80,
        enableSorting: true,
        cell: ({ row }) => (
          <DateCell value={row.original.createdAt} relative />
        ),
      },
    ],
    [handleCellSave],
  );

  return (
    <CellEditProvider>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">매물관리</h1>
            <span className="text-xs text-muted-foreground">
              {data?.pagination?.total?.toLocaleString() ?? 0}건
            </span>
          </div>
          <Button size="sm" asChild>
            <Link to="/properties/new">
              <Plus className="size-4" />
              매물 등록
            </Link>
          </Button>
        </div>

        {/* ViewBar + Table panel */}
        <div className="rounded-xl border border-border/60 bg-background">
          {/* View Bar */}
          <ViewBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="단지명, 주소, 메모..."
            filterDefinitions={filterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={handleFilterAdd}
            onFilterRemove={handleFilterRemove}
            onFiltersReset={handleFiltersReset}
            sortDefinitions={sortDefinitions}
            activeSorts={activeSorts}
            onSortAdd={handleSortAdd}
            onSortRemove={handleSortRemove}
          />

          {/* Data Table */}
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            totalCount={data?.pagination?.total ?? 0}
            pageCount={data?.pagination?.totalPages ?? 1}
            page={page}
            onPageChange={setPage}
            pageSize={20}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            enableRowSelection
            onRowClick={(row) => navigate({ to: '/properties/$id', params: { id: row.propertyId } })}
            isLoading={isLoading}
            emptyMessage="매물이 없습니다."
          />
        </div>
      </div>
    </CellEditProvider>
  );
}
