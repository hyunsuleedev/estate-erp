import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, type ProjectPerson, type ProjectPlan } from "@estate-erp/api-client";
import {
  AlertCircle,
  ArrowLeft,
  ChevronsUpDown,
  CircleCheck,
  EllipsisVertical,
  FolderSearch,
  ListOrdered,
  MessageSquarePlus,
  Phone,
  RotateCcw,
  StickyNote,
  Trash2,
  Unlink,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useElementWidth } from "@/hooks/use-element-width";
import { useTabTitle } from "@/hooks/use-tab-title";
import { useAuth } from "@/providers/auth-provider";
import { ConfirmDialog, EmptyState } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { CopyPhone } from "../properties/-detail/brief";
import { DOC_WIDE_LAYOUT, nb } from "../properties/-detail/ui";
import {
  isProjectRemoved,
  planQueryKey,
  useRefreshAfterSaves,
  useCommentSave,
  useProjectChangesFromOtherTabs,
  useProjectRemove,
  useProjectUpdate,
} from "./-project-hooks";
import { AssigneeField, PrimaryContactField, SavedText } from "./-project-inspector";
import {
  describeProjectRemoval,
  EMPTY_PROJECT_REMOVAL_NOTE,
  projectRemovalFor,
  getProjectStatus,
  getProjectTitle,
  projectTabCounts,
  PROJECT_ARCHIVE_NOTE,
  PROJECT_PERSON_ROLE_LABELS,
  PROJECT_STATUS_HINTS,
  type CommentDraftStore,
  type ProjectViewTab,
} from "./-project-model";
import {
  PROJECT_DOC_MEMO_PLACEHOLDER,
  PROJECT_DOC_RAIL_CLASS,
  PROJECT_DOC_ROOT_CLASS,
  PROJECT_DOC_SCROLLER_CLASS,
  PROJECT_DOC_TITLE_CLASS,
  PROJECT_DOC_WIDTH_CLASS,
  ProjectDocHeader,
} from "./-project-doc";
import { ProjectFlow, type ProjectComposerMode, type ProjectComposerRequest } from "./-project-flow";
import { RefreshFailedNote } from "./-project-notes";
import { PlanPanelStateProvider } from "./-project-panel-state";
import { ProjectPlanSection } from "./-project-plan-flow";
import { ProjectIntakeTag, ProjectStatusChip } from "./-project-status-chip";
import { ProjectTasks, useProjectTasks } from "./-project-tasks";
import { BOX_CLASS, PERSON_PILL_CLASS, SectionBox } from "./-project-ui";
import {
  ProjectDealsTab,
  ProjectFilesDemo,
  ProjectMatchesTab,
  ProjectViewTabs,
} from "./-project-workspace-tabs";

/**
 * 프로젝트 상세 — 작업 공간 (2026-11-22 밤 개편, 사용자 지시).
 *
 * 이 화면의 물음: "이 손님 일이 어디까지 왔고, 지금 여기서 내가 무엇을 적고 처리하나."
 *
 * - 머리: 위 얇은 줄(어디인지 · 자주 쓰는 작업) → 큰 이름 → 속성 한 줄씩(상태 · 고객 · 담당 · 시작 · 의뢰 · 진행).
 *   고객 줄 하나에 대표 고객과 담긴 의뢰의 다른 사람들이 이름 · 역할 · 전화번호로 이어진다(연락처 상세와 같은
 *   전화 표기 · 동작). 사람을 따로 한 줄 두지 않는다(사용자 지적).
 * - 본문: 속성 아래 보기 탭 — 개요(메모 · 진행 계획과 단계마다 요점) · 매물·매칭(단계를 그 자리에서 바꾸기) ·
 *   거래·보수(서버가 주는 것만) · 자료실(아직 연결하지 않은 예시 화면).
 * - 오른쪽 열 = 일하는 자리: 업무(프로젝트에 직접 달린다, 한 줄로 적기) → 상담 · 코멘트 한 흐름(여기서 바로 적기).
 *   넓은 창에서는 따로 굴러가고, 좁으면 본문 아래로 내려온다.
 *
 * 부품은 매물 상세(properties/-detail)의 것을 쓴다: 단추 nb · 꼬리표 Tag · 구역 제목 H2 ·
 * 오른쪽 열 RailSection. 시안(docs/mockups/project-workspace)에서 가져온 것은 기능과 배치뿐이다.
 */
