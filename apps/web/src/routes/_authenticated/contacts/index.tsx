import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  BuyerRequirement,
  Contact,
  ContactDetail,
  ContactRelation,
  Consultation,
  PropertyContact,
} from '@estate-erp/api-client';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import {
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Mail,
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
  splitContactTags,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SheetSection,
  SheetEmptyState,
  SheetNoticeRow,
  formatDateShort,
  formatDateTime,
  getDaysSince,
  getDaysUntil,
  type QuickSheetNotice,
} from '@/components/quick-sheet';

/**
 * boolean 타입은 ViewBar fallback에서 빈 칩으로 렌더되어 사용자에게 모호함.
 * select 타입 + 단일 옵션("있음")으로 변환해 칩에 "매물 연결: 있음"이 분명히 노출되도록 함.
 * apiParams의 `activeFilters.some(f => f.field === 'hasPropertyContact')` 매칭은 그대로 동작.
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
              setSelectedContactId(contact.id);
            }}
          />
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
          {formatPhoneNumber(phone)}
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

// ── ContactQuickSheet ───────────────────────────────────────────
// 매물 페이지의 PropertyQuickSheet와 같은 모양으로 연락처 빠른 확인을 제공.

const buyerStatusLabels: Record<string, string> = {
  active: '활성',
  matched: '매칭됨',
  completed: '완료',
  inactive: '비활성',
};

const buyerStatusMeta: Record<string, string> = {
  active: 'bg-[#eef3ed] text-[#44745a]',
  matched: 'bg-[#e7f3f8] text-[#337ea9]',
  completed: 'bg-[#f1f1ef] text-[#5f5e5b]',
  inactive: 'bg-[#f1f1ef] text-[#9b9a97]',
};

const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

const urgencyMeta: Record<string, string> = {
  urgent: 'bg-[#fbe4e4] text-[#9f5555]',
  normal: 'bg-[#f1f1ef] text-[#5f5e5b]',
  flexible: 'bg-[#e7f3f8] text-[#337ea9]',
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

const propertyRoleLabels: Record<string, string> = {
  owner: '소유주',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

const relationTypeLabels: Record<string, string> = {
  parent: '부모',
  spouse: '배우자',
  child: '자녀',
  sibling: '형제자매',
  lawyer: '법무사',
  tax_agent: '세무사',
  other: '기타',
};

function ContactQuickSheet({
  contactId,
  onClose,
  onNavigateToDetail,
}: {
  contactId: string | null;
  onClose: () => void;
  onNavigateToDetail: (id: string) => void;
}) {
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', 'quick-sheet', contactId],
    queryFn: () => api.contacts.findOne(contactId as string),
    enabled: Boolean(contactId),
  });

  return (
    <Sheet open={Boolean(contactId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="!w-full !max-w-full !gap-0 overflow-hidden p-0 sm:!max-w-[720px]"
      >
        {contactId && isLoading && <ContactSheetSkeleton />}
        {contactId && !isLoading && contact && (
          <ContactSheetContent contact={contact} onNavigateToDetail={onNavigateToDetail} />
        )}
        {contactId && !isLoading && !contact && (
          <div className="flex h-full flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>연락처를 찾을 수 없습니다</SheetTitle>
              <SheetDescription>요청한 연락처가 존재하지 않습니다.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              연락처를 찾을 수 없습니다.
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactSheetSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="sr-only">
        <SheetTitle>연락처 빠른 확인</SheetTitle>
        <SheetDescription>연락처 정보를 불러오는 중입니다.</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 border-b px-6 py-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="space-y-5 p-6">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

function ContactSheetContent({
  contact,
  onNavigateToDetail,
}: {
  contact: ContactDetail;
  onNavigateToDetail: (id: string) => void;
}) {
  const phones = useMemo(() => collectContactPhones(contact), [contact]);
  const primaryPhone = phones[0]?.phone ?? null;
  const { groupTags, customTags } = useMemo(
    () => splitContactTags(contact.tags ?? []),
    [contact.tags],
  );
  const propertyContacts = contact.propertyContacts ?? [];
  const buyerRequirements = contact.buyerRequirements ?? [];
  const consultations = contact.consultations ?? [];
  const relationships = useMemo(() => mergeContactRelationships(contact), [contact]);
  const notices = useMemo(() => getContactSheetNotices(contact), [contact]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SheetHeader className="space-y-5 border-b border-border px-8 pb-6 pt-5">
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            빠른 확인
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => onNavigateToDetail(contact.id)}
          >
            전체 페이지로 열기
            <ExternalLink className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-3">
          <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
            <span>{contact.name}</span>
          </SheetTitle>

          {(groupTags.length > 0 || customTags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {groupTags.map((tag) => (
                <span
                  key={`group-${tag}`}
                  className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium text-[#337ea9]"
                >
                  {tag}
                </span>
              ))}
              {customTags.map((tag) => (
                <span
                  key={`tag-${tag}`}
                  className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {phones.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="size-3.5 shrink-0" />
                {formatPhoneNumber(primaryPhone)}
                {phones.length > 1 && (
                  <span className="text-slate-400">· 외 {phones.length - 1}건</span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Phone className="size-3.5" />
                전화번호 없음
              </span>
            )}
            {contact.email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              등록 {formatDateShort(contact.createdAt)}
            </span>
          </SheetDescription>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/*
            properties 패턴(소유주 전화 / 상담 기록 2슬롯)에 맞춘 액션 행.
            전화는 항상 노출(없으면 disabled), 메일은 있을 때만 노출.
            "상세 페이지" 버튼은 우상단 "전체 페이지로 열기"와 중복이라 생략.
          */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            disabled={!primaryPhone}
            asChild={Boolean(primaryPhone)}
          >
            {primaryPhone ? (
              <a href={`tel:${primaryPhone}`}>
                <Phone className="size-3.5" />
                {contact.name} 전화
              </a>
            ) : (
              <span>
                <Phone className="size-3.5" />
                전화번호 없음
              </span>
            )}
          </Button>
          {contact.email && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[13px] font-medium"
              asChild
            >
              <a href={`mailto:${contact.email}`}>
                <Mail className="size-3.5" />
                메일 보내기
              </a>
            </Button>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <SheetSection title="지금 확인할 것">
          {notices.length > 0 ? (
            <div className="space-y-2">
              {notices.map((notice) => (
                <SheetNoticeRow key={`${notice.title}-${notice.detail}`} notice={notice} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="즉시 확인할 운영 이슈가 없습니다." compact />
          )}
        </SheetSection>

        {phones.length > 1 && (
          <SheetSection title={`전화번호 ${phones.length}`}>
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {phones.map((phone, index) => (
                <ContactSheetPhoneRow
                  key={phone.key}
                  phone={phone}
                  isFirst={index === 0}
                />
              ))}
            </div>
          </SheetSection>
        )}

        <SheetSection title={`연결 매물 ${propertyContacts.length}`}>
          {propertyContacts.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {propertyContacts.map((propertyContact) => (
                <ContactSheetPropertyRow
                  key={propertyContact.id}
                  propertyContact={propertyContact}
                />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="연결된 매물이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`매수요건 ${buyerRequirements.length}`}>
          {buyerRequirements.length > 0 ? (
            <div className="grid gap-2">
              {buyerRequirements.map((requirement) => (
                <ContactSheetBuyerReqCard key={requirement.id} requirement={requirement} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="등록된 매수요건이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`최근 상담 ${consultations.length}`}>
          {consultations.length > 0 ? (
            <div className="space-y-2">
              {consultations.slice(0, 3).map((consultation) => (
                <ContactSheetConsultationRow
                  key={consultation.id}
                  consultation={consultation}
                />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="상담 기록이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`관계 ${relationships.length}`}>
          {relationships.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {relationships.map((item) => (
                <ContactSheetRelationRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="등록된 관계가 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title="메모">
          {contact.memo?.trim() ? (
            <div className="rounded-md border border-[#eeeeec] bg-slate-50/60 p-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {contact.memo.trim()}
              </p>
            </div>
          ) : (
            <SheetEmptyState text="작성된 메모가 없습니다." compact />
          )}
        </SheetSection>
      </div>
    </div>
  );
}

interface SheetPhone {
  key: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

function collectContactPhones(contact: ContactDetail): SheetPhone[] {
  const fromPhones = (contact.phones ?? [])
    .filter((phone) => phone.phone)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((phone) => ({
      key: phone.id,
      phone: phone.phone,
      label: phone.label || null,
      isPrimary: phone.isPrimary,
    }));

  if (fromPhones.length > 0) return fromPhones;
  if (contact.phone) {
    return [
      {
        key: `legacy-${contact.id}`,
        phone: contact.phone,
        label: null,
        isPrimary: true,
      },
    ];
  }
  return [];
}

function ContactSheetPhoneRow({ phone, isFirst }: { phone: SheetPhone; isFirst: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px] tabular-nums',
              isFirst ? 'font-medium text-slate-900' : 'text-slate-700',
            )}
          >
            {formatPhoneNumber(phone.phone)}
          </span>
          {phone.isPrimary && (
            <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
              주 연락처
            </span>
          )}
          {phone.label && (
            <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
              {phone.label}
            </span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`tel:${phone.phone}`} aria-label={`${phone.label ?? '전화'} ${phone.phone}`}>
          <Phone className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}

function ContactSheetPropertyRow({
  propertyContact,
}: {
  propertyContact: PropertyContact;
}) {
  const title = propertyContact.property?.site?.name ?? '연결 매물';
  const unitName = propertyContact.property?.unit?.name;
  const titleLine = unitName ? `${title} · ${unitName}` : title;
  const address =
    propertyContact.property?.site?.roadAddress ??
    propertyContact.property?.site?.jibunAddress ??
    null;

  return (
    <div className="px-3 py-3">
      {/* 1행: 매물명/호수 (링크 또는 텍스트) */}
      <div className="min-w-0">
        {propertyContact.property ? (
          <Link
            to="/properties/$id"
            params={{ id: propertyContact.propertyId }}
            className="block truncate text-sm font-medium text-slate-900 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {titleLine}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium text-slate-900">
            {titleLine}
          </span>
        )}
      </div>
      {/* 2행: 역할/상태 배지 */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {propertyRoleLabels[propertyContact.role] ?? propertyContact.role}
        </span>
        {propertyContact.isPrimary && (
          <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
            주 연락처
          </span>
        )}
        {propertyContact.isResident && (
          <span className="rounded-[4px] bg-[#eef3ed] px-1.5 py-0.5 text-[11px] text-[#44745a]">
            거주중
          </span>
        )}
      </div>
      {/* 3행: 주소 (있을 때) */}
      {address && (
        <p className="mt-1 truncate text-xs text-slate-500">{address}</p>
      )}
    </div>
  );
}

function ContactSheetBuyerReqCard({ requirement }: { requirement: BuyerRequirement }) {
  const transaction = requirement.transactionType
    ? transactionTypeMeta[requirement.transactionType]
    : null;
  const statusClassName =
    buyerStatusMeta[requirement.status] ?? 'bg-[#f1f1ef] text-[#5f5e5b]';
  const urgencyClassName =
    urgencyMeta[requirement.urgency] ?? 'bg-[#f1f1ef] text-[#5f5e5b]';

  return (
    <div className="rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
              statusClassName,
            )}
          >
            {buyerStatusLabels[requirement.status] ?? requirement.status}
          </span>
          <span
            className={cn(
              'rounded-[4px] px-1.5 py-0.5 text-[11px] leading-5',
              urgencyClassName,
            )}
          >
            {urgencyLabels[requirement.urgency] ?? requirement.urgency}
          </span>
          {transaction && (
            <span
              className={cn(
                'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
                transaction.className,
              )}
            >
              {transaction.label}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500">
          등록 {formatDateShort(requirement.createdAt)}
          {requirement.nextContactDate && (
            <div className="text-[11px] text-slate-500">
              다음 연락 {formatDateShort(requirement.nextContactDate)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-900">
        {formatBudgetSummary(requirement)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
        <span>{formatAreaSummary(requirement)}</span>
        {(() => {
          const regions = (requirement.preferredRegions ?? [])
            .map((region) => region.ward?.name ?? region.district?.name ?? region.province?.name ?? '')
            .filter(Boolean);
          if (regions.length === 0) return null;
          return <span className="truncate">· {regions.join(', ')}</span>;
        })()}
      </div>
      {requirement.memo?.trim() && (
        <p className="mt-2 line-clamp-2 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-slate-500">
          {requirement.memo.trim()}
        </p>
      )}
    </div>
  );
}

function ContactSheetConsultationRow({ consultation }: { consultation: Consultation }) {
  const siteName = consultation.property?.site?.name;
  return (
    <div className="rounded-md border border-[#eeeeec] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {consultationTypeLabels[consultation.type] ?? consultation.type}
        </span>
        <span className="text-[11px] text-slate-500">{formatDateTime(consultation.createdAt)}</span>
        {siteName && (
          <span className="text-[11px] text-slate-500">· {siteName}</span>
        )}
        {consultation.createdBy?.name && (
          <span className="text-[11px] text-slate-500">· {consultation.createdBy.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {consultation.content}
      </p>
    </div>
  );
}

interface SheetRelationItem {
  id: string;
  direction: '연결함' | '연결됨';
  relation: ContactRelation;
  counterpartName: string;
  counterpartPhone: string | null;
}

function mergeContactRelationships(contact: ContactDetail): SheetRelationItem[] {
  return [
    ...contact.relationsAsMain.map<SheetRelationItem>((relation) => ({
      id: `main-${relation.id}`,
      direction: '연결함',
      relation,
      counterpartName: relation.relatedContact?.name ?? '이름 없음',
      counterpartPhone: relation.relatedContact?.phone ?? null,
    })),
    ...contact.relationsAsRelated.map<SheetRelationItem>((relation) => ({
      id: `related-${relation.id}`,
      direction: '연결됨',
      relation,
      counterpartName: relation.contact?.name ?? '이름 없음',
      counterpartPhone: relation.contact?.phone ?? null,
    })),
  ];
}

function ContactSheetRelationRow({ item }: { item: SheetRelationItem }) {
  const relationLabel =
    item.relation.label ||
    relationTypeLabels[item.relation.relationType] ||
    item.relation.relationType;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {item.counterpartName}
          </span>
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            {relationLabel}
          </span>
          <span className="rounded-[4px] bg-transparent px-1 py-0.5 text-[11px] text-slate-400">
            {item.direction}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {item.counterpartPhone ? formatPhoneNumber(item.counterpartPhone) : '연락처 없음'}
          {item.relation.memo ? ` · ${item.relation.memo}` : ''}
        </p>
      </div>
      <Link2 className="size-4 shrink-0 text-slate-400" />
    </div>
  );
}

/**
 * "지금 확인할 것" 섹션의 알림 생성.
 * 룰:
 *  - 활성 BuyerRequirement 중 nextContactDate가 지났으면 danger
 *  - nextContactDate가 7일 이내면 warning
 *  - 활성 BuyerRequirement가 있는데 최근 30일 내 상담이 0이면 warning
 *  - 모든 상담이 60일 이상 지났으면 neutral
 *  - 활성 매수요건이 있는데 PropertyContact가 0이면 neutral
 */
function getContactSheetNotices(contact: ContactDetail): QuickSheetNotice[] {
  const notices: QuickSheetNotice[] = [];
  const buyerRequirements = contact.buyerRequirements ?? [];
  const consultations = contact.consultations ?? [];
  const propertyContacts = contact.propertyContacts ?? [];
  const activeBuyerReqs = buyerRequirements.filter((req) => req.status === 'active');

  // 1) 연락 지연
  const overdueReqs = activeBuyerReqs.filter((req) => {
    if (!req.nextContactDate) return false;
    return getDaysUntil(req.nextContactDate) < 0;
  });
  if (overdueReqs.length > 0) {
    const oldest = overdueReqs.reduce((acc, req) => {
      const accDays = getDaysUntil(acc.nextContactDate);
      const reqDays = getDaysUntil(req.nextContactDate);
      return reqDays < accDays ? req : acc;
    });
    const daysAgo = Math.abs(getDaysUntil(oldest.nextContactDate));
    notices.push({
      title: '다음 연락 예정일 지남',
      detail: `매수요건 ${overdueReqs.length}건 중 ${daysAgo}일 지난 건이 있습니다.`,
      tone: 'danger',
    });
  }

  // 2) 연락 임박 (overdue가 아닌 활성건 중 7일 이내)
  const upcomingReqs = activeBuyerReqs.filter((req) => {
    if (!req.nextContactDate) return false;
    const days = getDaysUntil(req.nextContactDate);
    return days >= 0 && days <= 7;
  });
  if (upcomingReqs.length > 0 && overdueReqs.length === 0) {
    notices.push({
      title: '다음 연락 임박',
      detail: `매수요건 ${upcomingReqs.length}건이 7일 이내 연락 예정입니다.`,
      tone: 'warning',
    });
  }

  // 3) 활성 매수요건 있는데 최근 상담 없음
  if (activeBuyerReqs.length > 0) {
    const recentConsultation = consultations[0];
    const daysSinceLastConsult = recentConsultation
      ? getDaysSince(recentConsultation.createdAt)
      : null;
    if (daysSinceLastConsult === null || daysSinceLastConsult > 30) {
      notices.push({
        title: '최근 상담 없음',
        detail:
          recentConsultation === undefined
            ? `활성 매수요건 ${activeBuyerReqs.length}건이 있지만 상담 기록이 없습니다.`
            : `마지막 상담이 ${daysSinceLastConsult}일 전입니다.`,
        tone: 'warning',
      });
    }
  }

  // 4) 활성 매수요건 있는데 연결 매물 없음
  if (activeBuyerReqs.length > 0 && propertyContacts.length === 0) {
    notices.push({
      title: '연결된 매물 없음',
      detail: `활성 매수요건 ${activeBuyerReqs.length}건이 있는데 연결된 매물이 없어 추적이 어렵습니다.`,
      tone: 'neutral',
    });
  }

  // 5) 상담이 모두 60일+ 경과 (활성 매수요건 없는 경우만, 중복 회피)
  if (activeBuyerReqs.length === 0 && consultations.length > 0) {
    const latest = consultations[0];
    const days = getDaysSince(latest.createdAt);
    if (days !== null && days >= 60) {
      notices.push({
        title: '오랜 미접촉 연락처',
        detail: `마지막 상담이 ${days}일 전입니다. 후속 연락이 필요한지 확인해 보세요.`,
        tone: 'neutral',
      });
    }
  }

  return notices.slice(0, 5);
}

function formatBudgetSummary(requirement: BuyerRequirement) {
  if (requirement.transactionType === 'monthly') {
    const deposit = formatRange(requirement.depositMin, requirement.depositMax);
    const monthly = requirement.monthlyRentMax
      ? `${formatPrice(requirement.monthlyRentMax)} 이하`
      : '협의';
    return `보증금 ${deposit} · 월세 ${monthly}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${formatRange(requirement.depositMin, requirement.depositMax)}`;
  }

  return `매매 ${formatRange(requirement.priceMin, requirement.priceMax)}`;
}

function formatRange(min: number | null, max: number | null) {
  if (min && max) return `${formatPrice(min)} ~ ${formatPrice(max)}`;
  if (min) return `${formatPrice(min)} 이상`;
  if (max) return `${formatPrice(max)} 이하`;
  return '협의';
}

function formatAreaSummary(requirement: BuyerRequirement) {
  if (!requirement.areaMin && !requirement.areaMax) return '면적 조건 없음';
  if (requirement.areaMin && requirement.areaMax) {
    return `${sqmToPyeong(requirement.areaMin)}평 ~ ${sqmToPyeong(requirement.areaMax)}평`;
  }
  if (requirement.areaMin) return `${sqmToPyeong(requirement.areaMin)}평 이상`;
  return `${sqmToPyeong(requirement.areaMax ?? 0)}평 이하`;
}
