import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type {
  BuyerIntakeLifecycleStatus,
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseLedgerMode,
  BrokerageCaseLedgerSortField,
  BrokerageCaseListingIntent,
  UpdateBuyerRequirementDto,
  UpdateContactDto,
  UpdateListingDto,
  UpdateListingIntakeDto,
} from "@estate-erp/api-client";
import {
  pyeongToSqm,
  sqmToPyeong,
  TRANSACTION_TYPE_LABELS,
} from "@estate-erp/shared";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  CircleDot,
  Columns3,
  FileText,
  GitBranch,
  Hash,
  List,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Type,
  UserCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  formatDateShortYear,
  formatDday,
  formatMoney,
  formatPhone,
  formatPyeong,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CellEditProvider,
  DateRangeFilterBody,
  EditableCell,
  NumberRangeFilterBody,
  type ActiveFilter,
  type ChipOption,
  type FilterDefinition,
} from "@/components/data-table";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
  getNextCustomerLedgerSort,
} from "../customers/-customer-list-filters";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "../customers/-customer-ledger-pagination";
import { CustomerCaseActionMenu } from "../customers/-customer-case-action-menu";
import {
  CONSULTATION_TYPE_LABELS,
  getFollowUpState,
} from "../buyer-requirements/-buyer-utils";
import { LedgerMatchPanel } from "../wanted-properties/-ledger-match-panel";
import {
  AddFilterMenu,
  ChecklistFilterPanel,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarPillToggle,
  toolbarGhostButtonClassName,
  type AddFilterItem,
} from "../properties/-components/property-toolbar";
import "../customers/-customer-ledger.css";

export const Route = createFileRoute("/_authenticated/customers-table/")({
  component: CustomersPage,
});

type SortOrder = "asc" | "desc";
type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">;

const PAGE_SIZE = 20;
type LedgerColumnKey =
  | "select"
  | "customer"
  | "phone"
  | "actions"
  | "kind"
  | "transaction"
  | "intake"
  | "status"
  | "budgetMin"
  | "budgetMax"
  | "rentMin"
  | "rentMax"
  | "areaMin"
  | "areaMax"
  | "match"
  | "assignee"
  | "next"
  | "consult"
  | "memo"
  | "created";

// 매물관리 표처럼 식별 열을 왼쪽에 고정하고, 남는 폭은 메모 열이 가져간다.
// 의뢰 1건은 1행이다. 매물 의뢰의 금액·월세·평형은 최소·최대 2열을 colSpan으로 합쳐 표시한다.
const LEDGER_COLUMNS: ReadonlyArray<{ key: LedgerColumnKey; width: number }> = [
  { key: "select", width: 36 },
  // 최근 상담 펼침 버튼 열. 상담 내용은 희망매물의 고객 메모처럼 의뢰 행 아래에 펼친다.
  { key: "consult", width: 28 },
  { key: "customer", width: 108 },
  { key: "phone", width: 128 },
  { key: "actions", width: 40 },
  { key: "kind", width: 66 },
  { key: "transaction", width: 60 },
  { key: "intake", width: 220 },
  { key: "status", width: 80 },
  { key: "budgetMin", width: 112 },
  { key: "budgetMax", width: 112 },
  { key: "rentMin", width: 84 },
  { key: "rentMax", width: 84 },
  { key: "areaMin", width: 84 },
  { key: "areaMax", width: 84 },
  { key: "match", width: 66 },
  { key: "assignee", width: 72 },
  { key: "next", width: 104 },
  { key: "memo", width: 180 },
  { key: "created", width: 78 },
];

// 메모 열은 폭을 지정하지 않아 남는 공간을 가져간다. 위 width는 표의 최소 폭 계산에만 쓴다.
const LEDGER_GROW_COLUMN: LedgerColumnKey = "memo";

const OPTIONAL_COLUMN_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  keys: readonly LedgerColumnKey[];
}> = [
  { id: "kind", label: "구분", keys: ["kind"] },
  { id: "transaction", label: "거래", keys: ["transaction"] },
  { id: "status", label: "상태", keys: ["status"] },
  { id: "area", label: "최소·최대 평형", keys: ["areaMin", "areaMax"] },
  { id: "match", label: "매칭", keys: ["match"] },
  { id: "assignee", label: "담당", keys: ["assignee"] },
  { id: "next", label: "다음 연락", keys: ["next"] },
  { id: "consult", label: "최근 상담", keys: ["consult"] },
  { id: "memo", label: "의뢰 메모", keys: ["memo"] },
  { id: "created", label: "등록일", keys: ["created"] },
];

const SORT_FIELD_COLUMN: Partial<
  Record<BrokerageCaseLedgerSortField, LedgerColumnKey>
> = {
  monthlyRentMin: "rentMin",
  monthlyRentMax: "rentMax",
  areaMin: "areaMin",
  areaMax: "areaMax",
  matchCount: "match",
  createdAt: "created",
};

// 선택 + 고객 + 연락처 + 작업. -customer-ledger.css의 sticky left 값과 맞춘다.
// 최근 상담 펼침 버튼 열은 숨길 수 있어 표시 중일 때만 더한다.
const LEDGER_PINNED_WIDTH = 312;
// 상담 줄은 고정 칸(선택 + 펼침 + 고객 + 연락처 + 작업) 오른쪽에서 시작한다.
const LEDGER_PINNED_COLUMN_COUNT = 5;
const COLUMN_GUIDE_LEAD = 4;
const COLUMN_GUIDE_TOGGLE_SIZE = 20;

const PRIMARY_FILTER_FIELDS = [
  "transactionType",
  "status",
  "assignedToId",
  "nextContact",
];
const PLACE_FILTER_FIELDS = ["preferredRegions", "preferredSites"];
const MORE_FILTER_ICONS: Record<string, ReactNode> = {
  urgency: <CircleAlert />,
  price: <CircleDollarSign />,
  deposit: <CircleDollarSign />,
  monthlyRent: <CircleDollarSign />,
  area: <Hash />,
  moveIn: <CalendarDays />,
};

const MODE_OPTIONS: Array<{
  value: CustomerLedgerMode;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "listing", label: "내놓음" },
];

interface ListingGroup {
  intakeId: string;
  lines: BrokerageCaseListingIntent[];
}

type LedgerUpdateRequest =
  | { target: "contact"; id: string; patch: UpdateContactDto }
  | {
      target: "buyer-intake";
      id: string;
      patch: { lifecycleStatus: BuyerIntakeLifecycleStatus };
    }
  | {
      target: "buyer-requirement";
      id: string;
      patch: UpdateBuyerRequirementDto;
    }
  | {
      target: "buyer-requirement-priority";
      id: string;
      priorityRank: number;
    }
  | { target: "listing"; id: string; patch: UpdateListingDto }
  | {
      target: "listing-intake";
      id: string;
      patch: UpdateListingIntakeDto;
    };

const LIFECYCLE_OPTIONS: ChipOption[] = [
  {
    label: "진행중",
    value: "open",
    className: "bg-[#eef3ed] text-[#44745a]",
  },
  {
    label: "보류",
    value: "hold",
    className: "bg-[#fbf3db] text-[#9f6b00]",
  },
  {
    label: "종료",
    value: "closed",
    className: "bg-[#f1f1ef] text-[#6f6d6a]",
  },
];

const TRANSACTION_OPTIONS: ChipOption[] = [
  {
    label: "매매",
    value: "sale",
    className: "bg-[#fdebec] text-[#8f4b46]",
  },
  {
    label: "전세",
    value: "jeonse",
    className: "bg-[#e7f3f8] text-[#337ea9]",
  },
  {
    label: "월세",
    value: "monthly",
    className: "bg-[#fbf3db] text-[#8f6b1f]",
  },
];

// 빠르게 고르는 다음 연락 일정. 날짜를 직접 고르는 항목은 아래 옵션에서 따로 붙인다.
const NEXT_CONTACT_PRESETS = [
  { label: "오늘", value: "0" },
  { label: "내일", value: "1" },
  { label: "3일 뒤", value: "3" },
  { label: "다음 주", value: "7" },
] as const;

const NEXT_CONTACT_OPTIONS: ChipOption[] = [
  ...NEXT_CONTACT_PRESETS,
  {
    label: "날짜 선택",
    value: "pick",
    picker: "date",
    fromField: "nextContactDate",
    getPreselect: (value) =>
      typeof value === "string" ? new Date(value) : undefined,
  },
];

// 케이스 1개를 렌더할 행 단위. sticky 셀 rowSpan은 이 배열 길이에 펼친 상담 줄을 더한 값이다.
type RowDescriptor =
  | { type: "intent"; line: BrokerageCaseDemandIntent }
  | { type: "stack"; group: ListingGroup };

function groupListingIntents(
  lines: BrokerageCaseListingIntent[],
): ListingGroup[] {
  const groups: ListingGroup[] = [];
  for (const line of lines) {
    const existing = groups.find((g) => g.intakeId === line.listingIntakeId);
    if (existing) existing.lines.push(line);
    else groups.push({ intakeId: line.listingIntakeId, lines: [line] });
  }
  return groups;
}

function demandMatchRowKey(requirementId: string) {
  return `demand:${requirementId}`;
}

function listingMatchRowKey(listingIntakeId: string) {
  return `listing:${listingIntakeId}`;
}

function matchPanelId(rowKey: string) {
  return `customer-ledger-match-panel-${rowKey.replace(":", "-")}`;
}

function demandPriorityOptions(requirementCount: number): ChipOption[] {
  return Array.from({ length: requirementCount }, (_, index) => {
    const priorityRank = index + 1;
    return {
      label: `${priorityRank}순위`,
      value: String(priorityRank),
      className: "bg-info-soft text-info-strong",
    };
  });
}

// 구함은 요건당 1행, 매물 의뢰는 ListingIntake(같은 호실)당 1행이다.
// 매물 의뢰의 listing은 그 행의 셀 안에 세로로 쌓는다.
function buildRowDescriptors(brokerageCase: BrokerageCase): RowDescriptor[] {
  const rows: RowDescriptor[] = [];
  for (const line of brokerageCase.demandIntents) {
    rows.push({ type: "intent", line });
  }
  for (const group of groupListingIntents(brokerageCase.listingIntents)) {
    rows.push({ type: "stack", group });
  }
  return rows;
}

