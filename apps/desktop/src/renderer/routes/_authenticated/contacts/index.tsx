import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
import { ApiError, type Contact } from '@estate-erp/api-client';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  EllipsisVertical,
  FolderMinus,
  FolderPlus,
  Loader2,
  PanelRightOpen,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTACT_CATEGORY_LABELS,
  CONTACT_GROUP_MEMBERS_MAX,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { formatDateShortYear, formatPhone } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
import { isContactTagVisible, splitContactTags } from '@/lib/contacts';
import {
  CONSULTATION_TYPE_LABELS,
  formatAreaRange,
  formatBudget,
} from '../buyer-requirements/-buyer-utils';
import {
  ALL_CONTACTS_CATEGORY,
  contactGroupNameOf,
  resolveContactCategory,
} from './-contact-categories';
import {
  ContactCategoriesPanel,
  ContactCategoriesToggle,
  contactCategorySummaryQuery,
  readStoredCategoriesPanelOpen,
  storeCategoriesPanelOpen,
} from './-contact-categories-panel';
import { ContactGroupNameDialog } from './-contact-group-dialog';
import { propertyRoleLabels } from './-detail-cards';
import { ContactQuickSheet } from './-quick-sheet';
import './-contacts-table.css';
import {
  DataTable,
  DateCell,
  type SortDefinition,
} from '@/components/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * 분류는 왼쪽 사이드바에서 고른다.
 * '최근 상담 있음' 필터(PRD 7장)는 서버 GET /contacts에 파라미터가 없어 의도적으로 생략.
 */
const sortDefinitions = [
  { field: 'updatedAt', label: '최근 수정' },
  { field: 'createdAt', label: '등록일' },
  { field: 'name', label: '이름' },
];

const CONTACTS_PAGE_SIZE = 50;
/**
 * 모든 행이 이름 줄과 최근 상담 줄을 가진 같은 높이다.
 * 높이가 고정이라 희망·매물 패널을 펼치지 않으면 50행 이상에서 가상화가 동작한다.
 */
const CONTACT_ROW_HEIGHT = 56;

type ContactExpandedPanel = 'buyerRequirements' | 'propertyContacts';

