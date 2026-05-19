import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { Contact } from '@estate-erp/api-client';
import {
  Building2,
  CalendarDays,
  FileText,
  Phone,
  Plus,
  Target,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  CONTACT_GROUP_TAGS,
  formatPhoneNumber,
  isContactTagVisible,
} from '@/lib/contacts';
import { cn } from '@/lib/utils';
import {
  DataTable,
  DateCell,
  ViewBar,
  type ActiveFilter,
  type FilterDefinition,
  type SortDefinition,
} from '@/components/data-table';
import { Button } from '@/components/ui/button';

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

const CONTACTS_PAGE_SIZE = 50;

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'updatedAt', label: '최근 수정', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);

  const apiParams = useMemo(() => {
    const customTagFilters = activeFilters
      .filter((filter) => filter.field === 'tags')
      .map((filter) => filter.value);

    const tags = Array.from(new Set(customTagFilters));

    return {
      search: deferredSearch.trim() || undefined,
      tags: tags.length > 0 ? tags.join(',') : undefined,
      hasPropertyContact: activeFilters.some((filter) => filter.field === 'hasPropertyContact') || undefined,
      hasBuyerReq: activeFilters.some((filter) => filter.field === 'hasBuyerReq') || undefined,
      sortBy: activeSorts[0]?.field as 'name' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
  }, [activeFilters, activeSorts, deferredSearch]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['contacts', 'infinite', apiParams],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.contacts.findAll({
        ...apiParams,
        page: pageParam,
        limit: CONTACTS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const contacts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages]);
  const totalContacts = data?.pages[0]?.pagination.total ?? 0;

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const uniqueCustomTags = Array.from(new Set([
      ...contacts
        .flatMap((contact) => contact.tags)
        .filter((tag) => !CONTACT_GROUP_TAGS.includes(tag) && isContactTagVisible(tag)),
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
  }, [activeFilters, contacts]);

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <ContactHeaderLabel icon={<UserRound className="size-4" />} label="이름" />,
        size: 220,
        enableSorting: true,
        cell: ({ row }) => <ContactNameCell contact={row.original} />,
      },
      {
        accessorKey: 'phone',
        header: () => <ContactHeaderLabel icon={<Phone className="size-4" />} label="전화번호" />,
        size: 180,
        cell: ({ row }) => <PhoneStack contact={row.original} />,
      },
      {
        accessorKey: 'connections',
        header: () => <ContactHeaderLabel icon={<Building2 className="size-4" />} label="연결" />,
        size: 180,
        enableSorting: false,
        cell: ({ row }) => (
          <ConnectionSummary
            propertyCount={row.original._count?.propertyContacts ?? 0}
            buyerReqCount={row.original._count?.buyerRequirements ?? 0}
          />
        ),
      },
      {
        accessorKey: 'latestConsultation',
        header: () => <ContactHeaderLabel icon={<FileText className="size-4" />} label="최근 상담" />,
        size: 420,
        enableSorting: false,
        cell: ({ row }) => <LatestConsultationCell contact={row.original} />,
      },
      {
        accessorKey: 'updatedAt',
        header: () => <ContactHeaderLabel icon={<CalendarDays className="size-4" />} label="수정일" />,
        size: 100,
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
  }, []);

  const handleFilterRemove = useCallback((filterId: string) => {
    setActiveFilters((previous) => previous.filter((filter) => filter.id !== filterId));
  }, []);

  const handleFiltersReset = useCallback(() => {
    setActiveFilters([]);
    setActiveSorts([{ field: 'updatedAt', label: '최근 수정', direction: 'desc' }]);
    setSorting([{ id: 'updatedAt', desc: true }]);
    setSearch('');
  }, []);

  const handleSortAdd = useCallback((sort: SortDefinition) => {
    setActiveSorts([sort]);
    setSorting([{ id: sort.field, desc: sort.direction === 'desc' }]);
  }, []);

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const emptyMessage = deferredSearch.trim() || activeFilters.length > 0
      ? '조건에 맞는 연락처가 없습니다.'
      : '등록된 연락처가 없습니다.';

  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-0 flex-col bg-white">
      <section className="border-b border-slate-200 bg-white px-3 py-0">
        <ViewBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
          }}
          searchPlaceholder="이름, 전화번호 검색..."
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
          }}
          actions={(
            <Button size="sm" asChild className="h-7 gap-1.5 px-2.5 text-xs">
              <Link to="/contacts/new">
                <Plus className="size-3.5" />
                연락처 추가
              </Link>
            </Button>
          )}
        />
      </section>

      <section className="flex min-h-0 flex-1 bg-white px-6 py-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <DataTable
            columns={columns}
            data={contacts}
            totalCount={totalContacts}
            pageSize={CONTACTS_PAGE_SIZE}
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
            }}
            layout="full-height"
            variant="notion"
            rowHeight="auto"
            isLoading={isLoading}
            isLoadingMore={isFetchingNextPage}
            onEndReached={handleEndReached}
            emptyMessage={emptyMessage}
            renderStatusBar={() => (
              <span>
                연락처 {contacts.length.toLocaleString()} / {totalContacts.toLocaleString()}건 표시
                {hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
              </span>
            )}
            onRowClick={(contact) => {
              navigate({
                to: '/contacts/$id',
                params: { id: contact.id },
              });
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ContactHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-500">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ContactNameCell({ contact }: { contact: Contact }) {
  return (
    <Link
      to="/contacts/$id"
      params={{ id: contact.id }}
      className="block min-w-0 text-[13px] font-medium text-slate-900 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="block truncate">{contact.name}</span>
    </Link>
  );
}

function PhoneStack({ contact }: { contact: Contact }) {
  const phones = contact.phones?.length
    ? contact.phones.map((item) => item.phone)
    : [contact.phone].filter(Boolean);

  if (phones.length === 0) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      {phones.map((phone, index) => (
        <span
          key={`${phone}-${index}`}
          className={cn(
            'truncate text-[13px] tabular-nums',
            index === 0 ? 'font-medium text-slate-800' : 'text-slate-500',
          )}
        >
          {formatPhoneNumber(phone)}
        </span>
      ))}
    </div>
  );
}

function LatestConsultationCell({ contact }: { contact: Contact }) {
  const consultation = contact.latestConsultation;

  if (!consultation) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span className="text-[11px] text-slate-400">
        {formatContactDateShort(consultation.createdAt)}
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug text-slate-700">
        {consultation.content}
      </span>
    </div>
  );
}

function formatContactDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function ConnectionSummary({
  propertyCount,
  buyerReqCount,
}: {
  propertyCount: number;
  buyerReqCount: number;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 py-1">
      <ConnectionPill icon={<Building2 className="size-3" />} label="매물" count={propertyCount} />
      <ConnectionPill icon={<Target className="size-3" />} label="요건" count={buyerReqCount} />
    </div>
  );
}

function ConnectionPill({ icon, label, count }: { icon: ReactNode; label: string; count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] leading-5',
        count > 0 ? 'bg-[#f1f1ef] text-[#5f5e5b]' : 'bg-transparent text-slate-400',
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
