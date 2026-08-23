import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BuyerIntakeLifecycleStatus,
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseLedgerMode,
  BrokerageCaseLedgerSortField,
  BrokerageCaseListingIntent,
} from "@estate-erp/api-client";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitBranch,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  formatDateShortYear,
  formatDateTime,
  formatMoney,
  formatPhone,
  formatPyeong,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import {
  CellEditProvider,
  EditableCell,
  ViewBar,
  type ActiveFilter,
  type FilterDefinition,
  type SortDefinition,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
  customerLedgerSortDefinitions,
  getNextCustomerLedgerSort,
} from "./-customer-list-filters";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "./-customer-ledger-pagination";
import { CustomerCaseActionMenu } from "./-customer-case-action-menu";
import { CustomerDemandIntakeActionMenu } from "./-customer-demand-intake-action-menu";
import { CustomerDemandIntentActionMenu } from "./-customer-demand-intent-action-menu";
import { LedgerMatchPanel } from "../matches/-ledger-match-panel";
import {
  getCustomerCaseSelectionKeys,
  getCustomerSelectionState,
  getDemandSelectionKey,
  getListingSelectionKey,
  groupCustomerDemandIntents,
  groupCustomerListingIntents,
  summarizeCustomerCase,
  toggleCustomerCaseCollapsed,
  toggleCustomerIntakeCollapsed,
  updateCustomerSelection,
  type CustomerDemandGroup,
  type CustomerListingGroup,
} from "../customers-next/-customers-next-model";
import "../customers-next/-customers-next.css";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersNextPage,
});

type SortOrder = "asc" | "desc";
type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">;

const PAGE_SIZE = 20;
const CUSTOMER_CASE_ESTIMATED_HEIGHT = 240;
const CUSTOMER_CASE_GAP = 0;
const CUSTOMER_CASE_OVERSCAN = 5;

function estimateCustomerCaseHeight() {
  return CUSTOMER_CASE_ESTIMATED_HEIGHT;
}

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  phone: "전화",
  visit: "방문",
  online: "온라인",
};

const MODE_OPTIONS: Array<{
  value: CustomerLedgerMode;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "listing", label: "내놓음" },
];

