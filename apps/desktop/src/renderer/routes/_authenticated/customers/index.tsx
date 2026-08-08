import { createFileRoute, Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
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
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseLedgerMode,
  BrokerageCaseLedgerSortField,
  BrokerageCaseSupplyIntent,
} from "@estate-erp/api-client";
import { TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  EllipsisVertical,
  GitBranch,
  MapPin,
  RotateCcw,
  Search,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
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
  ViewBar,
  type ActiveFilter,
  type FilterDefinition,
  type SortDefinition,
} from "@/components/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
  customerLedgerSortDefinitions,
} from "./-customer-list-filters";
import "./-customer-ledger.css";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersPage,
});

type IntentLine = BrokerageCaseDemandIntent | BrokerageCaseSupplyIntent;
type SortOrder = "asc" | "desc";
type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">;

const PAGE_SIZE = 20;
// intent 행 14열: 선택 / 고객 / 작업 / 구분 / 상태 / 거래유형 / 최소예산 / 최대예산
// / 최소월세 / 최대월세 / 최소평형 / 최대평형 / 매칭 / 최근 갱신
// (납품 매매가·보증금은 예산 2열을 colSpan으로 합쳐 표시 — 월세·평형과 같은 패턴)
const COLUMN_COUNT = 14;
// context 행은 sticky 선택·고객·작업 열과 최근 갱신 열을 제외한 10열을 span
const CONTEXT_COL_SPAN = 10;
const MODE_OPTIONS: Array<{
  value: CustomerLedgerMode;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "supply", label: "납품" },
];

interface SupplyGroup {
  intakeId: string;
  lines: BrokerageCaseSupplyIntent[];
}

// 케이스 1개를 렌더할 행 단위. sticky 셀 rowSpan 계산이 이 배열 길이로 결정된다.
type RowDescriptor =
  | { type: "intent"; line: BrokerageCaseDemandIntent }
  | { type: "context"; line: BrokerageCaseDemandIntent }
  | { type: "stack"; group: SupplyGroup }
  | { type: "stack-context"; group: SupplyGroup };

function groupSupplyIntents(lines: BrokerageCaseSupplyIntent[]): SupplyGroup[] {
  const groups: SupplyGroup[] = [];
  for (const line of lines) {
    const existing = groups.find((g) => g.intakeId === line.listingIntakeId);
    if (existing) existing.lines.push(line);
    else groups.push({ intakeId: line.listingIntakeId, lines: [line] });
  }
  return groups;
}

