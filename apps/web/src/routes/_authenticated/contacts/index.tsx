import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { api } from '@/lib/api';
import type { Contact } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  ViewBar,
  DateCell,
  TextCell,
  CellEditProvider,
  EditableCell,
  type FilterDefinition,
  type ActiveFilter,
  type SortDefinition,
} from '@/components/data-table';

// ── Filter / Sort definitions ────────────────────────────────────

const filterDefinitions: FilterDefinition[] = [
  {
    id: 'tags_vip',
    field: 'tags',
    label: 'VIP',
    type: 'boolean',
    operators: ['is'],
  },
];

const sortDefinitions = [
  { field: 'name', label: '이름' },
  { field: 'createdAt', label: '등록일' },
];

// ── Route ────────────────────────────────────────────────────────

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
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

  // ── Derive API params ─────────────────────────────────────────
  const apiParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit: 20,
      search: search || undefined,
      sortBy: activeSorts[0]?.field as any,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
    return params;
  }, [page, search, activeSorts]);

  // ── Query ─────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['contacts', apiParams],
    queryFn: () => api.contacts.findAll(apiParams as any),
  });

  // ── Inline edit mutation ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: unknown }) =>
      api.contacts.update(id, { [field]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const handleCellSave = useCallback(
    (recordId: string, field: string, value: unknown) => {
      updateMutation.mutate({ id: recordId, field, value });
    },
    [updateMutation],
  );

  // ── Filter / Sort handlers ────────────────────────────────────
  const handleFilterAdd = useCallback((filter: ActiveFilter) => {
    setActiveFilters((prev) => [...prev.filter((f) => f.field !== filter.field), filter]);
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
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
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

  // ── Columns ───────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '이름',
        size: 140,
        enableSorting: true,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <Link
              to="/contacts/$id"
              params={{ id: c.id }}
              className="font-medium text-foreground hover:text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {c.name}
            </Link>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        size: 130,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <EditableCell
              recordId={c.id}
              field="phone"
              value={c.phone ?? null}
              onSave={handleCellSave}
              editType="text"
            >
              <TextCell value={c.phone ?? null} muted />
            </EditableCell>
          );
        },
      },
      {
        accessorKey: 'email',
        header: '이메일',
        size: 180,
        enableSorting: false,
        cell: ({ row }) => (
          <TextCell value={row.original.email ?? null} muted />
        ),
      },
      {
        accessorKey: 'tags',
        header: '태그',
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const tags = row.original.tags ?? [];
          if (tags.length === 0) return <TextCell value={null} muted />;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: 'memo',
        header: '메모',
        size: 220,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-1 text-sm text-muted-foreground">
            {row.original.memo ?? '-'}
          </span>
        ),
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
            <h1 className="text-lg font-semibold tracking-tight">연락처</h1>
            <span className="text-xs text-muted-foreground">
              {data?.pagination?.total?.toLocaleString() ?? 0}건
            </span>
          </div>
          <Button size="sm" asChild>
            <Link to="/contacts/new">
              <Plus className="size-4" />
              연락처 추가
            </Link>
          </Button>
        </div>

        {/* ViewBar + Table panel */}
        <div className="rounded-xl border border-border/60 bg-background">
          <ViewBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder="이름, 전화번호..."
            filterDefinitions={filterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={handleFilterAdd}
            onFilterRemove={handleFilterRemove}
            onFiltersReset={handleFiltersReset}
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
            onSortingChange={handleSortingChange}
            enableRowSelection
            onRowClick={(row) => navigate({ to: '/contacts/$id', params: { id: row.id } })}
            isLoading={isLoading}
            emptyMessage="연락처가 없습니다."
          />
        </div>
      </div>
    </CellEditProvider>
  );
}
