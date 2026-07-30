import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Phone,
  Plus,
  Tags,
  Target,
  UserRound,
} from 'lucide-react';
import { TRANSACTION_TYPE_LABELS, type TransactionType } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import {
  CONTACT_GROUP_TAGS,
  isContactTagVisible,
  splitContactTags,
} from '@/lib/contacts';
import { EmptyState, StatusBadge } from '@/components/domain';
import { formatAreaRange, formatBudget } from '../buyer-requirements/-buyer-utils';
import { ContactGroupChips } from './-group-chips';
import { ContactQuickSheet } from './-quick-sheet';
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
/** 디자인 시안 기준 단일 행 높이(40px) — 고정 높이라 50행 이상에서 가상화가 동작한다. */
const CONTACT_ROW_HEIGHT = 40;

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  /** 상단 그룹 칩 선택 (null = 전체 연락처). ViewBar 필터와 AND로 결합된다. */
  const [selectedGroupTag, setSelectedGroupTag] = useState<string | null>(null);
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'updatedAt', label: '최근 수정', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);
  /** 희망 칩 클릭으로 펼친 행(연락처 id) 집합 — 행 아래에 구매 희망조건 패널 표시 */
  const [expandedBuyerReqIds, setExpandedBuyerReqIds] = useState<ReadonlySet<string>>(new Set());
  const viewBarRef = useRef<HTMLDivElement | null>(null);

  const toggleBuyerReqExpanded = useCallback((contactId: string) => {
    setExpandedBuyerReqIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }, []);

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

  // 디자인 시안 컬럼 순서: 이름(고정) → 구분 → 전화 → 희망 → 물건 → 최근 상담 → 수정일.
  // '담당' 컬럼과 희망조건/연결물건 인라인 펼침 패널은 GET /contacts 응답에
  // 해당 projection이 없어 생략 — 상세는 행 클릭 시 ContactQuickSheet에서 확인.
  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <ContactHeaderLabel icon={<UserRound className="size-3.5" />} label="이름" />,
        size: 160,
        enableSorting: true,
        cell: ({ row }) => <ContactNameCell contact={row.original} />,
      },
      {
        accessorKey: 'tags',
        header: () => <ContactHeaderLabel icon={<Tags className="size-3.5" />} label="구분" />,
        size: 104,
        enableSorting: false,
        cell: ({ row }) => <GroupTagCell tags={row.original.tags} />,
      },
      {
        accessorKey: 'phone',
        header: () => <ContactHeaderLabel icon={<Phone className="size-3.5" />} label="전화번호" />,
        size: 150,
        cell: ({ row }) => <PhoneLineCell contact={row.original} />,
      },
      {
        accessorKey: 'buyerRequirements',
        header: () => <ContactHeaderLabel icon={<Target className="size-3.5" />} label="희망" />,
        size: 72,
        enableSorting: false,
        cell: ({ row }) => (
          <BuyerReqToggleChip
            count={row.original._count?.buyerRequirements ?? 0}
            expanded={expandedBuyerReqIds.has(row.original.id)}
            onToggle={() => toggleBuyerReqExpanded(row.original.id)}
          />
        ),
      },
      {
        accessorKey: 'propertyContacts',
        header: () => <ContactHeaderLabel icon={<Building2 className="size-3.5" />} label="물건" />,
        size: 72,
        enableSorting: false,
        cell: ({ row }) => (
          <CountChip
            icon={<Building2 className="size-3" />}
            count={row.original._count?.propertyContacts ?? 0}
            title="연결 물건"
          />
        ),
      },
      {
        accessorKey: 'latestConsultation',
        header: () => <ContactHeaderLabel icon={<FileText className="size-3.5" />} label="최근 상담" />,
        size: 340,
        enableSorting: false,
        cell: ({ row }) => <LatestConsultationCell contact={row.original} />,
      },
      {
        accessorKey: 'updatedAt',
        header: () => <ContactHeaderLabel icon={<CalendarDays className="size-3.5" />} label="수정일" />,
        size: 92,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.updatedAt} relative />,
      },
    ],
    [expandedBuyerReqIds, toggleBuyerReqExpanded],
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
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col bg-white">
      {/* 디자인 시안 헤더 — 그룹 필터 칩 + 우측 연락처 추가 (그룹 카운트 포함) */}
      <section className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-6 py-3">
        <ContactGroupChips selectedGroupTag={selectedGroupTag} onSelect={setSelectedGroupTag} />

        <div className="flex-1" />

        <Button size="sm" asChild className="shrink-0 px-3.5">
          <Link to="/contacts/new">
            <Plus className="size-3.5" />
            연락처 추가
          </Link>
        </Button>
      </section>

      {/* 검색·필터·정렬 ViewBar */}
      <section ref={viewBarRef} className="border-b border-slate-200 bg-white px-3 py-0">
        <ViewBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
          }}
          searchPlaceholder="이름, 전화번호 검색..."
          searchAlwaysVisible
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

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
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
            rowHeight={CONTACT_ROW_HEIGHT}
            pinnedColumns={['name']}
            isLoading={isLoading}
            isLoadingMore={isFetchingNextPage}
            onEndReached={handleEndReached}
            emptyMessage={emptyMessage}
            renderStatusBar={() => (
              <span>
                연락처 {contacts.length.toLocaleString()} / {totalContacts.toLocaleString()}건 표시
                {activeSorts[0] ? ` · ${activeSorts[0].label}순` : ''}
                {hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
              </span>
            )}
            onRowClick={(contact) => {
              setSelectedContactId(contact.id);
            }}
            expandedRowIds={expandedBuyerReqIds}
            renderExpandedRow={(contact) => <BuyerReqExpandedPanel contact={contact} />}
          />
        )}
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
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ContactNameCell({ contact }: { contact: Contact }) {
  // 행 클릭 → ContactQuickSheet 일관성 유지를 위해 이름 셀에 별도 링크 두지 않음.
  return (
    <span className="block min-w-0 truncate text-[13px] font-semibold text-foreground">
      {contact.name}
    </span>
  );
}