export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  // 다른 탭(목록의 옆 패널 등)에서 이 프로젝트를 고치거나 풀면 다시 읽는다.
  // 풀렸으면 "찾을 수 없습니다"로 바뀐다. 화면이 어떤 상태든(불러오는 중 · 없음) 듣는다.
  useProjectChangesFromOtherTabs();
  // "프로젝트 열기"로 방금 만든 프로젝트는 ?new=1로 열린다(제목에 커서를 둔다).
  const fresh = useRouterState({
    select: (state) => {
      const value = (state.location.search as Record<string, unknown> | undefined)?.new;
      return value === 1 || value === "1" || value === true;
    },
  });
  const removedHere = isProjectRemoved(id);
  const planQuery = useQuery({
    queryKey: planQueryKey(id),
    queryFn: () => api.projects.findOne(id),
    // 이 탭에서 푼 프로젝트는 목록으로 돌아가는 동안 다시 읽지 않는다.
    enabled: !removedHere,
    // 단계의 진행 상태(의뢰 · 거래에서 읽은 값)는 다른 화면에서 바뀐다. 이 화면으로 돌아올 때 다시 읽는다.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // 없는 프로젝트는 다시 물어도 없다.
      if (error instanceof ApiError && error.statusCode === 404) return false;
      return failureCount < 2;
    },
  });

  const backToList = () => {
    const route = "/projects";
    const meta = getRouteMeta(route);
    void navigateActiveTab({ route, kind: meta.kind, title: meta.title });
  };

  if (planQuery.isPending && !removedHere) {
    return (
      <PageShell onBack={backToList}>
        <div className={cn(PROJECT_DOC_WIDTH_CLASS, "space-y-4 pt-8")}>
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-24 w-full max-w-[520px]" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  const isNotFound =
    removedHere ||
    (planQuery.error instanceof ApiError && planQuery.error.statusCode === 404);
  if (isNotFound || !planQuery.data) {
    return (
      <PageShell onBack={backToList}>
        {isNotFound ? (
          <EmptyState
            icon={FolderSearch}
            title="프로젝트를 찾을 수 없습니다"
            description="풀었거나 없는 프로젝트입니다."
            className="flex-1"
            action={
              <Button variant="outline" onClick={backToList}>
                목록으로 돌아가기
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={AlertCircle}
            title="프로젝트를 불러오지 못했습니다"
            description="네트워크 상태를 확인한 뒤 다시 시도하세요."
            className="flex-1"
            action={
              <Button variant="outline" onClick={() => void planQuery.refetch()}>
                다시 시도
              </Button>
            }
          />
        )}
      </PageShell>
    );
  }

  // 프로젝트가 바뀌면 적던 칸과 열린 창을 새로 시작한다. 단계 카드에서 펼치고 접은 것은 이 화면에 머무는 동안 남는다.
  return (
    <PlanPanelStateProvider key={id}>
      <ProjectDetail
        plan={planQuery.data}
        fresh={fresh}
        // 앞서 읽은 것은 있는데 다시 읽다가 실패했다(없어진 것은 위에서 걸렀다). 예전 내용임을 알린다.
        refreshFailed={planQuery.isError}
        onRefresh={() => void planQuery.refetch()}
        onBack={backToList}
      />
    </PlanPanelStateProvider>
  );
}

/** 불러오는 중 · 없음 · 연결 실패일 때의 틀. 머리 줄 높이와 선은 상세 화면과 같다. */
function PageShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div
      data-project-detail
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e9e9e7] px-7 py-3.5">
        <button type="button" onClick={onBack} className={nb.ghost}>
          <ArrowLeft />
          프로젝트 목록
        </button>
      </div>
      {children}
    </div>
  );
}

