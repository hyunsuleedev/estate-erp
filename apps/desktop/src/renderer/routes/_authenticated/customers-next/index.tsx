import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseLedgerMode,
  BrokerageCaseLedgerSortField,
  BrokerageCaseListingIntent,
} from "@estate-erp/api-client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "../customers/-customer-ledger-pagination";
import { LedgerMatchPanel } from "../matches/-ledger-match-panel";
import {
  getCustomerListingOptionMemo,
  groupCustomerDemandIntents,
  groupCustomerListingIntents,
  summarizeCustomerCase,
  toggleCustomerCaseCollapsed,
  type CustomerDemandGroup,
  type CustomerListingGroup,
} from "./-customers-next-model";
import "./-customers-next.css";

export const Route = createFileRoute("/_authenticated/customers-next/")({
  component: CustomersNextPage,
});

type SortOrder = "asc" | "desc";

interface CustomerNextSortOption {
  id: string;
  label: string;
  field: BrokerageCaseLedgerSortField;
  order: SortOrder;
}

const PAGE_SIZE = 20;
const CUSTOMER_CASE_ESTIMATED_HEIGHT = 240;
const CUSTOMER_CASE_GAP = 8;
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
  value: BrokerageCaseLedgerMode;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "both", label: "양쪽" },
  { value: "listing", label: "내놓음" },
];

const SORT_OPTIONS: CustomerNextSortOption[] = [
  {
    id: "createdAt-desc",
    label: "최근 등록순",
    field: "createdAt",
    order: "desc",
  },
  {
    id: "createdAt-asc",
    label: "오래된 등록순",
    field: "createdAt",
    order: "asc",
  },
  {
    id: "customer-asc",
    label: "고객명 가나다순",
    field: "customer",
    order: "asc",
  },
  {
    id: "intentCount-desc",
    label: "거래 정보 많은순",
    field: "intentCount",
    order: "desc",
  },
  {
    id: "matchCount-desc",
    label: "매칭 많은순",
    field: "matchCount",
    order: "desc",
  },
];

function CustomersNextPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [mode, setMode] = useState<BrokerageCaseLedgerMode>("all");
  const [sortId, setSortId] = useState(SORT_OPTIONS[0].id);
  const [collapsedCaseIds, setCollapsedCaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const selectedSort =
    SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0];
  const filters = useMemo(
    () => ({
      search: deferredSearch.trim() || undefined,
      mode,
      sortBy: selectedSort.field,
      sortOrder: selectedSort.order,
      limit: PAGE_SIZE,
    }),
    [deferredSearch, mode, selectedSort.field, selectedSort.order],
  );

  const ledgerQuery = useInfiniteQuery({
    queryKey: ["brokerage-cases", "ledger", "customers-next", filters],
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
  }, [collapsedCaseIds, expandedMatchKey, measureRenderedCustomerCases]);
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
        caseIds.set(`listing:${intent.listingId}`, brokerageCase.id);
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
  const hasActiveControls =
    search.trim().length > 0 || mode !== "all" || sortId !== SORT_OPTIONS[0].id;
  const modeCount = (value: BrokerageCaseLedgerMode) => {
    if (value === "all") return summary.cases;
    return summary[value];
  };

  const resetControls = () => {
    setSearch("");
    setMode("all");
    setSortId(SORT_OPTIONS[0].id);
  };

  const toggleCase = useCallback((caseId: string) => {
    setCollapsedCaseIds((current) =>
      toggleCustomerCaseCollapsed(current, caseId),
    );
    setExpandedMatchKey(null);
  }, []);
  const toggleMatch = useCallback((key: string) => {
    setExpandedMatchKey((current) => (current === key ? null : key));
  }, []);

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
    <div
      data-customers-next-page
      className="customers-next-page -m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <h1 className="sr-only">고객 원장 새 보기</h1>

      <section
        aria-label="전체 기준 고객 케이스 요약"
        className="flex shrink-0 flex-wrap items-center gap-y-2 border-b border-border bg-background px-4 py-2.5"
      >
        <div className="mr-4 flex items-center gap-2 border-r border-border/70 pr-4">
          <span className="text-[13px] font-semibold">고객 원장</span>
          <span className="rounded-md bg-violet-soft px-1.5 py-0.5 text-[10px] font-semibold text-violet">
            새 보기
          </span>
          <span className="text-[10px] text-muted-foreground">전체 기준</span>
        </div>
        <SummaryItem label="활성 케이스" value={summary.cases} />
        <SummaryItem label="구함 포함" value={summary.demand} tone="demand" />
        <SummaryItem
          label="내놓음 포함"
          value={summary.listing}
          tone="listing"
        />
        <SummaryItem label="양쪽" value={summary.both} tone="both" />

        <Button
          asChild
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1.5 bg-background text-xs shadow-none"
        >
          <Link to="/customers">표 원장 보기</Link>
        </Button>
      </section>

      <section
        aria-label="고객 케이스 검색과 정렬"
        className="shrink-0 border-b border-border bg-muted/30 px-3 py-2"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] max-w-80 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="고객, 전화번호, 지역, 매물 검색 (⌘F)"
              aria-label="새 고객 원장 검색"
              className="h-8 bg-background pl-8 pr-8 text-xs shadow-none"
            />
            {search && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as BrokerageCaseLedgerMode)}
            className="min-w-0 gap-0"
          >
            <TabsList
              className="border border-border/80 bg-background p-0.5"
              aria-label="고객 케이스 유형 필터"
            >
              {MODE_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="gap-1.5 border-0 px-2.5 text-[11px] shadow-none"
                >
                  {option.label}
                  <span className="text-[10px] tabular-nums opacity-60">
                    {modeCount(option.value)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-[132px] justify-between gap-2 bg-background px-2.5 text-[11px] shadow-none"
                aria-label={`정렬: ${selectedSort.label}`}
              >
                <span className="flex items-center gap-1.5">
                  <ArrowUpDown className="size-3.5" aria-hidden="true" />
                  {selectedSort.label}
                </span>
                {selectedSort.order === "desc" ? (
                  <ArrowDown className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowUp className="size-3" aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[11px]">
                고객 케이스 정렬
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={sortId} onValueChange={setSortId}>
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.id}
                    value={option.id}
                    className="text-xs"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasActiveControls && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={resetControls}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              초기화
            </Button>
          )}

          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {totalCases.toLocaleString()}개 케이스
          </span>
        </div>
      </section>

      <main
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/20"
        aria-busy={ledgerQuery.isLoading || ledgerQuery.isFetchingNextPage}
      >
        {cases.length > 0 && (
          <div className="flex h-9 shrink-0 items-center border-b border-border/70 bg-background/95 px-3 text-[11px] text-muted-foreground">
            <span>
              고객별 구함과 내놓음을 펼친 상태로 확인하고, 필요하면 개별 고객을
              접을 수 있습니다.
            </span>
            <span className="ml-auto tabular-nums">
              {cases.length.toLocaleString()} / {totalCases.toLocaleString()}개
            </span>
          </div>
        )}

        <div
          ref={listScrollRef}
          data-customer-case-scroll-region
          className="min-h-0 min-w-0 flex-1 overflow-auto p-3"
          aria-label="고객 케이스 목록"
        >
          {ledgerQuery.isLoading ? (
            <CustomerCaseSkeletons />
          ) : ledgerQuery.isError && !firstPage ? (
            <LoadError onRetry={() => void ledgerQuery.refetch()} />
          ) : cases.length === 0 ? (
            <EmptyView active={hasActiveControls} onReset={resetControls} />
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
                        expandedMatchKey={
                          activeMatchCaseId === brokerageCase.id
                            ? expandedMatchKey
                            : null
                        }
                        onToggle={toggleCase}
                        onToggleMatch={toggleMatch}
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
          {cases.length.toLocaleString()} / {totalCases.toLocaleString()}개 표시
        </span>
        <span role="status" aria-live="polite" className="ml-auto">
          {statusMessage}
        </span>
      </footer>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "demand" | "listing" | "both";
}) {
  return (
    <div className="flex items-baseline gap-2 border-r border-border/70 px-4 first:pl-0 last:border-r-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "demand" && "text-info-strong",
          tone === "listing" && "text-success",
          tone === "both" && "text-violet",
        )}
      >
        {value.toLocaleString()}
      </strong>
    </div>
  );
}