function getContactExpandedPanelId(contactId: string) {
  return `contact-expanded-panel-${contactId}`;
}

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [categoryId, setCategoryId] = useState(ALL_CONTACTS_CATEGORY.id);
  const category = useMemo(() => resolveContactCategory(categoryId), [categoryId]);
  const [isCategoriesPanelOpen, setIsCategoriesPanelOpen] = useState(
    readStoredCategoriesPanelOpen,
  );
  const [activeSorts, setActiveSorts] = useState<SortDefinition[]>([
    { field: 'updatedAt', label: '최근 수정', direction: 'desc' },
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  /** 카운트 칩 클릭으로 펼친 패널 — 연락처별로 희망조건/연결물건 중 하나만 표시 */
  const [expandedPanels, setExpandedPanels] = useState<
    ReadonlyMap<string, ContactExpandedPanel>
  >(() => new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const toggleExpandedPanel = useCallback(
    (contactId: string, panel: ContactExpandedPanel) => {
      setExpandedPanels((previous) => {
        const next = new Map(previous);
        if (next.get(contactId) === panel) next.delete(contactId);
        else next.set(contactId, panel);
        return next;
      });
    },
    [],
  );

  const toggleCategoriesPanel = useCallback(() => {
    setIsCategoriesPanelOpen((open) => {
      storeCategoriesPanelOpen(!open);
      return !open;
    });
  }, []);

  // PRD 13장 키보드 단축키 — Cmd/Ctrl+F: 검색 포커스
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'f' || event.key === 'F') {
        if (searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const apiParams = useMemo(() => {
    return {
      ...category.filter,
      search: deferredSearch.trim() || undefined,
      sortBy: activeSorts[0]?.field as 'name' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
  }, [activeSorts, category, deferredSearch]);

  useEffect(() => {
    setSelectedContactIds([]);
  }, [apiParams]);

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

  const expandedRowIds = useMemo<ReadonlySet<string>>(
    () => new Set(expandedPanels.keys()),
    [expandedPanels],
  );

  const openQuickSheet = useCallback((contact: Contact) => {
    setSelectedContactId(contact.id);
  }, []);

  const openContactDetail = useCallback(
    (contact: Contact) => {
      void navigate({ to: '/contacts/$id', params: { id: contact.id } });
    },
    [navigate],
  );

  // 사람을 찾는 목록: 이름·역할·최근 상담을 한 칸에 두 줄로 읽고, 전화와 건수를 오른쪽에 맞춘다.
  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: () => <ContactHeaderLabel icon={<UserRound className="size-4" />} label="연락처" />,
        size: 240,
        enableSorting: true,
        meta: { fill: true },
        cell: ({ row }) => (
          <ContactPrimaryCell contact={row.original} onOpenConsultation={openQuickSheet} />
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: () => <ContactHeaderLabel icon={<Phone className="size-4" />} label="전화" />,
        size: 128,
        enableSorting: false,
        cell: ({ row }) => <PhoneLineCell contact={row.original} />,
      },
      {
        id: 'buyerRequirements',
        accessorKey: 'buyerRequirements',
        header: () => <ContactHeaderLabel icon={<Target className="size-4" />} label="희망" />,
        size: 60,
        enableSorting: false,
        cell: ({ row }) => (
          <ExpandableCountChip
            count={row.original._count?.buyerRequirements ?? 0}
            label="매수 희망조건"
            expanded={expandedPanels.get(row.original.id) === 'buyerRequirements'}
            panelId={getContactExpandedPanelId(row.original.id)}
            onToggle={() => toggleExpandedPanel(row.original.id, 'buyerRequirements')}
          />
        ),
      },
      {
        id: 'propertyContacts',
        accessorKey: 'propertyContacts',
        header: () => <ContactHeaderLabel icon={<Building2 className="size-4" />} label="매물" />,
        size: 60,
        enableSorting: false,
        cell: ({ row }) => (
          <ExpandableCountChip
            count={row.original._count?.propertyContacts ?? 0}
            label="연결 물건"
            expanded={expandedPanels.get(row.original.id) === 'propertyContacts'}
            panelId={getContactExpandedPanelId(row.original.id)}
            onToggle={() => toggleExpandedPanel(row.original.id, 'propertyContacts')}
          />
        ),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: () => <ContactHeaderLabel icon={<CalendarDays className="size-4" />} label="수정" />,
        size: 88,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            <DateCell value={row.original.updatedAt} relative />
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">작업</span>,
        size: 36,
        minSize: 36,
        maxSize: 36,
        enableResizing: false,
        enableSorting: false,
        meta: { cellClassName: 'px-1' },
        cell: ({ row }) => (
          <ContactRowActions
            contact={row.original}
            onQuickOpen={openQuickSheet}
            onOpenDetail={openContactDetail}
          />
        ),
      },
    ],
    [
      expandedPanels,
      openContactDetail,
      openQuickSheet,
      toggleExpandedPanel,
    ],
  );

  const handleFiltersReset = useCallback(() => {
    setCategoryId(ALL_CONTACTS_CATEGORY.id);
    setActiveSorts([{ field: 'updatedAt', label: '최근 수정', direction: 'desc' }]);
    setSorting([{ id: 'updatedAt', desc: true }]);
    setSearch('');
  }, []);

  const handleSortChange = useCallback((field: string) => {
    const definition = sortDefinitions.find((item) => item.field === field);
    if (!definition) return;
    setActiveSorts([{ ...definition, direction: 'desc' }]);
    setSorting([{ id: field, desc: true }]);
  }, []);

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    categoryId !== ALL_CONTACTS_CATEGORY.id ||
    activeSorts[0]?.field !== 'updatedAt' ||
    activeSorts[0]?.direction !== 'desc';

  const currentGroupName = contactGroupNameOf(categoryId);
  const emptyMessage = deferredSearch.trim()
    ? '조건에 맞는 연락처가 없습니다.'
    : currentGroupName
      ? '이 그룹에 아직 연락처가 없습니다. 전체 연락처에서 선택해 넣어 보세요.'
      : categoryId !== ALL_CONTACTS_CATEGORY.id
        ? '이 분류에 해당하는 연락처가 없습니다.'
        : '등록된 연락처가 없습니다.';

  return (
    <div data-contacts-page className="-m-4 flex min-h-0 flex-1 bg-white">
      {isCategoriesPanelOpen && (
        <ContactCategoriesPanel selectedId={categoryId} onSelect={setCategoryId} />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 도구줄: 분류 + 검색 + 정렬 + 추가 — 사이드바 머리줄과 높이를 맞춘다 */}
        <section className="flex h-[51px] shrink-0 items-center gap-2 border-b border-border bg-white px-3">
          <ContactCategoriesToggle
            open={isCategoriesPanelOpen}
            label={category.label}
            onToggle={toggleCategoriesPanel}
          />
          <div className="relative min-w-[160px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 전화번호 검색"
              className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
            />
            {search && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select
            value={activeSorts[0]?.field ?? 'updatedAt'}
            onValueChange={handleSortChange}
          >
            <SelectTrigger
              aria-label="정렬"
              className="h-8 w-[116px] shrink-0 border-transparent bg-[#f7f6f3] px-2.5 text-[13px] shadow-none hover:border-border"
            >
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              {sortDefinitions.map((definition) => (
                <SelectItem key={definition.field} value={definition.field}>
                  {definition.label}순
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs text-muted-foreground"
              onClick={handleFiltersReset}
            >
              <RotateCcw className="size-3.5" />
              초기화
            </Button>
          )}
          <Button size="sm" asChild className="ml-auto shrink-0 px-3.5">
            <Link to="/contacts/new">
              <Plus className="size-3.5" />
              연락처 추가
            </Link>
          </Button>
        </section>

        <section className="flex min-h-0 flex-1 bg-white px-0 py-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
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
                      label:
                        sortDefinitions.find((definition) => definition.field === next.id)
                          ?.label ?? next.id,
                      direction: next.desc ? 'desc' : 'asc',
                    },
                  ]);
                }}
                layout="full-height"
                variant="notion"
                rowHeight={CONTACT_ROW_HEIGHT}
                enableRowSelection
                selectedRowIds={selectedContactIds}
                onRowSelectionChange={setSelectedContactIds}
                activateOnDoubleClick
                isLoading={isLoading}
                isLoadingMore={isFetchingNextPage}
                onEndReached={handleEndReached}
                emptyMessage={emptyMessage}
                onRowClick={(contact) => {
                  openQuickSheet(contact);
                }}
                renderBulkActions={(selectedContacts) => (
                  <ContactBulkActions
                    contacts={selectedContacts}
                    currentGroupName={currentGroupName}
                    onQuickOpen={openQuickSheet}
                    onOpenDetail={openContactDetail}
                    onDone={() => setSelectedContactIds([])}
                  />
                )}
                expandedRowIds={expandedRowIds}
                renderExpandedRow={(contact) => {
                  const panel = expandedPanels.get(contact.id);
                  if (!panel) return null;

                  return (
                    <div id={getContactExpandedPanelId(contact.id)}>
                      {panel === 'buyerRequirements' ? (
                        <BuyerReqExpandedPanel contact={contact} />
                      ) : (
                        <PropertyContactsExpandedPanel contact={contact} />
                      )}
                    </div>
                  );
                }}
                renderStatusBar={({ focusedRow, totalCount }) => {
                  const focusedPhone = focusedRow
                    ? collectContactPhoneStrings(focusedRow)[0]
                    : undefined;
                  return (
                    <span>
                      {isLoading
                        ? '불러오는 중'
                        : focusedRow
                          ? `${focusedRow.name}${focusedPhone ? ` · ${formatPhone(focusedPhone)}` : ''}`
                          : `${category.id === ALL_CONTACTS_CATEGORY.id ? '연락처' : category.label} ${contacts.length.toLocaleString()} / ${totalCount.toLocaleString()}건`}
                      {!isLoading && activeSorts[0] ? ` · ${activeSorts[0].label}순` : ''}
                      {!isLoading && hasNextPage && !isFetchingNextPage
                        ? ' · 아래로 스크롤하면 더 불러옵니다'
                        : ''}
                      {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                      {!isLoading && !focusedRow ? ' · 더블클릭으로 빠른 확인' : ''}
                    </span>
                  );
                }}
              />
            )}
          </div>
        </section>
      </div>

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

/** 고객 원장과 같은 표기: 올해는 "11.04", 다른 해는 "25.12.28" */
function formatConsultDate(value: string) {
  const short = formatDateShortYear(value);
  return new Date(value).getFullYear() === new Date().getFullYear()
    ? short.slice(3)
    : short;
}

/** 역할과 그룹을 한 줄 글자로 합친다. 같은 말이 겹치면 한 번만 쓴다. */
function getContactLabels(contact: Contact): string[] {
  const { groupTags, customTags } = splitContactTags(contact.tags);
  return Array.from(
    new Set([
      ...(contact.roles ?? []).map((role) => CONTACT_CATEGORY_LABELS[role]),
      ...[...groupTags, ...customTags].filter(isContactTagVisible),
    ]),
  );
}

/**
 * 연락처 칸 — 첫 줄은 누구인지(이름·역할·그룹), 둘째 줄은 최근에 무슨 얘기를 했는지.
 * 색 칩 없이 글자 굵기와 농도로만 나눈다. 모든 행의 높이가 같아야 하므로 상담이 없어도 둘째 줄을 둔다.
 */
function ContactPrimaryCell({
  contact,
  onOpenConsultation,
}: {
  contact: Contact;
  onOpenConsultation: (contact: Contact) => void;
}) {
  const labels = getContactLabels(contact).join(' · ');
  const consultation = contact.latestConsultation;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[13.5px] font-semibold text-slate-900">
          {contact.name}
        </span>
        {labels && (
          <span title={labels} className="min-w-0 truncate text-xs text-muted-foreground">
            {labels}
          </span>
        )}
      </div>
      {consultation ? (
        // 목록 API가 상담 id를 주지 않아 상담 상세 대신 전체 상담이 보이는 빠른 확인을 연다.
        <button
          type="button"
          aria-label={`${contact.name} 최근 상담 열기`}
          title={consultation.content}
          onClick={(event) => {
            event.stopPropagation();
            onOpenConsultation(contact);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="group/consult flex min-w-0 items-baseline gap-1.5 rounded-sm text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatConsultDate(consultation.createdAt)}{' '}
            {CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type}
          </span>
          <span className="min-w-0 truncate text-[#55534e] underline-offset-2 group-hover/consult:underline">
            {consultation.content.replace(/\s+/g, ' ')}
          </span>
        </button>
      ) : (
        <span className="text-xs text-muted-foreground/50">상담 기록 없음</span>
      )}
    </div>
  );
}

function ContactHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
      <span className="shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/70">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ContactRowActions({
  contact,
  onQuickOpen,
  onOpenDetail,
}: {
  contact: Contact;
  onQuickOpen: (contact: Contact) => void;
  onOpenDetail: (contact: Contact) => void;
}) {
  const hasPhone = collectContactPhoneStrings(contact).length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${contact.name} 작업 메뉴`}
          title="행 작업 메뉴"
          // 행마다 있는 버튼이라 평소에는 숨겨 목록을 조용하게 둔다.
          className="mx-auto text-[#627d98] opacity-0 hover:bg-[#eef1f3] hover:text-slate-900 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[#eef1f3] data-[state=open]:text-slate-900 data-[state=open]:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem onClick={() => onQuickOpen(contact)}>
          <PanelRightOpen className="size-3.5" />
          빠른 확인
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenDetail(contact)}>
          <ArrowUpRight className="size-3.5" />
          상세 보기
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!hasPhone}
          onClick={() => void copyContactPhoneNumbers([contact])}
        >
          <Copy className="size-3.5" />
          전화번호 복사
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function groupErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function ContactBulkActions({
  contacts,
  currentGroupName,
  onQuickOpen,
  onOpenDetail,
  onDone,
}: {
  contacts: Contact[];
  /** 지금 보고 있는 그룹. 있으면 '이 그룹에서 빼기'를 보여 준다. */
  currentGroupName: string | null;
  onQuickOpen: (contact: Contact) => void;
  onOpenDetail: (contact: Contact) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const summary = useQuery(contactCategorySummaryQuery);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const singleContact = contacts.length === 1 ? contacts[0] : null;
  const hasPhone = contacts.some(
    (contact) => collectContactPhoneStrings(contact).length > 0,
  );
  const contactIds = contacts.map((contact) => contact.id);
  const groups = (summary.data?.groups ?? []).filter(({ name }) =>
    isContactTagVisible(name),
  );

  // 서버 한도를 넘으면 다시 눌러도 계속 실패하므로 보내기 전에 이유를 알려 준다.
  const isOverMemberLimit = contactIds.length > CONTACT_GROUP_MEMBERS_MAX;
  const memberLimitMessage = `한 번에 ${CONTACT_GROUP_MEMBERS_MAX}명까지 처리할 수 있습니다. 선택을 줄여 주세요.`;

  const finishGroupChange = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    toast.success(message);
    onDone();
  };

  const addToGroup = useMutation({
    mutationFn: (name: string) => api.contacts.addGroupMembers(name, contactIds),
    onSuccess: ({ updated }, name) =>
      finishGroupChange(`${updated}명을 '${name}' 그룹에 넣었습니다.`),
    onError: (error) => toast.error(groupErrorMessage(error, '그룹에 넣지 못했습니다.')),
  });

  const removeFromGroup = useMutation({
    mutationFn: (name: string) => api.contacts.removeGroupMembers(name, contactIds),
    onSuccess: ({ updated }, name) =>
      finishGroupChange(`${updated}명을 '${name}' 그룹에서 뺐습니다.`),
    onError: (error) => toast.error(groupErrorMessage(error, '그룹에서 빼지 못했습니다.')),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={addToGroup.isPending}
            className="text-slate-600"
          >
            <FolderPlus className="size-3" />
            그룹에 넣기
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
          {isOverMemberLimit ? (
            <DropdownMenuItem disabled className="whitespace-normal">
              {memberLimitMessage}
            </DropdownMenuItem>
          ) : (
            <>
              {groups.map(({ name }) => (
                <DropdownMenuItem key={name} onClick={() => addToGroup.mutate(name)}>
                  <span className="truncate">{name}</span>
                </DropdownMenuItem>
              ))}
              {/* 사이드바를 닫아 둔 상태에서도 그룹 목록을 다시 불러올 수 있어야 한다 */}
              {summary.isError && (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void summary.refetch();
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  그룹 목록 다시 불러오기
                </DropdownMenuItem>
              )}
              {(groups.length > 0 || summary.isError) && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => setIsCreatingGroup(true)}>
                <Plus className="size-3.5" />
                새 그룹 만들기
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {currentGroupName && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={removeFromGroup.isPending}
          onClick={() => {
            if (isOverMemberLimit) {
              toast.error(memberLimitMessage);
              return;
            }
            removeFromGroup.mutate(currentGroupName);
          }}
          className="text-slate-600"
        >
          <FolderMinus className="size-3" />
          이 그룹에서 빼기
        </Button>
      )}
      <ContactGroupNameDialog
        open={isCreatingGroup}
        onOpenChange={setIsCreatingGroup}
        title="새 그룹 만들기"
        description={`선택한 ${contacts.length}명을 새 그룹에 넣습니다. 사무소 직원 모두가 함께 씁니다.`}
        submitLabel="만들고 넣기"
        onSubmit={async (typedName) => {
          // 만들기와 넣기를 한 요청으로 처리한다. 나누면 넣기만 실패했을 때 다시 시도가 '이미 있는 그룹'으로 막힌다.
          const { name, updated } = await api.contacts.createGroup(typedName, contactIds);
          await finishGroupChange(`'${name}' 그룹을 만들고 ${updated}명을 넣었습니다.`);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={!singleContact}
        onClick={() => singleContact && onQuickOpen(singleContact)}
        className="text-slate-600"
      >
        <PanelRightOpen className="size-3" />
        빠른 확인
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={!singleContact}
        onClick={() => singleContact && onOpenDetail(singleContact)}
        className="text-slate-600"
      >
        <ArrowUpRight className="size-3" />
        상세 보기
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={!hasPhone}
        onClick={() => void copyContactPhoneNumbers(contacts)}
        className="text-slate-600"
      >
        <Copy className="size-3" />
        전화번호 복사
      </Button>
    </>
  );
}

/** 대표 전화 1줄 + 나머지 개수 "+N" 배지 */
function PhoneLineCell({ contact }: { contact: Contact }) {
  const phones = collectContactPhoneStrings(contact);

  if (phones.length === 0) {
    return <span className="text-[13px] text-slate-400">—</span>;
  }

  const [primary, ...rest] = phones;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[13px] tabular-nums text-slate-900">
        {formatPhone(primary)}
      </span>
      {rest.length > 0 && (
        <span
          title={rest.map((phone) => formatPhone(phone)).join(', ')}
          className="inline-flex h-4 shrink-0 cursor-default items-center rounded-full bg-[#f1f1ef] px-1.5 text-[9.5px] font-bold text-slate-500"
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

async function copyContactPhoneNumbers(contacts: Contact[]) {
  const phones = Array.from(
    new Set(
      contacts.flatMap((contact) => collectContactPhoneStrings(contact)),
    ),
  ).map(formatPhone);

  if (phones.length === 0) {
    toast.error('선택한 연락처에 전화번호가 없습니다.');
    return;
  }

  try {
    await navigator.clipboard.writeText(phones.join(', '));
    toast.success(`전화번호 ${phones.length}건을 복사했습니다.`);
  } catch {
    toast.error('전화번호를 복사하지 못했습니다.');
  }
}

/** 카운트 칩 — 클릭 시 행 아래의 연결 데이터를 펼친다 (0건이면 "—"). 매물관리 광고/매칭 토글(ListingPanelToggle)과 동일 스타일. */
function ExpandableCountChip({
  count,
  label,
  expanded,
  panelId,
  onToggle,
}: {
  count: number;
  label: string;
  expanded: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  if (count === 0) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }

  return (
    <div
      className="-ml-1.5 flex h-full items-center"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant={expanded ? 'secondary' : 'ghost'}
        size="xs"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${label} ${count}건 ${expanded ? '접기' : '펼치기'}`}
        title={`${label} ${expanded ? '접기' : '펼치기'}`}
        onClick={onToggle}
        className="gap-0.5 px-1.5 text-xs tabular-nums shadow-none"
      >
        {count}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3 text-muted-foreground/60 transition-transform duration-150',
            expanded && 'rotate-180',
          )}
        />
      </Button>
    </div>
  );
}