function ProjectDetail({
  plan,
  fresh,
  refreshFailed,
  onRefresh,
  onBack,
}: {
  plan: ProjectPlan;
  /** 방금 "프로젝트 열기"로 만든 프로젝트 — 제목 칸에 커서를 둔다 */
  fresh: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
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

  const update = useProjectUpdate(plan.id);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const remove = useProjectRemove(plan.id, () => {
    setIsRemoveOpen(false);
    onBack();
  });

  // 적다 만 코멘트는 이 화면이 떠 있는 동안 남는다. 적는 칸이 늘 보이므로 저장 결과는 그 칸이 알린다.
  const commentDrafts = useRef<CommentDraftStore>(new Map()).current;
  const saveComment = useCommentSave(commentDrafts, (projectId) => projectId === plan.id);

  const steps = useMemo(
    () => [...plan.steps].sort((left, right) => left.sortOrder - right.sortOrder),
    [plan.steps],
  );
  // 같은 번호는 동시 진행이다. 번호는 1부터 다시 매겨 보여 준다.
  const orders = useMemo(() => [...new Set(steps.map((step) => step.sortOrder))], [steps]);
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) ?? null;
  const buyerCount = steps.filter((step) => step.kind === "buyer_intake").length;
  const listingCount = steps.filter((step) => step.kind === "listing_intake").length;
  const tabCounts = useMemo(() => projectTabCounts(steps), [steps]);
  const customerName = plan.people[0]?.name ?? null;
  const fallbackTitle = getProjectTitle({
    title: null,
    customerName,
    firstStepTitle: steps[0]?.title ?? null,
  });
  const displayTitle = plan.title?.trim() || fallbackTitle;
  // 링크로 연 탭은 처음에 "프로젝트 상세"로만 보인다. 불러온 뒤 프로젝트 이름으로 바꾼다.
  useTabTitle(displayTitle);
  // 풀기는 대표 · 매니저만(남이 적은 코멘트까지 지워진다). 아무것도 적지 않은 빈 프로젝트는 담당(만든 사람)도 지운다.
  // 업무가 하나라도 있으면 빈 프로젝트가 아니다(서버와 같은 기준). 업무를 아직 모르면 지우기를 내놓지 않는다.
  const tasksQuery = useProjectTasks(plan.id);
  const removal = projectRemovalFor(plan, useAuth().user, tasksQuery.data ? tasksQuery.data.length : null);
  const status = getProjectStatus({
    archivedAt: plan.archivedAt,
    stepCount: steps.length,
    doneStepCount: doneCount,
  });
  // "의뢰 담기" 고르기를 여는 신호(진행 계획 머리의 고르기 — 진행 계획 창은 이 화면에서 쓰지 않는다)
  const [addIntakeSignal, setAddIntakeSignal] = useState(0);
  const openAddIntake = () => {
    setTab("overview");
    // 다른 탭에서 부르면 진행 계획이 이제 막 그려진다. 그려진 뒤에 신호를 보내야 고르기가 열린다.
    requestAnimationFrame(() => setAddIntakeSignal((value) => value + 1));
  };
  // 대표 고객이 아닌 사람들(담긴 의뢰의 당사자). 대표 고객은 바로 위 줄에 있다.
  const otherPeople = plan.people.filter(
    (person) => person.role !== "primary" && person.contactId !== plan.primaryContact?.id,
  );

  const [tab, setTab] = useState<ProjectViewTab>("overview");
  const [composerRequest, setComposerRequest] = useState<ProjectComposerRequest | null>(null);
  const openComposer = (mode: ProjectComposerMode) =>
    setComposerRequest((current) => ({ mode, nonce: (current?.nonce ?? 0) + 1 }));
  const taskInputRef = useRef<HTMLInputElement>(null);
  const focusTaskInput = () => {
    const input = taskInputRef.current;
    if (!input) return;
    input.scrollIntoView({ block: "nearest" });
    input.focus({ preventScroll: true });
  };

  // 단계 카드가 쓰는 다른 화면의 부품(매칭 패널, 거래 전환 창)이 저장을 끝내면 진행 계획도 다시 읽는다.
  useRefreshAfterSaves(plan.id);
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const wide = rootWidth === 0 || rootWidth >= DOC_WIDE_LAYOUT;
  const mainRef = useRef<HTMLDivElement>(null);
  // "프로젝트 열기"로 방금 만든 빈 프로젝트(주소에 ?new=1)면 제목 칸에 커서를 둔다 — Notion의 새 페이지처럼.
  // 새 탭이 막 뜬 때는 화면이 다 보이기 전이라 focus가 먹지 않을 수 있다. 먹을 때까지 몇 번 더 시도하되,
  // 그 사이 사용자가 다른 곳을 눌렀으면 빼앗지 않는다.
  useEffect(() => {
    if (!fresh) return;
    let tries = 0;
    let frame = 0;
    const tryFocus = () => {
      const input = mainRef.current?.querySelector<HTMLInputElement>('input[aria-label="프로젝트 이름"]');
      if (!input || document.activeElement === input) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      input.focus({ preventScroll: true });
      if (document.activeElement !== input && tries++ < 120) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
    // 처음 그려질 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 빈 프로젝트 안내의 "대표 고객 정하기": 머리의 고객 줄에 있는 대표 고객 고르기를 연다.
  // 머리에는 담당 고르기도 같은 모양(combobox)으로 있으므로 표식으로 짚는다.
  const openPrimaryChooser = () => {
    mainRef.current
      ?.querySelector<HTMLButtonElement>('[data-project-primary-picker] button[role="combobox"]')
      ?.click();
  };

  // 오른쪽 열(좁은 화면에서는 본문 아래에 두 칸으로): 업무 → 상담 · 코멘트 한 흐름.
  const tasksPart = <ProjectTasks ref={taskInputRef} projectId={plan.id} />;
  const flowPart = (
    <ProjectFlow
      projectId={plan.id}
      people={plan.people}
      drafts={commentDrafts}
      onSaveComment={saveComment.mutate}
      request={composerRequest}
      boundedList={!wide}
    />
  );

  return (
    <div ref={rootRef} data-project-detail className={PROJECT_DOC_ROOT_CLASS}>
      {/*
        위 줄 (Notion 문서의 위 줄과 같은 구실): 왼쪽은 어디인지(프로젝트 목록 / 이 프로젝트),
        오른쪽은 자주 쓰는 작업. 이름과 속성은 본문 맨 위에 문서처럼 적는다. 새 프로젝트 문서와 같은 부품이다.
      */}
      <ProjectDocHeader title={displayTitle} onBack={onBack}>
          {plan.primaryContact?.phone && (
            <a
              href={`tel:${plan.primaryContact.phone}`}
              className={nb.ghost}
              title={`${plan.primaryContact.name}에게 전화`}
            >
              <Phone />
              대표 고객 전화
            </a>
          )}
          {plan.archivedAt ? (
            <button
              type="button"
              className={nb.line}
              disabled={update.isPending}
              onClick={() => update.mutate({ archived: false })}
            >
              <RotateCcw />
              다시 열기
            </button>
          ) : (
            <button
              type="button"
              className={nb.line}
              title={PROJECT_ARCHIVE_NOTE}
              disabled={update.isPending}
              onClick={() => update.mutate({ archived: true })}
            >
              <CircleCheck />
              끝내기
            </button>
          )}
          <button type="button" className={nb.solid} onClick={() => openComposer("comment")}>
            <MessageSquarePlus />
            코멘트
          </button>
          {/* 진행 계획은 화면에서 바로 고친다(창 없음). 메뉴에는 풀기 · 지우기만 남아, 그럴 수 없는 사람에게는 메뉴를 두지 않는다. */}
          {removal && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={nb.icon} aria-label={`${displayTitle} 작업 메뉴`}>
                  <EllipsisVertical />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem variant="destructive" onSelect={() => setIsRemoveOpen(true)}>
                  {removal === "delete-empty" ? (
                    <Trash2 className="size-3.5" />
                  ) : (
                    <Unlink className="size-3.5" />
                  )}
                  {removal === "delete-empty" ? "지우기" : "프로젝트 풀기"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
      </ProjectDocHeader>

      <div className="flex min-h-0 flex-1">
        <div ref={mainRef} data-project-scroller className={PROJECT_DOC_SCROLLER_CLASS}>
          {/* 머리(흰 바탕): 이름, 그 아래 두 줄(상태·담당·시작·의뢰 / 고객), 그리고 보기 탭이 아래 선 위에 앉는다. */}
          <div data-project-head className="shrink-0 border-b border-[#e9e9e7] bg-white">
            <div className={cn(PROJECT_DOC_WIDTH_CLASS, "pt-2")}>
              {refreshFailed && (
                <RefreshFailedNote what="최신 프로젝트 내용을" onRetry={onRefresh} className="mb-2" />
              )}
              <SavedText
                label="프로젝트 이름"
                value={plan.title}
                placeholder={fallbackTitle}
                maxLength={100}
                className={PROJECT_DOC_TITLE_CLASS}
                onSave={(next) => update.mutateAsync({ title: next })}
              />
              {/*
                머리 두 줄(사용자 지적, 2026-11-23: 속성을 한 줄씩 늘어놓는 Notion형 표는 자리만 차지한다).
                첫 줄은 상태 · 담당 · 시작 · 담은 의뢰, 둘째 줄은 고객 알약(대표 고객 고르기와 전화, 그 뒤에 다른 사람들).
                그 자리에서 고치는 것(담당, 대표 고객)은 그대로다. 진행("1/4 끝남 …")은 진행 계획 머리의 알약에 있다.
              */}
              <div
                data-project-meta
                className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[#37352f]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {/* 목록 표 · 옆 패널과 같은 알약(매물관리 표의 매물상태 알약) */}
                  <ProjectStatusChip status={status} />
                  {/* 상태 낱말만으로는 뜻을 알기 어렵다. 무엇 때문에 그 상태인지 옆에 적는다. */}
                  <span data-project-status-hint className="min-w-0 break-keep text-[13px] text-[#37352f]/55">
                    {PROJECT_STATUS_HINTS[status]}
                  </span>
                  {status === "wrapping" && (
                    <button
                      type="button"
                      title={PROJECT_ARCHIVE_NOTE}
                      className={cn(nb.line, "h-6 px-2 text-[13px]")}
                      disabled={update.isPending}
                      onClick={() => update.mutate({ archived: true })}
                    >
                      <CircleCheck />
                      끝내기
                    </button>
                  )}
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="text-[12.5px] text-[#37352f]/45">담당</span>
                  <AssigneeField
                    value={plan.assignedTo}
                    options={assigneeOptions}
                    onChange={(userId) => update.mutate({ assignedToId: userId })}
                  />
                </span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-[12.5px] text-[#37352f]/45">시작</span>
                  {formatDate(plan.createdAt)}
                  {plan.archivedAt && (
                    <span className="text-[#37352f]/65">→ {formatDate(plan.archivedAt)} 끝냄</span>
                  )}
                </span>
                {buyerCount + listingCount > 0 && (
                  <span className="flex items-center gap-1">
                    {/* 목록 표 · 옆 패널과 같은 꼬리표 */}
                    {listingCount > 0 && <ProjectIntakeTag kind="listing" count={listingCount} />}
                    {buyerCount > 0 && <ProjectIntakeTag kind="buyer" count={buyerCount} />}
                  </span>
                )}
              </div>
              {/* 고객 알약 줄: 이름 굵게 · 역할 회색 · 전화번호 파랑(눌러서 복사) + 전화 단추 */}
              <div
                data-project-people
                className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[14px]"
              >
                <span
                  className={cn(
                    PERSON_PILL_CLASS,
                    !plan.primaryContact && "bg-white outline-1 -outline-offset-1 outline-dashed outline-[#d6d5d1]",
                  )}
                >
                  <span data-project-primary-picker className="inline-flex min-w-0">
                    <PrimaryContactField
                      value={plan.primaryContact}
                      onChange={(contactId) => update.mutate({ primaryContactId: contactId })}
                      triggerClassName="-ml-1 inline-flex h-6 min-w-0 max-w-[220px] items-center gap-1 rounded-full px-1 text-left hover:bg-[#37352f]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
                      trigger={
                        plan.primaryContact ? (
                          <>
                            <span className="truncate font-semibold text-[#37352f]">{plan.primaryContact.name}</span>
                            <ChevronsUpDown className="size-3 shrink-0 text-[#37352f]/40" />
                          </>
                        ) : (
                          <>
                            <UserRound className="size-3.5 shrink-0 text-[#37352f]/45" />
                            <span className="text-[#37352f]/55">대표 고객 정하기</span>
                            <ChevronsUpDown className="size-3 shrink-0 text-[#37352f]/40" />
                          </>
                        )
                      }
                    />
                  </span>
                  {plan.primaryContact && (
                    <>
                      <span className="shrink-0 text-[12.5px] text-[#37352f]/50">대표 고객</span>
                      {plan.primaryContact.phone ? (
                        <PhoneActions name={plan.primaryContact.name} phone={plan.primaryContact.phone} />
                      ) : (
                        <span className="pr-1.5 text-[12.5px] text-[#37352f]/45">전화번호 없음</span>
                      )}
                    </>
                  )}
                </span>
                {otherPeople.length > 0 && <OtherPeople people={otherPeople} />}
              </div>

              {/* 보기 탭: 머리 아래 선 위에 앉는 밑줄 탭 */}
              <div className="mt-3">
                <ProjectViewTabs value={tab} onChange={setTab} counts={tabCounts} />
              </div>
            </div>
          </div>

          {/* 본문(옅은 회색 바탕): 구역마다 머리 있는 흰 상자 */}
          <div data-project-body className="flex-1 bg-muted">
            <div data-project-tab-panel={tab} className={cn(PROJECT_DOC_WIDTH_CLASS, "space-y-3.5 pb-10 pt-4")}>
              {tab === "overview" && (
                <>
                  {/* 첫 구역이 메모다(이 프로젝트가 어떤 일인지 한두 줄 — 시안의 "핵심 브리프"). */}
                  <SectionBox
                    data-project-memo
                    icon={<StickyNote />}
                    title="프로젝트 메모"
                    hint="누르면 바로 고칩니다"
                  >
                    <SavedText
                      multiline
                      label="프로젝트 메모"
                      value={plan.memo}
                      placeholder={PROJECT_DOC_MEMO_PLACEHOLDER}
                      maxLength={2000}
                      // 상자 안 상자를 만들지 않는다: 글만 놓고, 올리거나 고칠 때만 바탕이 옅게 깔린다.
                      className="-mx-1.5 w-[calc(100%+12px)] max-w-[892px] rounded-md px-1.5 py-1 text-[15px] leading-[1.65] text-[#37352f] placeholder:text-[#37352f]/45"
                      onSave={(next) => update.mutateAsync({ memo: next })}
                    />
                  </SectionBox>

                  <ProjectPlanSection
                    projectId={plan.id}
                    steps={steps}
                    primaryContactId={plan.primaryContact?.id ?? null}
                    hasPrimary={plan.primaryContact !== null}
                    canConsult={plan.people.length > 0}
                    archived={plan.archivedAt !== null}
                    addIntakeSignal={addIntakeSignal}
                    onOpenDeals={() => setTab("deals")}
                    onPickPrimary={openPrimaryChooser}
                    onWriteTask={focusTaskInput}
                    onWriteNote={() => openComposer(plan.people.length > 0 ? "consultation" : "comment")}
                  />
                </>
              )}
              {tab === "matches" && <ProjectMatchesTab steps={steps} onAddIntake={openAddIntake} />}
              {tab === "deals" && <ProjectDealsTab steps={steps} />}
              {tab === "files" && <ProjectFilesDemo />}

              {!wide && (
                <div
                  data-project-rail="inline"
                  className={cn(BOX_CLASS, "mt-6 grid items-start gap-x-8 px-4 py-2 sm:grid-cols-2")}
                >
                  {/* 두 칸에 나란히 놓을 때는 구역 사이 선을 긋지 않는다(각자 감싸 이웃이 아니게) */}
                  <div>{tasksPart}</div>
                  <div>{flowPart}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {wide && (
          <aside
            data-project-rail="side"
            aria-label="업무와 상담 · 코멘트"
            // 창이 넓을수록 넓어진다(사용자 지적 2026-11-23: 양옆 빈 띠). 1440에서는 389px.
            className={cn(PROJECT_DOC_RAIL_CLASS, "w-[clamp(376px,27vw,520px)]")}
          >
            <div className="px-[18px] pb-14 pt-3">
              {tasksPart}
              {flowPart}
            </div>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={isRemoveOpen}
        onOpenChange={setIsRemoveOpen}
        title={removal === "delete-empty" ? "빈 프로젝트를 지울까요?" : "프로젝트를 풀까요?"}
        description={
          removal === "delete-empty"
            ? EMPTY_PROJECT_REMOVAL_NOTE
            : describeProjectRemoval(plan.commentCount)
        }
        confirmLabel={removal === "delete-empty" ? "지우기" : "풀기"}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate({ empty: removal === "delete-empty" })}
      />
    </div>
  );
}

/** 전화번호(파랑, 눌러서 복사)와 전화 걸기 — 연락처 상세와 같은 동작 */
function PhoneActions({ name, phone }: { name: string; phone: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <CopyPhone phone={phone} className="text-[13.5px] text-info hover:text-info-strong" />
      <a
        href={`tel:${phone}`}
        aria-label={`${name}에게 전화`}
        title={`${name}에게 전화`}
        className="grid size-6 place-items-center rounded-full text-info hover:bg-info/10"
      >
        <Phone className="size-3.5" />
      </a>
    </span>
  );
}

/** 고객 줄에 바로 보이는 다른 사람 수. 넷 이상이면 앞의 둘만 보이고 나머지는 "+N"으로 연다. */
const PEOPLE_SHOWN_WHEN_MANY = 2;
const PEOPLE_MANY = 4;

/** 고객 줄의 다른 사람들(알약): 이름(연락처로) · 역할(회색) · 전화. 넷 이상이면 둘 + "+N"(누르면 작은 목록). */
function OtherPeople({ people }: { people: ProjectPerson[] }) {
  const shown = people.length >= PEOPLE_MANY ? people.slice(0, PEOPLE_SHOWN_WHEN_MANY) : people;
  const rest = people.slice(shown.length);
  return (
    <>
      {shown.map((person) => (
        <PersonPill key={person.contactId} person={person} />
      ))}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`다른 사람 ${rest.length}명 더 보기`}
              className="inline-flex h-7 items-center rounded-full bg-secondary px-2.5 text-[13px] font-medium tabular-nums text-[#37352f]/75 hover:bg-[#37352f]/[0.09]"
            >
              +{rest.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-[260px] p-1.5" data-project-people-more>
            <ul className="space-y-1">
              {rest.map((person) => (
                <li key={person.contactId}>
                  <PersonPill person={person} />
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

/** 사람 알약: 이름(굵게, 연락처로) · 어떻게 걸려 있나(회색) · 전화(파랑) */
function PersonPill({ person }: { person: ProjectPerson }) {
  return (
    <span data-project-person className={PERSON_PILL_CLASS}>
      <Link
        to="/contacts/$id"
        params={{ id: person.contactId }}
        className="min-w-0 truncate font-semibold text-[#37352f] underline-offset-2 hover:underline"
      >
        {person.name}
      </Link>
      <span className="shrink-0 text-[12.5px] text-[#37352f]/50">{PROJECT_PERSON_ROLE_LABELS[person.role]}</span>
      {person.phone ? (
        <PhoneActions name={person.name} phone={person.phone} />
      ) : (
        <span className="shrink-0 pr-1.5 text-[12.5px] text-[#37352f]/45">전화번호 없음</span>
      )}
    </span>
  );
}
