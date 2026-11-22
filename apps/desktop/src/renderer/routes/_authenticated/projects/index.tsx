import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
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
  ProjectListItem,
  ProjectListSort,
  ProjectListStatus,
} from "@estate-erp/api-client";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CircleCheck,
  Copy,
  Flag,
  FolderKanban,
  House,
  ListOrdered,
  MessageSquare,
  Plus,
  RotateCcw,
  UserCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { announceProjectChange } from "@/lib/project-sync";
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
import { ProjectPlanHost } from "../customers/-project-plan-dialog";
import { formatLedgerDate } from "../customers-table/-customer-inspector";
import { LedgerSideTag } from "../customers-table/-ledger-chips";
import {
  ToolbarFilterChip,
  ToolbarPillSearch,
  ToolbarPillTabs,
  toolbarGhostButtonClassName,
} from "../properties/-components/property-toolbar";
import { ProjectCreateDialog } from "./-project-create-dialog";
import { useCommentSave, useProjectChangesFromOtherTabs } from "./-project-hooks";
import { PROJECT_INSPECTOR_ID, ProjectInspector } from "./-project-inspector";
import { ProjectStatusChip } from "./-project-status-chip";
import {
  DEFAULT_PROJECT_SORT,
  collectProjectPhones,
  getProjectProgress,
  getProjectRowLabel,
  getProjectStatus,
  mergeProjectPages,
  PROJECT_SORT_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type CommentDraftStore,
} from "./-project-model";

/**
 * 프로젝트.
 *
 * 한 줄이 프로젝트 하나다: 고객 · 이름 · 상태 · 진행 · 의뢰 · 최근 코멘트 · 담당 · 시작.
 * 고객이 첫 칸이다(사용자 결정, 2026-11-21): 손님을 따라가며 보는 목록이고 이름은 비어 있을 때가 많다.
 * 프로젝트는 한 손님과 계속 주고받을 일이 있을 때 사용자가 직접 여는 묶음이라, 모든 손님이
 * 여기 나오지는 않는다. 서버가 알아서 만들지 않는다.
 *
 * 줄에서 여는 옆 패널에 사람들 · 진행 계획 · 코멘트가 있다. 진행 계획을 고치는 창은
 * 고객 원장이 쓰던 것(ProjectPlanHost)을 그대로 쓴다.
 */
export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

type StatusFilter = Exclude<ProjectListStatus, "all">;

const PAGE_SIZE = 50;
/** 매물관리 · 연락처 표와 같은 줄 높이 (36 + 선 1) */
const PROJECT_ROW_HEIGHT = 37;

function ProjectsPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [sortValue, setSortValue] = useState<ProjectListSort>(DEFAULT_PROJECT_SORT);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const queryClient = useQueryClient();
  // 다른 탭(열어 둔 상세 등)에서 고치거나 푼 것을 이 목록에도 반영한다.
  useProjectChangesFromOtherTabs();

  // 적다 만 코멘트는 패널이 닫혀도 프로젝트별로 남는다.
  const commentDrafts = useRef<CommentDraftStore>(new Map()).current;
  // 지금 화면에 패널이 열려 있는 프로젝트. 그 프로젝트의 저장 결과는 패널이 직접 보여 준다.
  const visibleProjectId = useRef<string | null>(null);
  // 코멘트 저장은 패널이 아니라 화면이 쥔다. 패널을 닫거나 다른 프로젝트로 옮겨도 저장은 끝까지 간다.
  const saveComment = useCommentSave(
    commentDrafts,
    (projectId) => visibleProjectId.current === projectId,
  );
  const handleSaveComment = saveComment.mutate;

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

  const filters = useMemo(
    () => ({
      status,
      search: deferredSearch.trim() || undefined,
      assignedToId: assigneeId ?? undefined,
      sort: sortValue,
      limit: PAGE_SIZE,
    }),
    [assigneeId, deferredSearch, sortValue, status],
  );
  // 조건이 바뀌면 보이는 줄이 바뀐다. 보이지 않는 줄을 고른 채로 두지 않는다.
  useEffect(() => {
    setSelectedRowIds([]);
  }, [filters]);

  // 검색 · 보기 탭 · 담당 · 정렬은 모두 서버가 한다. 목록은 쪽 단위로 받아 아래로 굴리면 이어 받는다:
  // 끝낸 지 오래된 프로젝트도 끝까지 내려가면 모두 나온다.
  const listQuery = useInfiniteQuery({
    queryKey: ["projects", "list", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.projects.findAll({ ...filters, offset: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    // 조건을 바꾸는 동안 표를 비우지 않는다.
    placeholderData: keepPreviousData,
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = listQuery;
  const rows = useMemo(() => mergeProjectPages(listQuery.data?.pages), [listQuery.data?.pages]);
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const handleEndReached = useCallback(() => {
    // 다음 쪽을 못 불러왔을 때 굴릴 때마다 다시 부르지 않는다. 아래 줄의 "다시 시도"로 부른다.
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);
  const sortLabel =
    PROJECT_SORT_OPTIONS.find((option) => option.value === sortValue)?.label ?? "";

  // 상세 패널은 연락처·매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [openId, setOpenId] = useState<string | null>(null);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);
  const openInspector = useCallback((project: ProjectListItem) => {
    setInspectorMotion(!document.activeElement?.matches(":focus-visible"));
    setIsInspectorClosing(false);
    setOpenId(project.id);
  }, []);
  const closeInspector = useCallback((animate = true) => {
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingInspector = useCallback(() => {
    setOpenId(null);
    setIsInspectorClosing(false);
  }, []);
  // 줄은 받은 목록에서 다시 찾는다(고친 값이 패널에 바로 보인다). 목록을 새로 받는 동안에는
  // 마지막으로 본 줄을 그대로 보여 준다: 그 사이에 패널을 없앴다 다시 그리면 적던 칸이 닫힌다.
  const lastInspectorRow = useRef<ProjectListItem | null>(null);
  const inspectorRow = useMemo(() => {
    if (!openId) return null;
    const found = rows.find((row) => row.id === openId) ?? null;
    if (found) lastInspectorRow.current = found;
    if (found || !listQuery.isFetching) return found;
    return lastInspectorRow.current?.id === openId ? lastInspectorRow.current : null;
  }, [listQuery.isFetching, openId, rows]);
  // 다 받은 뒤에도 그 줄이 없으면(끝내서 탭에서 빠졌거나 풀어서 없어짐) 패널을 닫는다.
  useEffect(() => {
    if (openId && !inspectorRow && !listQuery.isFetching) finishClosingInspector();
  }, [finishClosingInspector, inspectorRow, listQuery.isFetching, openId]);
  useEffect(() => {
    visibleProjectId.current = inspectorRow && !isInspectorClosing ? inspectorRow.id : null;
  }, [inspectorRow, isInspectorClosing]);
  // 닫히는 중인 줄은 표의 열기 버튼을 바로 "열기"로 되돌린다
  const currentId = isInspectorClosing ? null : openId;

  // 새로 연 프로젝트는 지금 조건(끝남 탭, 검색, 담당)에 안 맞을 수 있다. 조건을 풀고 그 줄을 연다.
  const handleCreated = useCallback(
    async (project: { id: string }) => {
      setSearch("");
      setStatus("open");
      setAssigneeId(null);
      // 패널은 목록에 그 줄이 있어야 열린다. 목록을 다시 받은 뒤에 연다
      // (먼저 열면 "없는 줄"로 보고 바로 닫힌다).
      await queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      setInspectorMotion(true);
      setIsInspectorClosing(false);
      setOpenId(project.id);
    },
    [queryClient],
  );

  const columns = useMemo<ColumnDef<ProjectListItem, unknown>[]>(
    () => [
      {
        // 첫 칸은 손님이다: 이 화면은 손님을 따라가며 보는 목록이고, 프로젝트 이름은 비어 있을 때가 많다.
        id: "customer",
        header: () => <HeaderLabel icon={<UserRound />} label="고객" />,
        size: 184,
        minSize: 132,
        enableSorting: false,
        cell: ({ row }) => {
          const project = row.original;
          const label = getProjectRowLabel(project);
          const isCurrent = currentId === project.id;
          return (
            <>
              {project.customerName ? (
                <span className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[21px] text-foreground">
                  <ContactNameBadge name={project.customerName} />
                  {project.peopleCount > 1 && (
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      외 {project.peopleCount - 1}명
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[14px] leading-[21px] text-[#a9a7a1]">고객 미정</span>
              )}
              <RowOpenButton
                label={label}
                current={isCurrent}
                controls={PROJECT_INSPECTOR_ID}
                onToggle={() => (isCurrent ? closeInspector() : openInspector(project))}
              />
            </>
          );
        },
      },
      {
        id: "title",
        header: () => <HeaderLabel icon={<FolderKanban />} label="프로젝트" />,
        size: 232,
        minSize: 140,
        enableSorting: false,
        cell: ({ row }) => {
          // 이름을 정하지 않은 프로젝트는 비워 둔다. 손님 이름은 바로 앞 칸에 있다.
          const title = row.original.title?.trim();
          return title ? (
            <span
              className="block w-full min-w-0 truncate text-[14px] leading-[21px] text-foreground"
              title={title}
            >
              {title}
            </span>
          ) : (
            <span className="sr-only">이름 없음</span>
          );
        },
      },
      {
        // 저장한 값이 아니라 끝냈는지와 단계 수에서 계산한 상태다.
        id: "status",
        header: () => <HeaderLabel icon={<Flag />} label="상태" />,
        size: 104,
        minSize: 92,
        enableSorting: false,
        cell: ({ row }) => <ProjectStatusChip status={getProjectStatus(row.original)} />,
      },
      {
        id: "progress",
        header: () => <HeaderLabel icon={<ListOrdered />} label="진행" />,
        size: 224,
        minSize: 140,
        enableSorting: false,
        cell: ({ row }) => <ProgressCell project={row.original} />,
      },
      {
        id: "intakes",
        header: () => <HeaderLabel icon={<House />} label="의뢰" />,
        size: 128,
        minSize: 96,
        enableSorting: false,
        cell: ({ row }) => {
          const { buyerIntakeCount, listingIntakeCount } = row.original;
          if (buyerIntakeCount + listingIntakeCount === 0) {
            return <span className="sr-only">담긴 의뢰 없음</span>;
          }
          return (
            <span className="inline-flex items-center gap-1">
              {buyerIntakeCount > 0 && <LedgerSideTag side="buy" />}
              {listingIntakeCount > 0 && <LedgerSideTag side="sell" />}
            </span>
          );
        },
      },
      {
        id: "latestComment",
        header: () => <HeaderLabel icon={<MessageSquare />} label="최근 코멘트" />,
        size: 320,
        minSize: 180,
        enableSorting: false,
        meta: { fill: true },
        cell: ({ row }) => <LatestCommentCell project={row.original} />,
      },
      {
        id: "assignee",
        header: () => <HeaderLabel icon={<UserCheck />} label="담당" />,
        size: 112,
        minSize: 88,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.assignedTo ? (
            <span className="truncate text-[#5f5e5b]">{row.original.assignedTo.name}</span>
          ) : (
            <span className="sr-only">담당 없음</span>
          ),
      },
      {
        id: "createdAt",
        header: () => <HeaderLabel icon={<CalendarDays />} label="시작" />,
        size: 96,
        minSize: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-[#5f5e5b]">
            {formatLedgerDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [closeInspector, currentId, openInspector],
  );

  const hasActiveControls =
    search.trim() !== "" || assigneeId !== null || sortValue !== DEFAULT_PROJECT_SORT;
  const resetControls = () => {
    setSearch("");
    setAssigneeId(null);
    setSortValue(DEFAULT_PROJECT_SORT);
  };

  const emptyMessage =
    search.trim() !== "" || assigneeId !== null
      ? "조건에 맞는 프로젝트가 없습니다."
      : status === "archived"
        ? "끝낸 프로젝트가 없습니다."
        : "아직 연 프로젝트가 없습니다. 한 손님과 계속 주고받을 일이 생기면 프로젝트를 여세요.";

  return (
    <div data-projects-page className="relative -m-4 flex min-h-0 flex-1 bg-white">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <h1 className="sr-only">프로젝트</h1>
        {/* 도구줄(연락처·매물관리와 같은 두 줄): 첫 줄은 보기 탭 + 검색 + 열기 */}
        <section
          aria-label="프로젝트 보기 및 검색"
          className="flex h-[51px] shrink-0 items-center gap-2 border-b border-border bg-white px-3"
        >
          <ToolbarPillTabs
            shape="soft"
            ariaLabel="프로젝트 보기"
            value={status}
            onChange={setStatus}
            options={PROJECT_STATUS_OPTIONS}
          />
          <div className="flex min-w-[160px] max-w-[360px] flex-1">
            <ToolbarPillSearch
              value={search}
              onChange={setSearch}
              placeholder="고객, 프로젝트 이름"
              ariaLabel="프로젝트 검색"
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-[30px] shrink-0 rounded-[8px] px-3"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="size-3.5" />
              프로젝트 열기
            </Button>
          </div>
        </section>
        {/* 진행 계획 창은 화면에 하나만 둔다(패널이 다시 그려져도 남는다). */}
        <ProjectPlanHost />
        <ProjectCreateDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          assigneeOptions={assigneeOptions}
          onCreated={handleCreated}
        />

        {/* 둘째 줄: 거르기 칩 + 정렬 */}
        <section
          aria-label="프로젝트 거르기와 정렬"
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
                <FilterOptionList
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
            <Select
              value={sortValue}
              onValueChange={(value) => setSortValue(value as ProjectListSort)}
            >
              <SelectTrigger
                aria-label="정렬"
                className="h-7 w-auto shrink-0 gap-1.5 rounded-full border-transparent bg-transparent px-2.5 text-[13px] text-[#6f6c66] shadow-none hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground data-[size=default]:h-7"
              >
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_SORT_OPTIONS.map((option) => (
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
          {listQuery.isError && rows.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="프로젝트를 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도하세요."
              className="flex-1"
              action={
                <Button variant="outline" onClick={() => void listQuery.refetch()}>
                  다시 시도
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              totalCount={total}
              pageSize={PAGE_SIZE}
              layout="full-height"
              variant="notion"
              propertyListTone
              rowHeight={PROJECT_ROW_HEIGHT}
              scrollResetKey={JSON.stringify(filters)}
              getRowSelectionLabel={(row) => `${getProjectRowLabel(row)} 선택`}
              enableRowSelection
              selectedRowIds={selectedRowIds}
              onRowSelectionChange={setSelectedRowIds}
              renderBulkActions={(selectedRows) => (
                <ProjectBulkActions
                  rows={selectedRows}
                  status={status}
                  // 처리한 줄만 고른 것에서 뺀다. 요청이 기다리는 동안 다른 탭에서 새로 고른 줄은 그대로 둔다.
                  onDone={(ids) =>
                    setSelectedRowIds((current) => current.filter((id) => !ids.includes(id)))
                  }
                />
              )}
              activateOnDoubleClick
              isLoading={listQuery.isPending}
              isLoadingMore={isFetchingNextPage}
              onEndReached={handleEndReached}
              emptyMessage={emptyMessage}
              onRowClick={openInspector}
              renderStatusBar={({ focusedRow }) => (
                <span>
                  {listQuery.isPending
                    ? "불러오는 중"
                    : focusedRow
                      ? getProjectRowLabel(focusedRow)
                      : `프로젝트 ${rows.length.toLocaleString()} / ${total.toLocaleString()} · ${sortLabel}`}
                  {isFetchingNextPage ? " · 더 불러오는 중..." : ""}
                  {!listQuery.isPending &&
                  hasNextPage &&
                  !isFetchingNextPage &&
                  !isFetchNextPageError
                    ? " · 아래로 스크롤하면 더 불러옵니다"
                    : ""}
                  {/* 받아 둔 줄은 있는데 새로 받다가 실패했다. 보이는 줄이 예전 것일 수 있다. */}
                  {listQuery.isError && rows.length > 0 && !isFetchNextPageError && (
                    <span data-refresh-failed>
                      {" · 새로 고치지 못했습니다. 보이는 내용이 예전 것일 수 있습니다. "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => void listQuery.refetch()}
                      >
                        다시 시도
                      </button>
                    </span>
                  )}
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
                  {!listQuery.isPending && !focusedRow && rows.length > 0
                    ? " · 두 번 누르면 상세 패널"
                    : ""}
                </span>
              )}
            />
          )}
        </section>
      </div>

      {inspectorRow ? (
        <ProjectInspector
          key={inspectorRow.id}
          project={inspectorRow}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          assigneeOptions={assigneeOptions}
          drafts={commentDrafts}
          onClose={closeInspector}
          onExited={finishClosingInspector}
          onSaveComment={handleSaveComment}
        />
      ) : null}
    </div>
  );
}

/** 매물관리 표 머리(TableHeaderLabel)와 같은 모양: 13px 보통 굵기, 16px 아이콘 */
function HeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/** 진행 칸: "2/5" 다음 단계 이름. 순서는 사람이 정한 것이고, 끝났는지는 의뢰·거래에서 읽는다. */
function ProgressCell({ project }: { project: ProjectListItem }) {
  const progress = getProjectProgress(project);
  if (progress.kind === "none") return <span className="sr-only">정한 단계 없음</span>;
  if (progress.kind === "done") {
    return (
      <span className="flex min-w-0 items-baseline gap-2 text-[14px] leading-[21px] text-muted-foreground">
        <span className="shrink-0 tabular-nums">
          {progress.total}/{progress.total}
        </span>
        <span className="truncate">모두 끝남</span>
      </span>
    );
  }
  return (
    <span
      className="flex min-w-0 items-baseline gap-2 text-[14px] leading-[21px]"
      title={progress.next ?? undefined}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
      <span className="min-w-0 truncate text-foreground">{progress.next}</span>
    </span>
  );
}

/** 최근 코멘트 칸: 날짜와 적은 사람은 흐리게, 내용은 한 줄로. 연락처 표의 최근 상담 칸과 같은 표기다. */
function LatestCommentCell({ project }: { project: ProjectListItem }) {
  const comment = project.latestComment;
  if (!comment) return <span className="sr-only">코멘트 없음</span>;
  return (
    <span
      title={comment.body}
      className="flex w-full min-w-0 items-baseline gap-2 text-[14px] leading-[21px]"
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatLedgerDate(comment.createdAt)}
        {comment.authorName ? ` ${comment.authorName}` : ""}
      </span>
      <span className="min-w-0 truncate text-foreground">
        {comment.body.replace(/\s+/g, " ")}
      </span>
    </span>
  );
}

/**
 * 고른 프로젝트들에 한 번에 하는 일: 대표 고객 전화번호 복사, 끝내기(끝남 탭에서는 다시 열기).
 * 풀기처럼 되돌릴 수 없는 일은 여기에 두지 않는다(패널에서 하나씩 확인하고 한다).
 */
function ProjectBulkActions({
  rows,
  status,
  onDone,
}: {
  rows: ProjectListItem[];
  status: StatusFilter;
  /** 처리가 끝난 프로젝트의 id */
  onDone: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const archive = status === "open";
  // 무엇을 어느 쪽으로 바꿀지는 누른 순간에 정해 요청에 담는다. 요청이 기다리는 동안(연결이 끊겨 멈춘 동안)
  // 탭을 바꾸면 이 컴포넌트의 status가 바뀌는데, 그 값을 나중에 읽으면 끝내려던 것을 다시 열게 된다.
  const setArchived = useMutation({
    mutationFn: async ({ ids, archived }: { ids: string[]; archived: boolean }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.projects.update(id, { archived })),
      );
      return {
        done: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    },
    onSuccess: async ({ done, failed }, { ids, archived: archive }) => {
      if (failed > 0) {
        toast.error(
          `${done}개는 ${archive ? "끝냈고" : "다시 열었고"} ${failed}개는 하지 못했습니다. 다시 시도해 주세요.`,
        );
      } else {
        toast.success(`프로젝트 ${done}개를 ${archive ? "끝냈습니다" : "다시 열었습니다"}.`);
      }
      // 바뀐 줄은 그 탭에서 빠진다. 처리한 줄을 고른 것에서 빼고 목록과 패널이 읽는 값을 새로 받는다.
      onDone(ids);
      if (done > 0) announceProjectChange("changed", null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", "plan"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] }),
      ]);
    },
  });

  const copyPhones = async () => {
    const phones = collectProjectPhones(rows);
    if (phones.length === 0) {
      toast.error("고른 프로젝트의 대표 고객에게 전화번호가 없습니다.");
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
    <>
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
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="text-slate-600"
        disabled={setArchived.isPending}
        onClick={() =>
          setArchived.mutate({ ids: rows.map((row) => row.id), archived: archive })
        }
      >
        {archive ? <CircleCheck className="size-3" /> : <RotateCcw className="size-3" />}
        {setArchived.isPending ? "처리 중" : archive ? "끝내기" : "다시 열기"}
      </Button>
    </>
  );
}

/** 거르기 칩 안의 고르는 목록. 연락처·고객 원장 화면의 것과 같은 모양이다. */
function FilterOptionList({
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
