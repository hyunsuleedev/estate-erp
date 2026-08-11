import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  ArrowLeftRight,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDot,
  EllipsisVertical,
  GitBranch,
  MapPin,
  RotateCcw,
  Search,
  StickyNote,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  formatDateShortYear,
  formatMoney,
  formatPhone,
  formatPyeong,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CellEditProvider,
  EditableCell,
  ViewBar,
  type ActiveFilter,
  type ChipOption,
  type FilterDefinition,
  type SortDefinition,
} from "@/components/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
  customerLedgerSortDefinitions,
} from "./-customer-list-filters";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "./-customer-ledger-pagination";
import { LedgerMatchPanel } from "../matches/-ledger-match-panel";
import "./-customer-ledger.css";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersPage,
});

type SortOrder = "asc" | "desc";
type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">;

const PAGE_SIZE = 20;
// intent 행 14열: 선택 / 고객 / 작업 / 구분 / 상태 / 거래유형 / 최소예산 / 최대예산
// / 최소월세 / 최대월세 / 최소평형 / 최대평형 / 매칭 / 등록일
// (매물 의뢰의 매매가·보증금은 예산 2열을 colSpan으로 합쳐 표시 — 월세·평형과 같은 패턴)
const COLUMN_COUNT = 14;
// context 행은 sticky 선택·고객·작업 열과 등록일 열을 제외한 10열을 span
const CONTEXT_COL_SPAN = 10;
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

// 케이스 1개를 렌더할 행 단위. sticky 셀 rowSpan 계산이 이 배열 길이로 결정된다.
type RowDescriptor =
  | { type: "intent"; line: BrokerageCaseDemandIntent }
  | { type: "context"; line: BrokerageCaseDemandIntent }
  | { type: "stack"; group: ListingGroup }
  | { type: "stack-context"; group: ListingGroup };

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

// 구함은 요건당 intent+context 2행, 매물 의뢰는 ListingIntake(같은 호실) 단위로
// listing을 세로 적층한 stack+context 2행으로 렌더링한다.
function buildRowDescriptors(brokerageCase: BrokerageCase): RowDescriptor[] {
  const rows: RowDescriptor[] = [];
  for (const line of brokerageCase.demandIntents) {
    rows.push({ type: "intent", line });
    rows.push({ type: "context", line });
  }
  for (const group of groupListingIntents(brokerageCase.listingIntents)) {
    rows.push({ type: "stack", group });
    rows.push({ type: "stack-context", group });
  }
  return rows;
}

function CustomersPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [mode, setMode] = useState<CustomerLedgerMode>("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] =
    useState<BrokerageCaseLedgerSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
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

  const allFilterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      ...customerLedgerFilterDefinitions,
      {
        id: "assignedToId",
        field: "assignedToId",
        label: "담당자",
        type: "asyncMultiSelect",
        operators: ["in"],
        fetchOptions: async (query) => {
          const employees = await api.employees.findAll();
          return employees
            .filter(
              (employee) =>
                employee.isActive && (!query || employee.name.includes(query)),
            )
            .map((employee) => ({
              label: employee.name,
              value: employee.id,
            }));
        },
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
    [],
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
      sortBy,
      sortOrder,
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
    if (field === sortBy) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder(field === "customer" ? "asc" : "desc");
  };

  const activeSorts = useMemo<SortDefinition[]>(
    () => [
      {
        field: sortBy,
        label:
          customerLedgerSortDefinitions.find((item) => item.field === sortBy)
            ?.label ?? sortBy,
        direction: sortOrder,
      },
    ],
    [sortBy, sortOrder],
  );

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

  const hasActiveControls =
    search.trim() !== "" ||
    mode !== "all" ||
    activeFilters.length > 0 ||
    sortBy !== "createdAt" ||
    sortOrder !== "desc";

  return (
    <CellEditProvider>
      <main className="customer-ledger-page -m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <h1 className="sr-only">고객 원장</h1>
        <section
          className="shrink-0 border-b border-border bg-white px-3 py-2.5"
          aria-label="고객 원장 보기 및 검색"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as CustomerLedgerMode)}
                className="min-w-0 shrink-0 gap-0"
              >
                <TabsList
                  className="max-w-full justify-start border border-border/80 bg-[#f5f4f1] p-0.5"
                  aria-label="거래 보기 필터"
                >
                  {MODE_OPTIONS.map((option) => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      className="flex-none border-0 px-3 text-[13px] text-muted-foreground shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
                    >
                      <span>{option.label}</span>
                      <span className="ml-1 text-[11px] tabular-nums opacity-60">
                        {modeCount(option.value)}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="relative ml-1 min-w-[160px] max-w-72 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="고객, 전화번호, 지역, 매물 (⌘F)"
                  aria-label="고객 원장 검색"
                  className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {search ? (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <Button
              asChild
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 bg-background px-2.5 text-xs shadow-none"
            >
              <Link to="/customers-next" aria-label="고객 중심 새 보기 열기">
                고객 중심 보기
              </Link>
            </Button>
          </div>
        </section>

        <section
          className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6]"
          aria-label="고객 원장 상세 필터"
        >
          <div className="w-full min-w-max">
            <ViewBar
              variant="workbench"
              showSearch={false}
              showActiveChips={false}
              filterDefinitions={allFilterDefinitions}
              activeFilters={activeFilters}
              onFilterAdd={addFilter}
              onFilterRemove={removeFilter}
              onFiltersReset={resetFilters}
              inlineFilterGroups={[
                ["preferredRegions", "preferredSites", "transactionType"],
                ["status", "urgency"],
                ["price", "area"],
              ]}
              sortDefinitions={customerLedgerSortDefinitions}
              activeSorts={activeSorts}
              onSortAdd={(sort) => {
                setSortBy(sort.field as BrokerageCaseLedgerSortField);
                setSortOrder(sort.direction);
              }}
              onSortRemove={() => {
                setSortBy("createdAt");
                setSortOrder("desc");
              }}
              actions={
                hasActiveControls ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                    onClick={resetFilters}
                  >
                    <RotateCcw className="size-3.5" />
                    초기화
                  </Button>
                ) : null
              }
            />
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
            <table
              className="customer-ledger-table"
              aria-label="고객 중개 케이스 원장"
              aria-describedby={
                ledgerScrollState.hasOverflow
                  ? "customer-ledger-scroll-hint"
                  : undefined
              }
            >
              <colgroup>
                <col className="ledger-select-column" />
                <col className="ledger-customer-column" />
                <col className="ledger-action-column" />
                {Array.from({ length: COLUMN_COUNT - 3 }, (_, index) => (
                  <col
                    key={index}
                    className={
                      index === 2
                        ? "ledger-transaction-column"
                        : "ledger-fluid-column"
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
                    className="ledger-sticky-action"
                    label="작업"
                  />
                  <LedgerStaticHeader icon={<Tag />} label="구분" />
                  <LedgerStaticHeader icon={<CircleDot />} label="상태" />
                  <LedgerStaticHeader
                    className="ledger-group-end"
                    icon={<ArrowLeftRight />}
                    label="거래"
                  />
                  <LedgerHeader
                    label="최소예산"
                    field="budgetMin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    className="ledger-group-end"
                    label="최대예산"
                    field="budgetMax"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    label="최소월세"
                    field="monthlyRentMin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    className="ledger-group-end"
                    label="최대월세"
                    field="monthlyRentMax"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    label="최소평형"
                    field="areaMin"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    className="ledger-group-end"
                    label="최대평형"
                    field="areaMax"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    className="ledger-group-end"
                    icon={<GitBranch />}
                    label="매칭"
                    field="matchCount"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                  <LedgerHeader
                    icon={<CalendarDays />}
                    label="등록일"
                    field="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={changeSort}
                  />
                </tr>
              </thead>
              <tbody>
                {ledgerQuery.isLoading ? (
                  <LoadingRows />
                ) : ledgerQuery.isError && ledgerCases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMN_COUNT}
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
                      onUpdate={(request) =>
                        ledgerUpdateMutation.mutate(request)
                      }
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={COLUMN_COUNT} className="h-56 text-center">
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
            <strong className="font-semibold text-foreground">
              {ledgerCases.length}
            </strong>
            {" / "}
            <strong className="font-semibold text-foreground">
              {totalCases}
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
              <span>전체 {totalCases}건 불러옴</span>
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
  onUpdate,
}: {
  brokerageCase: BrokerageCase;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
  expandedMatchRows: ReadonlySet<string>;
  onToggleMatchRow: (rowKey: string, siblingRowKeys: readonly string[]) => void;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const rows = buildRowDescriptors(brokerageCase);
  if (rows.length === 0) return null;
  const caseMatchRowKeys = rows.flatMap((row) => {
    if (row.type === "context") {
      return [demandMatchRowKey(row.line.requirementId)];
    }
    if (row.type === "stack-context") {
      return [listingMatchRowKey(row.group.intakeId)];
    }
    return [];
  });
  const rowSpan = rows.length;
  const primary = brokerageCase.primaryParticipant;
  const customerName = primary?.contact.name ?? "이름 없음";

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
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
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
              className="min-w-0"
            >
              <span className="truncate text-[13px] font-semibold text-foreground">
                {primary.contact.name}
              </span>
            </EditableCell>
          ) : (
            <span className="text-[13px] font-semibold">이름 없음</span>
          )}
          {brokerageCase.participants.length > 1 ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              연결 {brokerageCase.participants.length}명
            </span>
          ) : null}
        </div>
        <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
          {formatPhone(primary?.contact.phone)}
        </span>
      </div>
    </th>
  );

  const actionCell = (
    <td
      rowSpan={rowSpan}
      className="ledger-sticky-action ledger-action-cell ledger-rowspan-top"
    >
      <CaseActionMenu
        brokerageCase={brokerageCase}
        customerName={customerName}
      />
    </td>
  );

  // 등록일 셀은 반드시 행의 마지막에 렌더링해야 컬럼이 밀리지 않는다
  const createdAtCell = (
    <td rowSpan={rowSpan} className="ledger-updated-cell ledger-rowspan-top">
      {formatDateShortYear(brokerageCase.createdAt)}
    </td>
  );

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
                  first && "ledger-case-start",
                  selected && "ledger-case-selected",
                )}
              >
                {first ? selectionCell : null}
                {first ? customerCell : null}
                {first ? actionCell : null}
                <DemandCells
                  line={row.line}
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
                  onUpdate={onUpdate}
                />
                {first ? createdAtCell : null}
              </tr>
            );
          case "context":
            return (
              <tr
                key={`${row.line.requirementId}-ctx`}
                className={cn(
                  "ledger-context-row",
                  selected && "ledger-case-selected",
                )}
              >
                <td colSpan={CONTEXT_COL_SPAN} className="ledger-group-end">
                  <IntentContext line={row.line} onUpdate={onUpdate} />
                </td>
              </tr>
            );
          case "stack":
            return (
              <tr
                key={`${row.group.intakeId}-stack`}
                className={cn(
                  "ledger-intent-row ledger-stack-row",
                  first && "ledger-case-start",
                  selected && "ledger-case-selected",
                )}
              >
                {first ? selectionCell : null}
                {first ? customerCell : null}
                {first ? actionCell : null}
                <StackCells
                  group={row.group}
                  expanded={expandedMatchRows.has(
                    listingMatchRowKey(row.group.intakeId),
                  )}
                  onToggleMatch={() =>
                    onToggleMatchRow(
                      listingMatchRowKey(row.group.intakeId),
                      caseMatchRowKeys,
                    )
                  }
                  onUpdate={onUpdate}
                />
                {first ? createdAtCell : null}
              </tr>
            );
          case "stack-context":
            return (
              <tr
                key={`${row.group.intakeId}-stack-ctx`}
                className={cn(
                  "ledger-context-row",
                  selected && "ledger-case-selected",
                )}
              >
                <td colSpan={CONTEXT_COL_SPAN} className="ledger-group-end">
                  <StackContext group={row.group} onUpdate={onUpdate} />
                </td>
              </tr>
            );
        }
      })}
      {rows.map((row) => {
        if (row.type === "context") {
          const rowKey = demandMatchRowKey(row.line.requirementId);
          if (!expandedMatchRows.has(rowKey)) return null;
          return (
            <tr key={`${rowKey}-panel`} className="ledger-match-panel-row">
              <td colSpan={COLUMN_COUNT}>
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
        if (row.type === "stack-context") {
          const rowKey = listingMatchRowKey(row.group.intakeId);
          if (!expandedMatchRows.has(rowKey)) return null;
          return (
            <tr key={`${rowKey}-panel`} className="ledger-match-panel-row">
              <td colSpan={COLUMN_COUNT}>
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
        }
        return null;
      })}
    </>
  );
}

function CaseActionMenu({
  brokerageCase,
  customerName,
}: {
  brokerageCase: BrokerageCase;
  customerName: string;
}) {
  const primary = brokerageCase.primaryParticipant;
  const listingTargets = [
    ...new Map(
      brokerageCase.listingIntents.map(
        (line) => [line.propertyId, line] as const,
      ),
    ).values(),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${customerName} 케이스 작업 메뉴`}
          title="케이스 작업 메뉴"
          className="mx-auto text-[#627d98] hover:bg-[#eef1f3] hover:text-slate-900 data-[state=open]:bg-[#eef1f3] data-[state=open]:text-slate-900"
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-48"
        onClick={(event) => event.stopPropagation()}
      >
        {primary ? (
          <DropdownMenuItem asChild>
            <Link
              to="/contacts/$id"
              params={{ id: primary.contact.id }}
              className="min-w-0"
            >
              <UserRound className="size-3.5" />
              <span className="truncate">고객 정보 열기</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        {brokerageCase.demandIntents.map((line) => (
          <DropdownMenuItem key={line.requirementId} asChild>
            <Link
              to="/buyer-requirements/$id"
              params={{ id: line.requirementId }}
              className="min-w-0"
              title={line.contextLabel}
            >
              <Tag className="size-3.5" />
              <span className="truncate">
                구함 {line.priorityRank} 상세 열기
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        {listingTargets.map((line, index) => (
          <DropdownMenuItem key={line.propertyId} asChild>
            <Link
              to="/properties/$id"
              params={{ id: line.propertyId }}
              className="min-w-0"
              title={line.contextLabel}
            >
              <Building2 className="size-3.5" />
              <span className="truncate">매물 {index + 1} 열기</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DemandCells({
  line,
  expanded,
  onToggleMatch,
  priorityOptions,
  onUpdate,
}: {
  line: BrokerageCaseDemandIntent;
  expanded: boolean;
  onToggleMatch: () => void;
  priorityOptions: ChipOption[];
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
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
      <td
        className={cn(
          "text-center",
          priorityOptions.length > 1 && "ledger-editable-cell",
        )}
      >
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
            className="cursor-pointer justify-center"
            hoverHighlight={false}
          >
            <span data-ledger-cell-value className="justify-center">
              <KindLabel kind="demand" priorityRank={line.priorityRank} />
            </span>
          </EditableCell>
        ) : (
          <KindLabel kind="demand" priorityRank={line.priorityRank} />
        )}
      </td>
      <td className="ledger-editable-cell text-center">
        <EditableCell
          recordId={line.buyerIntakeId}
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
          className="justify-center"
        >
          <span data-ledger-cell-value className="justify-center">
            <LifecyclePill lifecycleStatus={line.lifecycleStatus} />
          </span>
        </EditableCell>
      </td>
      <td className="ledger-editable-cell ledger-group-end">
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
      <MoneyCell
        recordId={line.requirementId}
        field="budgetMin"
        value={line.budgetMin}
        ariaLabel="최소예산 편집, 만원 단위"
        onSave={saveRequirementNumber}
      />
      <MoneyCell
        recordId={line.requirementId}
        field="budgetMax"
        value={line.budgetMax}
        ariaLabel="최대예산 편집, 만원 단위"
        onSave={saveRequirementNumber}
        groupEnd
      />
      <RentCell
        recordId={line.requirementId}
        field="monthlyRentMin"
        value={line.monthlyRentMin}
        ariaLabel="최소월세 편집, 만원 단위"
        onSave={
          line.transactionType === "monthly" ? saveRequirementNumber : undefined
        }
      />
      <RentCell
        recordId={line.requirementId}
        field="monthlyRentMax"
        value={line.monthlyRentMax}
        ariaLabel="최대월세 편집, 만원 단위"
        onSave={
          line.transactionType === "monthly" ? saveRequirementNumber : undefined
        }
        groupEnd
      />
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
        groupEnd
      />
      <MatchCell
        count={line.matchCount}
        expanded={expanded}
        panelId={matchPanelId(demandMatchRowKey(line.requirementId))}
        label="연결 매물"
        onToggle={onToggleMatch}
        groupEnd
      />
    </>
  );
}

// 매물 의뢰 — ListingIntake(같은 호실)당 1행, listing을 셀 안에 36px 라인으로 세로 적층
function StackCells({
  group,
  expanded,
  onToggleMatch,
  onUpdate,
}: {
  group: ListingGroup;
  expanded: boolean;
  onToggleMatch: () => void;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const first = group.lines[0];
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
      <td className="ledger-stack-merged-cell ledger-stack-merged-left">
        <KindLabel kind="listing" />
      </td>
      <td className="ledger-stack-merged-cell">
        <LifecyclePill
          lifecycleStatus={first.lifecycleStatus}
          paused={group.lines.every((line) => line.isPaused)}
        />
      </td>
      <td className="ledger-group-end">
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
      <td colSpan={2} className="ledger-group-end">
        <div className="ledger-stack ledger-stack-right">
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
                  className="justify-end font-medium tabular-nums"
                >
                  {formatMoney(line.askingPrice)}
                </span>
              </EditableCell>
            </div>
          ))}
        </div>
      </td>
      <td colSpan={2} className="ledger-group-end">
        <div className="ledger-stack ledger-stack-center">
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
                    className="justify-center font-medium tabular-nums"
                  >
                    {line.monthlyRent
                      ? `${line.monthlyRent.toLocaleString()}만`
                      : "—"}
                  </span>
                </EditableCell>
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  —
                </span>
              )}
            </div>
          ))}
        </div>
      </td>
      <td
        colSpan={2}
        className="ledger-stack-merged-cell ledger-exact-cell ledger-group-end"
      >
        {formatPyeong(first.area)}
      </td>
      <td className="ledger-stack-merged-cell ledger-group-end">
        <MatchBadge
          count={group.lines.reduce((sum, line) => sum + line.matchCount, 0)}
          expanded={expanded}
          panelId={matchPanelId(listingMatchRowKey(group.intakeId))}
          label="연결 구매고객"
          onToggle={onToggleMatch}
        />
      </td>
    </>
  );
}

// 매물 의뢰 context — 매물 identity와 intake 공유 노트(묶음 전체가 같은 의뢰 메모를 공유)
function StackContext({
  group,
  onUpdate,
}: {
  group: ListingGroup;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  const first = group.lines[0];
  return (
    <div className="ledger-context-layout">
      <Link
        to="/properties/$id"
        params={{ id: first.propertyId }}
        className="ledger-context-link"
        aria-label={`${first.contextLabel} 매물 상세 열기`}
        title={first.contextLabel}
      >
        <Building2 className="size-3 shrink-0 text-success" aria-hidden />
        <span className="truncate">{first.contextLabel}</span>
      </Link>
      <div className="ledger-context-memo">
        <StickyNote
          className="size-3 shrink-0 text-muted-foreground/70"
          aria-hidden
        />
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
      </div>
    </div>
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        isDemand
          ? "bg-info-soft text-info-strong"
          : "bg-success-soft text-success",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isDemand ? "bg-info" : "bg-success",
        )}
      />
      {isDemand ? `구함 ${priorityRank ?? 1}` : "내놓음"}
    </span>
  );
}

// 상태 컬럼 — 의뢰 생명주기 pill. 매물관리 Notion 팔레트와 동일한 색상 체계
const LIFECYCLE_PILL_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  open: { label: "진행중", className: "bg-[#eef3ed] text-[#44745a]" },
  hold: { label: "보류", className: "bg-[#fbf3db] text-[#9f6b00]" },
  closed: { label: "종료", className: "bg-[#f1f1ef] text-[#787774]" },
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
    } as const);
  return (
    <span
      className={cn(
        "inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5",
        meta.className,
      )}
    >
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
        "inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5",
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

// 구함 context — 장소를 먼저 읽고, 구분선 뒤의 노트를 별도 보조 정보로 편집한다.
function IntentContext({
  line,
  onUpdate,
}: {
  line: BrokerageCaseDemandIntent;
  onUpdate: (request: LedgerUpdateRequest) => void;
}) {
  return (
    <div className="ledger-context-layout">
      <Link
        to="/buyer-requirements/$id"
        params={{ id: line.requirementId }}
        className="ledger-context-link"
        aria-label={`${line.contextLabel} 구함 상세 열기`}
        title={line.contextLabel}
      >
        <MapPin className="size-3 shrink-0 text-info" aria-hidden />
        <span className="truncate">{line.contextLabel}</span>
      </Link>
      <div className="ledger-context-memo">
        <StickyNote
          className="size-3 shrink-0 text-muted-foreground/70"
          aria-hidden
        />
        <MemoCell
          recordId={line.requirementId}
          value={line.memo}
          ariaLabel={`${line.contextLabel} 구함 노트 편집`}
          onSave={(memo) =>
            onUpdate({
              target: "buyer-requirement",
              id: line.requirementId,
              patch: { memo },
            })
          }
        />
      </div>
    </div>
  );
}

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
  return (
    <EditableCell
      recordId={recordId}
      field="memo"
      value={value}
      ariaLabel={ariaLabel}
      onSave={(_recordId, _field, nextValue) => {
        const next = String(nextValue ?? "").trim();
        if (next !== (value ?? "")) onSave(next);
      }}
      editType="text"
      activation="doubleClick"
      editorChrome="floating"
      hoverHighlight={false}
      className="min-w-0 px-1.5 text-[11px]"
    >
      <span
        title={value ? value.replace(/\n/g, " ") : undefined}
        className={cn(
          "min-w-0 truncate",
          value ? "text-muted-foreground" : "italic text-muted-foreground/70",
        )}
      >
        {value ? value.replace(/\n/g, " ") : "+ 노트"}
      </span>
    </EditableCell>
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
  ariaLabel,
  onSave,
  groupEnd = false,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "budgetMin" | "budgetMax">;
  value: number | null;
  ariaLabel: string;
  onSave: (field: LedgerNumberField, value: unknown) => boolean | void;
  groupEnd?: boolean;
}) {
  return (
    <td
      className={cn(
        "ledger-editable-cell ledger-number-cell",
        groupEnd && "ledger-group-end",
      )}
    >
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
        <span data-ledger-cell-value className="justify-end">
          {formatMoney(value)}
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
  groupEnd = false,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "monthlyRentMin" | "monthlyRentMax">;
  value: number | null;
  ariaLabel: string;
  onSave?: (field: LedgerNumberField, value: unknown) => boolean | void;
  groupEnd?: boolean;
}) {
  return (
    <td
      className={cn(
        onSave && "ledger-editable-cell",
        "ledger-number-cell",
        groupEnd && "ledger-group-end",
      )}
    >
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
          <span data-ledger-cell-value className="justify-end">
            {value ? `${value.toLocaleString()}만` : "—"}
          </span>
        </EditableCell>
      ) : (
        "—"
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
  groupEnd = false,
}: {
  recordId: string;
  field: Extract<LedgerNumberField, "areaMin" | "areaMax">;
  value: number | null;
  ariaLabel: string;
  onSave: (field: LedgerNumberField, value: unknown) => boolean | void;
  groupEnd?: boolean;
}) {
  return (
    <td
      className={cn(
        "ledger-editable-cell ledger-number-cell",
        groupEnd && "ledger-group-end",
      )}
    >
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
        <span data-ledger-cell-value className="justify-end">
          {formatPyeong(value)}
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
  groupEnd = false,
}: {
  count: number;
  expanded: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
  groupEnd?: boolean;
}) {
  return (
    <td className={cn("text-center", groupEnd && "ledger-group-end")}>
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
  sortBy: BrokerageCaseLedgerSortField;
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
        <LedgerHeaderLabel icon={icon} label={label} />
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

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index}>
          <td colSpan={COLUMN_COUNT} className="h-[68px] px-4">
            <div className="h-7 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          </td>
        </tr>
      ))}
    </>
  );
}
