import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { Contact } from '@estate-erp/api-client';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  FileText,
  Phone,
  Plus,
  Tags,
  Target,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import {
  CONTACT_GROUP_TAGS,
  isContactTagVisible,
  splitContactTags,
} from '@/lib/contacts';
import { EmptyState } from '@/components/domain';
import { ContactGroupSidebar } from './-group-sidebar';
import { ContactQuickSheet } from './-quick-sheet';
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
import { formatDateShort } from '@/components/quick-sheet';

/**
 * boolean 타입은 ViewBar fallback에서 빈 칩으로 렌더되어 사용자에게 모호함.
 * select 타입 + 단일 옵션("있음")으로 변환해 칩에 "매물 연결: 있음"이 분명히 노출되도록 함.
 * apiParams의 `activeFilters.some(f => f.field === 'hasPropertyContact')` 매칭은 그대로 동작.
 * '최근 상담 있음' 필터(PRD 7장)는 서버 GET /contacts에 파라미터가 없어 의도적으로 생략.
 */
const baseFilterDefinitions: FilterDefinition[] = [
  {
    id: 'hasPropertyContact',
    field: 'hasPropertyContact',
    label: '매물 연결',
    type: 'select',
    operators: ['is'],
    options: [{ label: '있음', value: 'true' }],
  },
  {
    id: 'hasBuyerReq',
    field: 'hasBuyerReq',
    label: '매수요건',
    type: 'select',
    operators: ['is'],
    options: [{ label: '있음', value: 'true' }],
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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  /** 좌측 그룹 사이드바 선택 (null = 전체 연락처). ViewBar 필터와 AND로 결합된다. */
  const [selectedGroupTag, setSelectedGroupTag] = useState<string | null>(null);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'updatedAt', label: '최근 수정', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);
  const viewBarRef = useRef<HTMLDivElement | null>(null);

  // PRD 13장 키보드 단축키 — Cmd/Ctrl+F: 검색 포커스 (Cmd/Ctrl+N은 브라우저 예약 키라 미지원)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'f' || event.key === 'F') {
        const input = viewBarRef.current?.querySelector('input');
        if (input) {
          event.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      search: deferredSearch.trim() || undefined,
      tags: tags.length > 0 ? tags.join(',') : undefined,
      hasPropertyContact: activeFilters.some((filter) => filter.field === 'hasPropertyContact') || undefined,
      hasBuyerReq: activeFilters.some((filter) => filter.field === 'hasBuyerReq') || undefined,
      sortBy: activeSorts[0]?.field as 'name' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
  }, [activeFilters, activeSorts, deferredSearch, selectedGroupTag]);

  const {
    data,
    isLoading,
    isError,
    refetch,
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
        accessorKey: 'tags',
        header: () => <ContactHeaderLabel icon={<Tags className="size-4" />} label="그룹" />,
        size: 130,
        enableSorting: false,
        cell: ({ row }) => <GroupTagCell tags={row.original.tags} />,
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

  const emptyMessage = deferredSearch.trim() || activeFilters.length > 0 || selectedGroupTag
      ? '조건에 맞는 연락처가 없습니다.'
      : '등록된 연락처가 없습니다.';

  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-0 flex-col bg-white">
      {/* 페이지 타이틀 + 우측 액션 */}
      <section className="border-b border-border bg-white px-8 pb-3 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-slate-950">
              연락처
            </h1>
            <span className="text-[12px] tabular-nums text-slate-500">
              {totalContacts.toLocaleString()}명
            </span>
            {selectedGroupTag && (
              <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium text-[#337ea9]">
                {selectedGroupTag}
              </span>
            )}
          </div>

          <Button size="sm" asChild className="shrink-0 px-3.5">
            <Link to="/contacts/new">
              <Plus className="size-3.5" />
              연락처 추가
            </Link>
          </Button>
        </div>
      </section>

      {/* 검색·필터·정렬 ViewBar */}
      <section ref={viewBarRef} className="border-b border-slate-200 bg-white px-3 py-0">
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
        />
      </section>

      <section className="flex min-h-0 flex-1 bg-white py-0">
        {/* PRD 5장 — 좌측 고정 그룹 사이드바 (전체 연락처 + 고정 그룹 5종 + 그룹별 개수) */}
        <ContactGroupSidebar selectedGroupTag={selectedGroupTag} onSelect={setSelectedGroupTag} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-6">
          {isError ? (
            <EmptyState
              icon={AlertCircle}
              title="연락처 목록을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도하세요."
              className="flex-1"
              action={
                <Button variant="outline" onClick={() => void refetch()}>
                  다시 시도
                </Button>
              }
            />
          ) : (
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
              setSelectedContactId(contact.id);
            }}
          />
          )}
        </div>
      </section>

      <ContactQuickSheet
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onNavigateToDetail={(id) => {
          setSelectedContactId(null);
          void navigate({ to: '/contacts/$id', params: { id } });
        }}
      />
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
  // 행 클릭 → ContactQuickSheet 일관성 유지를 위해 이름 셀에 별도 링크 두지 않음.
  return (
    <span className="block min-w-0 truncate text-[13px] font-medium text-slate-900">
      {contact.name}
    </span>
  );
}