// 구함은 요건당 intent+context 2행, 납품은 ListingIntake(같은 호실) 단위로
// listing을 세로 적층한 stack+context 2행으로 렌더링한다.
function buildRowDescriptors(brokerageCase: BrokerageCase): RowDescriptor[] {
  const rows: RowDescriptor[] = [];
  for (const line of brokerageCase.demandIntents) {
    rows.push({ type: "intent", line });
    rows.push({ type: "context", line });
  }
  for (const group of groupSupplyIntents(brokerageCase.supplyIntents)) {
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
    useState<BrokerageCaseLedgerSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
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
    setPage(1);
  }, [activeFilters, deferredSearch, mode, sortBy, sortOrder]);

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

  const filters = useMemo(
    () => ({
      ...customerLedgerFiltersToApiParams(activeFilters),
      search: deferredSearch.trim() || undefined,
      mode,
      sortBy,
      sortOrder,
      page,
      limit: PAGE_SIZE,
    }),
    [activeFilters, deferredSearch, mode, page, sortBy, sortOrder],
  );

  useEffect(() => {
    setSelectedCaseIds([]);
  }, [filters]);

  const ledgerQuery = useQuery({
    queryKey: ["brokerage-cases", "ledger", filters],
    queryFn: () => api.brokerageCases.ledger(filters),
    placeholderData: keepPreviousData,
  });

  const memoMutation = useMutation({
    mutationFn: async ({ line, memo }: { line: IntentLine; memo: string }) => {
      if (line.kind === "demand") {
        await api.buyerRequirements.update(line.requirementId, { memo });
      } else {
        // 납품 노트는 ListingIntake 의뢰 메모를 묶음 전체가 공유
        await api.listingIntakes.update(line.listingIntakeId, { memo });
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["brokerage-cases"] }),
  });

  const data = ledgerQuery.data;
  const visibleCaseIds = useMemo(
    () =>
      (data?.items ?? [])
        .filter(
          (brokerageCase) => buildRowDescriptors(brokerageCase).length > 0,
        )
        .map((brokerageCase) => brokerageCase.id),
    [data?.items],
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
  const summary = data?.summary ?? { cases: 0, demand: 0, supply: 0, both: 0 };
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
    setPage(1);
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters((current) =>
      current.filter((filter) => filter.id !== filterId),
    );
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setMode("all");
    setActiveFilters([]);
    setSortBy("updatedAt");
    setSortOrder("desc");
    setPage(1);
  };

  const hasActiveControls =
    search.trim() !== "" ||
    mode !== "all" ||
    activeFilters.length > 0 ||
    sortBy !== "updatedAt" ||
    sortOrder !== "desc";

  return (
    <main className="customer-ledger-page -m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
              setPage(1);
            }}
            onSortRemove={() => {
              setSortBy("updatedAt");
              setSortOrder("desc");
              setPage(1);
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

      <section
        className="min-h-0 flex-1 overflow-auto"
        aria-busy={ledgerQuery.isFetching}
      >
        <table
          className="customer-ledger-table"
          aria-label="고객 중개 케이스 원장"
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
                  aria-label="현재 페이지 고객 케이스 전체 선택"
                  title="현재 페이지 고객 케이스 전체 선택"
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
              <LedgerHeader
                icon={<Tag />}
                label="구분"
                field="intentCount"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={changeSort}
              />
              <LedgerStaticHeader icon={<CircleDot />} label="상태" />
              <LedgerStaticHeader icon={<ArrowLeftRight />} label="거래" />
              <LedgerHeader
                label="최소예산"
                field="budgetMin"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={changeSort}
              />
              <LedgerHeader
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
                label="최대평형"
                field="areaMax"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={changeSort}
              />
              <LedgerHeader
                icon={<GitBranch />}
                label="매칭"
                field="matchCount"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={changeSort}
              />
              <LedgerHeader
                icon={<CalendarDays />}
                label="최근 갱신"
                field="updatedAt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={changeSort}
              />
            </tr>
          </thead>
          <tbody>
            {ledgerQuery.isLoading ? (
              <LoadingRows />
            ) : ledgerQuery.isError ? (
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
            ) : data?.items.length ? (
              data.items.map((brokerageCase) => (
                <CaseRows
                  key={brokerageCase.id}
                  brokerageCase={brokerageCase}
                  selected={selectedCaseIdSet.has(brokerageCase.id)}
                  onSelectionChange={(selected) =>
                    toggleCaseSelection(brokerageCase.id, selected)
                  }
                  onSaveMemo={(line, memo) =>
                    memoMutation.mutate({ line, memo })
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
      </section>

      <footer className="flex h-10 shrink-0 items-center justify-between border-t bg-background px-4 text-xs text-muted-foreground">
        <span aria-live="polite">
          총{" "}
          <strong className="font-semibold text-foreground">
            {data?.pagination.total ?? 0}
          </strong>
          개 케이스
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
          <span className="ml-2 text-[11px]">
            · 정렬은 우선순위가 가장 높은 일치 요건 기준
          </span>
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {data?.pagination.page ?? page} /{" "}
            {Math.max(1, data?.pagination.totalPages ?? 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            disabled={page <= 1 || ledgerQuery.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            disabled={
              ledgerQuery.isFetching ||
              page >= (data?.pagination.totalPages ?? 1)
            }
            onClick={() => setPage((current) => current + 1)}
            aria-label="다음 페이지"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </footer>
    </main>
  );
}

function CaseRows({
  brokerageCase,
  selected,
  onSelectionChange,
  onSaveMemo,
}: {
  brokerageCase: BrokerageCase;
  selected: boolean;
  onSelectionChange: (selected: boolean) => void;
  onSaveMemo: (line: IntentLine, memo: string) => void;
}) {
  const rows = buildRowDescriptors(brokerageCase);
  if (rows.length === 0) return null;
  const rowSpan = rows.length;
  const primary = brokerageCase.primaryParticipant;
  const customerName = primary?.contact.name ?? "이름 없음";

  const selectionCell = (
    <td rowSpan={rowSpan} className="ledger-sticky-select ledger-select-cell">
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
      className="ledger-sticky-customer ledger-customer-cell"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {primary ? (
            <Link
              to="/contacts/$id"
              params={{ id: primary.contact.id }}
              className="truncate text-[13px] font-semibold text-foreground hover:underline"
            >
              {primary.contact.name}
            </Link>
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
    <td rowSpan={rowSpan} className="ledger-sticky-action ledger-action-cell">
      <CaseActionMenu
        brokerageCase={brokerageCase}
        customerName={customerName}
      />
    </td>
  );

  // 최근 갱신 셀은 반드시 행의 마지막에 렌더링해야 컬럼이 밀리지 않는다
  const updatedCell = (
    <td rowSpan={rowSpan} className="ledger-updated-cell">
      {formatDateShortYear(brokerageCase.updatedAt)}
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
                <DemandCells line={row.line} />
                {first ? updatedCell : null}
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
                <td colSpan={CONTEXT_COL_SPAN}>
                  <IntentContext line={row.line} onSaveMemo={onSaveMemo} />
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
                <StackCells group={row.group} />
                {first ? updatedCell : null}
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
                <td colSpan={CONTEXT_COL_SPAN}>
                  <StackContext group={row.group} onSaveMemo={onSaveMemo} />
                </td>
              </tr>
            );
        }
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
  const supplyTargets = [
    ...new Map(
      brokerageCase.supplyIntents.map(
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
        {brokerageCase.demandIntents.map((line, index) => (
          <DropdownMenuItem key={line.requirementId} asChild>
            <Link
              to="/buyer-requirements/$id"
              params={{ id: line.requirementId }}
              className="min-w-0"
              title={line.contextLabel}
            >
              <Tag className="size-3.5" />
              <span className="truncate">구함 {index + 1} 상세 열기</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {supplyTargets.map((line, index) => (
          <DropdownMenuItem key={line.propertyId} asChild>
            <Link
              to="/properties/$id"
              params={{ id: line.propertyId }}
              className="min-w-0"
              title={line.contextLabel}
            >
              <Building2 className="size-3.5" />
              <span className="truncate">납품 {index + 1} 매물 열기</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DemandCells({ line }: { line: BrokerageCaseDemandIntent }) {
  return (
    <>
      <td>
        <KindLabel kind="demand" />
      </td>
      <td className="text-center">
        <LifecyclePill lifecycleStatus={line.lifecycleStatus} />
      </td>
      <td>
        <TransactionBadge transactionType={line.transactionType} />
      </td>
      <MoneyCell value={line.budgetMin} />
      <MoneyCell value={line.budgetMax} />
      <RentCell value={line.monthlyRentMin} />
      <RentCell value={line.monthlyRentMax} />
      <AreaCell value={line.areaMin} />
      <AreaCell value={line.areaMax} />
      <MatchCell count={line.matchCount} />
    </>
  );
}

// 납품 — ListingIntake(같은 호실)당 1행, listing을 셀 안에 36px 라인으로 세로 적층
function StackCells({ group }: { group: SupplyGroup }) {
  const first = group.lines[0];
  return (
    <>
      <td className="ledger-stack-merged-cell ledger-stack-merged-left">
        <KindLabel kind="supply" />
      </td>
      <td className="ledger-stack-merged-cell">
        <LifecyclePill
          lifecycleStatus={first.lifecycleStatus}
          paused={group.lines.every((line) => line.isPaused)}
        />
      </td>
      <td>
        <div className="ledger-stack">
          {group.lines.map((line) => (
            <div key={line.listingId} className="ledger-stack-line">
              <TransactionBadge transactionType={line.transactionType} />
            </div>
          ))}
        </div>
      </td>
      <td colSpan={2}>
        <div className="ledger-stack ledger-stack-right">
          {group.lines.map((line) => (
            <div
              key={line.listingId}
              className="ledger-stack-line ledger-number-cell"
            >
              {formatMoney(line.askingPrice)}
            </div>
          ))}
        </div>
      </td>
      <td colSpan={2}>
        <div className="ledger-stack ledger-stack-center">
          {group.lines.map((line) => (
            <div
              key={line.listingId}
              className="ledger-stack-line ledger-exact-cell"
            >
              {line.transactionType === "monthly" && line.monthlyRent
                ? `${line.monthlyRent.toLocaleString()}만`
                : "—"}
            </div>
          ))}
        </div>
      </td>
      <td colSpan={2} className="ledger-stack-merged-cell ledger-exact-cell">
        {formatPyeong(first.area)}
      </td>
      <td className="ledger-stack-merged-cell">
        <MatchBadge
          count={group.lines.reduce((sum, line) => sum + line.matchCount, 0)}
        />
      </td>
    </>
  );
}

// 납품 context — 매물 identity와 intake 공유 노트(묶음 전체가 같은 의뢰 메모를 공유)
function StackContext({
  group,
  onSaveMemo,
}: {
  group: SupplyGroup;
  onSaveMemo: (line: IntentLine, memo: string) => void;
}) {
  const first = group.lines[0];
  return (
    <div className="grid min-w-0 grid-cols-[92px_240px_minmax(0,1fr)] items-center gap-2 px-2.5">
      <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
        <Building2 className="size-3 text-success" aria-hidden />
        매물 데이터
      </span>
      <Link
        to="/properties/$id"
        params={{ id: first.propertyId }}
        className="truncate text-xs font-medium text-foreground hover:underline"
      >
        {first.contextLabel}
      </Link>
      <MemoCell line={first} onSaveMemo={onSaveMemo} />
    </div>
  );
}

// 구분 컬럼 — 구함/납품 pill
function KindLabel({ kind }: { kind: "demand" | "supply" }) {
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
      {isDemand ? "구함" : "납품"}
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
  // 납품 묶음이 전부 중지됐으면 매물관리의 paused 표기(보류)를 따른다
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

// 구함 context — 규격화된 3트랙: [구분 라벨 92px] [대상 링크 240px] [노트 나머지]
function IntentContext({
  line,
  onSaveMemo,
}: {
  line: BrokerageCaseDemandIntent;
  onSaveMemo: (line: IntentLine, memo: string) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[92px_240px_minmax(0,1fr)] items-center gap-2 px-2.5">
      <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
        <MapPin className="size-3 text-info" aria-hidden />
        선호지역·물건
      </span>
      <Link
        to="/buyer-requirements/$id"
        params={{ id: line.requirementId }}
        className="truncate text-xs font-medium text-foreground hover:underline"
      >
        {line.contextLabel}
      </Link>
      <MemoCell line={line} onSaveMemo={onSaveMemo} />
    </div>
  );
}

function MemoCell({
  line,
  onSaveMemo,
}: {
  line: IntentLine;
  onSaveMemo: (line: IntentLine, memo: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(line.memo ?? "");
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next !== (line.memo ?? "")) {
      onSaveMemo(line, next);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        className="h-6 w-full rounded border border-ring bg-background px-1.5 text-[11px] text-foreground outline-none"
        aria-label="노트 편집"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="클릭해서 노트 편집"
      className={cn(
        "min-w-0 truncate rounded px-1.5 text-left text-[11px] transition-colors hover:bg-muted",
        line.memo ? "text-muted-foreground" : "italic text-muted-foreground/50",
      )}
    >
      {line.memo ? line.memo.replace(/\n/g, " ") : "+ 노트"}
    </button>
  );
}

function MoneyCell({ value }: { value: number | null }) {
  return <td className="ledger-number-cell">{formatMoney(value)}</td>;
}

function RentCell({ value }: { value: number | null }) {
  return (
    <td className="ledger-number-cell">
      {value ? `${value.toLocaleString()}만` : "—"}
    </td>
  );
}

function AreaCell({ value }: { value: number | null }) {
  return <td className="ledger-number-cell">{formatPyeong(value)}</td>;
}

// 매칭 컬럼 — 매물관리(ListingPanelToggle)의 매칭 버튼과 같은 모양. 매칭 없으면 빈 셀
function MatchBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex h-6 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md border bg-background px-1.5 text-[11px] font-medium tabular-nums shadow-none">
      <GitBranch className="size-3" aria-hidden />
      {count}
    </span>
  );
}

function MatchCell({ count }: { count: number }) {
  return (
    <td className="text-center">
      <MatchBadge count={count} />
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
