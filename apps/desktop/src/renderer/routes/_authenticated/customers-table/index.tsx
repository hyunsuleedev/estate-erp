import { createFileRoute } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CustomerLedgerRow,
  CustomerLedgerMode,
} from "@estate-erp/api-client";
import {
  AlertCircle,
  Check,
  Copy,
  Flag,
  House,
  List,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ContactNameBadge, EmptyState, RowOpenButton } from "@/components/domain";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { CONSULTATION_TYPE_LABELS } from "../buyer-requirements/-buyer-utils";
import {
  ProjectListButton,
  ProjectPlanHost,
} from "../customers/-project-plan-dialog";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "../customers/-customer-ledger-pagination";
import {
  ToolbarFilterChip,
  ToolbarPillSearch,
  ToolbarPillTabs,
  ToolbarPillToggle,
  toolbarGhostButtonClassName,
} from "../properties/-components/property-toolbar";
import { useProjectChangesFromOtherTabs } from "../projects/-project-hooks";
import {
  CUSTOMER_INSPECTOR_ID,
  CustomerInspector,
  formatLedgerDate,
} from "./-customer-inspector";
import { LedgerSideTags, LedgerStatusChip } from "./-ledger-chips";
import {
  collectLedgerPhones,
  CONSULTATION_SAVE_MUTATION_KEY,
  DEFAULT_LEDGER_SORT,
  getLedgerAssignees,
  getLedgerCompanionCount,
  getLedgerCustomerName,
  getLedgerCustomerPhone,
  LEDGER_SORT_OPTIONS,
  settleSavedConsultationDraft,
  type ConsultationDraftStore,
  type ConsultationSaveRequest,
} from "./-ledger-model";

/**
 * 고객 원장 (표 보기).
 *
 * 한 줄이 한 손님이다: 고객 · 연락처 · 최근 상담 · 의뢰(구함·내놓음) · 상태 · 담당.
 * 조건과 금액 같은 자세한 내용은 줄에서 여는 옆 상세 패널에 있다. 줄 안에서 여러 값을
 * 고치던 예전 표를 걷어내고, 연락처·매물관리와 같은 도구 줄 · 표 · 상세 패널 규격으로 맞췄다.
 *
 * 검색 · 보기 탭 · 담당 · 정렬은 모두 서버가 한다(쪽 단위로 불러오므로 화면에서 걸러 내거나
 * 다시 줄 세우지 않는다). 그래서 서버가 아직 못 하는 것은 여기에도 없다:
 * 최근 상담순 정렬, 상태로 거르기, 의뢰가 모두 끝났거나 문의만 남긴 손님.
 */
export const Route = createFileRoute("/_authenticated/customers-table/")({
  component: CustomersPage,
});

type LedgerModeFilter = Exclude<CustomerLedgerMode, "both">;

const PAGE_SIZE = 50;
/** 매물관리 · 연락처 표와 같은 줄 높이 (36 + 선 1) */
const LEDGER_ROW_HEIGHT = 37;

const MODE_OPTIONS: ReadonlyArray<{ value: LedgerModeFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "listing", label: "내놓음" },
];