/** 고정 그룹 태그 — 대표 그룹 1개 + 추가 개수 축약 (디자인 시안 '구분' 칩) */
function GroupTagCell({ tags }: { tags: string[] }) {
  const { groupTags } = splitContactTags(tags);

  if (groupTags.length === 0) {
    return <span className="text-[12px] text-muted-foreground/60">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="inline-flex h-[22px] max-w-full items-center truncate rounded-md bg-[#e7f3f8] px-2 text-[11.5px] font-medium text-[#337ea9]">
        {groupTags[0]}
      </span>
      {groupTags.length > 1 && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          +{groupTags.length - 1}
        </span>
      )}
    </div>
  );
}

/** 대표 전화 1줄 + 나머지 개수 "+N" 배지 (title로 전체 번호 노출) */
function PhoneLineCell({ contact }: { contact: Contact }) {
  const phones = collectContactPhoneStrings(contact);

  if (phones.length === 0) {
    return <span className="text-[12px] text-muted-foreground/60">—</span>;
  }

  const [primary, ...rest] = phones;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[12.5px] tabular-nums text-foreground">
        {formatPhone(primary)}
      </span>
      {rest.length > 0 && (
        <span
          title={rest.map((phone) => formatPhone(phone)).join(', ')}
          className="inline-flex h-4 shrink-0 cursor-default items-center rounded-full bg-[#f1f1ef] px-1.5 text-[9.5px] font-bold text-muted-foreground"
        >
          +{rest.length}
        </span>
      )}
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

/** 희망 칩 — 클릭 시 행 아래로 구매 희망조건 패널을 펼친다 (0건이면 "—") */
function BuyerReqToggleChip({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (count === 0) {
    return <span className="text-[12px] text-muted-foreground/60">—</span>;
  }

  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      title="매수 희망조건 펼치기"
      aria-expanded={expanded}
      onClick={(event) => {
        // 행 클릭(QuickSheet 열기)과 분리
        event.stopPropagation();
        onToggle();
      }}
      className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold tabular-nums transition-colors ${
        expanded
          ? 'border-foreground/30 bg-foreground text-background'
          : 'border-border bg-muted/60 text-foreground/80 hover:bg-muted'
      }`}
    >
      <Target className="size-3" />
      {count}
      <Chevron className="size-3" />
    </button>
  );
}

/** 희망 펼침 패널 — 해당 연락처의 구매 희망조건을 행 아래에 인라인 표시 */
function BuyerReqExpandedPanel({ contact }: { contact: Contact }) {
  const PANEL_LIMIT = 20;
  // limit 초과분은 '더 보기'로 패널 안에서 직접 로드 (조용한 누락 방지)
  const [limit, setLimit] = useState(PANEL_LIMIT);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contact-buyer-requirements', contact.id, limit],
    queryFn: () => api.buyerRequirements.findAll({ contactId: contact.id, limit }),
    placeholderData: (previous) => previous,
  });
  const items = data?.items ?? [];
  const total = data?.pagination?.total ?? items.length;
  const hiddenCount = Math.max(0, total - items.length);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-3 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        희망조건 불러오는 중...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-6 py-3 text-[12px] text-destructive">희망조건을 불러오지 못했습니다.</div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="px-6 py-3 text-[12px] text-muted-foreground">등록된 희망조건이 없습니다.</div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-6 py-2.5">
      {items.map((req) => {
        const txLabel = req.transactionType
          ? (TRANSACTION_TYPE_LABELS[req.transactionType as TransactionType] ?? req.transactionType)
          : null;
        // 구매고객 페이지와 동일 헬퍼 재사용 — 표기 일관성 유지
        const budget = formatBudget(req);
        const area =
          req.areaMin != null || req.areaMax != null
            ? formatAreaRange(req.areaMin, req.areaMax)
            : null;

        return (
          <Link
            key={req.id}
            to="/buyer-requirements/$id"
            params={{ id: req.id }}
            className="flex min-w-0 items-center gap-2 rounded-[8px] border border-border bg-white px-3 py-1.5 transition-colors hover:bg-muted/40"
          >
            <StatusBadge kind="buyerUrgency" status={req.urgency} size="sm" />
            {txLabel && <span className="shrink-0 text-[12px] font-semibold">{txLabel}</span>}
            {budget !== '—' && (
              <span className="shrink-0 text-[12px] tabular-nums text-foreground/80">{budget}</span>
            )}
            {area && (
              <span className="shrink-0 text-[11.5px] text-muted-foreground">{area}</span>
            )}
            {req.mustConditions.length > 0 && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                필수: {req.mustConditions.join(', ')}
              </span>
            )}
            <span className="flex-1" />
            {req.assignedTo && (
              <span className="shrink-0 text-[11px] text-muted-foreground/70">
                담당 {req.assignedTo.name}
              </span>
            )}
            <StatusBadge kind="buyerStatus" status={req.status} size="sm" />
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
          </Link>
        );
      })}
      {/* limit 초과분은 조용히 숨기지 않고 패널 안에서 이어서 로드 */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setLimit(total)}
          className="flex items-center justify-center gap-1 rounded-[8px] border border-dashed border-border px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted/40"
        >
          외 {hiddenCount}건 더 보기
          <ChevronDown className="size-3" />
        </button>
      )}
    </div>
  );
}

/** 희망조건/연결물건 카운트 칩 — 0건이면 "—" (디자인 시안의 확장 칩을 카운트 표기로 대체) */
function CountChip({ icon, count, title }: { icon: ReactNode; count: number; title: string }) {
  if (count === 0) {
    return <span className="text-[12px] text-muted-foreground/60">—</span>;
  }

  return (
    <span
      title={title}
      className="inline-flex h-5 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-[11px] font-semibold tabular-nums text-foreground/80"
    >
      {icon}
      {count}
    </span>
  );
}

/** 최근 상담 — 날짜 + 내용 1줄 요약 (디자인 시안 lastTxt) */
function LatestConsultationCell({ contact }: { contact: Contact }) {
  const consultation = contact.latestConsultation;

  if (!consultation) {
    return <span className="text-[12px] text-muted-foreground/60">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
        {formatDateShort(consultation.createdAt)}
      </span>
      <span className="truncate text-[12px] text-foreground/80">
        {consultation.content}
      </span>
    </div>
  );
}
