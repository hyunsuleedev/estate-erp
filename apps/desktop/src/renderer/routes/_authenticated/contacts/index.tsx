import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo, useState, type ComponentType } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { Contact } from '@estate-erp/api-client';
import {
  BriefcaseBusiness,
  Building2,
  Home,
  MessageSquare,
  MessageSquareText,
  Plus,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  CONTACT_GROUPS,
  CONTACT_GROUP_TAGS,
  formatPhoneNumber,
} from '@/lib/contacts';
import { cn } from '@/lib/utils';
import {
  DataTable,
  DateCell,
  TextCell,
  ViewBar,
  type ActiveFilter,
  type FilterDefinition,
  type SortDefinition,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const baseFilterDefinitions: FilterDefinition[] = [
  {
    id: 'hasPropertyContact',
    field: 'hasPropertyContact',
    label: '매물 연결',
    type: 'boolean',
    operators: ['is'],
  },
  {
    id: 'hasBuyerReq',
    field: 'hasBuyerReq',
    label: '매수요건',
    type: 'boolean',
    operators: ['is'],
  },
];

const sortDefinitions = [
  { field: 'updatedAt', label: '최근 수정' },
  { field: 'createdAt', label: '등록일' },
  { field: 'name', label: '이름' },
];

const contactGroupIcons: Record<string, ComponentType<{ className?: string }>> = {
  '매수/투자': Target,
  임차: Home,
  매물상담: MessageSquareText,
  소유자: UserRound,
  거래처: BriefcaseBusiness,
  중개사무소: Building2,
};

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedGroupTag, setSelectedGroupTag] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'updatedAt', label: '최근 수정', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);

  const totalCountQuery = useQuery({
    queryKey: ['contacts', 'sidebar-total-count'],
    queryFn: () => api.contacts.findAll({ page: 1, limit: 1 }),
    staleTime: 60_000,
  });

  const groupCountQueries = useQueries({
    queries: CONTACT_GROUPS.map((group) => ({
      queryKey: ['contacts', 'sidebar-group-count', group.tag],
      queryFn: () => api.contacts.findAll({ page: 1, limit: 1, tags: group.tag }),
      staleTime: 60_000,
    })),
  });

  const apiParams = useMemo(() => {
    const customTagFilters = activeFilters
      .filter((filter) => filter.field === 'tags')
      .map((filter) => filter.value);

    const tags = Array.from(
      new Set([
        ...(selectedGroupTag ? [selectedGroupTag] : []),
        ...customTagFilters,
      ]),
    );

    return {
      page,
      limit: 20,
      search: deferredSearch.trim() || undefined,
      tags: tags.length > 0 ? tags.join(',') : undefined,
      hasPropertyContact: activeFilters.some((filter) => filter.field === 'hasPropertyContact') || undefined,
      hasBuyerReq: activeFilters.some((filter) => filter.field === 'hasBuyerReq') || undefined,
      sortBy: activeSorts[0]?.field as 'name' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
  }, [activeFilters, activeSorts, deferredSearch, page, selectedGroupTag]);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', apiParams],
    queryFn: () => api.contacts.findAll(apiParams),
  });

  const groupCounts = CONTACT_GROUPS.reduce<Record<string, number | undefined>>((acc, group, index) => {
    acc[group.tag] = groupCountQueries[index]?.data?.pagination?.total;
    return acc;
  }, {});

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const uniqueCustomTags = Array.from(new Set([
      ...(data?.items ?? [])
        .flatMap((contact) => contact.tags)
        .filter((tag) => !CONTACT_GROUP_TAGS.includes(tag)),
      ...activeFilters
        .filter((filter) => filter.field === 'tags')
        .map((filter) => filter.value),
    ])).slice(0, 12);

    if (uniqueCustomTags.length === 0) return baseFilterDefinitions;

    return [
      ...baseFilterDefinitions,
      {
        id: 'tags',
        field: 'tags',
        label: '추가 태그',
        type: 'select',
        operators: ['is'],
        options: uniqueCustomTags.map((tag) => ({ label: tag, value: tag })),
      },
    ];
  }, [activeFilters, data?.items]);

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '이름',
        size: 180,
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to="/contacts/$id"
            params={{ id: row.original.id }}
            className="font-medium text-foreground hover:text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'phone',
        header: '연락처',
        size: 200,
        cell: ({ row }) => {
          const phones = [row.original.phone, row.original.phone2]
            .filter(Boolean)
            .map((phone) => formatPhoneNumber(phone));

          return (
            <TextCell
              value={phones.length > 0 ? phones.join(' · ') : '-'}
              muted={phones.length === 0}
            />
          );
        },
      },
      {
        accessorKey: 'tags',
        header: '그룹/태그',
        size: 220,
        enableSorting: false,
        cell: ({ row }) => <TagPreview tags={row.original.tags} />,
      },
      {
        accessorKey: 'connections',
        header: '연결 현황',
        size: 190,
        enableSorting: false,
        cell: ({ row }) => (
          <ConnectionSummary
            propertyCount={row.original._count?.propertyContacts ?? 0}
            buyerReqCount={row.original._count?.buyerRequirements ?? 0}
            consultationCount={row.original._count?.consultations ?? 0}
          />
        ),
      },
      {
        accessorKey: 'memo',
        header: '메모',
        size: 260,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block truncate text-sm text-muted-foreground">
            {row.original.memo ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: '최근 수정',
        size: 90,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.updatedAt} relative />,
      },
    ],
    [],
  );

  const handleFilterAdd = useCallback((filter: ActiveFilter) => {
    setActiveFilters((previous) => {
      if (filter.field === 'tags') {
        if (previous.some((item) => item.field === 'tags' && item.value === filter.value)) {
          return previous;
        }
        return [...previous, filter];
      }

      return [
        ...previous.filter((item) => item.field !== filter.field),
        filter,
      ];
    });
    setPage(1);
  }, []);

  const handleFilterRemove = useCallback((filterId: string) => {
    setActiveFilters((previous) => previous.filter((filter) => filter.id !== filterId));
    setPage(1);
  }, []);

  const handleFiltersReset = useCallback(() => {
    setActiveFilters([]);
    setActiveSorts([{ field: 'updatedAt', label: '최근 수정', direction: 'desc' }]);
    setSorting([{ id: 'updatedAt', desc: true }]);
    setSearch('');
    setPage(1);
  }, []);

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
    setPage(1);
  }, []);

  const emptyMessage = selectedGroupTag
    ? `${selectedGroupTag} 그룹에 해당하는 연락처가 없습니다.`
    : deferredSearch.trim() || activeFilters.length > 0
      ? '조건에 맞는 연락처가 없습니다.'
      : '등록된 연락처가 없습니다.';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">연락처</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
          {selectedGroupTag && (
            <Badge>{selectedGroupTag}</Badge>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        <div className="grid min-h-[720px] grid-cols-[260px_minmax(0,1fr)]">
          <ContactGroupSidebar
            selectedGroupTag={selectedGroupTag}
            onSelectGroup={(tag) => {
              setSelectedGroupTag(tag);
              setPage(1);
            }}
            totalCount={totalCountQuery.data?.pagination?.total}
            groupCounts={groupCounts}
          />

          <div className="flex min-w-0 flex-col">
            <ViewBar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              searchPlaceholder="이름, 전화번호, 이메일 검색..."
              filterDefinitions={filterDefinitions}
              activeFilters={activeFilters}
              onFilterAdd={handleFilterAdd}
              onFilterRemove={handleFilterRemove}
              onFiltersReset={handleFiltersReset}
              sortDefinitions={sortDefinitions}
              activeSorts={activeSorts}
              onSortAdd={handleSortAdd}
              onSortRemove={() => {
                setActiveSorts([]);
                setSorting([]);
                setPage(1);
              }}
              actions={(
                <Button size="sm" asChild>
                  <Link to="/contacts/new">
                    <Plus className="size-4" />
                    연락처 추가
                  </Link>
                </Button>
              )}
            />

            <div className="border-t border-border/50" />

            <DataTable
              columns={columns}
              data={data?.items ?? []}
              totalCount={data?.pagination?.total ?? 0}
              pageCount={data?.pagination?.totalPages ?? 1}
              page={page}
              onPageChange={setPage}
              pageSize={20}
              sorting={sorting}
              onSortingChange={(nextSorting) => {
                setSorting(nextSorting);
                if (nextSorting.length === 0) {
                  setActiveSorts([]);
                  return;
                }

                const next = nextSorting[0];
                setActiveSorts([
                  {
                    field: next.id,
                    label: sortDefinitions.find((definition) => definition.field === next.id)?.label ?? next.id,
                    direction: next.desc ? 'desc' : 'asc',
                  },
                ]);
                setPage(1);
              }}
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              onRowClick={(contact) => {
                navigate({
                  to: '/contacts/$id',
                  params: { id: contact.id },
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactGroupSidebar({
  selectedGroupTag,
  onSelectGroup,
  totalCount,
  groupCounts,
}: {
  selectedGroupTag: string | null;
  onSelectGroup: (tag: string | null) => void;
  totalCount?: number;
  groupCounts: Record<string, number | undefined>;
}) {
  return (
    <aside className="border-r border-border/60 bg-muted/10">
      <div className="flex h-full flex-col">
        <div className="border-b border-border/60 px-4 py-4">
          <p className="text-sm font-semibold">연락처 그룹</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            고정 카테고리로 빠르게 연락처를 분류하고 조회합니다.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-3">
            <SidebarItem
              label="전체 연락처"
              description="그룹 필터 없이 전체 목록"
              count={totalCount}
              selected={selectedGroupTag === null}
              onClick={() => onSelectGroup(null)}
              icon={Users}
            />

            {CONTACT_GROUPS.map((group) => (
              <SidebarItem
                key={group.id}
                label={group.label}
                description={group.description}
                count={groupCounts[group.tag]}
                selected={selectedGroupTag === group.tag}
                onClick={() => onSelectGroup(group.tag)}
                icon={contactGroupIcons[group.tag] ?? Target}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

function SidebarItem({
  label,
  description,
  count,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string;
  description: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/6'
          : 'border-transparent bg-background/70 hover:bg-accent/60',
      )}
    >
      <div className={cn(
        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
        selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {count ?? '-'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </button>
  );
}

function TagPreview({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const groupTags = CONTACT_GROUPS
    .map((group) => group.tag)
    .filter((tag) => tags.includes(tag));
  const customTags = tags.filter((tag) => !CONTACT_GROUP_TAGS.includes(tag));
  const visibleTags = [...groupTags, ...customTags].slice(0, 3);
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {visibleTags.map((tag) => (
        <Badge
          key={tag}
          variant={CONTACT_GROUP_TAGS.includes(tag) ? 'default' : 'secondary'}
          className="max-w-[84px] truncate px-2 py-0"
        >
          {tag}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <span className="text-xs text-muted-foreground">+{hiddenCount}</span>
      )}
    </div>
  );
}

function ConnectionSummary({
  propertyCount,
  buyerReqCount,
  consultationCount,
}: {
  propertyCount: number;
  buyerReqCount: number;
  consultationCount: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Building2 className="size-3.5" />
        {propertyCount}
      </span>
      <span className="inline-flex items-center gap-1">
        <Target className="size-3.5" />
        {buyerReqCount}
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageSquare className="size-3.5" />
        {consultationCount}
      </span>
    </div>
  );
}