/** 고정 그룹 태그 — 대표 그룹 1개 + 추가 개수 축약 (PRD 5장 목록 컬럼) */
function GroupTagCell({ tags }: { tags: string[] }) {
  const { groupTags } = splitContactTags(tags);

  if (groupTags.length === 0) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1 py-1">
      <span className="truncate rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium text-[#337ea9]">
        {groupTags[0]}
      </span>
      {groupTags.length > 1 && (
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          +{groupTags.length - 1}
        </span>
      )}
    </div>
  );
}

function PhoneStack({ contact }: { contact: Contact }) {
  const phones = collectContactPhoneStrings(contact);

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
          {formatPhone(phone)}
        </span>
      ))}
    </div>
  );
}

/**
 * Contact의 phones[]에서 primary 우선 정렬해 표시용 전화번호 배열을 반환.
 * phones가 비어있으면 legacy contact.phone로 폴백.
 */
function collectContactPhoneStrings(contact: Contact): string[] {
  const fromPhones = (contact.phones ?? [])
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((phone) => phone.phone)
    .filter((phone): phone is string => Boolean(phone));

  if (fromPhones.length > 0) return fromPhones;

  return contact.phone ? [contact.phone] : [];
}

function LatestConsultationCell({ contact }: { contact: Contact }) {
  const consultation = contact.latestConsultation;

  if (!consultation) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span className="text-[11px] text-slate-400">
        {formatDateShort(consultation.createdAt)}
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug text-slate-700">
        {consultation.content}
      </span>
    </div>
  );
}

function ConnectionSummary({
  propertyCount,
  buyerReqCount,
}: {
  propertyCount: number;
  buyerReqCount: number;
}) {
  // 둘 다 0이면 properties의 AdIndicator "미등록" 패턴처럼 단일 회색 칩으로 노이즈 최소화.
  // 소유물건 대표 물건명 컬럼(PRD 5장)은 GET /contacts에 ownedProperties projection이 없어 카운트 칩으로 대체.
  if (propertyCount === 0 && buyerReqCount === 0) {
    return (
      <span className="inline-flex max-w-full rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[12px] font-medium leading-5 text-[#9b9a97]">
        연결 없음
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 py-1">
      {propertyCount > 0 && (
        <ConnectionPill icon={<Building2 className="size-3" />} label="매물" count={propertyCount} />
      )}
      {buyerReqCount > 0 && (
        <ConnectionPill icon={<Target className="size-3" />} label="요건" count={buyerReqCount} />
      )}
    </div>
  );
}

function ConnectionPill({ icon, label, count }: { icon: ReactNode; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[12px] leading-5 text-[#5f5e5b]">
      {icon}
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