const CustomerCaseGroup = memo(function CustomerCaseGroup({
  brokerageCase,
  expanded,
  expandedMatchKey,
  onToggle,
  onToggleMatch,
}: {
  brokerageCase: BrokerageCase;
  expanded: boolean;
  expandedMatchKey: string | null;
  onToggle: (caseId: string) => void;
  onToggleMatch: (key: string) => void;
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

  return (
    <section
      data-customer-case-group
      aria-label={`${customerName} 고객 케이스`}
      className="overflow-hidden rounded-lg border border-border bg-background shadow-xs"
    >
      <header
        className={cn(
          "flex min-w-0 items-center gap-2 bg-muted/30 px-3 py-2.5",
          expanded && "border-b border-border/70",
        )}
      >
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
          <div className="customers-next-case-identity flex min-w-0 items-center gap-1.5">
            {participant ? (
              <Link
                to="/contacts/$id"
                params={{ id: participant.contactId }}
                className="min-w-0 truncate text-[13px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {customerName}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-[13px] font-semibold">
                {customerName}
              </span>
            )}
            {participantExtra > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                외 {participantExtra}명
              </span>
            )}
            <span className="shrink-0 text-border" aria-hidden="true">
              ·
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatPhone(participant?.contact.phone)}
            </span>
            <span
              className="customers-next-case-date shrink-0 text-border"
              aria-hidden="true"
            >
              ·
            </span>
            <time
              dateTime={brokerageCase.createdAt}
              className="customers-next-case-date shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
            >
              등록 {formatDateShortYear(brokerageCase.createdAt)}
            </time>
          </div>

          <div className="customers-next-case-overview min-w-0">
            {latestConsultation ? (
              <Link
                data-customer-consultation-summary
                to="/consultations"
                search={{ consultationId: latestConsultation.id }}
                aria-label={`${customerName} 최근 ${latestConsultationTypeLabel} 상담: ${latestConsultationContent || "내용 없음"}, ${formatDateTime(latestConsultation.createdAt)}. 상세 보기`}
                className="group -mx-2 grid min-w-0 grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
                <span className="customers-next-consultation-meta flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span className="rounded-md bg-neutral-soft px-1.5 py-px font-medium text-foreground/70">
                    {latestConsultationTypeLabel}
                  </span>
                  <time
                    dateTime={latestConsultation.createdAt}
                    className="tabular-nums"
                  >
                    {formatDateTime(latestConsultation.createdAt)}
                  </time>
                  <span className="sr-only">상담 상세 보기</span>
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
                  className="space-y-0.5"
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
                        isLast={
                          index === demandGroups.length - 1 &&
                          listingGroups.length === 0
                        }
                        expandedMatchKey={expandedMatchKey}
                        onToggleMatch={onToggleMatch}
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
  isLast,
  expandedMatchKey,
  onToggleMatch,
}: {
  customerName: string;
  group: CustomerDemandGroup;
  ordinal: number;
  isLast: boolean;
  expandedMatchKey: string | null;
  onToggleMatch: (key: string) => void;
}) {
  const first = group.lines[0];
  if (!first) return null;

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
        className="customers-next-intent-branch-row relative flex min-w-0 items-start gap-3 py-3 pr-3"
      >
        <span
          data-customer-intake-child-stem
          aria-hidden="true"
          className="customers-next-intake-child-stem pointer-events-none absolute bottom-0 z-[1] w-px bg-border"
        />
        <span
          data-customer-intake-marker
          className="relative z-[2] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-info-soft text-info-strong"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
        </span>
        <div className="relative z-[2] flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-info-strong">
            구함 의뢰 {ordinal}
          </span>
          <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info-strong tabular-nums">
            조건 {group.lines.length}
          </span>
          <StatusBadge
            kind="intakeLifecycle"
            status={first.lifecycleStatus}
            size="sm"
          />
          <time
            dateTime={first.receivedAt}
            className="customers-next-intake-date ml-auto shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
          >
            접수 {formatDateShortYear(first.receivedAt)}
          </time>
        </div>
      </article>

      <div
        data-customer-intake-children
        className="customers-next-intake-children customers-next-intent-branch-list relative"
      >
        <span
          data-customer-intake-child-trunk
          aria-hidden="true"
          className="customers-next-intent-branch-trunk pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-border"
        />
        <div
          role="list"
          aria-label={`${customerName} 구함 의뢰 ${ordinal} 조건 목록`}
          className="space-y-0.5"
        >
          {group.lines.map((intent, index) => {
            const matchKey = `demand:${intent.requirementId}`;
            return (
              <DemandIntentRow
                key={intent.requirementId}
                intent={intent}
                isLast={index === group.lines.length - 1}
                matchKey={matchKey}
                matchExpanded={expandedMatchKey === matchKey}
                onToggleMatch={() => onToggleMatch(matchKey)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DemandIntentRow({
  intent,
  isLast,
  matchKey,
  matchExpanded,
  onToggleMatch,
}: {
  intent: BrokerageCaseDemandIntent;
  isLast: boolean;
  matchKey: string;
  matchExpanded: boolean;
  onToggleMatch: () => void;
}) {
  const panelId = getMatchPanelId(matchKey);
  const terms = getDemandTerms(intent);
  const conditionLabel = formatDemandConditionLabel(intent, terms);
  const locationLabel = intent.contextLabel || "지역 미정";
  const memo = intent.memo?.replace(/\s+/g, " ").trim() || null;
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
      <CustomerIntentBranchConnector isLast={isLast} />
      <article
        data-customer-demand-row
        className={cn(
          "customers-next-intent-branch-row grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md py-2.5 pr-3 transition-colors duration-150 hover:bg-muted/40 focus-within:bg-muted/40",
          matchExpanded && "bg-muted/50",
        )}
      >
        <span
          data-customer-intent-marker
          className="mt-0.5 inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md bg-neutral-soft px-2 text-[11px] font-semibold text-neutral-strong tabular-nums whitespace-nowrap"
        >
          {intent.priorityRank}순위
        </span>

        <Link
          data-customer-demand-summary
          to="/buyer-requirements/$id"
          params={{ id: intent.requirementId }}
          aria-label={`${conditionLabel}, 희망지역 ${locationLabel}${memo ? `, 요청 ${memo}` : ""}, 구함 조건 상세`}
          className="group min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
        >
          <span
            data-customer-demand-primary
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
          >
            <StatusBadge
              kind="transactionType"
              status={intent.transactionType}
              size="sm"
              className="text-[11.5px]"
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

          <span
            data-customer-demand-secondary
            className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[11.5px] leading-5"
          >
            <span
              data-customer-demand-location
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                memo ? "max-w-[42%]" : "flex-1",
              )}
            >
              <span className="shrink-0 font-medium text-muted-foreground-strong">
                희망지역
              </span>
              <span
                title={locationLabel}
                className="truncate font-medium text-foreground/75"
              >
                {locationLabel}
              </span>
            </span>

            {memo && (
              <>
                <span className="shrink-0 text-border" aria-hidden="true">
                  ·
                </span>
                <span
                  data-customer-demand-request
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                >
                  <span className="shrink-0 font-medium text-muted-foreground-strong">
                    요청
                  </span>
                  <span
                    title={memo}
                    className="truncate text-muted-foreground-strong"
                  >
                    {memo}
                  </span>
                </span>
              </>
            )}
          </span>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "customers-next-intent-match-toggle h-8 shrink-0 gap-1.5 rounded-md bg-neutral-soft px-2.5 text-xs font-medium text-foreground/75 shadow-none hover:bg-accent hover:text-foreground",
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
}: {
  customerName: string;
  group: CustomerListingGroup;
  ordinal: number;
  isLast: boolean;
  expandedMatchKey: string | null;
  onToggleMatch: (key: string) => void;
}) {
  const first = group.lines[0];
  if (!first) return null;

  const memo = first.intakeMemo?.replace(/\s+/g, " ").trim() || null;

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
        className="customers-next-intent-branch-row relative flex min-w-0 items-start gap-3 py-3 pr-3"
      >
        <span
          data-customer-intake-child-stem
          aria-hidden="true"
          className="customers-next-intake-child-stem pointer-events-none absolute bottom-0 z-[1] w-px bg-border"
        />
        <span
          data-customer-intake-marker
          className="relative z-[2] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-success-soft text-success"
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
            <span className="rounded-md bg-neutral-soft px-1.5 py-0.5 text-[10px] font-semibold text-neutral-strong tabular-nums">
              거래안 {group.lines.length}
            </span>
            <StatusBadge
              kind="intakeLifecycle"
              status={first.lifecycleStatus}
              size="sm"
            />
            <time
              dateTime={first.receivedAt}
              className="customers-next-intake-date ml-auto shrink-0 text-[10.5px] text-muted-foreground tabular-nums"
            >
              접수 {formatDateShortYear(first.receivedAt)}
            </time>
          </div>

          {memo && (
            <p
              data-customer-listing-intake-memo
              className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] leading-5"
            >
              <span className="shrink-0 font-medium text-muted-foreground-strong">
                의뢰 메모
              </span>
              <span title={memo} className="truncate text-muted-foreground">
                {memo}
              </span>
            </p>
          )}
        </div>
      </article>

      <div
        data-customer-intake-children
        className="customers-next-intake-children customers-next-intent-branch-list relative"
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
            const matchKey = `listing:${line.listingId}`;
            return (
              <ListingOptionRow
                key={line.listingId}
                line={line}
                ordinal={index + 1}
                isLast={index === group.lines.length - 1}
                matchKey={matchKey}
                matchExpanded={expandedMatchKey === matchKey}
                onToggleMatch={() => onToggleMatch(matchKey)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ListingOptionRow({
  line,
  ordinal,
  isLast,
  matchKey,
  matchExpanded,
  onToggleMatch,
}: {
  line: BrokerageCaseListingIntent;
  ordinal: number;
  isLast: boolean;
  matchKey: string;
  matchExpanded: boolean;
  onToggleMatch: () => void;
}) {
  const memo =
    getCustomerListingOptionMemo(line)?.replace(/\s+/g, " ").trim() || null;
  const panelId = getMatchPanelId(matchKey);
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
        aria-label={`${ordinal}번 거래안, ${conditionLabel}${detailLabel ? `, ${detailLabel}` : ""}${memo ? `, 메모 ${memo}` : ""}`}
        className={cn(
          "customers-next-intent-branch-row grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md py-2.5 pr-3 transition-colors duration-150 hover:bg-muted/40 focus-within:bg-muted/40",
          matchExpanded && "bg-muted/50",
        )}
      >
        <span
          data-customer-intent-marker
          className="mt-0.5 inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md bg-neutral-soft px-2 text-[11px] font-semibold text-neutral-strong tabular-nums whitespace-nowrap"
        >
          {ordinal}안
        </span>
        <div className="min-w-0 flex-1">
          <div
            data-customer-listing-primary
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
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
              className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11.5px] leading-5"
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

          {memo && (
            <p
              data-customer-listing-memo
              className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] leading-5"
            >
              <span className="shrink-0 font-medium text-muted-foreground-strong">
                메모
              </span>
              <span title={memo} className="truncate text-muted-foreground">
                {memo}
              </span>
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "customers-next-intent-match-toggle h-8 shrink-0 gap-1.5 rounded-md bg-neutral-soft px-2.5 text-xs font-medium text-foreground/75 shadow-none hover:bg-accent hover:text-foreground",
            matchExpanded &&
              "bg-info-soft text-info-strong hover:bg-info-soft/80 hover:text-info-strong",
          )}
          aria-label={`${line.contextLabel} ${conditionLabel} 연결 구매고객 ${line.matchCount}건 ${matchExpanded ? "접기" : "펼치기"}`}
          aria-expanded={matchExpanded}
          aria-controls={matchExpanded ? panelId : undefined}
          onClick={onToggleMatch}
        >
          <GitBranch className="size-3.5" aria-hidden="true" />
          <span className="customers-next-intent-match-label">매칭</span>
          <strong className="font-semibold tabular-nums">
            {line.matchCount}
          </strong>
          {matchExpanded ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </article>

      {matchExpanded && (
        <div
          data-customer-listing-match-panel
          className="customers-next-listing-match-panel relative z-[4]"
        >
          <LedgerMatchPanel
            panelId={panelId}
            label={`${line.contextLabel} ${conditionLabel} 거래안의 매칭`}
            initialCount={line.matchCount}
            source={{
              kind: "listing",
              intakeId: line.listingIntakeId,
              listingIds: [line.listingId],
            }}
          />
        </div>
      )}
    </div>
  );
}

function CustomerIntentBranchConnector({ isLast }: { isLast: boolean }) {
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
        viewBox="0 0 40 52"
        preserveAspectRatio="none"
        className="customers-next-intent-branch-connector pointer-events-none absolute top-0 z-[3] h-[52px] overflow-visible text-border"
      >
        <path
          d="M0 0C0 15 12 26 28 26"
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

  details.push({
    label: "수정",
    value: formatDateShortYear(intent.listingUpdatedAt),
  });

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
