import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { buyerRequirementQueries } from '@/queries/buyer-requirements';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { Contact } from '@estate-erp/api-client';
import { apiErrorMessage } from '@/lib/api-error';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  Check,
  ChevronRight,
  Columns3,
  Copy,
  EllipsisVertical,
  FolderMinus,
  FolderPlus,
  ListChecks,
  Loader2,
  MessageSquare,
  PanelRightOpen,
  Phone,
  Plus,
  RotateCcw,
  Tag,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTACT_CATEGORY_LABELS,
  CONTACT_GROUP_MEMBERS_MAX,
  type ContactCategoryKey,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  formatUnitName,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { consultationDisplayText, formatConsultationDay } from '../consultations/-consultation-list-model';
import { ContactNameBadge, EmptyState, RowOpenButton, StatusBadge } from '@/components/domain';
import { formatAreaRange, formatBudget } from '../buyer-requirements/-buyer-utils';
import {
  ALL_CONTACTS_CATEGORY,
  CONTACT_CATEGORY_SECTIONS,
  contactGroupCategory,
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
import { ContactTagsCell, contactTagsQuery } from './-contact-tag-picker';
import {
  CONTACT_OPTIONAL_COLUMNS,
  isContactColumnVisible,
  readStoredContactColumns,
  setContactColumnVisible,
  storeContactColumns,
  type ContactColumnOverrides,
} from './-contact-columns';
import { consultationTypeLabels, placeLabelOf, propertyRoleLabels } from './-detail-cards';
import { ContactInspector } from './-quick-sheet';
import { ContactNameFill, isPlaceholderContactName } from './-contact-name';
import {
  ToolbarFilterChip,
  ToolbarPillSearch,
  toolbarGhostButtonClassName,
} from '../properties/-components/property-toolbar';
import {
  DataTable,
  DateCell,
  type SortDefinition,
} from '@/components/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
 * 매물관리 표와 같은 행 높이(36 + 선 1). 한 사람이 한 줄이고, 이름·태그·전화·최근 상담이 각자 칸을 가진다.
 * 높이가 고정이라 희망·매물 패널을 펼치지 않으면 50행 이상에서 가상화가 동작한다.
 */
const CONTACT_ROW_HEIGHT = 37;
const CONTACT_INSPECTOR_ID = 'contact-inspector';

/** 칸 글자: 매물관리 표와 같은 14px/21px. 색은 토큰만 쓴다. */
const contactCellNumber = 'whitespace-nowrap text-[14px] leading-[21px] tabular-nums text-foreground';
const contactCellSub = 'whitespace-nowrap text-[14px] leading-[21px] tabular-nums text-muted-foreground';
/** Notion 선택 꼬리표: 높이 20 · 모서리 4 · 좌우 6 */
const contactTagClassName =
  'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[4px] bg-[#f1f1ef] px-1.5 text-[13px] font-normal leading-5 text-[#5f5e5b]';

type ContactExpandedPanel = 'buyerRequirements' | 'propertyContacts';

function getContactExpandedPanelId(contactId: string) {
  return `contact-expanded-panel-${contactId}`;
}

interface ContactFilterState {
  /** CONTACT_CATEGORY_SECTIONS와 같은 순서. 묶음마다 고른 분류 하나 */
  keys: ReadonlyArray<ContactCategoryKey | null>;
  group: string | null;
  /** 태그 하나 ("VIP", "학군") */
  tag: string | null;
}

const EMPTY_CONTACT_FILTERS: ContactFilterState = {
  keys: CONTACT_CATEGORY_SECTIONS.map(() => null),
  group: null,
  tag: null,
};

/** 필터 칩 아이콘 — CONTACT_CATEGORY_SECTIONS와 같은 순서 (고객 구분 · 진행 상황 · 정리) */
const CONTACT_FILTER_SECTION_ICONS = [
  <Tag key="segment" />,
  <Activity key="progress" />,
  <ListChecks key="cleanup" />,
];

/** 필터 칩 안의 하나 고르기 목록. 고른 항목을 다시 누르면 해제한다. */
function ContactFilterOptionList({
  ariaLabel,
  options,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string; count?: number }>;
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="max-h-[320px] overflow-y-auto">
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(isSelected ? null : option.value)}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#2383e2]"
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {isSelected ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              option.count !== undefined && (
                <span className="shrink-0 text-[12px] tabular-nums text-[#a3a09a]">
                  {option.count.toLocaleString()}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  // 필터: 분류 묶음(고객 구분·진행 상황·정리)마다 하나씩, 그리고 그룹 하나. 함께 걸면 모두 만족하는 연락처만 남는다.
  const [contactFilters, setContactFilters] = useState<ContactFilterState>(EMPTY_CONTACT_FILTERS);
  const activeCategoryKeys = useMemo(
    () => contactFilters.keys.filter((key): key is ContactCategoryKey => key !== null),
    [contactFilters.keys],
  );
  const activeFilterCount =
    activeCategoryKeys.length + (contactFilters.group ? 1 : 0) + (contactFilters.tag ? 1 : 0);
  // 사이드바는 조건이 하나일 때만 그 분류를 고른 것으로 보인다. 여러 개면 아무것도 고르지 않은 상태다.
  // 태그는 사이드바에 없으므로 태그만 걸려 있어도 사이드바는 아무것도 고르지 않은 상태다.
  const categoryId =
    activeFilterCount === 0
      ? ALL_CONTACTS_CATEGORY.id
      : activeFilterCount > 1 || contactFilters.tag
        ? ''
        : contactFilters.group
          ? contactGroupCategory(contactFilters.group).id
          : activeCategoryKeys[0];
  /** 사이드바에서 고르면 그 분류 하나만 남긴다 */
  const setCategoryId = useCallback((id: string) => {
    setContactFilters({
      keys: CONTACT_CATEGORY_SECTIONS.map(
        (section) =>
          (section.categories.find((item) => item.id === id)?.id as
            | ContactCategoryKey
            | undefined) ?? null,
      ),
      group: contactGroupNameOf(id),
      tag: null,
    });
  }, []);
  const categorySummary = useQuery(contactCategorySummaryQuery);
  const tagSummary = useQuery(contactTagsQuery);
  const tagOptions = useMemo(() => {
    const tags = (tagSummary.data ?? []).filter((tag) => tag.count > 0);
    return contactFilters.tag && !tags.some((tag) => tag.name === contactFilters.tag)
      ? [{ name: contactFilters.tag, count: 0 }, ...tags]
      : tags;
  }, [tagSummary.data, contactFilters.tag]);
  const groupOptions = useMemo(() => {
    const names = (categorySummary.data?.groups ?? [])
      .map(({ name }) => name);
    // 건수를 못 불러왔거나 방금 만든 그룹이어도 고른 그룹은 목록에 남긴다
    return contactFilters.group && !names.includes(contactFilters.group)
      ? [contactFilters.group, ...names]
      : names;
  }, [categorySummary.data?.groups, contactFilters.group]);
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
        const input = document.querySelector<HTMLInputElement>(
          '[data-contacts-page] input[aria-label="연락처 검색"]',
        );
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
    return {
      category: (activeCategoryKeys.join(',') || undefined) as
        | ContactCategoryKey
        | undefined,
      group: contactFilters.group ?? undefined,
      tags: contactFilters.tag ?? undefined,
      search: deferredSearch.trim() || undefined,
      sortBy: activeSorts[0]?.field as 'name' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: activeSorts[0]?.direction ?? 'desc',
    };
  }, [activeCategoryKeys, activeSorts, contactFilters.group, contactFilters.tag, deferredSearch]);

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

  // 상세 패널은 매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);
  const openQuickSheet = useCallback((contact: Contact) => {
    setInspectorMotion(!document.activeElement?.matches(':focus-visible'));
    setIsInspectorClosing(false);
    setSelectedContactId(contact.id);
  }, []);
  const closeInspector = useCallback((animate = true) => {
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingInspector = useCallback(() => {
    setSelectedContactId(null);
    setIsInspectorClosing(false);
  }, []);
  // 닫히는 중인 연락처는 표의 열기 버튼을 바로 "열기"로 되돌린다
  const openContactId = isInspectorClosing ? null : selectedContactId;

  const openContactDetail = useCallback(
    (contact: Contact) => {
      void navigate({ to: '/contacts/$id', params: { id: contact.id } });
    },
    [navigate],
  );

  // 표에 보일 열. 사용자가 켜고 끈 것을 기억한다.
  const [columnOverrides, setColumnOverrides] = useState<ContactColumnOverrides>(
    readStoredContactColumns,
  );
  const changeColumnOverrides = useCallback(
    (update: (current: ContactColumnOverrides) => ContactColumnOverrides) => {
      setColumnOverrides((current) => {
        const next = update(current);
        storeContactColumns(next);
        return next;
      });
    },
    [],
  );

  // 한 사람이 한 줄: 이름 · 태그 · 전화 · 최근 상담이 각자 칸을 가진다 (매물관리 표와 같은 규격).
  // 구분(계산된 특징 · 그룹)은 처음에는 숨기고 열 설정에서 켠다.
  const allColumns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: () => <ContactHeaderLabel icon={<UserRound />} label="이름" />,
        size: 168,
        minSize: 120,
        enableSorting: true,
        cell: ({ row }) => {
          const contact = row.original;
          const isCurrent = openContactId === contact.id;
          return (
            <>
              {/* 관리단지 소유자명 칸과 같은 이름 배지. 여기서는 줄이 곧 그 사람이라 배지를 눌러 갈 곳이 없다 —
                  누르는 기능 없이 모양만 쓰고, 여는 것은 옆의 "열기" 버튼이 맡는다. */}
              {isPlaceholderContactName(contact.name) ? (
                // 이름을 모르는 손님: 임시 이름은 흐리게, 바로 옆에서 이름을 넣는다
                <span className="flex min-w-0 items-center gap-1 text-[14px] leading-[21px]">
                  <span className="truncate text-muted-foreground" title="이름을 모르는 손님 (번호 끝 네 자리)">
                    {contact.name}
                  </span>
                  <ContactNameFill contactId={contact.id} size="xs" />
                </span>
              ) : (
                <span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">
                  <ContactNameBadge name={contact.name} />
                </span>
              )}
              <RowOpenButton
                label={contact.name}
                current={isCurrent}
                controls={CONTACT_INSPECTOR_ID}
                onToggle={() => (isCurrent ? closeInspector() : openQuickSheet(contact))}
              />
            </>
          );
        },
      },
      {
        id: 'tags',
        header: () => <ContactHeaderLabel icon={<Tag />} label="태그" />,
        size: 184,
        minSize: 96,
        enableSorting: false,
        // 칸 전체가 누르는 자리다. 칸 여백을 없애고 버튼이 같은 여백을 가진다.
        meta: { cellClassName: 'p-0' },
        cell: ({ row }) => (
          <div className="h-full px-2">
            <ContactTagsCell
              contactId={row.original.id}
              contactName={row.original.name}
              tags={row.original.tags}
            />
          </div>
        ),
      },
      {
        id: 'labels',
        header: () => <ContactHeaderLabel icon={<Users />} label="구분" />,
        size: 184,
        minSize: 96,
        enableSorting: false,
        cell: ({ row }) => (
          <ContactChipsCell labels={getContactLabels(row.original)} emptyLabel="구분 없음" />
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: () => <ContactHeaderLabel icon={<Phone />} label="전화" />,
        size: 176,
        minSize: 120,
        enableSorting: false,
        cell: ({ row }) => <PhoneLineCell contact={row.original} />,
      },
      {
        id: 'latestConsultation',
        header: () => <ContactHeaderLabel icon={<MessageSquare />} label="최근 상담" />,
        size: 320,
        minSize: 160,
        enableSorting: false,
        meta: { fill: true },
        cell: ({ row }) => (
          <ContactConsultationCell contact={row.original} onOpenConsultation={openQuickSheet} />
        ),
      },
      {
        id: 'buyerRequirements',
        accessorKey: 'buyerRequirements',
        header: () => <ContactHeaderLabel icon={<Target />} label="희망" />,
        size: 76,
        enableSorting: false,
        cell: ({ row }) => (
          <ExpandableCountChip
            count={row.original._count?.buyerRequirements ?? 0}
            label="희망 조건"
            expanded={expandedPanels.get(row.original.id) === 'buyerRequirements'}
            panelId={getContactExpandedPanelId(row.original.id)}
            onToggle={() => toggleExpandedPanel(row.original.id, 'buyerRequirements')}
          />
        ),
      },
      {
        id: 'propertyContacts',
        accessorKey: 'propertyContacts',
        header: () => <ContactHeaderLabel icon={<Building2 />} label="매물" />,
        size: 76,
        enableSorting: false,
        cell: ({ row }) => (
          <ExpandableCountChip
            count={row.original._count?.propertyContacts ?? 0}
            label="연결 매물"
            expanded={expandedPanels.get(row.original.id) === 'propertyContacts'}
            panelId={getContactExpandedPanelId(row.original.id)}
            onToggle={() => toggleExpandedPanel(row.original.id, 'propertyContacts')}
          />
        ),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: () => <ContactHeaderLabel icon={<CalendarDays />} label="수정" />,
        size: 104,
        enableSorting: true,
        cell: ({ row }) => (
          <span className={contactCellSub}>
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
      closeInspector,
      expandedPanels,
      openContactDetail,
      openContactId,
      openQuickSheet,
      toggleExpandedPanel,
    ],
  );
  const columns = useMemo(
    () =>
      allColumns.filter((column) =>
        isContactColumnVisible(columnOverrides, column.id ?? ''),
      ),
    [allColumns, columnOverrides],
  );

  const handleFiltersReset = useCallback(() => {
    setContactFilters(EMPTY_CONTACT_FILTERS);
    setActiveSorts([{ field: 'updatedAt', label: '최근 수정', direction: 'desc' }]);
    setSorting([{ id: 'updatedAt', desc: true }]);
    setSearch('');
  }, []);

  const handleSortChange = useCallback((field: string) => {
    const definition = sortDefinitions.find((item) => item.field === field);
    if (!definition) return;
    // 이름은 가나다순(ㄱ→ㅎ), 날짜는 최근 것부터
    const direction = field === 'name' ? 'asc' : 'desc';
    setActiveSorts([{ ...definition, direction }]);
    setSorting([{ id: field, desc: direction === 'desc' }]);
  }, []);

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    activeFilterCount > 0 ||
    activeSorts[0]?.field !== 'updatedAt' ||
    activeSorts[0]?.direction !== 'desc';

  const currentGroupName = contactFilters.group;
  const emptyMessage = deferredSearch.trim() || activeFilterCount > 1 || contactFilters.tag
    ? '조건에 맞는 연락처가 없습니다.'
    : currentGroupName
      ? '이 그룹에 아직 연락처가 없습니다. 전체 연락처에서 선택해 넣어 보세요.'
      : categoryId !== ALL_CONTACTS_CATEGORY.id
        ? '이 분류에 해당하는 연락처가 없습니다.'
        : (
          // 사무소에 연락처가 하나도 없을 때: 무엇을 하면 되는지와 바로 하는 단추
          <span className="flex flex-col items-center gap-2 py-2 text-center">
            <span className="text-[14px] text-foreground">등록된 연락처가 없습니다.</span>
            <span className="text-[13px]">
              전화 온 손님이나 집주인을 이름과 번호로 등록해 두면 상담·매물·희망매물에서 바로 찾을 수 있습니다.
            </span>
            <Button size="sm" asChild className="mt-1 h-[30px] rounded-[8px] px-3">
              <Link to="/contacts/new">
                <Plus className="size-3.5" />
                연락처 추가
              </Link>
            </Button>
          </span>
        );

  return (
    <div data-contacts-page className="relative -m-4 flex min-h-0 flex-1 bg-white">
      {isCategoriesPanelOpen && (
        <ContactCategoriesPanel selectedId={categoryId} onSelect={setCategoryId}
          onGroupDeleted={(name) =>
            setContactFilters((prev) => (prev.group === name ? { ...prev, group: null } : prev))
          }
          onGroupRenamed={(name, newName) =>
            setContactFilters((prev) => (prev.group === name ? { ...prev, group: newName } : prev))
          }
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 도구줄(매물관리와 같은 두 줄): 첫 줄은 분류 + 검색 + 추가 — 사이드바 머리줄과 높이를 맞춘다 */}
        <section className="flex h-[51px] shrink-0 items-center gap-2 border-b border-border bg-white px-3">
          <ContactCategoriesToggle
            open={isCategoriesPanelOpen}
            label={
              activeFilterCount > 1
                ? `조건 ${activeFilterCount}개`
                : contactFilters.tag
                  ? `태그 ${contactFilters.tag}`
                  : resolveContactCategory(categoryId).label
            }
            onToggle={toggleCategoriesPanel}
          />
          <div className="flex min-w-[160px] max-w-[360px] flex-1">
            <ToolbarPillSearch
              value={search}
              onChange={setSearch}
              placeholder="이름, 전화번호"
              ariaLabel="연락처 검색"
            />
          </div>
          <Button size="sm" asChild className="ml-auto h-[30px] shrink-0 rounded-[8px] px-3">
            <Link to="/contacts/new">
              <Plus className="size-3.5" />
              연락처 추가
            </Link>
          </Button>
        </section>

        {/* 둘째 줄: 필터 칩 — 매물관리 필터 줄과 같은 칩. 고르기 전에는 "아이콘 이름 ⌄", 고르면 파란 알약.
            칩이 많아 넘치면 다음 줄로 내린다. 표 머리에 윗선이 없어 여기 아랫선이 표와 나눈다. */}
        <section className="flex min-h-[44px] shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {CONTACT_CATEGORY_SECTIONS.map((section, sectionIndex) => {
              const selectedKey = contactFilters.keys[sectionIndex];
              const setKey = (key: ContactCategoryKey | null) =>
                setContactFilters((prev) => ({
                  ...prev,
                  keys: prev.keys.map((item, index) => (index === sectionIndex ? key : item)),
                }));
              return (
                <ToolbarFilterChip
                  key={section.label}
                  shape="soft"
                  icon={CONTACT_FILTER_SECTION_ICONS[sectionIndex]}
                  label={section.label}
                  summary={
                    selectedKey
                      ? (section.categories.find((item) => item.id === selectedKey)?.label ?? null)
                      : null
                  }
                  onClear={() => setKey(null)}
                  contentClassName="w-[220px] p-1"
                >
                  {(close) => (
                    <ContactFilterOptionList
                      ariaLabel={`${section.label} 필터`}
                      options={section.categories.map((item) => ({
                        value: item.id,
                        label: item.label,
                        count: categorySummary.data?.counts[item.id as ContactCategoryKey],
                      }))}
                      selected={selectedKey}
                      onSelect={(value) => {
                        setKey(value as ContactCategoryKey | null);
                        close();
                      }}
                    />
                  )}
                </ToolbarFilterChip>
              );
            })}
            {groupOptions.length > 0 && (
              <ToolbarFilterChip
                shape="soft"
                icon={<Users />}
                label="그룹"
                summary={contactFilters.group}
                onClear={() => setContactFilters((prev) => ({ ...prev, group: null }))}
                contentClassName="w-[220px] p-1"
              >
                {(close) => (
                  <ContactFilterOptionList
                    ariaLabel="그룹 필터"
                    options={groupOptions.map((name) => ({
                      value: name,
                      label: name,
                      count: categorySummary.data?.groups.find((group) => group.name === name)
                        ?.count,
                    }))}
                    selected={contactFilters.group}
                    onSelect={(value) => {
                      setContactFilters((prev) => ({ ...prev, group: value }));
                      close();
                    }}
                  />
                )}
              </ToolbarFilterChip>
            )}
            {tagOptions.length > 0 && (
              <ToolbarFilterChip
                shape="soft"
                icon={<Tag />}
                label="태그"
                summary={contactFilters.tag}
                onClear={() => setContactFilters((prev) => ({ ...prev, tag: null }))}
                contentClassName="w-[220px] p-1"
              >
                {(close) => (
                  <ContactFilterOptionList
                    ariaLabel="태그 필터"
                    options={tagOptions.map((tag) => ({
                      value: tag.name,
                      label: tag.name,
                      count: tag.count,
                    }))}
                    selected={contactFilters.tag}
                    onSelect={(value) => {
                      setContactFilters((prev) => ({ ...prev, tag: value }));
                      close();
                    }}
                  />
                )}
              </ToolbarFilterChip>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 self-start">
            <ContactColumnSettings overrides={columnOverrides} onChange={changeColumnOverrides} />
            <Select
              value={activeSorts[0]?.field ?? 'updatedAt'}
              onValueChange={handleSortChange}
            >
              <SelectTrigger
                aria-label="정렬"
                className="h-7 w-auto shrink-0 gap-1.5 rounded-full border-transparent bg-transparent px-2.5 text-[13px] text-[#6f6c66] shadow-none hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground"
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
              <button
                type="button"
                className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                onClick={handleFiltersReset}
              >
                <RotateCcw className="size-3.5" />
                초기화
              </button>
            )}
          </div>
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
                propertyListTone
                rowHeight={CONTACT_ROW_HEIGHT}
                scrollResetKey={JSON.stringify(apiParams)}
                getRowSelectionLabel={(contact) => `${contact.name} 선택`}
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
                          : `${activeFilterCount === 0 ? '연락처' : activeFilterCount > 1 ? `조건 ${activeFilterCount}개` : contactFilters.tag ? `태그 ${contactFilters.tag}` : resolveContactCategory(categoryId).label} ${contacts.length.toLocaleString()} / ${totalCount.toLocaleString()}건`}
                      {!isLoading && activeSorts[0] ? ` · ${activeSorts[0].label}순` : ''}
                      {!isLoading && hasNextPage && !isFetchingNextPage
                        ? ' · 아래로 스크롤하면 더 불러옵니다'
                        : ''}
                      {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                      {!isLoading && !focusedRow ? ' · 두 번 누르면 상세 패널' : ''}
                    </span>
                  );
                }}
              />
            )}
          </div>
        </section>
      </div>

      {selectedContactId ? (
        <ContactInspector
          key={selectedContactId}
          contactId={selectedContactId}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          onClose={closeInspector}
          onExited={finishClosingInspector}
        />
      ) : null}
    </div>
  );
}