/** 희망 펼침 패널 — 고객 원장 매칭 패널(LedgerMatchPanel) 스타일: 헤더(아이콘+건수+상태 요약) + 2단 카드 목록 */
function BuyerReqExpandedPanel({ contact }: { contact: Contact }) {
  const PANEL_LIMIT = 20;
  const [limit, setLimit] = useState(PANEL_LIMIT);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact-buyer-requirements', contact.id, limit],
    queryFn: () => api.buyerRequirements.findAll({ contactId: contact.id, limit }),
    placeholderData: (previous) => previous,
  });
  const items = data?.items ?? [];
  const total = data?.pagination?.total ?? items.length;
  const hiddenCount = Math.max(0, total - items.length);
  const summary = useMemo(
    () => ({
      active: items.filter((req) => req.status === 'active').length,
      hold: items.filter((req) => req.status === 'hold').length,
      completed: items.filter((req) => req.status === 'completed').length,
    }),
    [items],
  );

  return (
    <div
      role="region"
      aria-label={`${contact.name} 매수 희망조건`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-4 pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <Target className="size-3.5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <span className="text-[12.5px] font-semibold text-foreground">매수 희망조건</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground">
              {total}
            </span>
            {!isLoading && summary.active > 0 && (
              <span className="rounded-md border border-info/25 bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                활성 {summary.active}
              </span>
            )}
            {!isLoading && summary.hold > 0 && (
              <span className="rounded-md border border-warning/25 bg-warning-soft px-1.5 py-0.5 font-medium text-warning">
                보류 {summary.hold}
              </span>
            )}
            {!isLoading && summary.completed > 0 && (
              <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 font-medium text-success">
                완료 {summary.completed}
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            <Loader2
              className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            희망조건을 불러오는 중...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5"
          >
            <span className="text-xs text-destructive">희망조건을 불러오지 못했습니다.</span>
            <Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            등록된 희망조건이 없습니다.
          </div>
        ) : (
          <div className="mb-0 ml-8 mr-0 mt-1.5 flex flex-col gap-1.5">
            {items.map((req) => {
              const txLabel = req.transactionType
                ? (TRANSACTION_TYPE_LABELS[req.transactionType as TransactionType] ?? req.transactionType)
                : null;
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
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-md border border-border/90 bg-white transition-colors hover:border-muted-foreground/35"
                >
                  <div className="flex min-w-0 items-center gap-2.5 px-3 py-2">
                    <StatusBadge kind="buyerUrgency" status={req.urgency} size="sm" />
                    {txLabel && <ExpandedPanelTerm label="거래" value={txLabel} />}
                    {budget !== '—' && <ExpandedPanelTerm label="예산" value={budget} />}
                    {area && <ExpandedPanelTerm label="면적" value={area} />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 py-2 pl-2 pr-3">
                    {req.assignedTo && (
                      <span className="text-[11px] text-slate-500">담당 {req.assignedTo.name}</span>
                    )}
                    <StatusBadge kind="buyerStatus" status={req.status} size="sm" />
                    <ChevronRight className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
                  </div>
                  {req.memo?.trim() && (
                    <div className="col-span-2 truncate border-t border-border/70 bg-muted/30 px-3 py-1.5 text-[11.5px] text-slate-500">
                      메모: {req.memo.replace(/\s+/g, ' ')}
                    </div>
                  )}
                </Link>
              );
            })}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setLimit(total)}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border bg-white/70 px-3 py-1.5 text-[11.5px] text-slate-500 transition-colors hover:bg-white"
              >
                외 {hiddenCount}건 더 보기
                <ChevronDown className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 펼침 패널 카드의 라벨+값 한 쌍 — 고객 원장 조건 카드의 term 스타일 */
function ExpandedPanelTerm({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="shrink-0 text-[11.5px] text-slate-500">{label}</span>
      <span className="truncate text-[13px] font-semibold tabular-nums text-slate-900">{value}</span>
    </span>
  );
}

/** 연결 물건 펼침 패널 — 고객 원장 패널 스타일: 헤더(아이콘+건수+요약) + 2단 카드 목록 */
function PropertyContactsExpandedPanel({ contact }: { contact: Contact }) {
  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', contact.id, 'property-contacts'],
    queryFn: () => api.contacts.getPropertyContacts(contact.id),
  });
  const primaryCount = items.filter((item) => item.isPrimary).length;
  const residentCount = items.filter((item) => item.isResident).length;

  return (
    <div
      role="region"
      aria-label={`${contact.name} 연결 물건`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-4 pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <Building2 className="size-3.5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <span className="text-[12.5px] font-semibold text-foreground">연결 물건</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground">
              {items.length}
            </span>
            {!isLoading && primaryCount > 0 && (
              <span className="rounded-md border border-info/25 bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                주 연락처 {primaryCount}
              </span>
            )}
            {!isLoading && residentCount > 0 && (
              <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 font-medium text-success">
                거주중 {residentCount}
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            <Loader2
              className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            연결 물건을 불러오는 중...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5"
          >
            <span className="text-xs text-destructive">연결 물건을 불러오지 못했습니다.</span>
            <Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            연결된 물건이 없습니다.
          </div>
        ) : (
          <div className="mb-0 ml-8 mr-0 mt-1.5 flex flex-col gap-1.5">
            {items.map((propertyContact) => {
              const siteName = propertyContact.property?.site?.name?.trim() || '이름 없는 물건';
              const unitName = propertyContact.property?.unit?.name?.trim();
              const title = unitName ? `${siteName} · ${unitName}` : siteName;
              const address =
                propertyContact.property?.site?.roadAddress ??
                propertyContact.property?.site?.jibunAddress ??
                null;
              const content = (
                <>
                  <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                    <Building2 className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate text-[13px] font-semibold text-slate-900">{title}</span>
                    <span className="shrink-0 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[10.5px] text-[#5f5e5b]">
                      {propertyRoleLabels[propertyContact.role] ?? propertyContact.role}
                    </span>
                    {propertyContact.isPrimary && (
                      <span className="shrink-0 rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[10.5px] text-[#337ea9]">
                        주 연락처
                      </span>
                    )}
                    {propertyContact.isResident && (
                      <span className="shrink-0 rounded-[4px] bg-[#edf3ec] px-1.5 py-0.5 text-[10.5px] text-[#448361]">
                        거주중
                      </span>
                    )}
                    {propertyContact.shareRatio !== null && (
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                        지분 {propertyContact.shareRatio}%
                      </span>
                    )}
                  </div>
                  <span className="flex items-center py-2 pl-2 pr-3">
                    <ChevronRight className="size-3 shrink-0 text-slate-400" aria-hidden="true" />
                  </span>
                  {address && (
                    <div className="col-span-2 truncate border-t border-border/70 bg-muted/30 px-3 py-1.5 text-[11.5px] text-slate-500">
                      {address}
                    </div>
                  )}
                </>
              );
              const rowClassName =
                'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-md border border-border/90 bg-white transition-colors hover:border-muted-foreground/35';

              return propertyContact.property ? (
                <Link
                  key={propertyContact.id}
                  to="/properties/$id"
                  params={{ id: propertyContact.propertyId }}
                  className={rowClassName}
                >
                  {content}
                </Link>
              ) : (
                <div key={propertyContact.id} className={rowClassName}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