function localDateString(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// 같은 해의 날짜는 연도를 빼고 "11.06"으로 줄인다.
function formatLedgerDate(value: string) {
  const short = formatDateShortYear(value);
  return new Date(value).getFullYear() === new Date().getFullYear()
    ? short.slice(3)
    : short;
}

// 평형은 좁은 열에 들어가므로 "25.0평"의 군더더기 소수점을 뺀다.
function formatLedgerPyeong(value: number | null) {
  return value === null ? "-" : formatPyeong(value).replace(/\.0평$/, "평");
}

// 월세 열을 접으면 중개사가 흔히 쓰는 "보증금/월세" 표기로 한 칸에 보여 준다.
function formatLedgerAmount(value: number | null, rent?: number | null) {
  const amount = value === null ? "-" : formatMoney(value);
  return rent ? `${amount}/${rent.toLocaleString()}만` : amount;
}

function summarizeLedgerFilter(
  def: FilterDefinition,
  existing: ActiveFilter | undefined,
): string | null {
  if (!existing) return null;
  if (existing.operator === "in" && existing.values?.length) {
    const labels =
      existing.displayValues?.length === existing.values.length
        ? existing.displayValues
        : existing.values.map(
            (value) =>
              def.options?.find((option) => option.value === value)?.label ??
              value,
          );
    return labels.length === 1
      ? labels[0]
      : `${labels[0]} 외 ${labels.length - 1}`;
  }
  if (existing.operator === "between") {
    const unit = def.unit ? ` ${def.unit}` : "";
    const min = existing.valueMin ?? "";
    const max = existing.valueMax ?? "";
    if (min && max) return `${min} ~ ${max}${unit}`;
    if (min) return `${min}${unit} 이상`;
    if (max) return `${max}${unit} 이하`;
  }
  return null;
}

function CustomersPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [mode, setMode] = useState<CustomerLedgerMode>("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] =
    useState<BrokerageCaseLedgerSortField | null>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [rentColumnsOpen, setRentColumnsOpen] = useState(false);
  const [hiddenColumnGroups, setHiddenColumnGroups] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isPlaceFilterOpen, setIsPlaceFilterOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [expandedMatchRows, setExpandedMatchRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [cellEditStatus, setCellEditStatus] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ledgerScrollRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [ledgerScrollState, setLedgerScrollState] = useState({
    hasOverflow: false,
    canScrollRight: false,
  });
  const queryClient = useQueryClient();
  const createTab = useTabStore((state) => state.createTab);
  const handleCreateDemandIntake = useCallback(() => {
    const route = "/buyer-requirements/new";
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  }, [createTab]);
  // 보기 전환이라 새 탭을 열지 않고 지금 탭에서 바꾼다.
  const handleOpenCaseView = useCallback(() => {
    const route = "/customers";
    const meta = getRouteMeta(route);
    void navigateActiveTab({ route, kind: meta.kind, title: meta.title });
  }, []);
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.findAll(),
  });
  const assigneeOptions = useMemo<ChipOption[]>(
    () =>
      (employeesQuery.data ?? [])
        .filter((employee) => employee.isActive)
        .map((employee) => ({ label: employee.name, value: employee.id })),
    [employeesQuery.data],
  );

  const allFilterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      ...customerLedgerFilterDefinitions,
      {
        id: "assignedToId",
        field: "assignedToId",
        label: "담당",
        type: "multiSelect",
        operators: ["in"],
        options: assigneeOptions,
      },
      {
        id: "preferredSites",
        field: "preferredSites",
        label: "희망 단지",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (query) => {
          const sites = await api.officeSites.searchCentral(query);
          return sites.slice(0, 30).map((site) => ({
            label: site.name,
            value: site.id,
          }));
        },
      },
      {
        id: "preferredRegions",
        field: "preferredRegions",
        label: "희망 지역",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (query) => {
          const regions = await api.regions.search(query, 20);
          return regions.map((region) => ({
            value: `${region.level}:${region.code}`,
            label: region.fullName,
          }));
        },
      },
    ],
    [assigneeOptions],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const scrollRegion = ledgerScrollRef.current;
    if (!scrollRegion) return;

    const updateScrollCue = () => {
      const maxScrollLeft = Math.max(
        0,
        scrollRegion.scrollWidth - scrollRegion.clientWidth,
      );
      const nextState = {
        hasOverflow: maxScrollLeft > 1,
        canScrollRight: scrollRegion.scrollLeft < maxScrollLeft - 1,
      };
      setLedgerScrollState((current) =>
        current.hasOverflow === nextState.hasOverflow &&
        current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState,
      );
    };

    updateScrollCue();
    scrollRegion.addEventListener("scroll", updateScrollCue, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollCue);
    resizeObserver.observe(scrollRegion);
    const table = scrollRegion.querySelector(".customer-ledger-table");
    if (table) resizeObserver.observe(table);

    return () => {
      scrollRegion.removeEventListener("scroll", updateScrollCue);
      resizeObserver.disconnect();
    };
  }, []);

  const filters = useMemo(
    () => ({
      ...customerLedgerFiltersToApiParams(activeFilters),
      search: deferredSearch.trim() || undefined,
      mode,
      sortBy: sortBy ?? undefined,
      sortOrder: sortBy ? sortOrder : undefined,
      limit: PAGE_SIZE,
    }),
    [activeFilters, deferredSearch, mode, sortBy, sortOrder],
  );

  useEffect(() => {
    setSelectedCaseIds([]);
    if (ledgerScrollRef.current) ledgerScrollRef.current.scrollTop = 0;
  }, [filters]);

  const ledgerQuery = useInfiniteQuery({
    queryKey: ["brokerage-cases", "ledger", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.brokerageCases.ledger({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: getNextLedgerCursor,
  });

  useEffect(() => {
    const scrollRegion = ledgerScrollRef.current;
    const loadMoreTarget = loadMoreRef.current;
    if (
      !scrollRegion ||
      !loadMoreTarget ||
      !ledgerQuery.hasNextPage ||
      ledgerQuery.isFetching ||
      ledgerQuery.isFetchingNextPage ||
      ledgerQuery.isFetchNextPageError
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void ledgerQuery.fetchNextPage();
      },
      {
        root: scrollRegion,
        rootMargin: "0px 0px 240px 0px",
      },
    );
    observer.observe(loadMoreTarget);

    return () => observer.disconnect();
  }, [
    ledgerQuery.fetchNextPage,
    ledgerQuery.hasNextPage,
    ledgerQuery.isFetchNextPageError,
    ledgerQuery.isFetching,
    ledgerQuery.isFetchingNextPage,
  ]);

  const ledgerUpdateMutation = useMutation<unknown, Error, LedgerUpdateRequest>(
    {
      mutationFn: (request: LedgerUpdateRequest) => {
        switch (request.target) {
          case "contact":
            return api.contacts.update(request.id, request.patch);
          case "buyer-intake":
            return api.buyerIntakes.update(request.id, request.patch);
          case "buyer-requirement":
            return api.buyerRequirements.update(request.id, request.patch);
          case "buyer-requirement-priority":
            return api.buyerRequirements.reorder(
              request.id,
              request.priorityRank,
            );
          case "listing":
            return api.listings.update(request.id, request.patch);
          case "listing-intake":
            return api.listingIntakes.update(request.id, request.patch);
        }
      },
      onMutate: async () => {
        setCellEditStatus("변경사항을 저장하는 중입니다.");
        await queryClient.cancelQueries({ queryKey: ["brokerage-cases"] });
      },
      onSuccess: (_data, request) => {
        setCellEditStatus("변경사항을 저장했습니다.");
        const relatedKeys =
          request.target === "contact"
            ? [["contacts"]]
            : request.target === "buyer-intake"
              ? [["buyer-intakes"]]
              : request.target === "buyer-requirement"
                ? [["buyer-requirements"]]
                : request.target === "buyer-requirement-priority"
                  ? [["buyer-requirements"]]
                  : request.target === "listing-intake"
                    ? [["listing-intakes"]]
                    : [["listings"], ["listing-intakes"]];
        for (const queryKey of relatedKeys) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
      onError: (error: Error) => {
        setCellEditStatus("변경사항을 저장하지 못했습니다.");
        toast.error(error.message || "셀 값을 저장하지 못했습니다.");
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: ["brokerage-cases"] });
      },
    },
  );

  const toggleMatchRow = (
    rowKey: string,
    siblingRowKeys: readonly string[],
  ) => {
    setExpandedMatchRows((current) => {
      const wasExpanded = current.has(rowKey);
      const next = new Set(current);
      for (const siblingRowKey of siblingRowKeys) {
        next.delete(siblingRowKey);
      }
      if (!wasExpanded) next.add(rowKey);
      return next;
    });
  };

  const ledgerCases = useMemo(
    () => mergeLedgerPages(ledgerQuery.data?.pages),
    [ledgerQuery.data?.pages],
  );
  const firstPage = ledgerQuery.data?.pages[0];
  const totalCases = firstPage?.pagination.total ?? 0;
  const loadedRequestCount = useMemo(
    () =>
      ledgerCases.reduce(
        (total, brokerageCase) =>
          total + buildRowDescriptors(brokerageCase).length,
        0,
      ),
    [ledgerCases],
  );
  const ledgerStatusMessage = ledgerQuery.isLoading
    ? "고객 원장을 불러오는 중입니다."
    : ledgerQuery.isFetchNextPageError
      ? "추가 고객 케이스를 불러오지 못했습니다. 다시 시도할 수 있습니다."
      : ledgerQuery.isFetchingNextPage
        ? "고객 케이스를 더 불러오는 중입니다."
        : ledgerQuery.hasNextPage
          ? `현재 ${ledgerCases.length}개, 총 ${totalCases}개 고객 케이스를 불러왔습니다. 아래로 스크롤하면 계속 불러옵니다.`
          : totalCases > 0
            ? `고객 케이스 ${totalCases}개를 모두 불러왔습니다.`
            : "표시할 고객 케이스가 없습니다.";
  const visibleCaseIds = useMemo(
    () =>
      ledgerCases
        .filter(
          (brokerageCase) => buildRowDescriptors(brokerageCase).length > 0,
        )
        .map((brokerageCase) => brokerageCase.id),
    [ledgerCases],
  );
  const selectedCaseIdSet = useMemo(
    () => new Set(selectedCaseIds),
    [selectedCaseIds],
  );
  const allVisibleCasesSelected =
    visibleCaseIds.length > 0 &&
    visibleCaseIds.every((id) => selectedCaseIdSet.has(id));
  const someVisibleCasesSelected = visibleCaseIds.some((id) =>
    selectedCaseIdSet.has(id),
  );

  const toggleCaseSelection = (caseId: string, selected: boolean) => {
    setSelectedCaseIds((current) => {
      if (selected) {
        return current.includes(caseId) ? current : [...current, caseId];
      }
      return current.filter((id) => id !== caseId);
    });
  };
  const summary = firstPage?.summary ?? {
    cases: 0,
    demand: 0,
    listing: 0,
    both: 0,
  };
  const modeCount = (value: CustomerLedgerMode) => {
    if (value === "all") return summary.cases;
    return summary[value];
  };

  const changeSort = (field: BrokerageCaseLedgerSortField) => {
    const nextSort = getNextCustomerLedgerSort(
      { sortBy, sortOrder },
      field,
    );
    setSortBy(nextSort.sortBy);
    setSortOrder(nextSort.sortOrder);
  };

  const addFilter = (filter: ActiveFilter) => {
    setActiveFilters((current) => [
      ...current.filter((item) => item.field !== filter.field),
      filter,
    ]);
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters((current) =>
      current.filter((filter) => filter.id !== filterId),
    );
  };

  const resetFilters = () => {
    setSearch("");
    setMode("all");
    setActiveFilters([]);
    setSortBy("createdAt");
    setSortOrder("desc");
  };

  const visibleColumns = useMemo(() => {
    const hiddenKeys = new Set<LedgerColumnKey>(
      OPTIONAL_COLUMN_GROUPS.filter((group) =>
        hiddenColumnGroups.has(group.id),
      ).flatMap((group) => group.keys),
    );
    return LEDGER_COLUMNS.filter(
      (column) =>
        !hiddenKeys.has(column.key) &&
        (rentColumnsOpen ||
          (column.key !== "rentMin" && column.key !== "rentMax")),
    );
  }, [hiddenColumnGroups, rentColumnsOpen]);
  const visibleColumnKeys = useMemo<ReadonlySet<LedgerColumnKey>>(
    () => new Set(visibleColumns.map((column) => column.key)),
    [visibleColumns],
  );
  const columnCount = visibleColumns.length;
  const tableMinWidth = visibleColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  // 정렬 중인 열을 접거나 숨기면 화살표가 사라지므로 기본 정렬로 되돌린다.
  useEffect(() => {
    const column = sortBy ? SORT_FIELD_COLUMN[sortBy] : undefined;
    if (column && !visibleColumnKeys.has(column)) {
      setSortBy("createdAt");
      setSortOrder("desc");
    }
  }, [sortBy, visibleColumnKeys]);

  const filterDefinitionByField = useMemo(
    () =>
      new Map(allFilterDefinitions.map((def) => [def.field, def] as const)),
    [allFilterDefinitions],
  );
  const activeFilterByField = useMemo(
    () =>
      new Map(activeFilters.map((filter) => [filter.field, filter] as const)),
    [activeFilters],
  );
  const placeFilterDefinitions = useMemo(
    () =>
      allFilterDefinitions.filter((def) =>
        PLACE_FILTER_FIELDS.includes(def.field),
      ),
    [allFilterDefinitions],
  );
  const moreFilterDefinitions = allFilterDefinitions.filter(
    (def) =>
      !PRIMARY_FILTER_FIELDS.includes(def.field) &&
      !PLACE_FILTER_FIELDS.includes(def.field),
  );
  const moreFilterItems: AddFilterItem[] = moreFilterDefinitions.map((def) => {
    const existing = activeFilterByField.get(def.field);
    return {
      key: def.field,
      label: def.label,
      icon: MORE_FILTER_ICONS[def.field] ?? <Tag />,
      summary: summarizeLedgerFilter(def, existing),
      contentClassName:
        def.type === "multiSelect" ? "w-[180px] p-0" : "w-64 p-3",
      render: (close) => (
        <LedgerFilterBody
          def={def}
          existing={existing}
          onApply={addFilter}
          onClear={() => existing && removeFilter(existing.id)}
          close={close}
        />
      ),
    };
  });

  const hasActiveControls =
    search.trim() !== "" ||
    mode !== "all" ||
    activeFilters.length > 0 ||
    (sortBy !== null &&
      (sortBy !== "createdAt" || sortOrder !== "desc"));

  return (
    <CellEditProvider>
      <main className="customer-ledger-page -m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <h1 className="sr-only">고객 원장</h1>
        <section
          className="@container shrink-0 bg-white px-3 py-2"
          aria-label="고객 원장 보기 및 검색"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ToolbarPillTabs
              ariaLabel="거래 보기 필터"
              value={mode}
              onChange={setMode}
              options={MODE_OPTIONS.map((option) => ({
                ...option,
                count: modeCount(option.value),
              }))}
            />
            <LedgerSearchBar
              ref={searchRef}
              search={search}
              onSearchChange={setSearch}
              open={isPlaceFilterOpen}
              onOpenChange={setIsPlaceFilterOpen}
              definitions={placeFilterDefinitions}
              activeFilterByField={activeFilterByField}
              onApply={addFilter}
              onRemove={removeFilter}
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ToolbarPillToggle
                ariaLabel="고객 원장 보기 방식"
                value="table"
                onChange={(view) => {
                  if (view === "customers") handleOpenCaseView();
                }}
                options={[
                  { value: "table", label: "표", icon: <List /> },
                  {
                    value: "customers",
                    label: "고객 중심",
                    icon: <UsersRound />,
                  },
                ]}
              />
              <Button
                type="button"
                size="sm"
                aria-label="구함 의뢰 추가"
                className="h-[30px] shrink-0 rounded-full px-3.5"
                onClick={handleCreateDemandIntake}
              >
                <Plus className="size-3.5" />
                <span className="@max-3xl:hidden">구함 의뢰 추가</span>
              </Button>
            </div>
          </div>
        </section>

        <section
          className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 pb-2"
          aria-label="고객 원장 상세 필터"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRIMARY_FILTER_FIELDS.map((field) => {
              const def = filterDefinitionByField.get(field);
              if (!def) return null;
              return (
                <LedgerFilterChip
                  key={field}
                  def={def}
                  existing={activeFilterByField.get(field)}
                  onApply={addFilter}
                  onRemove={removeFilter}
                />
              );
            })}
            {moreFilterDefinitions.map((def) =>
              activeFilterByField.has(def.field) ? (
                <LedgerFilterChip
                  key={def.field}
                  def={def}
                  existing={activeFilterByField.get(def.field)}
                  onApply={addFilter}
                  onRemove={removeFilter}
                />
              ) : null,
            )}
            <AddFilterMenu
              items={moreFilterItems}
              hint="거래유형 · 요건상태 · 담당 · 다음 연락일은 이 줄에 늘 보입니다."
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {hasActiveControls ? (
              <>
                <button
                  type="button"
                  className={toolbarGhostButtonClassName}
                  onClick={resetFilters}
                >
                  <RotateCcw className="size-3.5" />
                  초기화
                </button>
                <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={toolbarGhostButtonClassName}>
                  <Columns3 className="size-3.5" />
                  컬럼
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {OPTIONAL_COLUMN_GROUPS.map((group) => (
                  <DropdownMenuCheckboxItem
                    key={group.id}
                    checked={!hiddenColumnGroups.has(group.id)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) =>
                      setHiddenColumnGroups((current) => {
                        const next = new Set(current);
                        if (checked) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                  >
                    {group.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <div
          className="customer-ledger-scroll-shell relative min-h-0 flex-1"
          data-can-scroll-right={ledgerScrollState.canScrollRight || undefined}
        >
          <section
            ref={ledgerScrollRef}
            className="customer-ledger-scroll-region h-full overflow-auto"
            aria-busy={ledgerQuery.isLoading || ledgerQuery.isFetchingNextPage}
          >
            <LedgerColumnGuide
              columns={visibleColumns}
              open={rentColumnsOpen}
              minWidth={tableMinWidth}
              onToggle={() => setRentColumnsOpen((current) => !current)}
            />
            <table
              className="customer-ledger-table"
              style={{ minWidth: tableMinWidth }}
              data-consult-hidden={
                visibleColumnKeys.has("consult") ? undefined : true
              }
              aria-label="고객 중개 케이스 원장"
              aria-describedby={
                ledgerScrollState.hasOverflow
                  ? "customer-ledger-scroll-hint"
                  : undefined
              }
            >
              <colgroup>
                {visibleColumns.map((column) => (
                  <col
                    key={column.key}
                    style={
                      column.key === LEDGER_GROW_COLUMN
                        ? undefined
                        : { width: column.width }
                    }
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="ledger-sticky-select">
                    <Checkbox
                      checked={
                        allVisibleCasesSelected ||
                        (someVisibleCasesSelected && "indeterminate")
                      }
                      disabled={visibleCaseIds.length === 0}
                      onCheckedChange={(checked) =>
                        setSelectedCaseIds(
                          checked === true ? [...visibleCaseIds] : [],
                        )
                      }
                      aria-label={`현재 불러온 ${visibleCaseIds.length}개 고객 케이스 전체 선택`}
                      title={`현재 불러온 ${visibleCaseIds.length}개 고객 케이스 전체 선택`}
                      className="size-3.5"
                    />
                  </th>
                  {visibleColumnKeys.has("consult") ? (
                    <th scope="col" className="ledger-sticky-expand">
                      <span className="sr-only">최근 상담 펼침</span>
                    </th>
                  ) : null}
                  <LedgerHeader
                    className="ledger-sticky-customer"
                    icon={<UserRound />}
                    label="고객"
                    field="customer"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerStaticHeader
                    className="ledger-sticky-phone"
                    icon={<Phone />}
                    label="연락처"
                  />
                  <th scope="col" className="ledger-sticky-action">
                    <span className="sr-only">작업</span>
                  </th>
                  {visibleColumnKeys.has("kind") ? (
                    <LedgerStaticHeader icon={<Tag />} label="구분" />
                  ) : null}
                  {visibleColumnKeys.has("transaction") ? (
                    <LedgerStaticHeader icon={<Tag />} label="거래" />
                  ) : null}
                  <LedgerStaticHeader icon={<Type />} label="의뢰" />
                  {visibleColumnKeys.has("status") ? (
                    <LedgerStaticHeader icon={<CircleDot />} label="상태" />
                  ) : null}
                  <LedgerHeader
                    icon={<CircleDollarSign />}
                    label="최소예산"
                    field="budgetMin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    icon={<CircleDollarSign />}
                    label="최대예산"
                    field="budgetMax"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  {rentColumnsOpen ? (
                    <>
                      <LedgerHeader
                        className="ledger-detail-header"
                        icon={<CircleDollarSign />}
                        label="최소월세"
                        field="monthlyRentMin"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={changeSort}
                      />
                      <LedgerHeader
                        className="ledger-detail-header"
                        icon={<CircleDollarSign />}
                        label="최대월세"
                        field="monthlyRentMax"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={changeSort}
                      />
                    </>
                  ) : null}
                  {visibleColumnKeys.has("areaMin") ? (
                    <>
                      <LedgerHeader
                        icon={<Hash />}
                        label="최소평형"
                        field="areaMin"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={changeSort}
                      />
                      <LedgerHeader
                        icon={<Hash />}
                        label="최대평형"
                        field="areaMax"
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={changeSort}
                      />
                    </>
                  ) : null}
                  {visibleColumnKeys.has("match") ? (
                    <LedgerHeader
                      icon={<GitBranch />}
                      label="매칭"
                      field="matchCount"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={changeSort}
                    />
                  ) : null}
                  {visibleColumnKeys.has("assignee") ? (
                    <LedgerStaticHeader icon={<UserCheck />} label="담당" />
                  ) : null}
                  {visibleColumnKeys.has("next") ? (
                    <LedgerStaticHeader
                      icon={<CalendarClock />}
                      label="다음 연락"
                    />
                  ) : null}
                  {visibleColumnKeys.has("memo") ? (
                    <LedgerStaticHeader icon={<FileText />} label="의뢰 메모" />
                  ) : null}
                  {visibleColumnKeys.has("created") ? (
                    <LedgerHeader
                      icon={<CalendarDays />}
                      label="등록일"
                      field="createdAt"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={changeSort}
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {ledgerQuery.isLoading ? (
                  <LoadingRows columnCount={columnCount} />
                ) : ledgerQuery.isError && ledgerCases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnCount}
                      role="alert"
                      className="h-52 text-center text-sm text-destructive"
                    >
                      고객 원장을 불러오지 못했습니다.
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-3 h-7"
                        onClick={() => void ledgerQuery.refetch()}
                      >
                        다시 시도
                      </Button>
                    </td>
                  </tr>
                ) : ledgerCases.length ? (
                  ledgerCases.map((brokerageCase) => (
                    <CaseRows
                      key={brokerageCase.id}
                      brokerageCase={brokerageCase}
                      selected={selectedCaseIdSet.has(brokerageCase.id)}
                      onSelectionChange={(selected) =>
                        toggleCaseSelection(brokerageCase.id, selected)
                      }
                      expandedMatchRows={expandedMatchRows}
                      onToggleMatchRow={toggleMatchRow}
                      assigneeOptions={assigneeOptions}
                      visibleColumns={visibleColumnKeys}
                      columnCount={columnCount}
                      onUpdate={(request) =>
                        ledgerUpdateMutation.mutate(request)
                      }
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={columnCount} className="h-56 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center text-muted-foreground">
                        <UsersRound
                          className="mb-2 size-8 opacity-35"
                          aria-hidden
                        />
                        <p className="text-sm font-medium text-foreground">
                          표시할 고객 케이스가 없습니다.
                        </p>
                        <p className="mt-1 text-xs">
                          검색어나 필터 조건을 바꿔보세요.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 h-7"
                          onClick={resetFilters}
                        >
                          필터 초기화
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div
              ref={loadMoreRef}
              className="customer-ledger-load-sentinel"
              style={{ minWidth: tableMinWidth }}
              aria-hidden="true"
            />
          </section>
          <span className="customer-ledger-overflow-cue" aria-hidden="true" />
          <span id="customer-ledger-scroll-hint" className="sr-only">
            이 표는 좌우로 스크롤할 수 있습니다.
          </span>
        </div>

        <footer className="flex min-h-7 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-[#faf9f6] px-3 text-[11px] text-muted-foreground">
          <span>
            고객{" "}
            <strong className="font-semibold text-foreground">
              {ledgerCases.length}
            </strong>
            {" / "}
            <strong className="font-semibold text-foreground">
              {totalCases}
            </strong>
            명 · 의뢰{" "}
            <strong className="font-semibold text-foreground">
              {loadedRequestCount}
            </strong>
            건 표시
            {selectedCaseIds.length > 0 ? (
              <>
                <span className="ml-2 font-medium text-foreground">
                  · {selectedCaseIds.length}개 선택됨
                </span>
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2 hover:text-foreground"
                  onClick={() => setSelectedCaseIds([])}
                >
                  선택 해제
                </button>
              </>
            ) : null}
          </span>
          <div className="flex shrink-0 items-center gap-2 tabular-nums">
            {ledgerQuery.isFetchNextPageError ? (
              <>
                <span>추가 로드 실패</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => void ledgerQuery.fetchNextPage()}
                  aria-label="추가 고객 다시 불러오기"
                >
                  다시 시도
                </Button>
              </>
            ) : ledgerQuery.isFetchingNextPage ? (
              <span>더 불러오는 중…</span>
            ) : ledgerQuery.hasNextPage ? (
              <span>아래로 스크롤하면 더 불러옵니다</span>
            ) : totalCases > 0 ? (
              <span>전체 {totalCases}명 불러옴</span>
            ) : null}
          </div>
        </footer>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {ledgerStatusMessage}
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {cellEditStatus}
        </div>
      </main>
    </CellEditProvider>
  );
}

function CaseRows({
  brokerageCase,
  selected,
  onSelectionChange,
  expandedMatchRows,
  onToggleMatchRow,
  assigneeOptions,
  visibleColumns,
  columnCount,
  onUpdate,
}: {
  brokerageCase: BrokerageCase;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
  expandedMatchRows: ReadonlySet<string>;
  onToggleMatchRow: (rowKey: string, siblingRowKeys: readonly string[]) => void;
  assigneeOptions: ChipOption[];
  visibleColumns: ReadonlySet<LedgerColumnKey>;
  columnCount: number;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const [consultExpanded, setConsultExpanded] = useState(true);
  const rows = buildRowDescriptors(brokerageCase);
  if (rows.length === 0) return null;
  const caseMatchRowKeys = rows.map((row) =>
    row.type === "intent"
      ? demandMatchRowKey(row.line.requirementId)
      : listingMatchRowKey(row.group.intakeId),
  );
  const latestConsultation = brokerageCase.latestConsultation;
  const consultVisible = visibleColumns.has("consult");
  const showConsultRow =
    consultVisible && consultExpanded && latestConsultation !== null;
  // 고정 칸을 상담 줄까지 이어, 의뢰와 상담이 한 고객의 덩어리로 보이게 한다.
  const rowSpan = rows.length + (showConsultRow ? 1 : 0);
  const primary = brokerageCase.primaryParticipant;
  const customerName = primary?.contact.name ?? "이름 없음";
  const extraParticipants = brokerageCase.participants.length - 1;

  const selectionCell = (
    <td
      rowSpan={rowSpan}
      className="ledger-sticky-select ledger-select-cell ledger-rowspan-top"
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onSelectionChange(checked === true)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`${customerName} 고객 케이스 선택`}
        className="size-3.5"
      />
    </td>
  );

  const customerCell = (
    <th
      scope="rowgroup"
      rowSpan={rowSpan}
      className="ledger-sticky-customer ledger-customer-cell ledger-rowspan-top"
    >
      <div className="flex h-8 min-w-0 items-center gap-1">
        {primary ? (
          <EditableCell
            recordId={primary.contact.id}
            field="name"
            value={primary.contact.name}
            ariaLabel={`${primary.contact.name} 고객명 편집`}
            onSave={(_recordId, _field, value) => {
              const name = String(value ?? "").trim();
              if (!name) {
                toast.error("고객명은 비워둘 수 없습니다.");
                return false;
              }
              if (name === primary.contact.name) return;
              onUpdate({
                target: "contact",
                id: primary.contact.id,
                patch: { name },
              });
            }}
            editType="text"
            activation="doubleClick"
            editorChrome="floating"
            hoverHighlight={false}
            className="w-auto min-w-0"
          >
            <span className="truncate text-[14px] font-semibold text-slate-900">
              {primary.contact.name}
            </span>
          </EditableCell>
        ) : (
          <span className="text-[14px] font-semibold text-slate-900">
            이름 없음
          </span>
        )}
        {extraParticipants > 0 ? (
          <span
            title={`연결 ${brokerageCase.participants.length}명`}
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            +{extraParticipants}
          </span>
        ) : null}
      </div>
    </th>
  );

  const phoneCell = (
    <td
      rowSpan={rowSpan}
      className="ledger-sticky-phone ledger-phone-cell ledger-rowspan-top"
    >
      {formatPhone(primary?.contact.phone)}
    </td>
  );

  const actionCell = (
    <td
      rowSpan={rowSpan}
      className="ledger-sticky-action ledger-action-cell ledger-rowspan-top"
    >
      <CustomerCaseActionMenu
        brokerageCase={brokerageCase}
        customerName={customerName}
        align="start"
        className="mx-auto"
      />
    </td>
  );

  const consultPanelId = `customer-ledger-consult-${brokerageCase.id}`;
  // 상담이 없으면 펼칠 내용이 없으므로 버튼을 두지 않는다.
  const consultToggleCell = consultVisible ? (
    <td
      rowSpan={rowSpan}
      className="ledger-sticky-expand ledger-expand-cell ledger-rowspan-top"
    >
      {latestConsultation ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${customerName} 최근 상담 ${consultExpanded ? "접기" : "펼치기"}`}
          aria-expanded={consultExpanded}
          aria-controls={consultPanelId}
          className="text-muted-foreground"
          onClick={() => setConsultExpanded((current) => !current)}
        >
          {consultExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </Button>
      ) : null}
    </td>
  ) : null;

  // 등록일 셀은 반드시 행의 마지막에 렌더링해야 컬럼이 밀리지 않는다
  const createdAtCell = visibleColumns.has("created") ? (
    <td
      rowSpan={rows.length}
      className={cn(
        "ledger-updated-cell ledger-rowspan-top",
        showConsultRow && "ledger-rowspan-inner",
      )}
    >
      {formatDateShortYear(brokerageCase.createdAt)}
    </td>
  ) : null;

  return (
    <>
      {rows.map((row, rowIndex) => {
        const first = rowIndex === 0;
        switch (row.type) {
          case "intent":
            return (
              <tr
                key={row.line.requirementId}
                className={cn(
                  "ledger-intent-row",
                  rowIndex === rows.length - 1 &&
                    !showConsultRow &&
                    "ledger-case-end",
                  selected && "ledger-case-selected",
                )}
              >
                {first ? selectionCell : null}
                {first ? consultToggleCell : null}
                {first ? customerCell : null}
                {first ? phoneCell : null}
                {first ? actionCell : null}
                <DemandCells
                  line={row.line}
                  visibleColumns={visibleColumns}
                  expanded={expandedMatchRows.has(
                    demandMatchRowKey(row.line.requirementId),
                  )}
                  onToggleMatch={() =>
                    onToggleMatchRow(
                      demandMatchRowKey(row.line.requirementId),
                      caseMatchRowKeys,
                    )
                  }
                  priorityOptions={demandPriorityOptions(
                    row.line.intakeRequirementCount,
                  )}
                  assigneeOptions={assigneeOptions}
                  createdAtCell={first ? createdAtCell : null}
                  onUpdate={onUpdate}
                />
              </tr>
            );
          case "stack":
            return (
              <tr
                key={`${row.group.intakeId}-stack`}
                className={cn(
                  "ledger-intent-row ledger-stack-row",
                  rowIndex === rows.length - 1 &&
                    !showConsultRow &&
                    "ledger-case-end",
                  selected && "ledger-case-selected",
                )}
              >
                {first ? selectionCell : null}
                {first ? consultToggleCell : null}
                {first ? customerCell : null}
                {first ? phoneCell : null}
                {first ? actionCell : null}
                <StackCells
                  group={row.group}
                  visibleColumns={visibleColumns}
                  expanded={expandedMatchRows.has(
                    listingMatchRowKey(row.group.intakeId),
                  )}
                  onToggleMatch={() =>
                    onToggleMatchRow(
                      listingMatchRowKey(row.group.intakeId),
                      caseMatchRowKeys,
                    )
                  }
                  createdAtCell={first ? createdAtCell : null}
                  onUpdate={onUpdate}
                />
              </tr>
            );
        }
      })}
      {showConsultRow && latestConsultation ? (
        <tr
          className={cn(
            "ledger-consult-row ledger-case-end",
            selected && "ledger-case-selected",
          )}
        >
          <td colSpan={columnCount - LEDGER_PINNED_COLUMN_COUNT}>
            <div id={consultPanelId} className="ledger-consult-line">
              <MessageSquare aria-hidden className="size-3 shrink-0" />
              <Link
                to="/consultations"
                search={{ consultationId: latestConsultation.id }}
                className="ledger-consult-link"
                aria-label={`${customerName} 최근 상담 열기`}
                title={latestConsultation.content}
              >
                <span className="ledger-consult-date">
                  {formatLedgerDate(latestConsultation.createdAt)}{" "}
                  {CONSULTATION_TYPE_LABELS[latestConsultation.type] ??
                    latestConsultation.type}
                </span>
                {latestConsultation.content.replace(/\s+/g, " ")}
              </Link>
            </div>
          </td>
        </tr>
      ) : null}
      {rows.map((row) => {
        if (row.type === "intent") {
          const rowKey = demandMatchRowKey(row.line.requirementId);
          if (!expandedMatchRows.has(rowKey)) return null;
          return (
            <tr key={`${rowKey}-panel`} className="ledger-match-panel-row">
              <td colSpan={columnCount}>
                <div className="customer-ledger-match-panel-frame">
                  <LedgerMatchPanel
                    panelId={matchPanelId(rowKey)}
                    label={`${customerName} 구함 매칭`}
                    initialCount={row.line.matchCount}
                    source={{
                      kind: "demand",
                      requirementId: row.line.requirementId,
                    }}
                  />
                </div>
              </td>
            </tr>
          );
        }
        const rowKey = listingMatchRowKey(row.group.intakeId);
        if (!expandedMatchRows.has(rowKey)) return null;
        return (
          <tr key={`${rowKey}-panel`} className="ledger-match-panel-row">
            <td colSpan={columnCount}>
              <div className="customer-ledger-match-panel-frame">
                <LedgerMatchPanel
                  panelId={matchPanelId(rowKey)}
                  label={`${row.group.lines[0]?.contextLabel ?? customerName} 매물 매칭`}
                  initialCount={row.group.lines.reduce(
                    (sum, line) => sum + line.matchCount,
                    0,
                  )}
                  source={{
                    kind: "listing",
                    intakeId: row.group.intakeId,
                    listingIds: row.group.lines.map((line) => line.listingId),
                  }}
                />
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function DemandCells({
  line,
  visibleColumns,
  expanded,
  onToggleMatch,
  priorityOptions,
  assigneeOptions,
  createdAtCell,
  onUpdate,
}: {
  line: BrokerageCaseDemandIntent;
  visibleColumns: ReadonlySet<LedgerColumnKey>;
  expanded: boolean;
  onToggleMatch: () => void;
  priorityOptions: ChipOption[];
  assigneeOptions: ChipOption[];
  createdAtCell: ReactNode;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const rentOpen = visibleColumns.has("rentMin");
  // 거래유형을 바꿔도 이전 월세 값은 지우지 않으므로, 월세 의뢰일 때만 금액 칸에 붙인다.
  const showRentInAmount = !rentOpen && line.transactionType === "monthly";
  const saveRequirementNumber = (
    screenField:
      | "budgetMin"
      | "budgetMax"
      | "monthlyRentMin"
      | "monthlyRentMax"
      | "areaMin"
      | "areaMax",
    rawValue: unknown,
  ) => {
    const isArea = screenField === "areaMin" || screenField === "areaMax";
    const parsed = parseLedgerNumber(rawValue, {
      label: isArea ? "평형" : "금액",
      integer: !isArea,
    });
    if (!parsed.valid) return false;

    const currentValue =
      screenField === "budgetMin"
        ? line.budgetMin
        : screenField === "budgetMax"
          ? line.budgetMax
          : line[screenField];
    if (
      isArea &&
      parsed.value !== null &&
      currentValue !== null &&
      parsed.value === sqmToPyeong(currentValue)
    ) {
      return;
    }
    const value =
      parsed.value === null || !isArea
        ? parsed.value
        : pyeongToSqm(parsed.value);
    if (value === currentValue) return;
    const apiField =
      screenField === "budgetMin"
        ? line.transactionType === "monthly"
          ? "depositMin"
          : "priceMin"
        : screenField === "budgetMax"
          ? line.transactionType === "monthly"
            ? "depositMax"
            : "priceMax"
          : screenField;

    const minField = screenField.endsWith("Min");
    const otherValue =
      screenField === "budgetMin"
        ? line.budgetMax
        : screenField === "budgetMax"
          ? line.budgetMin
          : screenField === "monthlyRentMin"
            ? line.monthlyRentMax
            : screenField === "monthlyRentMax"
              ? line.monthlyRentMin
              : screenField === "areaMin"
                ? line.areaMax
                : line.areaMin;
    if (
      value !== null &&
      otherValue !== null &&
      ((minField && value > otherValue) || (!minField && value < otherValue))
    ) {
      toast.error("최소값은 최대값보다 클 수 없습니다.");
      return false;
    }

    onUpdate({
      target: "buyer-requirement",
      id: line.requirementId,
      patch: { [apiField]: value } as UpdateBuyerRequirementDto,
    });
  };

  return (
    <>
      {visibleColumns.has("kind") ? (
        <td className={cn(priorityOptions.length > 1 && "ledger-editable-cell")}>
          {priorityOptions.length > 1 ? (
            <EditableCell
              recordId={line.requirementId}
              field="priorityRank"
              value={line.priorityRank}
              ariaLabel={`구함 ${line.priorityRank} 우선순위 편집`}
              onSave={(_recordId, _field, value) => {
                const priorityRank = Number(value);
                if (priorityRank === line.priorityRank) return;
                onUpdate({
                  target: "buyer-requirement-priority",
                  id: line.requirementId,
                  priorityRank,
                });
              }}
              editType="select-chip"
              chipOptions={priorityOptions}
              chipValueOf={(value) => String(value)}
              className="cursor-pointer"
              hoverHighlight={false}
            >
              <span data-ledger-cell-value>
                <KindLabel kind="demand" priorityRank={line.priorityRank} />
              </span>
            </EditableCell>
          ) : (
            <KindLabel kind="demand" priorityRank={line.priorityRank} />
          )}
        </td>
      ) : null}
      {visibleColumns.has("transaction") ? (
        <td className="ledger-editable-cell">
          <EditableCell
            recordId={line.requirementId}
            field="transactionType"
            value={line.transactionType}
            ariaLabel="구함 거래유형 편집"
            onSave={(_recordId, _field, value) => {
              const transactionType = String(value);
              if (transactionType === line.transactionType) return;
              onUpdate({
                target: "buyer-requirement",
                id: line.requirementId,
                patch: { transactionType },
              });
            }}
            editType="select-chip"
            chipOptions={TRANSACTION_OPTIONS}
          >
            <span data-ledger-cell-value>
              <TransactionBadge transactionType={line.transactionType} />
            </span>
          </EditableCell>
        </td>
      ) : null}
      <DemandIntakeCell line={line} />
      {visibleColumns.has("status") ? (
        <td className="ledger-editable-cell">
          {/* 상태는 의뢰 단위지만 조건 행마다 칸이 있어, 편집기는 행 단위로 연다 */}
          <EditableCell
            recordId={line.requirementId}
            field="lifecycleStatus"
            value={line.lifecycleStatus}
            ariaLabel="구함 진행 상태 편집"
            onSave={(_recordId, _field, value) => {
              const lifecycleStatus = String(value) as BuyerIntakeLifecycleStatus;
              if (lifecycleStatus === line.lifecycleStatus) return;
              onUpdate({
                target: "buyer-intake",
                id: line.buyerIntakeId,
                patch: { lifecycleStatus },
              });
            }}
            editType="select-chip"
            chipOptions={LIFECYCLE_OPTIONS}
          >
            <span data-ledger-cell-value>
              <LifecyclePill lifecycleStatus={line.lifecycleStatus} />
            </span>
          </EditableCell>
        </td>
      ) : null}
      <MoneyCell
        recordId={line.requirementId}
        field="budgetMin"
        value={line.budgetMin}
        rent={showRentInAmount ? line.monthlyRentMin : null}
        ariaLabel="최소예산 편집, 만원 단위"
        onSave={saveRequirementNumber}
      />
      <MoneyCell
        recordId={line.requirementId}
        field="budgetMax"
        value={line.budgetMax}
        rent={showRentInAmount ? line.monthlyRentMax : null}
        ariaLabel="최대예산 편집, 만원 단위"
        onSave={saveRequirementNumber}
      />
      {rentOpen ? (
        <>
          <RentCell
            recordId={line.requirementId}
            field="monthlyRentMin"
            value={line.monthlyRentMin}
            ariaLabel="최소월세 편집, 만원 단위"
            onSave={
              line.transactionType === "monthly"
                ? saveRequirementNumber
                : undefined
            }
          />
          <RentCell
            recordId={line.requirementId}
            field="monthlyRentMax"
            value={line.monthlyRentMax}
            ariaLabel="최대월세 편집, 만원 단위"
            onSave={
              line.transactionType === "monthly"
                ? saveRequirementNumber
                : undefined
            }
          />
        </>
      ) : null}
      {visibleColumns.has("areaMin") ? (
        <>
          <AreaCell
            recordId={line.requirementId}
            field="areaMin"
            value={line.areaMin}
            ariaLabel="최소평형 편집, 평 단위"
            onSave={saveRequirementNumber}
          />
          <AreaCell
            recordId={line.requirementId}
            field="areaMax"
            value={line.areaMax}
            ariaLabel="최대평형 편집, 평 단위"
            onSave={saveRequirementNumber}
          />
        </>
      ) : null}
      {visibleColumns.has("match") ? (
        <MatchCell
          count={line.matchCount}
          expanded={expanded}
          panelId={matchPanelId(demandMatchRowKey(line.requirementId))}
          label="연결 매물"
          onToggle={onToggleMatch}
        />
      ) : null}
      {visibleColumns.has("assignee") ? (
        <AssigneeCell
          line={line}
          options={assigneeOptions}
          onUpdate={onUpdate}
        />
      ) : null}
      {visibleColumns.has("next") ? (
        <NextContactCell line={line} onUpdate={onUpdate} />
      ) : null}
      {visibleColumns.has("memo") ? (
        <MemoCell
          recordId={line.requirementId}
          value={line.memo}
          ariaLabel={`${demandPlaceLabel(line)} 구함 노트 편집`}
          onSave={(memo) =>
            onUpdate({
              target: "buyer-requirement",
              id: line.requirementId,
              patch: { memo },
            })
          }
        />
      ) : null}
      {createdAtCell}
    </>
  );
}

// 매물 의뢰 — ListingIntake(같은 호실)당 1행, listing을 셀 안에 줄로 세로 적층
function StackCells({
  group,
  visibleColumns,
  expanded,
  onToggleMatch,
  createdAtCell,
  onUpdate,
}: {
  group: ListingGroup;
  visibleColumns: ReadonlySet<LedgerColumnKey>;
  expanded: boolean;
  onToggleMatch: () => void;
  createdAtCell: ReactNode;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const first = group.lines[0];
  const rentOpen = visibleColumns.has("rentMin");
  const updateListing = (
    line: BrokerageCaseListingIntent,
    patch: UpdateListingDto,
  ) =>
    onUpdate({
      target: "listing",
      id: line.listingId,
      patch: { ...patch, expectedUpdatedAt: line.listingUpdatedAt },
    });

  return (
    <>
      {visibleColumns.has("kind") ? (
        <td className="ledger-stack-merged-cell">
          <KindLabel kind="listing" />
        </td>
      ) : null}
      {visibleColumns.has("transaction") ? (
        <td>
          <div className="ledger-stack">
            {group.lines.map((line) => (
              <div
                key={line.listingId}
                className="ledger-stack-line ledger-editable-stack-line"
              >
                <EditableCell
                  recordId={line.listingId}
                  field="transactionType"
                  value={line.transactionType}
                  ariaLabel={`${line.contextLabel} 거래유형 편집`}
                  onSave={(_recordId, _field, value) => {
                    const transactionType = String(value);
                    if (transactionType === line.transactionType) return;
                    updateListing(line, { transactionType });
                  }}
                  editType="select-chip"
                  chipOptions={TRANSACTION_OPTIONS}
                >
                  <span data-ledger-cell-value>
                    <TransactionBadge transactionType={line.transactionType} />
                  </span>
                </EditableCell>
              </div>
            ))}
          </div>
        </td>
      ) : null}
      <td className="ledger-intake-cell">
        <Link
          to="/properties/$id"
          params={{ id: first.propertyId }}
          className="ledger-intake-link"
          aria-label={`${first.contextLabel} 매물 상세 열기`}
          title={first.contextLabel}
        >
          <span className="truncate">{first.contextLabel}</span>
        </Link>
      </td>
      {visibleColumns.has("status") ? (
        <td className="ledger-stack-merged-cell">
          <LifecyclePill
            lifecycleStatus={first.lifecycleStatus}
            paused={group.lines.every((line) => line.isPaused)}
          />
        </td>
      ) : null}
      <td colSpan={2} className="ledger-number-cell">
        <div className="ledger-stack ledger-stack-rules">
          {group.lines.map((line) => (
            <div
              key={line.listingId}
              className="ledger-stack-line ledger-editable-stack-line"
            >
              <EditableCell
                recordId={line.listingId}
                field={line.transactionType === "monthly" ? "deposit" : "price"}
                value={line.askingPrice}
                ariaLabel={`${line.contextLabel} ${line.transactionType === "monthly" ? "보증금" : "가격"} 편집, 만원 단위`}
                onSave={(_recordId, field, rawValue) => {
                  const parsed = parseLedgerNumber(rawValue, {
                    label: "금액",
                    integer: true,
                  });
                  if (!parsed.valid) return false;
                  if (parsed.value === line.askingPrice) return;
                  updateListing(line, {
                    [field]: parsed.value,
                  } as UpdateListingDto);
                }}
                editType="number"
                activation="doubleClick"
                portalAnchor={group.lines.length > 1 ? "self" : "tableCell"}
                editorChrome="floating"
                hoverHighlight={false}
              >
                <span
                  data-ledger-cell-value
                  className={cn(line.isPaused && "ledger-paused-value")}
                >
                  {formatLedgerAmount(
                    line.askingPrice,
                    !rentOpen && line.transactionType === "monthly"
                      ? line.monthlyRent
                      : null,
                  )}
                  {line.isPaused ? (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      중단
                    </span>
                  ) : null}
                </span>
              </EditableCell>
            </div>
          ))}
        </div>
      </td>
      {rentOpen ? (
        <td colSpan={2} className="ledger-number-cell">
          <div className="ledger-stack ledger-stack-rules">
            {group.lines.map((line) => (
              <div
                key={line.listingId}
                className="ledger-stack-line ledger-editable-stack-line"
              >
                {line.transactionType === "monthly" ? (
                  <EditableCell
                    recordId={line.listingId}
                    field="monthlyRent"
                    value={line.monthlyRent}
                    ariaLabel={`${line.contextLabel} 월세 편집, 만원 단위`}
                    onSave={(_recordId, _field, rawValue) => {
                      const parsed = parseLedgerNumber(rawValue, {
                        label: "월세",
                        integer: true,
                      });
                      if (!parsed.valid) return false;
                      if (parsed.value === line.monthlyRent) return;
                      updateListing(line, { monthlyRent: parsed.value });
                    }}
                    editType="number"
                    activation="doubleClick"
                    portalAnchor={group.lines.length > 1 ? "self" : "tableCell"}
                    editorChrome="floating"
                    hoverHighlight={false}
                  >
                    <span
                      data-ledger-cell-value
                      className={cn(
                        !line.monthlyRent && "ledger-empty-value",
                        line.isPaused && "ledger-paused-value",
                      )}
                    >
                      {line.monthlyRent
                        ? `${line.monthlyRent.toLocaleString()}만`
                        : "-"}
                    </span>
                  </EditableCell>
                ) : (
                  <span className="ledger-empty-value px-2.5">-</span>
                )}
              </div>
            ))}
          </div>
        </td>
      ) : null}
      {visibleColumns.has("areaMin") ? (
        <td colSpan={2} className="ledger-stack-merged-cell">
          {formatLedgerPyeong(first.area)}
        </td>
      ) : null}
      {visibleColumns.has("match") ? (
        <td className="ledger-stack-merged-cell ledger-match-cell">
          <MatchBadge
            count={group.lines.reduce((sum, line) => sum + line.matchCount, 0)}
            expanded={expanded}
            panelId={matchPanelId(listingMatchRowKey(group.intakeId))}
            label="연결 구매고객"
            onToggle={onToggleMatch}
          />
        </td>
      ) : null}
      {/* 매물 의뢰에는 아직 담당·다음 연락 값이 없다 */}
      {visibleColumns.has("assignee") ? (
        <td className="ledger-stack-merged-cell ledger-empty-value">-</td>
      ) : null}
      {visibleColumns.has("next") ? (
        <td className="ledger-stack-merged-cell ledger-empty-value">-</td>
      ) : null}
      {visibleColumns.has("memo") ? (
        <MemoCell
          recordId={first.listingIntakeId}
          value={first.intakeMemo}
          ariaLabel={`${first.contextLabel} 매물 의뢰 노트 편집`}
          onSave={(memo) =>
            onUpdate({
              target: "listing-intake",
              id: first.listingIntakeId,
              patch: {
                memo: memo || null,
                expectedUpdatedAt: first.intakeUpdatedAt,
              },
            })
          }
        />
      ) : null}
      {createdAtCell}
    </>
  );
}

// 구분 컬럼 — 구함/내놓음 pill
function KindLabel({
  kind,
  priorityRank,
}: {
  kind: "demand" | "listing";
  priorityRank?: number;
}) {
  const isDemand = kind === "demand";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        isDemand
          ? "bg-info-soft text-info-strong"
          : "bg-success-soft text-success",
      )}
    >
      {isDemand ? `구함 ${priorityRank ?? 1}` : "내놓음"}
    </span>
  );
}

// 상태 컬럼 — 의뢰 생명주기 pill. 매물관리 매물상태와 같은 점과 색을 쓴다
const LIFECYCLE_PILL_STYLES: Record<
  string,
  { label: string; className: string; dotClassName: string }
> = {
  open: {
    label: "진행중",
    className: "bg-[#eef3ed] text-[#44745a]",
    dotClassName: "bg-[#6c9b7a]",
  },
  hold: {
    label: "보류",
    className: "bg-[#fbf3db] text-[#9f6b00]",
    dotClassName: "bg-[#dfab01]",
  },
  closed: {
    label: "종료",
    className: "bg-[#f1f1ef] text-[#787774]",
    dotClassName: "bg-[#b4b4b1]",
  },
};

function LifecyclePill({
  lifecycleStatus,
  paused = false,
}: {
  lifecycleStatus: string;
  paused?: boolean;
}) {
  // 매물 의뢰 묶음이 전부 중지됐으면 매물관리의 paused 표기(보류)를 따른다
  const meta =
    (paused && lifecycleStatus === "open"
      ? LIFECYCLE_PILL_STYLES.hold
      : LIFECYCLE_PILL_STYLES[lifecycleStatus]) ??
    ({
      label: lifecycleStatus,
      className: "bg-[#f1f1ef] text-[#787774]",
      dotClassName: "bg-[#b4b4b1]",
    } as const);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        meta.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

// 거래유형 컬럼 — 매물관리와 같은 Notion 팔레트 pill (매매/전세/월세 색상 구분)
const TRANSACTION_PILL_STYLES: Record<string, string> = {
  sale: "bg-[#fdebec] text-[#8f4b46]",
  jeonse: "bg-[#e7f3f8] text-[#337ea9]",
  monthly: "bg-[#fbf3db] text-[#8f6b1f]",
};

function TransactionBadge({
  transactionType,
}: {
  transactionType: string | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        (transactionType && TRANSACTION_PILL_STYLES[transactionType]) ??
          "bg-[#f1f1ef] text-[#787774]",
      )}
    >
      {transactionType
        ? ((TRANSACTION_TYPE_LABELS as Record<string, string>)[
            transactionType
          ] ?? transactionType)
        : "미정"}
    </span>
  );
}

function demandRegionLabel(line: BrokerageCaseDemandIntent) {
  return line.preferredRegions
    .map(
      (region) => region.wardName ?? region.districtName ?? region.provinceName,
    )
    .filter((name): name is string => Boolean(name))
    .join("·");
}

function demandSiteLabel(line: BrokerageCaseDemandIntent) {
  return line.preferredSites.map((site) => site.name).join("·");
}

function demandPlaceLabel(line: BrokerageCaseDemandIntent) {
  return (
    [demandRegionLabel(line), demandSiteLabel(line)]
      .filter(Boolean)
      .join(" · ") || "선호 지역 미등록"
  );
}

// 구함 의뢰 셀 — 희망 지역과 희망 단지를 한 줄에서 읽는다.
function DemandIntakeCell({ line }: { line: BrokerageCaseDemandIntent }) {
  const regionLabel = demandRegionLabel(line);
  const siteLabel = demandSiteLabel(line);
  const placeLabel = demandPlaceLabel(line);

  return (
    <td className="ledger-intake-cell">
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          to="/buyer-requirements/$id"
          params={{ id: line.requirementId }}
          className="ledger-intake-link"
          aria-label={`${placeLabel} 구함 상세 열기`}
          title={placeLabel}
        >
          <span className="truncate">
            {regionLabel || (!siteLabel ? "선호 지역 미등록" : null)}
            {regionLabel && siteLabel ? (
              <span className="font-normal text-muted-foreground"> · </span>
            ) : null}
            {siteLabel ? <span>{siteLabel}</span> : null}
          </span>
        </Link>
        {line.urgency === "urgent" ? (
          <span className="shrink-0 rounded-[4px] bg-destructive-soft px-1 text-[10.5px] font-medium leading-4 text-destructive-strong">
            급함
          </span>
        ) : null}
      </div>
    </td>
  );
}

// 담당 컬럼 — 구함 조건마다 담당이 따로 있다. 직원 목록을 못 불러오면 읽기 전용으로 둔다.
function AssigneeCell({
  line,
  options,
  onUpdate,
}: {
  line: BrokerageCaseDemandIntent;
  options: ChipOption[];
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const name = (
    <span
      data-ledger-cell-value
      className={cn(!line.assignedTo && "ledger-empty-value")}
    >
      <span className="truncate" title={line.assignedTo?.name}>
        {line.assignedTo?.name ?? "미배정"}
      </span>
    </span>
  );
  if (options.length === 0) return <td className="ledger-editable-cell">{name}</td>;
  return (
    <td className="ledger-editable-cell">
      <EditableCell
        recordId={line.requirementId}
        field="assignedToId"
        value={line.assignedTo?.id ?? ""}
        ariaLabel={`${demandPlaceLabel(line)} 담당 편집`}
        onSave={(_recordId, _field, value) => {
          const assignedToId = String(value);
          if (assignedToId === line.assignedTo?.id) return;
          onUpdate({
            target: "buyer-requirement",
            id: line.requirementId,
            patch: { assignedToId },
          });
        }}
        editType="select-chip"
        chipOptions={options}
        chipValueOf={(value) => String(value)}
      >
        {name}
      </EditableCell>
    </td>
  );
}

const NEXT_CONTACT_PILL_CLASS =
  "inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5 tabular-nums whitespace-nowrap";

function NextContactLabel({ value }: { value: string | null }) {
  const state = getFollowUpState(value);
  if (!value || state === "none") {
    return (
      <>
        <span className="ledger-next-empty ledger-empty-value">-</span>
        <span className="ledger-next-add">+ 일정</span>
      </>
    );
  }
  if (state === "today") {
    return (
      <span
        className={cn(
          NEXT_CONTACT_PILL_CLASS,
          "bg-warning-soft text-warning-strong",
        )}
      >
        오늘
      </span>
    );
  }
  return (
    <span
      className={cn(
        NEXT_CONTACT_PILL_CLASS,
        state === "overdue"
          ? "bg-destructive-soft text-destructive-strong"
          : "bg-[#f1f1ef] text-[#5f5e5a]",
      )}
    >
      {formatLedgerDate(value)} {formatDday(value)}
    </span>
  );
}

// 다음 연락 컬럼 — 매물관리 입주가능일과 같은 pill. 지난 일정과 오늘만 색으로 드러낸다.
function NextContactCell({
  line,
  onUpdate,
}: {
  line: BrokerageCaseDemandIntent;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const save = (nextContactDate: string) =>
    onUpdate({
      target: "buyer-requirement",
      id: line.requirementId,
      patch: { nextContactDate },
    });
  return (
    <td className="ledger-editable-cell">
      <EditableCell
        recordId={line.requirementId}
        field="nextContactDate"
        value={line.nextContactDate}
        ariaLabel={`${demandPlaceLabel(line)} 다음 연락일 편집`}
        onSave={(_recordId, _field, value) =>
          save(localDateString(Number(value)))
        }
        onChipSave={(_recordId, payload) => {
          const picked = payload.dateWrites?.[0]?.value;
          if (picked) save(picked);
        }}
        editType="select-chip"
        chipOptions={NEXT_CONTACT_OPTIONS}
      >
        <span data-ledger-cell-value>
          <NextContactLabel value={line.nextContactDate} />
        </span>
      </EditableCell>
    </td>
  );
}

// 의뢰 메모 컬럼 — 매물관리처럼 별도 열로 두고 남는 폭을 차지한다.
function MemoCell({
  recordId,
  value,
  ariaLabel,
  onSave,
}: {
  recordId: string;
  value: string | null;
  ariaLabel: string;
  onSave: (memo: string) => void;
}) {
  // 한 줄 입력칸은 줄바꿈을 지우므로, 고치지 않고 닫아도 저장되지 않게 표시값과 비교한다.
  const text = value?.replace(/\s*\n\s*/g, " ") ?? null;
  return (
    <td className="ledger-editable-cell">
      <EditableCell
        recordId={recordId}
        field="memo"
        value={text}
        ariaLabel={ariaLabel}
        onSave={(_recordId, _field, nextValue) => {
          const next = String(nextValue ?? "").trim();
          if (next !== (text ?? "").trim()) onSave(next);
        }}
        editType="text"
        activation="doubleClick"
        editorChrome="floating"
        hoverHighlight={false}
      >
        <span data-ledger-cell-value>
          {text ? (
            <span title={text} className="min-w-0 truncate text-slate-700">
              {text}
            </span>
          ) : (
            <span className="ledger-memo-add">+ 노트</span>
          )}
        </span>
      </EditableCell>
    </td>
  );
}

type LedgerNumberField =
  | "budgetMin"
  | "budgetMax"
  | "monthlyRentMin"
  | "monthlyRentMax"
  | "areaMin"
  | "areaMax";

function parseLedgerNumber(
  rawValue: unknown,
  options: { label: string; integer: boolean },
): { valid: true; value: number | null } | { valid: false } {
  if (rawValue === null || String(rawValue).trim() === "") {
    return { valid: true, value: null };
  }
  const value = Number(rawValue);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (options.integer && !Number.isInteger(value))
  ) {
    toast.error(
      `${options.label}은 0 이상의 ${options.integer ? "정수" : "숫자"}로 입력해 주세요.`,
    );
    return { valid: false };
  }
  return { valid: true, value };
}

function MoneyCell({
  recordId,
  field,
  value,
  rent,
  ariaLabel,
  onSave,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "budgetMin" | "budgetMax">;
  value: number | null;
  /** 월세 열을 접었을 때 함께 보여 줄 월세 */
  rent: number | null;
  ariaLabel: string;
  onSave: (field: LedgerNumberField, value: unknown) => boolean | void;
}) {
  return (
    <td className="ledger-editable-cell ledger-number-cell">
      <EditableCell
        recordId={recordId}
        field={field}
        value={value}
        ariaLabel={ariaLabel}
        onSave={(_recordId, savedField, nextValue) =>
          onSave(savedField as LedgerNumberField, nextValue)
        }
        editType="number"
        activation="doubleClick"
        portalAnchor="tableCell"
        editorChrome="floating"
        hoverHighlight={false}
      >
        <span
          data-ledger-cell-value
          className={cn(value === null && !rent && "ledger-empty-value")}
        >
          <span className="truncate" title={formatLedgerAmount(value, rent)}>
            {formatLedgerAmount(value, rent)}
          </span>
        </span>
      </EditableCell>
    </td>
  );
}

function RentCell({
  recordId,
  field,
  value,
  ariaLabel,
  onSave,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "monthlyRentMin" | "monthlyRentMax">;
  value: number | null;
  ariaLabel: string;
  onSave?: (field: LedgerNumberField, value: unknown) => boolean | void;
}) {
  return (
    <td className={cn(onSave && "ledger-editable-cell", "ledger-number-cell")}>
      {onSave ? (
        <EditableCell
          recordId={recordId}
          field={field}
          value={value}
          ariaLabel={ariaLabel}
          onSave={(_recordId, savedField, nextValue) =>
            onSave(savedField as LedgerNumberField, nextValue)
          }
          editType="number"
          activation="doubleClick"
          portalAnchor="tableCell"
          editorChrome="floating"
          hoverHighlight={false}
        >
          <span
            data-ledger-cell-value
            className={cn(!value && "ledger-empty-value")}
          >
            {value ? `${value.toLocaleString()}만` : "-"}
          </span>
        </EditableCell>
      ) : (
        <span className="ledger-empty-value">-</span>
      )}
    </td>
  );
}

function AreaCell({
  recordId,
  field,
  value,
  ariaLabel,
  onSave,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "areaMin" | "areaMax">;
  value: number | null;
  ariaLabel: string;
  onSave: (field: LedgerNumberField, value: unknown) => boolean | void;
}) {
  return (
    <td className="ledger-editable-cell ledger-number-cell ledger-area-cell">
      <EditableCell
        recordId={recordId}
        field={field}
        value={value === null ? null : sqmToPyeong(value)}
        ariaLabel={ariaLabel}
        onSave={(_recordId, savedField, nextValue) =>
          onSave(savedField as LedgerNumberField, nextValue)
        }
        editType="number"
        activation="doubleClick"
        portalAnchor="tableCell"
        editorChrome="floating"
        hoverHighlight={false}
      >
        <span
          data-ledger-cell-value
          className={cn(value === null && "ledger-empty-value")}
        >
          {formatLedgerPyeong(value)}
        </span>
      </EditableCell>
    </td>
  );
}

// 매칭 컬럼 — 매물관리(ListingPanelToggle)의 매칭 버튼과 같은 모양. 매칭 없으면 빈 셀
function MatchBadge({
  count,
  expanded,
  panelId,
  label,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
}) {
  if (count === 0 && !expanded) return null;
  return (
    <Button
      type="button"
      variant={expanded ? "secondary" : "outline"}
      size="xs"
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={`${count}건의 ${label} ${expanded ? "접기" : "펼치기"}`}
      title={expanded ? `${label} 접기` : `${label} 펼치기`}
      onClick={onToggle}
      className="min-w-11 px-1.5 text-[11px] tabular-nums shadow-none"
    >
      <GitBranch className="size-3" aria-hidden />
      {count}
      <ChevronDown
        aria-hidden
        className={cn(
          "size-3 transition-transform duration-150",
          expanded && "rotate-180",
        )}
      />
    </Button>
  );
}

function MatchCell({
  count,
  expanded,
  panelId,
  label,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <td className="ledger-match-cell">
      <MatchBadge
        count={count}
        expanded={expanded}
        panelId={panelId}
        label={label}
        onToggle={onToggle}
      />
    </td>
  );
}

function LedgerHeader({
  icon,
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  className,
}: {
  icon?: ReactNode;
  label: string;
  field: BrokerageCaseLedgerSortField;
  sortBy: BrokerageCaseLedgerSortField | null;
  sortOrder: SortOrder;
  onSort: (field: BrokerageCaseLedgerSortField) => void;
  className?: string;
}) {
  const active = field === sortBy;
  const SortIcon = sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={
        active ? (sortOrder === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        className="ledger-sort-button"
        onClick={() => onSort(field)}
      >
        {/* 좁은 열에서 이름이 잘리지 않도록 정렬 중에는 아이콘을 화살표로 대신한다 */}
        <LedgerHeaderLabel icon={active ? undefined : icon} label={label} />
        {active ? <SortIcon className="size-3 shrink-0" aria-hidden /> : null}
      </button>
    </th>
  );
}

function LedgerStaticHeader({
  icon,
  label,
  className,
}: {
  icon?: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <th scope="col" className={className}>
      <LedgerHeaderLabel icon={icon} label={label} />
    </th>
  );
}

// 머리글 위 안내 줄 — 매물관리의 "타입–확인 컬럼 접기"와 같은 방식으로 월세 열을 접고 펼친다.
// 버튼은 가로 스크롤 중에도 고정 열 오른쪽과 화면 끝 사이에 남아, 좁은 창에서도 누를 수 있다.
function LedgerColumnGuide({
  columns,
  open,
  minWidth,
  onToggle,
}: {
  columns: ReadonlyArray<{ key: LedgerColumnKey; width: number }>;
  open: boolean;
  minWidth: number;
  onToggle: () => void;
}) {
  let offset = 0;
  let groupStart = 0;
  let groupEnd = 0;
  for (const column of columns) {
    if (column.key === "rentMin") groupStart = offset;
    if (column.key === "rentMax") groupEnd = offset + column.width;
    if (!open && column.key === "budgetMax") {
      groupStart = offset + column.width;
      groupEnd = groupStart;
    }
    offset += column.width;
  }
  const guideLeft = groupStart - COLUMN_GUIDE_LEAD;
  const toggleLeft = open
    ? guideLeft - COLUMN_GUIDE_TOGGLE_SIZE
    : groupStart - COLUMN_GUIDE_TOGGLE_SIZE / 2;
  const pinnedWidth =
    LEDGER_PINNED_WIDTH +
    (columns.find((column) => column.key === "consult")?.width ?? 0);
  const label = open ? "월세 컬럼 접기" : "월세 컬럼 펼치기";
  return (
    <div
      data-ledger-column-guide
      className="sticky top-0 z-40 h-9 border-b border-border bg-[#f7f7f5]"
      style={{ width: "100%", minWidth }}
    >
      <div className="relative flex h-full items-start pt-2" style={{ minWidth }}>
        {open ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[18px] z-40 h-px bg-slate-400"
              style={{ left: guideLeft, width: groupEnd - guideLeft }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[18px] z-40 h-2 w-px bg-slate-400"
              style={{ left: groupEnd - 1 }}
            />
          </>
        ) : null}
        <span aria-hidden="true" className="shrink-0" style={{ width: toggleLeft }} />
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          title={label}
          className="sticky z-50 inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] border border-[#9ba7a3] bg-white p-0 text-[#536b64] shadow-[0_1px_1px_rgba(42,51,47,0.05)] outline-none transition-colors hover:border-[#738b83] hover:bg-[#f4f8f6] hover:text-[#315d50] focus-visible:ring-2 focus-visible:ring-[#4c8c7c]/35"
          style={{ left: pinnedWidth + 4, right: 8 }}
          onClick={onToggle}
        >
          {open ? <Minus className="size-3" /> : <Plus className="size-3" />}
        </button>
      </div>
    </div>
  );
}

// 필터 패널 — 여러 개 고르는 필터는 바로 적용하고, 범위 필터는 적용 버튼으로 닫는다.
function LedgerFilterBody({
  def,
  existing,
  onApply,
  onClear,
  close,
}: {
  def: FilterDefinition;
  existing: ActiveFilter | undefined;
  onApply: (filter: ActiveFilter) => void;
  onClear: () => void;
  close: () => void;
}) {
  const id = existing?.id ?? `${def.field}-${Date.now()}`;
  if (def.type === "multiSelect") {
    return (
      <ChecklistFilterPanel
        options={def.options ?? []}
        selected={existing?.values ?? []}
        searchable={false}
        onChange={(values) => {
          if (values.length === 0) {
            onClear();
            return;
          }
          onApply({
            id,
            field: def.field,
            operator: "in",
            value: values.join(","),
            values,
          });
        }}
      />
    );
  }
  const applyRange = (min: string, max: string) => {
    if (!min && !max) onClear();
    else {
      onApply({
        id,
        field: def.field,
        operator: "between",
        value: `${min}~${max}`,
        valueMin: min,
        valueMax: max,
      });
    }
    close();
  };
  return def.type === "dateRange" ? (
    <DateRangeFilterBody def={def} existing={existing} onApply={applyRange} />
  ) : (
    <NumberRangeFilterBody def={def} existing={existing} onApply={applyRange} />
  );
}

function LedgerFilterChip({
  def,
  existing,
  onApply,
  onRemove,
}: {
  def: FilterDefinition;
  existing: ActiveFilter | undefined;
  onApply: (filter: ActiveFilter) => void;
  onRemove: (filterId: string) => void;
}) {
  const clear = () => {
    if (existing) onRemove(existing.id);
  };
  return (
    <ToolbarFilterChip
      label={def.label}
      summary={summarizeLedgerFilter(def, existing)}
      onClear={clear}
      contentClassName={def.type === "multiSelect" ? "w-[180px] p-0" : "w-64 p-3"}
    >
      {(close) => (
        <LedgerFilterBody
          def={def}
          existing={existing}
          onApply={onApply}
          onClear={clear}
          close={close}
        />
      )}
    </ToolbarFilterChip>
  );
}

// 한 줄 검색바 — 희망 지역·단지 선택과 키워드 검색을 둥근 막대 하나에 모은다.
function LedgerSearchBar({
  ref,
  search,
  onSearchChange,
  open,
  onOpenChange,
  definitions,
  activeFilterByField,
  onApply,
  onRemove,
}: {
  ref: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: readonly FilterDefinition[];
  activeFilterByField: ReadonlyMap<string, ActiveFilter>;
  onApply: (filter: ActiveFilter) => void;
  onRemove: (filterId: string) => void;
}) {
  const selectedLabels = definitions.flatMap(
    (def) => activeFilterByField.get(def.field)?.displayValues ?? [],
  );
  const placeLabel =
    selectedLabels.length === 0
      ? "지역·단지 전체"
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels[0]} 외 ${selectedLabels.length - 1}`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className="flex h-[30px] min-w-[300px] max-w-[720px] flex-1 items-center rounded-full bg-[#f1f0ec]">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`지역·단지 필터: ${placeLabel}`}
              className="flex h-full min-w-[110px] shrink basis-[170px] items-center gap-1.5 rounded-l-full pl-3.5 pr-3 text-[13px] transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(55,53,47,0.05)]"
            >
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  selectedLabels.length === 0
                    ? "text-muted-foreground"
                    : "font-semibold text-foreground",
                )}
              >
                {placeLabel}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <span
            className="h-4 w-px shrink-0 bg-[rgba(55,53,47,0.14)]"
            aria-hidden="true"
          />
          <label
            title="⌘F로 바로 검색"
            className="flex h-full min-w-[140px] flex-1 cursor-text items-center gap-2 rounded-r-full pl-3 pr-1.5 transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]"
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={ref}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  if (search) onSearchChange("");
                  else event.currentTarget.blur();
                }
              }}
              placeholder="고객, 전화번호, 지역, 매물"
              aria-label="고객 원장 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {search ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => onSearchChange("")}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </label>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[340px] p-3">
        {open ? (
          <LedgerPlacePanel
            definitions={definitions}
            activeFilterByField={activeFilterByField}
            onApply={onApply}
            onRemove={onRemove}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// 희망 지역·단지 패널 — 검색어 하나로 두 목록을 함께 찾고, 고르면 바로 적용한다.
function LedgerPlacePanel({
  definitions,
  activeFilterByField,
  onApply,
  onRemove,
}: {
  definitions: readonly FilterDefinition[];
  activeFilterByField: ReadonlyMap<string, ActiveFilter>;
  onApply: (filter: ActiveFilter) => void;
  onRemove: (filterId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    ReadonlyArray<{
      def: FilterDefinition;
      options: ReadonlyArray<{ label: string; value: string }>;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await Promise.all(
          definitions.map(async (def) => ({
            def,
            options: (await def.fetchOptions?.(term)) ?? [],
          })),
        );
        if (!cancelled) setResults(next);
      } catch {
        if (!cancelled) {
          setResults([]);
          toast.error("지역·단지를 찾지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [definitions, query]);

  const toggle = (def: FilterDefinition, value: string, label: string) => {
    const existing = activeFilterByField.get(def.field);
    const values = existing?.values ?? [];
    const labels = existing?.displayValues ?? [];
    const index = values.indexOf(value);
    const nextValues =
      index >= 0 ? values.filter((_, i) => i !== index) : [...values, value];
    const nextLabels =
      index >= 0 ? labels.filter((_, i) => i !== index) : [...labels, label];
    if (nextValues.length === 0) {
      if (existing) onRemove(existing.id);
      return;
    }
    onApply({
      id: existing?.id ?? `${def.field}-${Date.now()}`,
      field: def.field,
      operator: "in",
      value: nextValues.join(","),
      values: nextValues,
      displayValues: nextLabels,
    });
  };

  const selected = definitions.flatMap((def) => {
    const existing = activeFilterByField.get(def.field);
    return (existing?.values ?? []).map((value, index) => ({
      def,
      value,
      label: existing?.displayValues?.[index] ?? value,
    }));
  });
  const hasResults = results.some((result) => result.options.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="희망 지역이나 단지 검색"
          aria-label="희망 지역이나 단지 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 pl-6 text-xs"
        />
      </div>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => (
            <button
              key={`${item.def.field}:${item.value}`}
              type="button"
              aria-label={`${item.label} 선택 해제`}
              onClick={() => toggle(item.def, item.value, item.label)}
              className="inline-flex items-center gap-1 rounded-full bg-[#ebeae6] px-2 py-0.5 text-[11.5px] text-foreground hover:bg-[#e2e1dc]"
            >
              {item.label}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <p className="px-2 py-2 text-[12px] text-muted-foreground">
            검색 중...
          </p>
        ) : !hasResults ? (
          <p className="px-2 py-2 text-[12px] text-muted-foreground">
            {query.trim() ? "검색 결과 없음" : "검색어를 입력하세요"}
          </p>
        ) : (
          results.map(({ def, options }) =>
            options.length > 0 ? (
              <div key={def.field} className="mb-1">
                <p className="px-2 pb-0.5 pt-1.5 text-[11.5px] font-medium text-muted-foreground">
                  {def.label}
                </p>
                {options.map((option) => {
                  const checked =
                    activeFilterByField
                      .get(def.field)
                      ?.values?.includes(option.value) ?? false;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggle(def, option.value, option.label)}
                      className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-[rgba(55,53,47,0.06)]"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                          checked
                            ? "border-foreground bg-foreground text-white"
                            : "border-[#d6d5d0] bg-white",
                        )}
                      >
                        {checked ? (
                          <Check className="size-3" strokeWidth={2.5} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null,
          )
        )}
      </div>
    </div>
  );
}

function LedgerHeaderLabel({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="ledger-header-label inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-normal text-muted-foreground">
      {icon ? (
        <span className="ledger-header-icon shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/70">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

function LoadingRows({ columnCount }: { columnCount: number }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <tr key={index}>
          <td colSpan={columnCount} className="h-10 px-4">
            <div className="h-5 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          </td>
        </tr>
      ))}
    </>
  );
}