/** 상담분석과 같은 표기: "오늘" · "어제" · "11.4" · 다른 해는 "25.12.28" (좁은 칸이라 요일은 뺀다) */
function formatConsultDate(value: string) {
  return formatConsultationDay(value, new Date(), { withWeekday: false });
}

/** 계산된 특징과 속한 그룹을 한 줄 글자로 합친다. 태그는 태그 열이 따로 보여 준다. */
function getContactLabels(contact: Contact): string[] {
  return Array.from(
    new Set([
      ...(contact.roles ?? []).map((role) => CONTACT_CATEGORY_LABELS[role]),
      ...(contact.groups ?? []),
    ]),
  );
}

/** 꼬리표 칸(태그 · 구분). 칸이 좁으면 넘치는 것은 잘리고, 전체는 풍선 글로 본다. */
function ContactChipsCell({ labels, emptyLabel }: { labels: string[]; emptyLabel: string }) {
  if (labels.length === 0) return <span className="sr-only">{emptyLabel}</span>;

  return (
    <div title={labels.join(' · ')} className="flex min-w-0 items-center gap-1 overflow-hidden">
      {labels.map((label) => (
        <span key={label} className={contactTagClassName}>
          {label}
        </span>
      ))}
    </div>
  );
}

/** 표에 보일 열을 고른다 (매물관리의 컬럼 설정과 같은 모양). 이름 열은 늘 보인다. */
function ContactColumnSettings({
  overrides,
  onChange,
}: {
  overrides: ContactColumnOverrides;
  onChange: (update: (current: ContactColumnOverrides) => ContactColumnOverrides) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="컬럼 설정"
          title="컬럼 설정"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(60,52,40,0.06)]"
        >
          <Columns3 className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">표에 표시할 열</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked disabled className="py-1 text-[13px]">
          이름
          <span className="ml-auto text-xs text-muted-foreground">기준 열</span>
        </DropdownMenuCheckboxItem>
        {CONTACT_OPTIONAL_COLUMNS.map(({ id, label }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={isContactColumnVisible(overrides, id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange((current) => setContactColumnVisible(current, id, checked === true))
            }
            className="py-1 text-[13px]"
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(() => ({}))}>
          <RotateCcw />
          기본 표시로 되돌리기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 최근 상담 칸 — 날짜·종류와 내용 한 줄. 누르면 상담이 모두 보이는 상세 패널을 연다. */
function ContactConsultationCell({
  contact,
  onOpenConsultation,
}: {
  contact: Contact;
  onOpenConsultation: (contact: Contact) => void;
}) {
  const consultation = contact.latestConsultation;
  if (!consultation) return <span className="sr-only">상담 기록 없음</span>;

  return (
    // 목록 API가 상담 id를 주지 않아 상담 상세 대신 전체 상담이 보이는 상세 패널을 연다.
    <button
      type="button"
      aria-label={`${contact.name} 최근 상담 열기`}
      title={consultationDisplayText(consultation.content)}
      onClick={(event) => {
        event.stopPropagation();
        onOpenConsultation(contact);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className="group/consult flex w-full min-w-0 items-baseline gap-2 rounded-sm text-left text-[14px] leading-[21px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatConsultDate(consultation.createdAt)}{' '}
        {consultationTypeLabels[consultation.type] ?? consultation.type}
      </span>
      <span className="min-w-0 truncate text-foreground underline-offset-2 group-hover/consult:underline">
        {consultationDisplayText(consultation.content).replace(/\s+/g, ' ')}
      </span>
    </button>
  );
}

function ContactHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    // 매물관리 표 머리(TableHeaderLabel)와 같은 모양: 13px 보통 굵기, 16px 아이콘
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">{icon}</span>
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
  return apiErrorMessage(error, fallback);
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
  const groups = summary.data?.groups ?? [];

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
    return <span className="sr-only">전화번호 없음</span>;
  }

  const [primary, ...rest] = phones;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={cn(contactCellNumber, 'truncate')}>
        {formatPhone(primary)}
      </span>
      {rest.length > 0 && (
        <span
          title={rest.map((phone) => formatPhone(phone)).join(', ')}
          className="inline-flex h-5 shrink-0 cursor-default items-center rounded-[4px] bg-[#f1f1ef] px-1.5 text-[12px] tabular-nums text-[#5f5e5b]"
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
    return <span className="sr-only">{label} 없음</span>;
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
        className="gap-0.5 px-1.5 text-[14px] font-normal tabular-nums shadow-none"
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
    ...buyerRequirementQueries.list({ contactId: contact.id, limit }),
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
      aria-label={`${contact.name} 희망 조건`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-4 pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <Target className="size-3.5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <span className="text-[12.5px] font-semibold text-foreground">희망 조건</span>
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
            희망 조건을 불러오는 중...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5"
          >
            <span className="text-xs text-destructive">희망 조건을 불러오지 못했습니다.</span>
            <Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            등록된 희망 조건이 없습니다.
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
      aria-label={`${contact.name} 연결 매물`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-4 pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
            <Building2 className="size-3.5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
            <span className="text-[12.5px] font-semibold text-foreground">연결 매물</span>
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
            연결 매물을 불러오는 중...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5"
          >
            <span className="text-xs text-destructive">연결 매물을 불러오지 못했습니다.</span>
            <Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            연결된 매물이 없습니다.
          </div>
        ) : (
          <div className="mb-0 ml-8 mr-0 mt-1.5 flex flex-col gap-1.5">
            {items.map((propertyContact) => {
              const title = placeLabelOf(propertyContact.property) || '이름 없는 매물';
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

