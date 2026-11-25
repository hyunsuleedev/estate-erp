import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectListItem } from "@estate-erp/api-client";
import {
  AlertCircle,
  CalendarDays,
  CircleCheck,
  Clock3,
  Copy,
  Flag,
  FolderKanban,
  House,
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
import { useAuth } from "@/providers/auth-provider";
import { EmptyState } from "@/components/domain";
import { CellEditProvider, DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { ProjectPlanHost } from "../customers/-project-plan-dialog";
import {
  useCommentSave,
  useOpenNewProject,
  useProjectChangesFromOtherTabs,
} from "./-project-hooks";
import { ProjectInspector } from "./-project-inspector";
import {
  EmptyCellValue,
  ProjectAssigneeCell,
  ProjectCustomerCell,
  ProjectDayCell,
  ProjectLatestCommentCell,
  ProjectStatusCell,
  ProjectTitleCell,
} from "./-project-list-cells";
import {
  clearProjectFilters,
  conditionsFromSearch,
  countActiveProjectFilters,
  DEFAULT_PROJECT_TABLE_SETTINGS,
  normalizeProjectTableSettings,
  PROJECT_FIXED_COLUMN_IDS,
  PROJECT_SORT_COLUMN,
  projectTableSettingsKey,
  readProjectListSearch,
  searchFromConditions,
  sortFromColumn,
  toProjectListFilter,
  type ProjectListConditions,
  type ProjectTableSettings,
} from "./-project-list-filters";
import {
  ProjectColumnSettings,
  ProjectFilterRow,
  ProjectListToolbar,
} from "./-project-list-toolbar";
import { ProjectIntakeTag } from "./-project-status-chip";
import {
  collectProjectPhones,
  getProjectRowLabel,
  mergeProjectPages,
  PROJECT_ARCHIVE_NOTE,
  type CommentDraftStore,
} from "./-project-model";

/**
 * 프로젝트.
 *
 * 한 줄이 프로젝트 하나다: 고객 · 이름 · 상태 · 진행 · 의뢰 · 최근 코멘트 · 담당 · 시작.
 * 고객이 첫 칸이다(사용자 결정, 2026-11-21): 손님을 따라가며 보는 목록이고 이름은 비어 있을 때가 많다.
 *
 * 위쪽 두 줄과 표는 매물관리 목록과 같은 부품 · 같은 치수다(사용자 요청, 2026-11-22): 도구 줄(보기 탭 · 검색 ·
 * 필터 줄 여닫기 · 열 설정 · 정렬 · 프로젝트 열기), 필터 알약 줄, Notion형 표(열 보이기 · 순서 · 너비 기억,
 * 머리글 정렬, 칸에서 바로 고치기), 아래 상태 줄. 조건은 모두 서버가 걸고(쪽 넘김 · 건수가 맞게) 주소에 남는다.
 *
 * 줄을 두 번 누르면 옆 패널(사람들 · 진행 계획 · 코멘트)이 열린다. 진행 계획을 고치는 창은
 * 고객 원장이 쓰던 것(ProjectPlanHost)을 그대로 쓴다.
 */
export const Route = createFileRoute("/_authenticated/projects/")({
  validateSearch: (search: Record<string, unknown>) => readProjectListSearch(search),
  component: ProjectsPage,
});

const PAGE_SIZE = 50;
/** 매물관리 · 연락처 표와 같은 줄 높이 (36 + 선 1) */
const PROJECT_ROW_HEIGHT = 37;
/** 검색어를 주소에 옮기기 전에 기다리는 시간(치는 동안 주소가 매번 바뀌지 않게) */
const SEARCH_DEBOUNCE_MS = 300;
/** 고정 열(기준 열). 표가 같은 배열을 계속 받게 한 번만 만든다. */
const PINNED_COLUMNS = [...PROJECT_FIXED_COLUMN_IDS];
/** 고정 열의 너비. + 단추 자리를 셀 때도 쓴다. */
const PROJECT_COLUMN_WIDTHS = {
  customer: { size: 184, minSize: 132 },
  title: { size: 280, minSize: 160 },
} as const;
/** 표의 체크 칸 너비(공용 표와 매물관리 표가 같다) */
const SELECT_COLUMN_WIDTH = 36;
/**
 * 매물관리 고정 열 경계선(property-listings-table의 PINNED_EDGE_LINE_CLASS)과 같은 선: 옅은 칸 테두리(#eeeeec)
 * 바로 바깥에 조금 진한 선(#e3e2df)을 붙여 두 줄 선으로 보이게 한다. 머리와 본문이 한 선으로 이어진다.
 */
const PINNED_EDGE_CELL_CLASS = "shadow-[1px_0_0_0_#e3e2df]";

/** 고정 열 끝(체크 칸 + 고객 + 프로젝트)의 x. 끌어 바꾼 너비는 놓은 뒤에 반영된다. */
function pinnedEdgeOffset(sizing: Record<string, number>) {
  const width = (id: keyof typeof PROJECT_COLUMN_WIDTHS) =>
    Math.max(PROJECT_COLUMN_WIDTHS[id].minSize, sizing[id] ?? PROJECT_COLUMN_WIDTHS[id].size);
  return SELECT_COLUMN_WIDTH + width("customer") + width("title");
}

/**
 * 머리 칸의 고정 열 경계선. 공용 표는 머리 칸에 클래스를 받지 않아서, 머리 칸(relative) 오른쪽 테두리 바로 바깥에
 * 1px 선을 그린다 — 본문 칸의 PINNED_EDGE_CELL_CLASS 그림자와 같은 자리 · 같은 색이다.
 */
function PinnedEdgeLine() {
  return (
    <span
      aria-hidden="true"
      data-project-pinned-edge
      className="pointer-events-none absolute inset-y-0 -right-[2px] w-px bg-[#e3e2df]"
    />
  );
}

function readTableSettings(key: string | null): ProjectTableSettings {
  if (!key) return DEFAULT_PROJECT_TABLE_SETTINGS;
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeProjectTableSettings(JSON.parse(raw)) : DEFAULT_PROJECT_TABLE_SETTINGS;
  } catch {
    return DEFAULT_PROJECT_TABLE_SETTINGS;
  }
}

function ProjectsPage() {
  const routeSearch = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const conditions = useMemo(() => conditionsFromSearch(routeSearch), [routeSearch]);
  const conditionsRef = useRef(conditions);
  conditionsRef.current = conditions;
  // 조건은 주소에 둔다(새로 고쳐도 · 탭을 옮겨 다녀와도 그대로). 뒤로 가기에 쌓이지 않게 바꿔 끼운다.
  const setConditions = useCallback(
    (next: ProjectListConditions) => {
      void navigate({ search: searchFromConditions(next), replace: true });
    },
    [navigate],
  );
  const patchConditions = useCallback(
    (patch: Partial<ProjectListConditions>) => setConditions({ ...conditionsRef.current, ...patch }),
    [setConditions],
  );

  // 검색어는 치는 대로 보이고, 잠깐 멈추면 주소(→ 서버 조건)로 옮긴다.
  const [searchText, setSearchText] = useState(conditions.search);
  const lastSentSearch = useRef(conditions.search);
  useEffect(() => {
    // 밖에서 검색어가 바뀌면(초기화 · 주소) 칸도 따라간다
    if (conditions.search !== lastSentSearch.current) {
      lastSentSearch.current = conditions.search;
      setSearchText(conditions.search);
    }
  }, [conditions.search]);
  useEffect(() => {
    if (searchText === conditionsRef.current.search) return;
    const timer = window.setTimeout(() => {
      lastSentSearch.current = searchText;
      patchConditions({ search: searchText });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [patchConditions, searchText]);

  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  // 다른 탭(열어 둔 상세 등)에서 고치거나 푼 것을 이 목록에도 반영한다.
  useProjectChangesFromOtherTabs();

  // 열 보이기 · 순서 · 너비: 사용자 · 사무소별로 이 PC에 기억한다(매물관리의 열 기억과 같은 규칙).
  const authUser = useAuth().user;
  const settingsKey = projectTableSettingsKey(authUser);
  const [tableSettings, setTableSettings] = useState(() => readTableSettings(settingsKey));
  const loadedSettingsKey = useRef(settingsKey);
  useEffect(() => {
    if (loadedSettingsKey.current !== settingsKey) {
      // 로그인 정보가 늦게 오거나 사용자가 바뀌면 그 사람의 기억을 다시 읽는다(덮어쓰지 않게)
      loadedSettingsKey.current = settingsKey;
      setTableSettings(readTableSettings(settingsKey));
      return;
    }
    if (!settingsKey) return;
    try {
      localStorage.setItem(settingsKey, JSON.stringify(tableSettings));
    } catch {
      /* 저장소를 못 써도 이번 화면에서는 그대로 쓴다 */
    }
  }, [settingsKey, tableSettings]);

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

  const filter = useMemo(() => toProjectListFilter(conditions, PAGE_SIZE), [conditions]);
  // 조건이 바뀌면 보이는 줄이 바뀐다. 보이지 않는 줄을 고른 채로 두지 않는다.
  useEffect(() => {
    setSelectedRowIds([]);
  }, [filter]);

  // 조건 · 정렬은 모두 서버가 한다. 목록은 쪽 단위로 받아 아래로 굴리면 이어 받는다:
  // 끝낸 지 오래된 프로젝트도 끝까지 내려가면 모두 나온다.
  const listQuery = useInfiniteQuery({
    queryKey: ["projects", "list", filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.projects.findAll({ ...filter, offset: pageParam }),
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

  // 프로젝트 열기: 누르는 순간 빈 프로젝트를 만들고 그 문서를 새 탭으로 연다(사용자 결정, 2026-11-22 —
  // Notion의 새 페이지처럼). 이 목록 탭은 그대로 남고 새 줄이 맨 위에 보인다.
  const newProject = useOpenNewProject();
  const openNewProject = newProject.open;

  // 열은 정의를 모아 두고, 기억한 순서대로 놓고 숨긴 것은 뺀다.
  const columnDefs = useMemo<Record<string, ColumnDef<ProjectListItem, unknown>>>(
    () => ({
      customer: {
        // 첫 칸은 손님이다: 이 화면은 손님을 따라가며 보는 목록이다.
        id: "customer",
        header: () => <HeaderLabel icon={<UserRound />} label="고객" />,
        size: PROJECT_COLUMN_WIDTHS.customer.size,
        minSize: PROJECT_COLUMN_WIDTHS.customer.minSize,
        enableSorting: false,
        cell: ({ row }) => <ProjectCustomerCell project={row.original} />,
      },
      title: {
        // 이 표의 주 칸: 매물관리 '단지' 칸처럼 가장 넓고, 열기(옆 패널) 단추가 여기 뜬다. 고정 열의 끝이라
        // 매물관리 고정 열과 같은 구분선을 긋는다(칸은 meta, 머리는 PinnedEdgeLine).
        id: "title",
        header: () => (
          <>
            <HeaderLabel icon={<FolderKanban />} label="프로젝트" />
            <PinnedEdgeLine />
          </>
        ),
        size: PROJECT_COLUMN_WIDTHS.title.size,
        minSize: PROJECT_COLUMN_WIDTHS.title.minSize,
        meta: { cellClassName: PINNED_EDGE_CELL_CLASS },
        cell: ({ row }) => {
          const project = row.original;
          const isCurrent = currentId === project.id;
          return (
            <ProjectTitleCell
              project={project}
              current={isCurrent}
              onToggleOpen={() => (isCurrent ? closeInspector() : openInspector(project))}
            />
          );
        },
      },
      status: {
        // 저장한 값이 아니라 끝냈는지와 단계 수에서 계산한 상태다. 칸을 누르면 끝내기 · 다시 열기를 고른다.
        id: "status",
        header: () => <HeaderLabel icon={<Flag />} label="상태" />,
        size: 112,
        minSize: 96,
        enableSorting: false,
        cell: ({ row }) => <ProjectStatusCell project={row.original} />,
      },
      intakes: {
        id: "intakes",
        header: () => <HeaderLabel icon={<House />} label="의뢰" />,
        // "매물 의뢰 2 · 구매 의뢰 2" 칩 둘(14px)이 들어가는 너비
        size: 196,
        minSize: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const { buyerIntakeCount, listingIntakeCount } = row.original;
          if (buyerIntakeCount + listingIntakeCount === 0) {
            return <EmptyCellValue label="담은 의뢰 없음" />;
          }
          return (
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {listingIntakeCount > 0 && (
                <ProjectIntakeTag kind="listing" count={listingIntakeCount} />
              )}
              {buyerIntakeCount > 0 && <ProjectIntakeTag kind="buyer" count={buyerIntakeCount} />}
            </span>
          );
        },
      },
      latestComment: {
        id: "latestComment",
        header: () => <HeaderLabel icon={<MessageSquare />} label="최근 코멘트" />,
        size: 280,
        minSize: 200,
        enableSorting: false,
        meta: { fill: true },
        cell: ({ row }) => <ProjectLatestCommentCell project={row.original} />,
      },
      assignee: {
        id: "assignee",
        header: () => <HeaderLabel icon={<UserCheck />} label="담당" />,
        size: 104,
        minSize: 88,
        enableSorting: false,
        cell: ({ row }) => <ProjectAssigneeCell project={row.original} options={assigneeOptions} />,
      },
      createdAt: {
        id: "createdAt",
        header: () => <HeaderLabel icon={<CalendarDays />} label="시작" />,
        size: 96,
        minSize: 80,
        cell: ({ row }) => <ProjectDayCell value={row.original.createdAt} />,
      },
      updatedAt: {
        id: "updatedAt",
        header: () => <HeaderLabel icon={<Clock3 />} label="최근 고침" />,
        size: 104,
        minSize: 80,
        cell: ({ row }) => <ProjectDayCell value={row.original.updatedAt} />,
      },
    }),
    [assigneeOptions, closeInspector, currentId, openInspector],
  );
  // 고정 열(체크 칸 · 고객 · 프로젝트)이 끝나는 자리. 표 머리 위 + 단추가 그 구분선 가운데에 걸친다.
  const pinnedEdgeX = pinnedEdgeOffset(tableSettings.sizing);
  const columns = useMemo(
    () =>
      tableSettings.order
        .filter((id) => !tableSettings.hidden.includes(id))
        .map((id) => columnDefs[id])
        .filter((column): column is ColumnDef<ProjectListItem, unknown> => Boolean(column)),
    [columnDefs, tableSettings.hidden, tableSettings.order],
  );

  // 머리글 정렬: 서버가 정렬하는 열(프로젝트 이름 · 시작 · 최근 고침)만 누를 수 있다.
  const sorting = useMemo<SortingState>(
    () => [{ id: PROJECT_SORT_COLUMN[conditions.sort], desc: conditions.order === "desc" }],
    [conditions.order, conditions.sort],
  );
  const handleSortingChange = useCallback(
    (next: SortingState) => {
      const active = next[0];
      const sort = active ? sortFromColumn(active.id) : null;
      // 세 번째 누르면 정렬을 풀고 기본(최근 고친 순)으로 돌아간다
      if (!active || !sort) {
        patchConditions({ sort: "updated", order: "desc" });
        return;
      }
      patchConditions({ sort, order: active.desc ? "desc" : "asc" });
    },
    [patchConditions],
  );

  const activeFilterCount = countActiveProjectFilters(conditions);
  const hasActiveConditions = activeFilterCount > 0 || conditions.search.trim() !== "";
  const resetFilters = () => {
    setSearchText("");
    lastSentSearch.current = "";
    setConditions(clearProjectFilters(conditions));
  };

  // 빈 목록 안내는 표 안(공용 emptyMessage)에 둔다.
  // - 조건 때문에 비었으면 한 줄과 필터 초기화.
  // - 종료 탭이 비었으면 끝내기가 무엇인지(계약 · 정산이 끝났다는 뜻이 아님).
  // - 활성 탭이 정말 비었으면(처음 쓰는 사무소 등) 무엇을 하는 곳인지와 여는 단추.
  const emptyMessage: ReactNode = hasActiveConditions ? (
    <span data-projects-empty="filtered" className="inline-flex flex-wrap items-center justify-center gap-x-2">
      조건에 맞는 프로젝트가 없습니다.
      <button
        type="button"
        className="font-medium text-foreground underline underline-offset-2 hover:text-[#2383e2]"
        onClick={resetFilters}
      >
        필터 초기화
      </button>
    </span>
  ) : conditions.archived ? (
    <span data-projects-empty="archived">
      종료한 프로젝트가 없습니다.
      <span className="mt-1 block text-[13px] text-[#a9a7a1]">
        끝내기는 {PROJECT_ARCHIVE_NOTE}
      </span>
    </span>
  ) : (
    <EmptyState
      icon={FolderKanban}
      title="활성 프로젝트가 없습니다"
      description="프로젝트는 한 손님과 주고받을 일을 모아 두는 작업 공간입니다. 빈 채로 열고 이름 · 고객 · 의뢰는 나중에 채워도 됩니다. 예를 들어 집을 팔고 새로 사는 갈아타기 손님이면 매물 의뢰와 구매 의뢰를 담고, 대출 상담 · 이사 같은 할 일을 순서대로 적어 둡니다."
      className="[&_p]:max-w-[520px] [&_p]:break-keep"
      action={
        <Button onClick={() => openNewProject()}>
          <Plus className="size-3.5" />
          프로젝트 열기
        </Button>
      }
    />
  );

  return (
    <CellEditProvider>
      <div data-projects-page className="relative -m-4 flex min-h-0 flex-1 bg-white">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <h1 className="sr-only">프로젝트</h1>
          <ProjectListToolbar
            archived={conditions.archived}
            onArchivedChange={(archived) => patchConditions({ archived })}
            search={searchText}
            onSearchChange={setSearchText}
            isFilterRowOpen={isFilterRowOpen}
            onToggleFilterRow={() => setIsFilterRowOpen((open) => !open)}
            activeFilterCount={activeFilterCount}
            tableSettings={tableSettings}
            onTableSettingsChange={setTableSettings}
            sort={conditions.sort}
            order={conditions.order}
            onSortChange={(sort, order) => patchConditions({ sort, order })}
            onCreate={() => openNewProject()}
          />
          {/* 진행 계획 창은 화면에 하나만 둔다(패널이 다시 그려져도 남는다). */}
          <ProjectPlanHost />
          {isFilterRowOpen && (
            <ProjectFilterRow
              conditions={conditions}
              onChange={patchConditions}
              assigneeOptions={assigneeOptions}
              activeFilterCount={activeFilterCount}
              onReset={resetFilters}
              showMine={Boolean(authUser)}
            />
          )}

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
              // 매물관리 표처럼 표 위에 8px을 비우고(+ 단추의 위 절반 자리) 표 머리 위에 선을 긋는다.
              <div className="relative flex min-h-0 flex-1 flex-col pt-2">
              <ProjectColumnSettings
                settings={tableSettings}
                onChange={setTableSettings}
                trigger={
                  // 매물관리 표 머리의 구분선 위 작은 +와 같은 단추. 매물관리는 묶어 둔 열을 펼치고,
                  // 프로젝트 표에는 묶음이 없어 숨긴 열을 다시 켜는 열 설정을 연다(도구 줄의 열 아이콘과 같은 목록).
                  <button
                    type="button"
                    aria-label="열 추가 · 숨긴 열 보기"
                    title="열 추가 · 숨긴 열 보기"
                    data-project-column-add
                    className="absolute top-0 z-50 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-[#cfcecb] bg-white p-0 text-[#8f8c86] outline-none transition-colors hover:border-[#a3a09a] hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:border-[#a3a09a] data-[state=open]:text-foreground"
                    // 단추 가운데(8px)가 고정 열 구분선(1px) 가운데에 오게 한다. 매물관리와 같은 계산이다.
                    style={{ left: Math.max(0, pinnedEdgeX - 8) + 0.5 }}
                  >
                    <Plus className="size-2.5" strokeWidth={2.25} />
                  </button>
                }
              />
              <div className="flex min-h-0 flex-1 flex-col border-t border-border">
              <DataTable
                columns={columns}
                data={rows}
                totalCount={total}
                pageSize={PAGE_SIZE}
                layout="full-height"
                variant="notion"
                propertyListTone
                rowHeight={PROJECT_ROW_HEIGHT}
                // 고객 · 프로젝트는 가로로 넘겨도 제자리(매물관리의 거래 ~ 공급 고정 열과 같다)
                pinnedColumns={PINNED_COLUMNS}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                columnSizing={tableSettings.sizing}
                onColumnSizingChange={(sizing) =>
                  setTableSettings((current) => ({ ...current, sizing }))
                }
                scrollResetKey={JSON.stringify(filter)}
                getRowSelectionLabel={(row) => `${getProjectRowLabel(row)} 선택`}
                enableRowSelection
                selectedRowIds={selectedRowIds}
                onRowSelectionChange={setSelectedRowIds}
                // 매물관리처럼 고른 것의 작업 줄은 표 아래(상태 줄 위)에 둔다 — 체크해도 표가 밀려 내려가지 않는다
                selectionToolbarPlacement="bottom"
                selectionItemLabel="프로젝트"
                renderBulkActions={(selectedRows) => (
                  <ProjectBulkActions
                    rows={selectedRows}
                    archived={conditions.archived}
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
                renderStatusBar={() => (
                  <span>
                    {listQuery.isPending
                      ? "불러오는 중"
                      : `프로젝트 ${rows.length.toLocaleString()}건 표시 · 전체 ${total.toLocaleString()}건`}
                    {isFetchingNextPage ? " · 더 불러오는 중..." : ""}
                    {!listQuery.isPending && hasNextPage && !isFetchingNextPage && !isFetchNextPageError
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
                  </span>
                )}
              />
              </div>
              </div>
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
    </CellEditProvider>
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

/**
 * 고른 프로젝트들에 한 번에 하는 일: 대표 고객 전화번호 복사, 끝내기(종료 탭에서는 다시 열기).
 * 풀기처럼 되돌릴 수 없는 일은 여기에 두지 않는다(패널에서 하나씩 확인하고 한다).
 */
function ProjectBulkActions({
  rows,
  archived,
  onDone,
}: {
  rows: ProjectListItem[];
  /** 지금 보고 있는 탭이 종료 탭인지 */
  archived: boolean;
  /** 처리가 끝난 프로젝트의 id */
  onDone: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const archive = !archived;
  // 무엇을 어느 쪽으로 바꿀지는 누른 순간에 정해 요청에 담는다. 요청이 기다리는 동안(연결이 끊겨 멈춘 동안)
  // 탭을 바꾸면 이 컴포넌트의 값이 바뀌는데, 그 값을 나중에 읽으면 끝내려던 것을 다시 열게 된다.
  const setArchived = useMutation({
    mutationFn: async ({ ids, archived: next }: { ids: string[]; archived: boolean }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.projects.update(id, { archived: next })),
      );
      return {
        done: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    },
    onSuccess: async ({ done, failed }, { ids, archived: next }) => {
      if (failed > 0) {
        toast.error(
          `${done}개는 ${next ? "끝냈고" : "다시 열었고"} ${failed}개는 하지 못했습니다. 다시 시도해 주세요.`,
        );
      } else {
        toast.success(
          `프로젝트 ${done}개를 ${next ? "끝냈습니다" : "다시 열었습니다"}.`,
          next ? { description: PROJECT_ARCHIVE_NOTE } : undefined,
        );
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
        title={archive ? PROJECT_ARCHIVE_NOTE : undefined}
        onClick={() => setArchived.mutate({ ids: rows.map((row) => row.id), archived: archive })}
      >
        {archive ? <CircleCheck className="size-3" /> : <RotateCcw className="size-3" />}
        {setArchived.isPending ? "처리 중" : archive ? "끝내기" : "다시 열기"}
      </Button>
    </>
  );
}