function CustomersNextPage() {
  const createTab = useTabStore((state) => state.createTab);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [mode, setMode] = useState<CustomerLedgerMode>("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] =
    useState<BrokerageCaseLedgerSortField | null>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [collapsedCaseIds, setCollapsedCaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedDemandIntakeIds, setCollapsedDemandIntakeIds] = useState<
    Set<string>
  >(() => new Set());
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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

  const ledgerQuery = useInfiniteQuery({
    queryKey: ["brokerage-cases", "ledger", "customers", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.brokerageCases.ledger({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: getNextLedgerCursor,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setCollapsedCaseIds(new Set());
    setCollapsedDemandIntakeIds(new Set());
    setSelectedItemKeys(new Set());
    setExpandedMatchKey(null);
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [filters]);

  useEffect(() => {
    const scrollRegion = listScrollRef.current;
    const target = loadMoreRef.current;
    if (
      !scrollRegion ||
      !target ||
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
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    ledgerQuery.fetchNextPage,
    ledgerQuery.hasNextPage,
    ledgerQuery.isFetchNextPageError,
    ledgerQuery.isFetching,
    ledgerQuery.isFetchingNextPage,
  ]);

  const cases = useMemo(
    () => mergeLedgerPages(ledgerQuery.data?.pages),
    [ledgerQuery.data?.pages],
  );
  const getCustomerCaseKey = useCallback(
    (index: number) => cases[index]?.id ?? `customer-case-${index}`,
    [cases],
  );
  const customerCaseVirtualizer = useVirtualizer({
    count: cases.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: estimateCustomerCaseHeight,
    getItemKey: getCustomerCaseKey,
    gap: CUSTOMER_CASE_GAP,
    overscan: CUSTOMER_CASE_OVERSCAN,
  });
  const virtualCustomerCases = customerCaseVirtualizer.getVirtualItems();
  const measureRenderedCustomerCases = useCallback(() => {
    const virtualList = virtualListRef.current;
    if (!virtualList) return;

    virtualList
      .querySelectorAll<HTMLElement>("[data-customer-case-virtual-row]")
      .forEach((row) => {
        customerCaseVirtualizer.measureElement(row);
      });
  }, [customerCaseVirtualizer]);
  useLayoutEffect(() => {
    measureRenderedCustomerCases();
  }, [
    collapsedCaseIds,
    collapsedDemandIntakeIds,
    expandedMatchKey,
    measureRenderedCustomerCases,
  ]);
  useEffect(() => {
    let resizeTimer: number | undefined;
    const handleWindowResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measureRenderedCustomerCases, 0);
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [measureRenderedCustomerCases]);
  useEffect(() => {
    const virtualList = virtualListRef.current;
    if (!virtualList) return;

    const observer = new MutationObserver((records) => {
      const changedRows = new Set<HTMLElement>();

      for (const record of records) {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const row = target?.closest<HTMLElement>(
          "[data-customer-case-virtual-row]",
        );
        if (row && virtualList.contains(row)) changedRows.add(row);
      }

      for (const row of changedRows) {
        customerCaseVirtualizer.measureElement(row);
      }
    });

    observer.observe(virtualList, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [cases.length, customerCaseVirtualizer]);
  const matchCaseIdByKey = useMemo(() => {
    const caseIds = new Map<string, string>();

    for (const brokerageCase of cases) {
      for (const intent of brokerageCase.demandIntents) {
        caseIds.set(`demand:${intent.requirementId}`, brokerageCase.id);
      }
      for (const intent of brokerageCase.listingIntents) {
        caseIds.set(`listing:${intent.listingIntakeId}`, brokerageCase.id);
      }
    }

    return caseIds;
  }, [cases]);
  const activeMatchCaseId = expandedMatchKey
    ? matchCaseIdByKey.get(expandedMatchKey)
    : undefined;
  const firstPage = ledgerQuery.data?.pages[0];
  const totalCases = firstPage?.pagination.total ?? 0;
  const summary = firstPage?.summary ?? {
    cases: 0,
    demand: 0,
    listing: 0,
    both: 0,
  };
  const activeSorts = useMemo<SortDefinition[]>(
    () =>
      sortBy
        ? [
            {
              field: sortBy,
              label:
                customerLedgerSortDefinitions.find(
                  (item) => item.field === sortBy,
                )?.label ?? sortBy,
              direction: sortOrder,
            },
          ]
        : [],
    [sortBy, sortOrder],
  );
  const hasActiveControls =
    search.trim().length > 0 ||
    mode !== "all" ||
    activeFilters.length > 0 ||
    (sortBy !== null &&
      (sortBy !== "createdAt" || sortOrder !== "desc"));
  const modeCount = (value: CustomerLedgerMode) => {
    if (value === "all") return summary.cases;
    return summary[value];
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

  const handleCreateDemandIntake = useCallback(() => {
    const route = "/buyer-requirements/new";
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  }, [createTab]);

  const toggleCase = useCallback((caseId: string) => {
    setCollapsedCaseIds((current) =>
      toggleCustomerCaseCollapsed(current, caseId),
    );
    setExpandedMatchKey(null);
  }, []);
  const toggleDemandIntake = useCallback((intakeId: string) => {
    setCollapsedDemandIntakeIds((current) =>
      toggleCustomerIntakeCollapsed(current, intakeId),
    );
    setExpandedMatchKey(null);
  }, []);
  const toggleMatch = useCallback((key: string) => {
    setExpandedMatchKey((current) => (current === key ? null : key));
  }, []);
  const updateSelection = useCallback(
    (keys: readonly string[], selected: boolean) => {
      setSelectedItemKeys((current) =>
        updateCustomerSelection(current, keys, selected),
      );
    },
    [],
  );
  const loadedSelectionKeys = useMemo(
    () => cases.flatMap(getCustomerCaseSelectionKeys),
    [cases],
  );
  const loadedSelectionState = getCustomerSelectionState(
    selectedItemKeys,
    loadedSelectionKeys,
  );
  const changeSort = (field: BrokerageCaseLedgerSortField) => {
    const nextSort = getNextCustomerLedgerSort(
      { sortBy, sortOrder },
      field,
    );
    setSortBy(nextSort.sortBy);
    setSortOrder(nextSort.sortOrder);
  };

  const statusMessage = ledgerQuery.isLoading
    ? "고객 케이스를 불러오는 중입니다."
    : ledgerQuery.isFetchNextPageError
      ? "추가 고객 케이스를 불러오지 못했습니다."
      : ledgerQuery.isFetchingNextPage
        ? "고객 케이스를 더 불러오는 중입니다."
        : ledgerQuery.hasNextPage
          ? `${totalCases}개 중 ${cases.length}개 고객 케이스를 불러왔습니다.`
          : `고객 케이스 ${cases.length}개를 불러왔습니다.`;

  return (
    <CellEditProvider>
      <div
        data-customers-next-page
        className="customers-next-page -m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <h1 className="sr-only">고객 원장 새 보기</h1>

        <section
          className="shrink-0 border-b border-border bg-white px-3 py-2.5"
          aria-label="새 고객 원장 보기 및 검색"
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
                  aria-hidden="true"
                />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="고객, 전화번호, 지역, 매물 (⌘F)"
                  aria-label="새 고객 원장 검색"
                  className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
                />
                {search ? (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {totalCases.toLocaleString()}개 케이스
            </span>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-3"
              onClick={handleCreateDemandIntake}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              구함 의뢰 추가
            </Button>
          </div>
        </section>

        <section
          className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6]"
          aria-label="새 고객 원장 상세 필터"
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
                setSortBy(null);
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
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    초기화
                  </Button>
                ) : null
              }
            />
          </div>
        </section>

        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
          aria-busy={ledgerQuery.isLoading || ledgerQuery.isFetchingNextPage}
        >
          {cases.length > 0 && (
            <CustomersNextLedgerHeader
              loadedCaseCount={cases.length}
              selectionState={loadedSelectionState}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSelectionChange={(selected) =>
                updateSelection(loadedSelectionKeys, selected)
              }
              onSort={changeSort}
            />
          )}

          <div
            ref={listScrollRef}
            data-customer-case-scroll-region
            className="min-h-0 min-w-0 flex-1 overflow-auto"
            aria-label="고객 케이스 목록"
          >
            {ledgerQuery.isLoading ? (
              <CustomerCaseSkeletons />
            ) : ledgerQuery.isError && !firstPage ? (
              <LoadError onRetry={() => void ledgerQuery.refetch()} />
            ) : cases.length === 0 ? (
              <EmptyView active={hasActiveControls} onReset={resetFilters} />
            ) : (
              <>
                <div
                  ref={virtualListRef}
                  data-customer-case-virtual-list
                  role="list"
                  className="relative w-full"
                  style={{ height: customerCaseVirtualizer.getTotalSize() }}
                >
                  {virtualCustomerCases.map((virtualCase) => {
                    const brokerageCase = cases[virtualCase.index];
                    if (!brokerageCase) return null;
                    const expanded = !collapsedCaseIds.has(brokerageCase.id);

                    return (
                      <div
                        key={virtualCase.key}
                        ref={customerCaseVirtualizer.measureElement}
                        data-index={virtualCase.index}
                        data-customer-case-virtual-row
                        data-customer-case-id={brokerageCase.id}
                        role="listitem"
                        aria-posinset={virtualCase.index + 1}
                        aria-setsize={totalCases}
                        className="absolute left-0 top-0 w-full"
                        style={{
                          transform: `translateY(${virtualCase.start}px)`,
                        }}
                      >
                        <CustomerCaseGroup
                          brokerageCase={brokerageCase}
                          expanded={expanded}
                          collapsedDemandIntakeIds={collapsedDemandIntakeIds}
                          selectedItemKeys={selectedItemKeys}
                          expandedMatchKey={
                            activeMatchCaseId === brokerageCase.id
                              ? expandedMatchKey
                              : null
                          }
                          onToggle={toggleCase}
                          onToggleDemandIntake={toggleDemandIntake}
                          onToggleMatch={toggleMatch}
                          onSelectionChange={updateSelection}
                        />
                      </div>
                    );
                  })}
                </div>

                <div ref={loadMoreRef} className="h-px" aria-hidden="true" />

                {ledgerQuery.isFetchingNextPage && (
                  <div className="mt-2 flex h-12 items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2
                      className="size-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    고객 케이스를 더 불러오는 중...
                  </div>
                )}

                {ledgerQuery.isFetchNextPageError && (
                  <div className="mt-2 flex h-12 items-center justify-center gap-3 text-xs text-destructive">
                    추가 고객 케이스를 불러오지 못했습니다.
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void ledgerQuery.fetchNextPage()}
                    >
                      다시 시도
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        <footer className="flex min-h-7 shrink-0 items-center border-t border-border/60 bg-[#faf9f6] px-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {cases.length.toLocaleString()} / {totalCases.toLocaleString()}개
            표시
          </span>
          <span role="status" aria-live="polite" className="ml-auto">
            {statusMessage}
          </span>
        </footer>
      </div>
    </CellEditProvider>
  );
}

function HierarchySelectionCheckbox({
  className,
  ...props
}: ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      {...props}
      data-hierarchy-selection-checkbox
      className={cn(
        "z-[5] size-3.5 rounded-[3px] border-border bg-background text-background shadow-none transition-[opacity,background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "hover:border-foreground/70 focus-visible:border-foreground focus-visible:opacity-100 focus-visible:ring-foreground/20",
        "data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:opacity-100",
        "data-[state=indeterminate]:border-foreground data-[state=indeterminate]:bg-foreground data-[state=indeterminate]:opacity-100",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

type EditableMemoTarget =
  | { kind: "demand"; id: string }
  | { kind: "listing"; id: string; expectedUpdatedAt: string };

function EditableIntentMemo({
  target,
  label,
  value,
  ariaLabel,
  showLabel = true,
  className,
}: {
  target: EditableMemoTarget;
  label: string;
  value: string | null;
  ariaLabel: string;
  showLabel?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (memo: string) => {
      if (target.kind === "listing") {
        return api.listingIntakes.update(target.id, {
          memo: memo || null,
          expectedUpdatedAt: target.expectedUpdatedAt,
        });
      }
      return api.buyerRequirements.update(target.id, { memo });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["brokerage-cases"] }),
        queryClient.invalidateQueries({
          queryKey:
            target.kind === "listing"
              ? ["listing-intakes"]
              : ["buyer-requirements"],
        }),
      ]);
      toast.success("메모가 저장되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || `${label} 저장에 실패했습니다.`);
    },
  });

  return (
    <EditableCell
      recordId={target.id}
      field="memo"
      value={value}
      ariaLabel={`${ariaLabel} 편집`}
      onSave={(_recordId, _field, nextValue) => {
        const next = String(nextValue ?? "").trim();
        if (next !== (value ?? "").trim()) mutation.mutate(next);
      }}
      editType="text"
      activation="doubleClick"
      editorChrome="floating"
      hoverHighlight={false}
      className={cn("min-w-0 gap-2", className)}
    >
      {showLabel && (
        <span className="shrink-0 font-medium text-muted-foreground-strong">
          {label}
        </span>
      )}
      <span
        title={value || undefined}
        className={cn(
          "min-w-0 flex-1 truncate",
          value ? "text-muted-foreground" : "italic text-muted-foreground/70",
        )}
      >
        {value || "메모 추가"}
      </span>
    </EditableCell>
  );
}

function CustomersNextLedgerHeader({
  loadedCaseCount,
  selectionState,
  sortBy,
  sortOrder,
  onSelectionChange,
  onSort,
}: {
  loadedCaseCount: number;
  selectionState: boolean | "indeterminate";
  sortBy: BrokerageCaseLedgerSortField | null;
  sortOrder: SortOrder;
  onSelectionChange: (selected: boolean) => void;
  onSort: (field: BrokerageCaseLedgerSortField) => void;
}) {
  return (
    <div
      data-customers-next-ledger-header
      role="row"
      className="customers-next-ledger-header shrink-0 overflow-x-auto"
    >
      <div className="customers-next-ledger-header-grid">
        <div
          role="columnheader"
          className="customers-next-ledger-header-cell justify-center px-0"
        >
          <HierarchySelectionCheckbox
            checked={selectionState}
            aria-label={`현재 불러온 ${loadedCaseCount}개 고객 케이스 전체 선택`}
            title={`현재 불러온 ${loadedCaseCount}개 고객 케이스 전체 선택`}
            onCheckedChange={(checked) => onSelectionChange(checked === true)}
          />
        </div>
        <CustomersNextStaticHeader icon={<UserRound />} label="이름" />
        <CustomersNextStaticHeader icon={<Phone />} label="연락처" groupEnd />
        <CustomersNextSortableHeader
          label="최소예산"
          field="budgetMin"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
        />
        <CustomersNextSortableHeader
          label="최대예산"
          field="budgetMax"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          groupEnd
        />
        <CustomersNextSortableHeader
          label="최소월세"
          field="monthlyRentMin"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
        />
        <CustomersNextSortableHeader
          label="최대월세"
          field="monthlyRentMax"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          groupEnd
        />
        <CustomersNextSortableHeader
          label="최소평형"
          field="areaMin"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
        />
        <CustomersNextSortableHeader
          label="최대평형"
          field="areaMax"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          groupEnd
        />
        <CustomersNextSortableHeader
          icon={<GitBranch />}
          label="매칭"
          field="matchCount"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          groupEnd
        />
        <CustomersNextSortableHeader
          icon={<CalendarDays />}
          label="등록일"
          field="createdAt"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
        />
      </div>
    </div>
  );
}

function CustomersNextSortableHeader({
  icon,
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  groupEnd,
}: {
  icon?: ReactNode;
  label: string;
  field: BrokerageCaseLedgerSortField;
  sortBy: BrokerageCaseLedgerSortField | null;
  sortOrder: SortOrder;
  onSort: (field: BrokerageCaseLedgerSortField) => void;
  groupEnd?: boolean;
}) {
  const active = field === sortBy;
  const SortIcon = sortOrder === "asc" ? ArrowUp : ArrowDown;

  return (
    <div
      role="columnheader"
      aria-sort={
        active ? (sortOrder === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "customers-next-ledger-header-cell",
        groupEnd && "customers-next-ledger-header-group-end",
      )}
    >
      <button
        type="button"
        className="customers-next-ledger-sort-button"
        onClick={() => onSort(field)}
      >
        <CustomersNextHeaderLabel icon={icon} label={label} />
        {active ? <SortIcon className="size-3 shrink-0" aria-hidden /> : null}
      </button>
    </div>
  );
}

function CustomersNextStaticHeader({
  icon,
  label,
  groupEnd,
}: {
  icon?: ReactNode;
  label: string;
  groupEnd?: boolean;
}) {
  return (
    <div
      role="columnheader"
      className={cn(
        "customers-next-ledger-header-cell",
        groupEnd && "customers-next-ledger-header-group-end",
      )}
    >
      <CustomersNextHeaderLabel icon={icon} label={label} />
    </div>
  );
}

function CustomersNextHeaderLabel({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-normal text-muted-foreground">
      {icon ? (
        <span className="shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/70">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

const CustomerCaseGroup = memo(function CustomerCaseGroup({
  brokerageCase,
  expanded,
  collapsedDemandIntakeIds,
  selectedItemKeys,
  expandedMatchKey,
  onToggle,
  onToggleDemandIntake,
  onToggleMatch,
  onSelectionChange,
}: {
  brokerageCase: BrokerageCase;
  expanded: boolean;
  collapsedDemandIntakeIds: ReadonlySet<string>;
  selectedItemKeys: ReadonlySet<string>;
  expandedMatchKey: string | null;
  onToggle: (caseId: string) => void;
  onToggleDemandIntake: (intakeId: string) => void;
  onToggleMatch: (key: string) => void;
  onSelectionChange: (keys: readonly string[], selected: boolean) => void;
}) {
  const participant =
    brokerageCase.primaryParticipant ?? brokerageCase.participants[0] ?? null;
  const customerName = participant?.contact.name ?? "고객 미지정";
  const participantExtra = Math.max(0, brokerageCase.participants.length - 1);
  const demandGroups = groupCustomerDemandIntents(brokerageCase.demandIntents);
  const listingGroups = groupCustomerListingIntents(
    brokerageCase.listingIntents,
  );
  const summary = summarizeCustomerCase(brokerageCase);
  const latestConsultation = brokerageCase.latestConsultation;
  const latestConsultationContent = latestConsultation?.content
    .replace(/\s+/g, " ")
    .trim();
  const latestConsultationTypeLabel = latestConsultation
    ? (CONSULTATION_TYPE_LABELS[latestConsultation.type] ??
      latestConsultation.type)
    : null;
  const intakeCount = demandGroups.length + listingGroups.length;
  const panelId = `customers-next-case-${brokerageCase.id}`;
  const selectionKeys = getCustomerCaseSelectionKeys(brokerageCase);
  const selectionState = getCustomerSelectionState(
    selectedItemKeys,
    selectionKeys,
  );

  return (
    <section
      data-customer-case-group
      data-selection-state={
        selectionState === true ? "checked" : selectionState || "unchecked"
      }
      aria-label={`${customerName} 고객 케이스`}
      className="group/customer-case overflow-hidden border-b border-border bg-background"
    >
      <header
        className={cn(
          "flex min-w-0 items-center gap-2 bg-muted/30 px-3 py-2.5",
          expanded && "border-b border-border/70",
        )}
      >
        <HierarchySelectionCheckbox
          checked={selectionState}
          disabled={selectionKeys.length === 0}
          aria-label={`${customerName} 고객 케이스 전체 선택`}
          className="shrink-0"
          onCheckedChange={(checked) =>
            onSelectionChange(selectionKeys, checked === true)
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          aria-label={`${customerName} 고객 케이스 ${expanded ? "접기" : "펼치기"}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onToggle(brokerageCase.id)}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </Button>
        <div className="customers-next-case-summary">
          <div className="customers-next-case-identity flex min-w-0 items-center gap-3">
            {participant ? (
              <Link
                to="/contacts/$id"
                params={{ id: participant.contactId }}
                className="w-24 shrink-0 truncate text-[13px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {customerName}
              </Link>
            ) : (
              <span className="w-24 shrink-0 truncate text-[13px] font-semibold">
                {customerName}
              </span>
            )}
            {participantExtra > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                외 {participantExtra}명
              </span>
            )}
            <dl data-customer-contact-summary className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <dt className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
                  연락처
                </dt>
                <dd
                  title={formatPhone(participant?.contact.phone)}
                  className="min-w-0 truncate text-[12.5px] font-semibold text-foreground tabular-nums"
                >
                  {formatPhone(participant?.contact.phone)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="customers-next-case-overview min-w-0">
            {latestConsultation ? (
              <Link
                data-customer-consultation-summary
                to="/consultations"
                search={{ consultationId: latestConsultation.id }}
                aria-label={`${customerName} 최근 ${latestConsultationTypeLabel} 상담: ${latestConsultationContent || "내용 없음"}, ${formatDateTime(latestConsultation.createdAt)}. 상세 보기`}
                className="group -mx-2 grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  최근 상담
                </span>
                <span
                  title={
                    latestConsultationContent || latestConsultation.content
                  }
                  className="min-w-0 truncate text-[12.5px] font-medium text-foreground"
                >
                  <span className="group-hover:underline group-hover:underline-offset-2">
                    {latestConsultationContent || "상담 내용이 없습니다."}
                  </span>
                </span>
              </Link>
            ) : (
              <div
                data-customer-consultation-summary
                className="-mx-2 grid min-h-7 min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2 px-2 py-1"
              >
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  최근 상담
                </span>
                <span className="truncate text-[12px] text-muted-foreground/80">
                  기록 없음
                </span>
              </div>
            )}
          </div>

          <div className="customers-next-case-counts flex flex-wrap items-center justify-end gap-2 text-[10.5px] tabular-nums">
            {summary.demandCount > 0 && (
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="font-medium text-info-strong">구함</span>
                <strong className="text-[12px] font-semibold text-foreground">
                  {summary.demandCount}
                </strong>
                <span className="text-muted-foreground">
                  · 매칭 {summary.demandMatchCount}
                </span>
              </span>
            )}
            {summary.demandCount > 0 && summary.listingCount > 0 && (
              <span className="h-3 w-px bg-border" aria-hidden="true" />
            )}
            {summary.listingCount > 0 && (
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="font-medium text-success">내놓음</span>
                <strong className="text-[12px] font-semibold text-foreground">
                  {summary.listingCount}
                </strong>
                <span className="text-muted-foreground">
                  · 매칭 {summary.listingMatchCount}
                </span>
              </span>
            )}
          </div>
        </div>
        <CustomerCaseActionMenu
          brokerageCase={brokerageCase}
          customerName={customerName}
        />
      </header>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={`${customerName} 구함 및 내놓음 상세`}
        >
          <div data-customer-intent-list className="min-w-0">
            {intakeCount > 0 ? (
              <div
                data-customer-intent-branch-list
                className="customers-next-intent-branch-list relative"
              >
                <span
                  data-customer-intent-branch-trunk
                  aria-hidden="true"
                  className="customers-next-intent-branch-trunk pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-border"
                />
                <div
                  role="list"
                  aria-label={`${customerName} 의뢰 목록`}
                  className="space-y-2"
                >
                  {demandGroups.map((group, index) => {
                    return (
                      <DemandIntakeGroup
                        key={group.intakeId}
                        customerName={customerName}
                        group={group}
                        ordinal={
                          group.lines[0]?.intakePriorityRank ?? index + 1
                        }
                        expanded={!collapsedDemandIntakeIds.has(group.intakeId)}
                        isLast={
                          index === demandGroups.length - 1 &&
                          listingGroups.length === 0
                        }
                        onToggle={() => onToggleDemandIntake(group.intakeId)}
                        expandedMatchKey={expandedMatchKey}
                        onToggleMatch={onToggleMatch}
                        selectedItemKeys={selectedItemKeys}
                        onSelectionChange={onSelectionChange}
                      />
                    );
                  })}

                  {listingGroups.map((group, index) => {
                    return (
                      <ListingIntakeGroup
                        key={group.intakeId}
                        customerName={customerName}
                        group={group}
                        ordinal={
                          group.lines[0]?.intakePriorityRank ?? index + 1
                        }
                        isLast={index === listingGroups.length - 1}
                        expandedMatchKey={expandedMatchKey}
                        onToggleMatch={onToggleMatch}
                        selectedItemKeys={selectedItemKeys}
                        onSelectionChange={onSelectionChange}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                이 케이스에 등록된 거래 정보가 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
});

function DemandIntakeGroup({
  customerName,
  group,
  ordinal,
  expanded,
  isLast,
  onToggle,
  expandedMatchKey,
  onToggleMatch,
  selectedItemKeys,
  onSelectionChange,
}: {
  customerName: string;
  group: CustomerDemandGroup;
  ordinal: number;
  expanded: boolean;
  isLast: boolean;
  onToggle: () => void;
  expandedMatchKey: string | null;
  onToggleMatch: (key: string) => void;
  selectedItemKeys: ReadonlySet<string>;
  onSelectionChange: (keys: readonly string[], selected: boolean) => void;
}) {
  const first = group.lines[0];
  if (!first) return null;
  const selectionKeys = group.lines.map((intent) =>
    getDemandSelectionKey(intent.requirementId),
  );
  const selectionState = getCustomerSelectionState(
    selectedItemKeys,
    selectionKeys,
  );
  const panelId = `customers-next-demand-intake-${group.intakeId}`;

  return (
    <div
      data-customer-buyer-intake={group.intakeId}
      data-customer-intake-branch
      role="listitem"
      className="customers-next-intent-branch relative"
    >
      <CustomerIntentBranchConnector isLast={isLast} />
      <article
        data-customer-intake-summary
        className="group/customer-intake customers-next-intent-branch-row relative flex min-w-0 items-center gap-2 py-3 pr-3"
      >
        <span
          data-customer-intake-child-stem
          aria-hidden="true"
          className="customers-next-demand-intake-child-stem customers-next-intake-child-stem pointer-events-none absolute bottom-0 z-[1] w-px bg-border"
        />
        <span
          data-customer-intake-marker
          aria-hidden="true"
          className="relative z-[2] -ml-2.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-neutral-soft text-muted-foreground"
        >
          <Search className="size-3.5" />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="relative z-[2] shrink-0 text-muted-foreground"
          aria-label={`${customerName} 구함 의뢰 ${ordinal} ${expanded ? "접기" : "펼치기"}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </Button>
        <HierarchySelectionCheckbox
          checked={selectionState}
          aria-label={`${customerName} 구함 의뢰 ${ordinal} 전체 선택`}
          className="relative z-[2] shrink-0"
          onCheckedChange={(checked) =>
            onSelectionChange(selectionKeys, checked === true)
          }
        />
        <div className="relative z-[2] flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">
            구함 의뢰 {ordinal}
          </span>
          <StatusBadge
            kind="intakeLifecycle"
            status={first.lifecycleStatus}
            size="sm"
          />
          <CustomerDemandIntakeActionMenu
            intakeId={group.intakeId}
            lifecycleStatus={
              first.lifecycleStatus as BuyerIntakeLifecycleStatus
            }
            customerName={customerName}
            ordinal={ordinal}
          />
          <time
            dateTime={first.receivedAt}
            className="customers-next-intake-date ml-auto shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
          >
            접수 {formatDateShortYear(first.receivedAt)}
          </time>
        </div>
      </article>

      {expanded && (
        <div
          id={panelId}
          data-customer-intake-children
          className="customers-next-demand-intake-children customers-next-intake-children customers-next-intent-branch-list relative"
        >
          <span
            data-customer-intake-child-trunk
            aria-hidden="true"
            className="customers-next-intent-branch-trunk pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-border"
          />
          <div
            role="list"
            aria-label={`${customerName} 구함 의뢰 ${ordinal} 조건 목록`}
            className="py-2.5"
          >
            {group.lines.map((intent, index) => {
              const matchKey = `demand:${intent.requirementId}`;
              return (
                <DemandIntentRow
                  key={intent.requirementId}
                  intent={intent}
                  isFirst={index === 0}
                  isLast={index === group.lines.length - 1}
                  matchKey={matchKey}
                  matchExpanded={expandedMatchKey === matchKey}
                  onToggleMatch={() => onToggleMatch(matchKey)}
                  selected={selectedItemKeys.has(
                    getDemandSelectionKey(intent.requirementId),
                  )}
                  onSelectionChange={(selected) =>
                    onSelectionChange(
                      [getDemandSelectionKey(intent.requirementId)],
                      selected,
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DemandIntentRow({
  intent,
  isFirst,
  isLast,
  matchKey,
  matchExpanded,
  onToggleMatch,
  selected,
  onSelectionChange,
}: {
  intent: BrokerageCaseDemandIntent;
  isFirst: boolean;
  isLast: boolean;
  matchKey: string;
  matchExpanded: boolean;
  onToggleMatch: () => void;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) {
  const panelId = getMatchPanelId(matchKey);
  const terms = getDemandTerms(intent);
  const conditionLabel = formatDemandConditionLabel(intent, terms);
  const regionLabel =
    intent.preferredRegions
      .map(
        (region) =>
          region.wardName ?? region.districtName ?? region.provinceName,
      )
      .filter((name): name is string => Boolean(name))
      .join(" · ") || "지역 미정";
  const siteAriaLabel = intent.preferredSites
    .map((site) => site.name)
    .join(", ");
  const memo = intent.memo || null;
  const showUrgency =
    intent.urgency === "urgent" || intent.urgency === "flexible";

  return (
    <div
      data-customer-demand-intent={intent.requirementId}
      data-customer-demand-requirement={intent.requirementId}
      data-customer-intent-branch
      role="listitem"
      className="customers-next-intent-branch relative"
    >
      <CustomerIntentBranchConnector isLast={isLast} compact />
      <article
        data-customer-demand-row
        className="group/customer-condition customers-next-intent-branch-row min-w-0 pr-3"
      >
        <div
          data-customer-demand-cells
          className={cn(
            "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] grid-rows-[auto_auto] overflow-hidden rounded-none border border-border/90 bg-background transition-[border-color,background-color,box-shadow] duration-150 group-hover/customer-condition:border-muted-foreground/35 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
            !isFirst && "border-t-0",
            matchExpanded && "border-info/35 bg-info-soft/20",
          )}
        >
          <HierarchySelectionCheckbox
            checked={selected}
            aria-label={`${conditionLabel} 구함 조건 선택`}
            className="col-start-1 row-start-1 ml-3 self-center"
            onCheckedChange={(checked) => onSelectionChange(checked === true)}
          />
          <Link
            data-customer-demand-summary
            to="/buyer-requirements/$id"
            params={{ id: intent.requirementId }}
            aria-label={`${conditionLabel}, 희망지역 ${regionLabel}${siteAriaLabel ? `, 희망단지 ${siteAriaLabel}` : ""}${memo ? `, 요청 ${memo}` : ""}, 구함 조건 상세`}
            className="group contents outline-none"
          >
            <span
              data-customer-demand-primary
              className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1"
            >
              <StatusBadge
                kind="transactionType"
                status={intent.transactionType}
                size="sm"
                className="max-w-full rounded-[4px] py-0.5 text-[12px] leading-5"
              />
              {terms.map((term) => (
                <span
                  key={term.label}
                  data-customer-demand-term={term.label}
                  className="inline-flex items-baseline gap-1 whitespace-nowrap"
                >
                  <span className="text-[11.5px] font-medium text-muted-foreground-strong">
                    {term.label}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] text-foreground tabular-nums group-hover:underline group-hover:decoration-border group-hover:underline-offset-2",
                      term.label === "면적" ? "font-medium" : "font-semibold",
                    )}
                  >
                    {term.value}
                  </span>
                </span>
              ))}
              {showUrgency && (
                <StatusBadge
                  kind="buyerUrgency"
                  status={intent.urgency}
                  size="sm"
                  className="text-[11.5px]"
                />
              )}
            </span>
          </Link>

          <span
            data-customer-demand-secondary
            className="col-span-4 row-start-2 grid min-w-0 border-t border-border/90 bg-muted/30 text-[11.5px] leading-5"
          >
            <span
              data-customer-demand-location-row
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5"
            >
              <span
                data-customer-demand-location
                className="flex min-w-0 max-w-full items-center gap-1.5"
              >
                <span className="shrink-0 font-medium text-muted-foreground-strong">
                  희망지역
                </span>
                <span
                  title={regionLabel}
                  className="min-w-0 max-w-64 truncate font-medium text-foreground/75"
                >
                  {regionLabel}
                </span>
              </span>

              <span className="shrink-0 text-border" aria-hidden="true">
                ·
              </span>
              <span
                data-customer-demand-sites
                className="flex min-w-0 max-w-full flex-wrap items-center gap-1"
              >
                <span className="mr-0.5 shrink-0 font-medium text-muted-foreground-strong">
                  희망단지
                </span>
                {intent.preferredSites.length > 0 ? (
                  <>
                    {intent.preferredSites.map((site) => (
                      <Badge
                        key={site.id}
                        data-customer-demand-site={site.id}
                        variant="secondary"
                        title={site.name}
                        className="h-5 max-w-44 rounded-md px-1.5 text-[10.5px] font-medium text-foreground/75"
                      >
                        <span className="truncate">{site.name}</span>
                      </Badge>
                    ))}
                  </>
                ) : (
                  <span className="text-muted-foreground/70">미정</span>
                )}
              </span>
            </span>

            <span data-customer-demand-request>
              <EditableIntentMemo
                target={{ kind: "demand", id: intent.requirementId }}
                label="요청"
                value={memo}
                ariaLabel={`${conditionLabel} 요청 메모`}
                showLabel={false}
                className="w-full border-t border-border/70 px-3 py-1.5"
              />
            </span>
          </span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "customers-next-intent-match-toggle col-start-3 row-start-1 h-auto self-stretch shrink-0 gap-1.5 rounded-none border-l border-border/90 bg-neutral-soft/70 px-3 text-xs font-medium text-foreground/75 shadow-none hover:bg-accent hover:text-foreground",
              matchExpanded &&
                "bg-info-soft text-info-strong hover:bg-info-soft/80 hover:text-info-strong",
            )}
            aria-label={`${conditionLabel} 연결 매물 ${intent.matchCount}건 ${matchExpanded ? "접기" : "펼치기"}`}
            aria-expanded={matchExpanded}
            aria-controls={matchExpanded ? panelId : undefined}
            onClick={onToggleMatch}
          >
            <GitBranch className="size-3.5" aria-hidden="true" />
            <span className="customers-next-intent-match-label">매칭</span>
            <strong className="font-semibold tabular-nums">
              {intent.matchCount}
            </strong>
            {matchExpanded ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            )}
          </Button>
          <div
            data-customer-demand-actions
            className="col-start-4 row-start-1 flex min-h-10 border-l border-border/90 bg-background"
          >
            <CustomerDemandIntentActionMenu
              requirementId={intent.requirementId}
              conditionLabel={conditionLabel}
              onDeleted={() => onSelectionChange(false)}
            />
          </div>
        </div>
      </article>

      {matchExpanded && (
        <div
          data-customer-demand-match-panel
          className="customers-next-demand-match-panel relative z-[4]"
        >
          <LedgerMatchPanel
            panelId={panelId}
            label={`${conditionLabel} 조건의 매칭`}
            initialCount={intent.matchCount}
            source={{
              kind: "demand",
              requirementId: intent.requirementId,
            }}
          />
        </div>
      )}
    </div>
  );
}

function ListingIntakeGroup({
  customerName,
  group,
  ordinal,
  isLast,
  expandedMatchKey,
  onToggleMatch,
  selectedItemKeys,
  onSelectionChange,
}: {
  customerName: string;
  group: CustomerListingGroup;
  ordinal: number;
  isLast: boolean;
  expandedMatchKey: string | null;
  onToggleMatch: (key: string) => void;
  selectedItemKeys: ReadonlySet<string>;
  onSelectionChange: (keys: readonly string[], selected: boolean) => void;
}) {
  const first = group.lines[0];
  if (!first) return null;

  const memo = first.intakeMemo || null;
  const listingIds = group.lines.map((line) => line.listingId);
  const matchCount = group.lines.reduce(
    (total, line) => total + line.matchCount,
    0,
  );
  const matchKey = `listing:${group.intakeId}`;
  const matchExpanded = expandedMatchKey === matchKey;
  const panelId = getMatchPanelId(matchKey);
  return (
    <div
      data-customer-listing-intake={group.intakeId}
      data-customer-intake-branch
      data-customer-intent-branch
      role="listitem"
      className="customers-next-intent-branch relative"
    >
      <CustomerIntentBranchConnector isLast={isLast} />
      <article
        data-customer-intake-summary
        className={cn(
          "group/customer-intake customers-next-intent-branch-row relative flex min-w-0 items-start gap-3 py-3 pr-3 transition-colors duration-150",
          matchExpanded && "bg-muted/50",
        )}
      >
        <span
          data-customer-intake-child-stem
          aria-hidden="true"
          className="customers-next-listing-intake-child-stem customers-next-intake-child-stem pointer-events-none absolute bottom-0 z-[1] w-px bg-border"
        />
        <span
          data-customer-intake-marker
          className="relative z-[2] -ml-2.5 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
        >
          <Building2 className="size-3.5" aria-hidden="true" />
        </span>
        <div className="relative z-[2] min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              data-customer-listing-property
              to="/properties/$id"
              params={{ id: first.propertyId }}
              className="min-w-0 truncate rounded-sm text-[13px] font-semibold outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
            >
              {first.contextLabel}
            </Link>
            <span className="shrink-0 text-[11.5px] font-medium text-success">
              내놓음 의뢰 {ordinal}
            </span>
            <StatusBadge
              kind="intakeLifecycle"
              status={first.lifecycleStatus}
              size="sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "customers-next-intent-match-toggle h-7 shrink-0 gap-1.5 rounded-md bg-neutral-soft px-2.5 text-xs font-medium text-foreground/75 shadow-none hover:bg-accent hover:text-foreground",
                matchExpanded &&
                  "bg-info-soft text-info-strong hover:bg-info-soft/80 hover:text-info-strong",
              )}
              aria-label={`${first.contextLabel} 내놓음 의뢰 연결 구매고객 ${matchCount}건 ${matchExpanded ? "접기" : "펼치기"}`}
              aria-expanded={matchExpanded}
              aria-controls={matchExpanded ? panelId : undefined}
              onClick={() => onToggleMatch(matchKey)}
            >
              <GitBranch className="size-3.5" aria-hidden="true" />
              <span className="customers-next-intent-match-label">매칭</span>
              <strong className="font-semibold tabular-nums">
                {matchCount}
              </strong>
              {matchExpanded ? (
                <ChevronDown className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            <time
              dateTime={first.receivedAt}
              className="customers-next-intake-date ml-auto shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
            >
              접수 {formatDateShortYear(first.receivedAt)}
            </time>
          </div>

          <div data-customer-listing-intake-memo className="mt-1.5">
            <EditableIntentMemo
              target={{
                kind: "listing",
                id: group.intakeId,
                expectedUpdatedAt: first.intakeUpdatedAt,
              }}
              label="의뢰 메모"
              value={memo}
              ariaLabel={`${first.contextLabel} 내놓음 의뢰 메모`}
              showLabel={false}
              className="w-full px-1 py-0.5 text-[11px] leading-5"
            />
          </div>
        </div>
      </article>

      <div
        data-customer-intake-children
        className="customers-next-listing-intake-children customers-next-intake-children customers-next-intent-branch-list relative"
      >
        <span
          data-customer-intake-child-trunk
          aria-hidden="true"
          className="customers-next-intent-branch-trunk pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-border"
        />
        <div
          role="list"
          aria-label={`${customerName} 내놓음 의뢰 ${ordinal} 거래 목록`}
          className="space-y-0.5"
        >
          {group.lines.map((line, index) => {
            return (
              <ListingOptionRow
                key={line.listingId}
                line={line}
                ordinal={index + 1}
                isLast={index === group.lines.length - 1}
                selected={selectedItemKeys.has(
                  getListingSelectionKey(line.listingId),
                )}
                onSelectionChange={(selected) =>
                  onSelectionChange(
                    [getListingSelectionKey(line.listingId)],
                    selected,
                  )
                }
              />
            );
          })}
        </div>
      </div>

      {matchExpanded && (
        <div data-customer-listing-match-panel className="relative z-[4]">
          <LedgerMatchPanel
            panelId={panelId}
            label={`${first.contextLabel} 내놓음 의뢰의 매칭`}
            initialCount={matchCount}
            source={{
              kind: "listing",
              intakeId: group.intakeId,
              listingIds,
            }}
          />
        </div>
      )}
    </div>
  );
}

function ListingOptionRow({
  line,
  ordinal,
  isLast,
  selected,
  onSelectionChange,
}: {
  line: BrokerageCaseListingIntent;
  ordinal: number;
  isLast: boolean;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) {
  const terms = getListingTerms(line);
  const details = getListingDetailTerms(line);
  const conditionLabel = formatListingConditionLabel(line, terms);
  const detailLabel = details
    .map((detail) => `${detail.label} ${detail.value}`)
    .join(", ");

  return (
    <div
      data-customer-listing-option={line.listingId}
      data-customer-intent-branch
      role="listitem"
      className="customers-next-intent-branch relative"
    >
      <CustomerIntentBranchConnector isLast={isLast} />
      <article
        data-customer-listing-row
        data-selected={selected || undefined}
        aria-label={`${ordinal}번 거래안, ${conditionLabel}${detailLabel ? `, ${detailLabel}` : ""}`}
        className="group/customer-condition customers-next-intent-branch-row min-w-0 py-2.5 pr-3"
      >
        <div
          data-customer-listing-cells
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] overflow-hidden rounded-md border border-border/90 bg-background transition-[border-color,background-color,box-shadow] duration-150 group-hover/customer-condition:border-muted-foreground/35 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
        >
          <HierarchySelectionCheckbox
            checked={selected}
            aria-label={`${conditionLabel} 거래안 선택`}
            className="col-start-1 row-start-1 ml-3 self-center"
            onCheckedChange={(checked) => onSelectionChange(checked === true)}
          />
          <div
            data-customer-listing-primary
            className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <StatusBadge
              kind="transactionType"
              status={line.transactionType}
              size="sm"
              className="text-[11.5px]"
            />
            {terms.map((term) => (
              <span
                key={term.label}
                data-customer-listing-term={term.label}
                className="inline-flex items-baseline gap-1 whitespace-nowrap"
              >
                <span className="text-[11.5px] font-medium text-muted-foreground-strong">
                  {term.label}
                </span>
                <span
                  className={cn(
                    "text-[13px] text-foreground tabular-nums",
                    term.label === "면적" ? "font-medium" : "font-semibold",
                  )}
                >
                  {term.value}
                </span>
              </span>
            ))}
            {line.isPaused && (
              <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warning">
                보류
              </span>
            )}
          </div>

          {details.length > 0 && (
            <div
              data-customer-listing-details
              className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/90 bg-muted/30 px-3 py-1.5 text-[11.5px] leading-5"
            >
              {details.map((detail) => (
                <span
                  key={detail.label}
                  data-customer-listing-detail={detail.label}
                  className="inline-flex items-baseline gap-1 whitespace-nowrap"
                >
                  <span className="font-medium text-muted-foreground-strong">
                    {detail.label}
                  </span>
                  <span className="font-medium text-foreground/75 tabular-nums">
                    {detail.value}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function CustomerIntentBranchConnector({
  isLast,
  compact = false,
}: {
  isLast: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {isLast && (
        <span
          data-customer-intent-branch-end
          aria-hidden="true"
          className="customers-next-intent-branch-end pointer-events-none absolute bottom-0 top-0 z-[2] w-0.5 bg-background"
        />
      )}
      <svg
        data-customer-intent-branch-connector
        aria-hidden="true"
        viewBox={compact ? "0 0 40 32" : "0 0 40 52"}
        preserveAspectRatio="none"
        className={cn(
          "customers-next-intent-branch-connector pointer-events-none absolute top-0 z-[3] overflow-visible text-border",
          compact ? "h-8" : "h-[52px]",
        )}
      >
        <path
          d={compact ? "M0 0C0 9 12 16 28 16" : "M0 0C0 15 12 26 28 26"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}

function getMatchPanelId(matchKey: string) {
  return `customers-next-match-${matchKey.replace(":", "-")}`;
}

function formatMoneyRange(
  minimum: number | null,
  maximum: number | null,
): string {
  if (minimum == null && maximum == null) return "—";
  if (minimum != null && maximum != null && minimum === maximum) {
    return formatMoney(minimum);
  }
  if (minimum == null) return `${formatMoney(maximum)} 이하`;
  if (maximum == null) return `${formatMoney(minimum)} 이상`;
  return `${formatMoney(minimum)}–${formatMoney(maximum)}`;
}

interface DemandTerm {
  label: string;
  value: string;
}

function displayDemandRange(value: string): string {
  return value === "—" ? "미정" : value;
}

function getDemandTerms(intent: BrokerageCaseDemandIntent): DemandTerm[] {
  const area = displayDemandRange(
    formatAreaRange(intent.areaMin, intent.areaMax),
  );

  if (intent.transactionType === "monthly") {
    return [
      {
        label: "보증금",
        value: displayDemandRange(
          formatMoneyRange(intent.depositMin, intent.depositMax),
        ),
      },
      {
        label: "월세",
        value: displayDemandRange(
          formatMoneyRange(intent.monthlyRentMin, intent.monthlyRentMax),
        ),
      },
      { label: "면적", value: area },
    ];
  }

  const minimum =
    intent.budgetMin ??
    intent.priceMin ??
    (intent.transactionType === "jeonse" ? intent.depositMin : null);
  const maximum =
    intent.budgetMax ??
    intent.priceMax ??
    (intent.transactionType === "jeonse" ? intent.depositMax : null);
  const label = intent.transactionType === "jeonse" ? "보증금" : "예산";
  return [
    {
      label,
      value: displayDemandRange(formatMoneyRange(minimum, maximum)),
    },
    { label: "면적", value: area },
  ];
}

function formatDemandConditionLabel(
  intent: BrokerageCaseDemandIntent,
  terms = getDemandTerms(intent),
): string {
  const transactionLabel = getStatusMeta(
    "transactionType",
    intent.transactionType,
  ).label;
  return [
    transactionLabel,
    ...terms.map((term) => `${term.label} ${term.value}`),
  ].join(" · ");
}

function formatAreaRange(
  minimum: number | null,
  maximum: number | null,
): string {
  if (minimum == null && maximum == null) return "—";
  if (minimum != null && maximum != null && minimum === maximum) {
    return formatPyeong(minimum);
  }
  if (minimum == null) return `${formatPyeong(maximum)} 이하`;
  if (maximum == null) return `${formatPyeong(minimum)} 이상`;
  return `${formatPyeong(minimum)}–${formatPyeong(maximum)}`;
}

interface ListingTerm {
  label: string;
  value: string;
}

interface ListingDetailTerm {
  label: string;
  value: string;
}

function displayListingValue(value: string): string {
  return value === "—" ? "미정" : value;
}

function getListingTerms(intent: BrokerageCaseListingIntent): ListingTerm[] {
  const area = displayListingValue(formatPyeong(intent.area));

  if (intent.transactionType === "monthly") {
    return [
      {
        label: "보증금",
        value: displayListingValue(formatMoney(intent.deposit)),
      },
      {
        label: "월세",
        value: displayListingValue(formatMoney(intent.monthlyRent)),
      },
      { label: "면적", value: area },
    ];
  }

  return [
    {
      label: intent.transactionType === "jeonse" ? "보증금" : "가격",
      value: displayListingValue(
        formatMoney(intent.price ?? intent.askingPrice),
      ),
    },
    { label: "면적", value: area },
  ];
}

function getListingDetailTerms(
  intent: BrokerageCaseListingIntent,
): ListingDetailTerm[] {
  const details: ListingDetailTerm[] = [];

  const moveIn = formatListingMoveIn(intent);
  if (moveIn) details.push({ label: "입주", value: moveIn });

  return details;
}

function formatListingMoveIn(
  intent: Pick<
    BrokerageCaseListingIntent,
    "moveInAvailableType" | "moveInAvailableFrom" | "moveInAvailableTo"
  >,
): string | null {
  const type = intent.moveInAvailableType;
  const from = intent.moveInAvailableFrom;
  const to = intent.moveInAvailableTo;

  if (!type) return null;
  if (type === "immediate") return "즉시";
  if (type === "negotiable") return "협의";
  if (type === "date") {
    return from ? `${formatDateShortYear(from)} 이후` : "날짜 확인";
  }
  if (type === "range") {
    if (from && to) {
      return `${formatDateShortYear(from)}–${formatDateShortYear(to)}`;
    }
    if (from) return `${formatDateShortYear(from)} 이후`;
    if (to) return `${formatDateShortYear(to)} 이전`;
    return "협의";
  }
  return "확인 필요";
}

function formatListingConditionLabel(
  intent: BrokerageCaseListingIntent,
  terms = getListingTerms(intent),
): string {
  const transactionLabel = getStatusMeta(
    "transactionType",
    intent.transactionType,
  ).label;
  return [
    transactionLabel,
    ...terms.map((term) => `${term.label} ${term.value}`),
  ].join(" · ");
}

function CustomerCaseSkeletons() {
  return (
    <div className="space-y-2" aria-label="고객 케이스 불러오는 중">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton
          key={index}
          className="customers-next-case-skeleton w-full rounded-lg"
        />
      ))}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-destructive/25 bg-background px-6 text-center"
    >
      <CircleAlert className="size-7 text-destructive/70" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">
        고객 케이스를 불러오지 못했습니다.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={onRetry}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyView({
  active,
  onReset,
}: {
  active: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-6 text-center">
      <UserRound
        className="size-8 text-muted-foreground/45"
        aria-hidden="true"
      />
      <p className="mt-3 text-sm font-medium">
        {active
          ? "검색과 조건에 맞는 고객 케이스가 없습니다."
          : "진행 중인 고객 케이스가 없습니다."}
      </p>
      {active && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          검색·필터 초기화
        </Button>
      )}
    </div>
  );
}