function CustomersPage() {
  // 다른 탭에서 프로젝트를 열거나 풀면 줄의 묶음이 달라진다. 원장도 다시 읽는다.
  useProjectChangesFromOtherTabs();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [mode, setMode] = useState<LedgerModeFilter>("all");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [sortValue, setSortValue] = useState(DEFAULT_LEDGER_SORT.value);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  // 적다 만 상담 글은 패널이 닫혀도 손님별로 남는다.
  const consultationDrafts = useRef<ConsultationDraftStore>(new Map()).current;
  // 지금 화면에 적는 칸이 열려 있는 손님. 그 손님의 저장 결과는 적는 칸이 직접 보여 준다.
  const visibleComposers = useRef(new Set<string>()).current;
  const queryClient = useQueryClient();
  // 상담 저장은 패널이 아니라 화면이 쥔다. 패널은 손님을 바꾸거나 닫으면 사라지지만 저장은 끝까지 가고,
  // 다시 연 패널도 같은 이름표로 "저장 중"을 알아본다(같은 글을 두 번 보내지 않는다).
  const saveConsultation = useMutation({
    mutationKey: CONSULTATION_SAVE_MUTATION_KEY,
    mutationFn: (request: ConsultationSaveRequest) => api.consultations.create(request),
    onSuccess: async (_consultation, request) => {
      // 보낸 글과 남아 있는 글이 같을 때만 지운다.
      settleSavedConsultationDraft(consultationDrafts, request);
      // 알림은 오른쪽 아래에 뜨고 패널의 아래 막대(상담 기록 · 기록 단추)를 가린다. 적는 칸이 보이는 동안에는
      // 띄우지 않는다: 칸이 닫히고 방금 적은 상담이 패널에 나타나는 것으로 충분하다. 그 손님을 떠났을 때만 알린다.
      if (!visibleComposers.has(request.contactId)) {
        toast.success("상담 기록이 저장되었습니다.");
      }
      // 표의 최근 상담과 패널의 상담 이력을 함께 새로 고친다. 다 고쳐진 뒤에 저장이 끝난 것으로 본다.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["consultations"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] }),
      ]);
    },
    onError: (_error, request) => {
      // 적은 글은 그대로 둔다. 다시 누르면 된다. 적는 칸이 보이면 그 칸이 실패를 알린다(알림이 단추를 가리지 않게).
      if (!visibleComposers.has(request.contactId)) {
        toast.error("상담 기록 저장에 실패했습니다. 적은 글은 남아 있습니다.");
      }
    },
  });
  const handleSaveConsultation = saveConsultation.mutate;

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
  const assigneeOptions = useMemo(
    () =>
      (employeesQuery.data ?? [])
        .filter((employee) => employee.isActive)
        .map((employee) => ({ value: employee.id, label: employee.name })),
    [employeesQuery.data],
  );
  const assigneeName =
    assigneeOptions.find((option) => option.value === assigneeId)?.label ?? null;

  const sort =
    LEDGER_SORT_OPTIONS.find((option) => option.value === sortValue) ??
    DEFAULT_LEDGER_SORT;
  const filters = useMemo(
    () => ({
      search: deferredSearch.trim() || undefined,
      mode,
      // 서버는 이 조건을 구함 의뢰의 담당에만 건다. 구하는 의뢰가 없는 손님은 빠진다.
      assignedToId: assigneeId ?? undefined,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      limit: PAGE_SIZE,
    }),
    [assigneeId, deferredSearch, mode, sort.sortBy, sort.sortOrder],
  );

  // 조건이 바뀌면 보이는 줄이 바뀐다. 보이지 않는 줄을 고른 채로 두지 않는다.
  useEffect(() => {
    setSelectedRowIds([]);
  }, [filters]);

  const ledgerQuery = useInfiniteQuery({
    queryKey: ["projects", "ledger", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.projects.ledger({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: getNextLedgerCursor,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = ledgerQuery;

  const rows = useMemo(
    () => mergeLedgerPages(ledgerQuery.data?.pages),
    [ledgerQuery.data?.pages],
  );
  const firstPage = ledgerQuery.data?.pages[0];
  const totalRows = firstPage?.pagination.total ?? 0;
  const summary = firstPage?.summary ?? null;
  const modeCount = (value: LedgerModeFilter) =>
    summary ? (value === "all" ? summary.rows : summary[value]) : undefined;

  const handleEndReached = useCallback(() => {
    // 다음 쪽을 못 불러왔을 때 굴릴 때마다 다시 부르지 않는다. 아래 줄의 "다시 시도"로 부른다.
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);

  // 상세 패널은 연락처·매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);
  const openInspector = useCallback((row: CustomerLedgerRow) => {
    setInspectorMotion(!document.activeElement?.matches(":focus-visible"));
    setIsInspectorClosing(false);
    setOpenRowId(row.id);
  }, []);
  const closeInspector = useCallback((animate = true) => {
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingInspector = useCallback(() => {
    setOpenRowId(null);
    setIsInspectorClosing(false);
  }, []);
  // 줄은 불러온 목록에서 다시 찾는다(고쳐진 값이 패널에 바로 보인다). 조건을 바꿔 목록을 새로 받는
  // 동안에는 마지막으로 본 줄을 그대로 보여 준다: 그 사이에 패널을 없앴다 다시 그리면 적던 칸이 닫힌다.
  const lastInspectorRow = useRef<CustomerLedgerRow | null>(null);
  const inspectorRow = useMemo(() => {
    if (!openRowId) return null;
    const found = rows.find((row) => row.id === openRowId) ?? null;
    if (found) lastInspectorRow.current = found;
    if (found || !ledgerQuery.isPending) return found;
    return lastInspectorRow.current?.id === openRowId ? lastInspectorRow.current : null;
  }, [ledgerQuery.isPending, openRowId, rows]);
  // 다 받은 뒤에도 그 줄이 없으면(조건에서 빠졌거나 프로젝트로 묶여 줄이 바뀜) 패널을 닫는다. 없는 줄을 보여 주지 않는다.
  useEffect(() => {
    if (openRowId && !inspectorRow && !ledgerQuery.isPending) finishClosingInspector();
  }, [finishClosingInspector, inspectorRow, ledgerQuery.isPending, openRowId]);
  // 닫히는 중인 줄은 표의 열기 버튼을 바로 "열기"로 되돌린다
  const currentRowId = isInspectorClosing ? null : openRowId;

  const columns = useMemo<ColumnDef<CustomerLedgerRow, unknown>[]>(
    () => [
      {
        id: "customer",
        header: () => <LedgerHeaderLabel icon={<UserRound />} label="고객" />,
        size: 184,
        minSize: 132,
        enableSorting: false,
        cell: ({ row }) => {
          const ledgerRow = row.original;
          const name = getLedgerCustomerName(ledgerRow);
          const companions = getLedgerCompanionCount(ledgerRow);
          const isCurrent = currentRowId === ledgerRow.id;
          return (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[21px] text-foreground">
                <ContactNameBadge name={name} />
                {companions > 0 && (
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    외 {companions}명
                  </span>
                )}
              </span>
              <RowOpenButton
                label={name}
                current={isCurrent}
                controls={CUSTOMER_INSPECTOR_ID}
                onToggle={() =>
                  isCurrent ? closeInspector() : openInspector(ledgerRow)
                }
              />
            </>
          );
        },
      },
      {
        id: "phone",
        header: () => <LedgerHeaderLabel icon={<Phone />} label="연락처" />,
        size: 136,
        minSize: 112,
        enableSorting: false,
        cell: ({ row }) => {
          const phone = getLedgerCustomerPhone(row.original);
          return phone ? (
            <span className="truncate tabular-nums text-[#5f5e5b]">
              {formatPhone(phone)}
            </span>
          ) : (
            <span className="sr-only">전화번호 없음</span>
          );
        },
      },
      {
        id: "latestConsultation",
        header: () => (
          <LedgerHeaderLabel icon={<MessageSquare />} label="최근 상담" />
        ),
        size: 360,
        minSize: 200,
        enableSorting: false,
        meta: { fill: true },
        cell: ({ row }) => <LatestConsultationCell row={row.original} />,
      },
      {
        id: "sides",
        header: () => <LedgerHeaderLabel icon={<House />} label="의뢰" />,
        size: 128,
        minSize: 96,
        enableSorting: false,
        cell: ({ row }) => <LedgerSideTags row={row.original} />,
      },
      {
        id: "status",
        header: () => <LedgerHeaderLabel icon={<Flag />} label="상태" />,
        size: 104,
        minSize: 92,
        enableSorting: false,
        cell: ({ row }) => <LedgerStatusChip row={row.original} />,
      },
      {
        id: "assignee",
        header: () => <LedgerHeaderLabel icon={<UserCheck />} label="담당" />,
        size: 124,
        minSize: 88,
        enableSorting: false,
        cell: ({ row }) => {
          const names = getLedgerAssignees(row.original);
          return names.length > 0 ? (
            <span className="truncate text-[#5f5e5b]" title={names.join(", ")}>
              {names.join(", ")}
            </span>
          ) : (
            <span className="sr-only">담당 없음</span>
          );
        },
      },
    ],
    [closeInspector, currentRowId, openInspector],
  );

  const hasActiveControls =
    search.trim() !== "" ||
    mode !== "all" ||
    assigneeId !== null ||
    sort.value !== DEFAULT_LEDGER_SORT.value;
  const resetControls = () => {
    setSearch("");
    setMode("all");
    setAssigneeId(null);
    setSortValue(DEFAULT_LEDGER_SORT.value);
  };

  const emptyMessage = hasActiveControls
    ? "조건에 맞는 손님이 없습니다."
    : "진행 중인 의뢰가 있는 손님이 없습니다.";

  return (
    <div
      data-customer-ledger-page
      className="relative -m-4 flex min-h-0 flex-1 bg-white"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <h1 className="sr-only">고객 원장</h1>
        {/* 도구줄(연락처·매물관리와 같은 두 줄): 첫 줄은 보기 탭 + 검색 + 보기 전환·추가 */}
        <section
          aria-label="고객 원장 보기 및 검색"
          className="flex h-[51px] shrink-0 items-center gap-2 border-b border-border bg-white px-3"
        >
          <ToolbarPillTabs
            shape="soft"
            ariaLabel="거래 보기 필터"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS.map((option) => ({
              ...option,
              count: modeCount(option.value),
            }))}
          />
          <div className="flex min-w-[160px] max-w-[360px] flex-1">
            <ToolbarPillSearch
              value={search}
              onChange={setSearch}
              placeholder="이름, 전화번호, 단지"
              ariaLabel="고객 원장 검색"
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ToolbarPillToggle
              ariaLabel="고객 원장 보기 방식"
              value="table"
              onChange={(view) => {
                if (view === "customers") handleOpenCaseView();
              }}
              options={[
                { value: "table", label: "표", icon: <List /> },
                { value: "customers", label: "고객 중심", icon: <UsersRound /> },
              ]}
            />
            <ProjectListButton className="h-[30px] shrink-0 rounded-full px-3" />
            <Button
              type="button"
              size="sm"
              aria-label="구함 의뢰 추가"
              className="h-[30px] shrink-0 rounded-[8px] px-3"
              onClick={handleCreateDemandIntake}
            >
              <Plus className="size-3.5" />
              구함 의뢰 추가
            </Button>
          </div>
        </section>
        {/* 진행 계획 창은 줄이 아니라 화면에 하나만 둔다(줄이 다시 그려져도 남는다). */}
        <ProjectPlanHost />

        {/* 둘째 줄: 거르기 칩 + 정렬. 표 머리에 윗선이 없어 여기 아랫선이 표와 나눈다. */}
        <section
          aria-label="고객 원장 거르기와 정렬"
          className="flex min-h-[44px] shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-1.5"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <ToolbarFilterChip
              shape="soft"
              icon={<UserCheck />}
              label="담당"
              summary={assigneeName}
              onClear={() => setAssigneeId(null)}
              contentClassName="w-[220px] p-1"
            >
              {(close) => (
                <LedgerFilterOptionList
                  ariaLabel="담당 필터"
                  options={assigneeOptions}
                  selected={assigneeId}
                  emptyText={
                    employeesQuery.isPending
                      ? "직원 목록을 불러오는 중입니다."
                      : "고를 수 있는 직원이 없습니다."
                  }
                  onSelect={(value) => {
                    setAssigneeId(value);
                    close();
                  }}
                />
              )}
            </ToolbarFilterChip>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 self-start">
            <Select value={sort.value} onValueChange={setSortValue}>
              {/* 기본 크기의 높이(36px)가 h-7을 이기므로 같은 조건으로 28px를 준다: 둘째 줄이 44px를 넘지 않는다. */}
              <SelectTrigger
                aria-label="정렬"
                className="h-7 w-auto shrink-0 gap-1.5 rounded-full border-transparent bg-transparent px-2.5 text-[13px] text-[#6f6c66] shadow-none hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground data-[size=default]:h-7"
              >
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                {LEDGER_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveControls && (
              <button
                type="button"
                className={cn(toolbarGhostButtonClassName, "rounded-full")}
                onClick={resetControls}
              >
                <RotateCcw className="size-3.5" />
                초기화
              </button>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {ledgerQuery.isError && rows.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="고객 원장을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도하세요."
              className="flex-1"
              action={
                <Button variant="outline" onClick={() => void ledgerQuery.refetch()}>
                  다시 시도
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              totalCount={totalRows}
              pageSize={PAGE_SIZE}
              layout="full-height"
              variant="notion"
              propertyListTone
              rowHeight={LEDGER_ROW_HEIGHT}
              scrollResetKey={JSON.stringify(filters)}
              getRowSelectionLabel={(row) => `${getLedgerCustomerName(row)} 선택`}
              enableRowSelection
              selectedRowIds={selectedRowIds}
              onRowSelectionChange={setSelectedRowIds}
              activateOnDoubleClick
              isLoading={ledgerQuery.isPending}
              isLoadingMore={isFetchingNextPage}
              onEndReached={handleEndReached}
              emptyMessage={emptyMessage}
              onRowClick={openInspector}
              renderBulkActions={(selectedRows) => (
                <LedgerBulkActions rows={selectedRows} />
              )}
              renderStatusBar={({ focusedRow }) => {
                const focusedPhone = focusedRow
                  ? getLedgerCustomerPhone(focusedRow)
                  : null;
                return (
                  <span>
                    {ledgerQuery.isPending
                      ? "불러오는 중"
                      : focusedRow
                        ? `${getLedgerCustomerName(focusedRow)}${focusedPhone ? ` · ${formatPhone(focusedPhone)}` : ""}`
                        : `고객 ${rows.length.toLocaleString()} / ${totalRows.toLocaleString()} · ${sort.label}`}
                    {isFetchingNextPage ? " · 더 불러오는 중..." : ""}
                    {!ledgerQuery.isPending &&
                    hasNextPage &&
                    !isFetchingNextPage &&
                    !isFetchNextPageError
                      ? " · 아래로 스크롤하면 더 불러옵니다"
                      : ""}
                    {isFetchNextPageError && (
                      <>
                        {" · 나머지를 불러오지 못했습니다. "}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-foreground"
                          onClick={() => void fetchNextPage()}
                        >
                          다시 시도
                        </button>
                      </>
                    )}
                    {!ledgerQuery.isPending && !focusedRow
                      ? " · 두 번 누르면 상세 패널"
                      : ""}
                  </span>
                );
              }}
            />
          )}
        </section>
      </div>

      {inspectorRow ? (
        <CustomerInspector
          key={inspectorRow.id}
          row={inspectorRow}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          drafts={consultationDrafts}
          visibleComposers={visibleComposers}
          onClose={closeInspector}
          onExited={finishClosingInspector}
          onCreateDemandIntake={handleCreateDemandIntake}
          onSaveConsultation={handleSaveConsultation}
        />
      ) : null}
    </div>
  );
}

/** 매물관리 표 머리(TableHeaderLabel)와 같은 모양: 13px 보통 굵기, 16px 아이콘 */
function LedgerHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/** 최근 상담 칸: 날짜와 방법은 흐리게, 내용은 한 줄로. 연락처 표의 같은 칸과 같은 표기다. */
function LatestConsultationCell({ row }: { row: CustomerLedgerRow }) {
  const consultation = row.latestConsultation;
  if (!consultation) return <span className="sr-only">상담 기록 없음</span>;
  return (
    <span
      title={consultation.content}
      className="flex w-full min-w-0 items-baseline gap-2 text-[14px] leading-[21px]"
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatLedgerDate(consultation.createdAt)}{" "}
        {CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type}
      </span>
      <span className="min-w-0 truncate text-foreground">
        {consultation.content.replace(/\s+/g, " ")}
      </span>
    </span>
  );
}

/** 거르기 칩 안의 고르는 목록. 연락처 화면의 것과 같은 모양이다. */
function LedgerFilterOptionList({
  ariaLabel,
  options,
  selected,
  emptyText,
  onSelect,
}: {
  ariaLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string | null;
  emptyText: string;
  onSelect: (value: string | null) => void;
}) {
  if (options.length === 0) {
    return <p className="px-2 py-2 text-[12px] text-muted-foreground">{emptyText}</p>;
  }
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
            {isSelected && <Check className="size-3.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

/** 고른 손님들에게 한 번에 하는 일. 지금은 전화번호 복사 하나다. */
function LedgerBulkActions({ rows }: { rows: CustomerLedgerRow[] }) {
  const copyPhones = async () => {
    const phones = collectLedgerPhones(rows);
    if (phones.length === 0) {
      toast.error("고른 손님에게 전화번호가 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(phones.map(formatPhone).join("\n"));
      toast.success(`전화번호 ${phones.length}개를 복사했습니다.`);
    } catch {
      toast.error("전화번호를 복사하지 못했습니다.");
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="text-slate-600"
      onClick={() => void copyPhones()}
    >
      <Copy className="size-3" />
      전화번호 복사
    </Button>
  );
}
