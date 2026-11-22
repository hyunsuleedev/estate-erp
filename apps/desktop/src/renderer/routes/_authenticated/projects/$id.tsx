import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ApiError,
  type ProjectPerson,
  type ProjectPlan,
  type ProjectStep,
} from "@estate-erp/api-client";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  EllipsisVertical,
  Flag,
  FolderKanban,
  FolderSearch,
  House,
  ListOrdered,
  MessageSquarePlus,
  Phone,
  Plus,
  RotateCcw,
  Unlink,
  UserCheck,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useElementWidth } from "@/hooks/use-element-width";
import { ConfirmDialog, EmptyState, StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { CONSULTATION_TYPE_LABELS } from "../buyer-requirements/-buyer-utils";
import { ProjectPlanHost } from "../customers/-project-plan-dialog";
import { openProjectPlan } from "../customers/-project-plan-store";
import { formatLedgerDate } from "../customers-table/-customer-inspector";
import { PersonLine, RailSection } from "../properties/-detail/rail";
import {
  DOC_WIDE_LAYOUT,
  DocProp,
  H2,
  nb,
  Tag,
  type TagTone,
} from "../properties/-detail/ui";
import {
  planQueryKey,
  useCommentSave,
  useProjectChangesFromOtherTabs,
  useProjectRemove,
  useProjectUpdate,
} from "./-project-hooks";
import {
  AssigneeField,
  CommentComposer,
  CommentSection,
  PrimaryContactField,
  SavedText,
} from "./-project-inspector";
import {
  getProjectStatus,
  getProjectTitle,
  mergeProjectConsultations,
  PROJECT_PERSON_ROLE_LABELS,
  PROJECT_STATUS_HINTS,
  PROJECT_STATUS_LABELS,
  type CommentDraftStore,
  type ProjectStatus,
} from "./-project-model";
import { RefreshFailedNote } from "./-project-notes";
import { LifecycleTag, ProjectStepDetail } from "./-project-step-detail";

/**
 * 프로젝트 상세.
 *
 * 이 화면의 물음: "이 손님의 일이 지금 어디까지 왔고, 그동안 무슨 일이 있었나."
 *
 * 부품은 매물 상세(properties/-detail)의 것을 쓴다(사용자 요청, 2026-11-22): 단추 nb · 꼬리표 Tag ·
 * 구역 제목 H2 · 오른쪽 열 RailSection · 사람 줄 PersonLine · 아래에 떠 있는 적는 칸.
 *
 * 머리는 Notion 문서처럼 읽힌다(사용자 요청, 같은 날): 큰 제목, 그 아래 속성을 한 줄씩(상태 · 대표 고객 ·
 * 담당 · 시작 · 의뢰 · 진행), 선, 그리고 본문(메모 → 진행 계획 카드 → 코멘트). 이름 · 요약 · 상태 ·
 * 진행을 점으로 이어 두 줄에 눌러 담은 고정 머리는 읽는 순서가 없다고 해서 바꿨다. 위에는 어디인지와
 * 자주 쓰는 작업만 있는 얇은 줄을 둔다. 오른쪽 고정 열은 사람 → 최근 상담이고, 화면이 좁으면 본문 안으로 들어온다.
 *
 * 옆 패널과 같은 부품을 쓴다. 다른 점은 진행 계획의 단계마다 담긴 것을 펼쳐 보여 주고(구함 의뢰의
 * 희망조건과 매칭된 매물, 내놓음 의뢰의 가격과 매칭된 손님, 거래의 합의 금액과 대금 일정 — 사용자 결정,
 * 2026-11-22), 손님들과의 상담을 읽어 와 함께 보여 준다는 것이다. 펼친 내용은 여기서 고치지 않는다. 상담은 사람에 달린 기록이라 여기서는
 * 읽기만 한다(프로젝트에 저장하지 않는다).
 */
export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetailPage,
});

/** 상담을 읽어 올 사람 수. 프로젝트의 사람은 대개 한둘이다. */
const CONSULTATION_PEOPLE = 4;
const CONSULTATIONS_PER_PERSON = 5;
const CONSULTATIONS_SHOWN = 6;

function ProjectDetailPage() {
  const { id } = Route.useParams();
  // 다른 탭(목록의 옆 패널 등)에서 이 프로젝트를 고치거나 풀면 다시 읽는다.
  // 풀렸으면 "찾을 수 없습니다"로 바뀐다. 화면이 어떤 상태든(불러오는 중 · 없음) 듣는다.
  useProjectChangesFromOtherTabs();
  const planQuery = useQuery({
    queryKey: planQueryKey(id),
    queryFn: () => api.projects.findOne(id),
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

  if (planQuery.isPending) {
    return (
      <PageShell onBack={backToList}>
        <div className="mx-auto w-full max-w-[1180px] space-y-4 px-10 pt-8">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-24 w-full max-w-[520px]" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  const isNotFound = planQuery.error instanceof ApiError && planQuery.error.statusCode === 404;
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

  // 프로젝트가 바뀌면 적던 칸과 열린 창을 새로 시작한다.
  return (
    <ProjectDetail
      key={id}
      plan={planQuery.data}
      // 앞서 읽은 것은 있는데 다시 읽다가 실패했다(없어진 것은 위에서 걸렀다). 예전 내용임을 알린다.
      refreshFailed={planQuery.isError}
      onRefresh={() => void planQuery.refetch()}
      onBack={backToList}
    />
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

const STATUS_TAG_TONE: Record<ProjectStatus, TagTone> = {
  preparing: "gray",
  active: "green",
  wrapping: "yellow",
  archived: "gray",
};

const PERSON_ROLE_TONE: Record<ProjectPerson["role"], "brown" | "gray" | "yellow"> = {
  primary: "brown",
  buyer: "gray",
  owner: "yellow",
};

function ProjectDetail({
  plan,
  refreshFailed,
  onRefresh,
  onBack,
}: {
  plan: ProjectPlan;
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
  const customerName = plan.people[0]?.name ?? null;
  const fallbackTitle = getProjectTitle({
    title: null,
    customerName,
    firstStepTitle: steps[0]?.title ?? null,
  });
  const displayTitle = plan.title?.trim() || fallbackTitle;
  const status = getProjectStatus({
    archivedAt: plan.archivedAt,
    stepCount: steps.length,
    doneStepCount: doneCount,
  });
  const openPlan = () => openProjectPlan({ kind: "case", projectId: plan.id, customerName });

  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const wide = rootWidth === 0 || rootWidth >= DOC_WIDE_LAYOUT;
  const mainRef = useRef<HTMLDivElement>(null);
  const revealLatestComment = () => {
    const scroller = mainRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };
  const focusComposer = () => {
    mainRef.current
      ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="코멘트 적기"]')
      ?.focus();
  };

  // 오른쪽 열(좁은 화면에서는 본문 안에 두 칸으로): 사람 → 그 사람들과의 최근 상담.
  // 프로젝트의 속성(상태 · 대표 고객 · 담당 · 시작 · 의뢰 · 진행)은 문서 머리에 있다.
  const rail = (
    <>
      <RailSection title="사람" count={plan.people.length} className="pt-0.5">
        <div data-project-people>
          {plan.people.length > 0 ? (
            <ul>
              {plan.people.map((person) => (
                <PersonLine
                  key={person.contactId}
                  contactId={person.contactId}
                  name={person.name}
                  role={PROJECT_PERSON_ROLE_LABELS[person.role]}
                  roleTone={PERSON_ROLE_TONE[person.role]}
                  phone={person.phone}
                />
              ))}
            </ul>
          ) : (
            <p className="break-keep rounded bg-[rgb(247,246,243)] px-2.5 py-2 text-[12.5px] leading-5 text-[#37352f]/65">
              대표 고객을 정하거나 의뢰를 담으면 여기에 사람이 나옵니다.
            </p>
          )}
        </div>
      </RailSection>

      <ProjectConsultations people={plan.people} />
    </>
  );

  return (
    <div
      ref={rootRef}
      data-project-detail
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
    >
      {/*
        위 줄 (Notion 문서의 위 줄과 같은 구실): 왼쪽은 어디인지(프로젝트 목록 / 이 프로젝트),
        오른쪽은 자주 쓰는 작업. 이름과 속성은 본문 맨 위에 문서처럼 적는다.
      */}
      <header
        data-project-detail-header
        className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#e9e9e7] bg-white pl-4 pr-5"
      >
        <nav aria-label="위치" className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
          <button type="button" className={nb.ghost} onClick={onBack}>
            <FolderKanban />
            프로젝트
          </button>
          <span className="text-[#37352f]/25">/</span>
          <span className="min-w-0 truncate px-2 text-[#37352f]" title={displayTitle}>
            {displayTitle}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
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
              disabled={update.isPending}
              onClick={() => update.mutate({ archived: true })}
            >
              <CircleCheck />
              끝내기
            </button>
          )}
          <button type="button" className={nb.solid} onClick={focusComposer}>
            <MessageSquarePlus />
            코멘트
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={nb.icon} aria-label={`${displayTitle} 작업 메뉴`}>
                <EllipsisVertical />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={openPlan}>
                <ListOrdered className="size-3.5" />
                진행 계획 고치기
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setIsRemoveOpen(true)}>
                <Unlink className="size-3.5" />
                프로젝트 풀기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* 진행 계획 창은 화면에 하나만 둔다. */}
      <ProjectPlanHost />

      <div className="flex min-h-0 flex-1">
        <div
          ref={mainRef}
          data-project-scroller
          className="relative flex min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-9 pb-6 pt-2">
            {refreshFailed && (
              <RefreshFailedNote what="최신 프로젝트 내용을" onRetry={onRefresh} className="mb-2" />
            )}

            {/* 문서의 머리: 제목, 그 아래 속성을 한 줄씩. Notion 문서와 같은 읽는 순서다. */}
            <SavedText
              label="프로젝트 이름"
              value={plan.title}
              placeholder={fallbackTitle}
              maxLength={100}
              className="-mx-1.5 mt-5 w-[calc(100%+12px)] rounded px-1.5 text-[32px] font-bold leading-[1.25] tracking-[-0.028em] text-[#37352f] placeholder:text-[#37352f]/35"
              onSave={(next) => update.mutate({ title: next })}
            />
            <dl data-project-props className="mt-3">
              <DocProp icon={<Flag />} label="상태">
                <span
                  data-project-status={status}
                  title={PROJECT_STATUS_HINTS[status]}
                  className="inline-flex px-1.5"
                >
                  <Tag tone={STATUS_TAG_TONE[status]} dot>
                    {PROJECT_STATUS_LABELS[status]}
                  </Tag>
                </span>
              </DocProp>
              <DocProp icon={<UserRound />} label="대표 고객">
                <PrimaryContactField
                  value={plan.primaryContact}
                  onChange={(contactId) => update.mutate({ primaryContactId: contactId })}
                />
                {plan.people.length > 1 && (
                  <span className="text-[13px] text-[#37352f]/45">
                    외 {plan.people.length - 1}명
                  </span>
                )}
              </DocProp>
              <DocProp icon={<UserCheck />} label="담당">
                <AssigneeField
                  value={plan.assignedTo}
                  options={assigneeOptions}
                  onChange={(userId) => update.mutate({ assignedToId: userId })}
                />
              </DocProp>
              <DocProp icon={<CalendarDays />} label="시작">
                <span className="px-1.5 tabular-nums">
                  {formatDate(plan.createdAt)}
                  {plan.archivedAt && (
                    <span className="text-[#37352f]/65"> → {formatDate(plan.archivedAt)} 끝냄</span>
                  )}
                </span>
              </DocProp>
              <DocProp icon={<House />} label="의뢰">
                <span className="flex items-center gap-1 px-1.5">
                  {buyerCount > 0 && <Tag>구함{buyerCount > 1 ? ` ${buyerCount}` : ""}</Tag>}
                  {listingCount > 0 && (
                    <Tag>내놓음{listingCount > 1 ? ` ${listingCount}` : ""}</Tag>
                  )}
                  {buyerCount + listingCount === 0 && (
                    <span className="text-[#37352f]/45">담은 의뢰 없음</span>
                  )}
                </span>
              </DocProp>
              <DocProp icon={<ListOrdered />} label="진행">
                <span className="flex min-w-0 items-baseline gap-2 px-1.5">
                  {steps.length > 0 ? (
                    <>
                      <b className="shrink-0 font-semibold tabular-nums">
                        {doneCount}/{steps.length}
                      </b>
                      <span className="min-w-0 truncate text-[#37352f]/65">
                        {nextStep ? `다음 · ${nextStep.title}` : "모든 단계가 끝났습니다"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#37352f]/45">정한 단계 없음</span>
                  )}
                </span>
              </DocProp>
            </dl>

            {/* 속성과 본문 사이의 선. 그 아래 첫 글이 메모다(이 프로젝트가 어떤 일인지 한두 줄). */}
            <div data-project-memo className="mt-3 border-t border-[#e9e9e7] pt-3">
              <SavedText
                multiline
                label="프로젝트 메모"
                value={plan.memo}
                placeholder="메모 — 이 프로젝트가 어떤 일인지 한두 줄 적어 두세요"
                maxLength={2000}
                className="-mx-1.5 w-[calc(100%+12px)] rounded px-1.5 py-1 text-[15px] leading-[1.65] text-[#37352f] placeholder:text-[#37352f]/45"
                onSave={(next) => update.mutate({ memo: next })}
              />
            </div>

            <section data-project-plan id="plan">
              <H2
                title="진행 계획"
                count={steps.length}
                hint="순서는 직접 정합니다"
                action={
                  <button type="button" className={nb.ghost} onClick={openPlan}>
                    <ListOrdered />
                    {steps.length > 0 ? "진행 계획 고치기" : "의뢰 담기"}
                  </button>
                }
              />
              {steps.length > 0 ? (
                <ol className="mt-2.5 grid gap-3">
                  {steps.map((step) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      order={orders.indexOf(step.sortOrder) + 1}
                    />
                  ))}
                </ol>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md px-4 py-3.5 text-[13px] text-[#37352f]/65 shadow-[0_0_0_1px_#e9e9e7]">
                  <span>
                    아직 담은 의뢰나 정한 단계가 없습니다. 이 손님의 구함·내놓음 의뢰를 담고 순서를
                    정해 두세요.
                  </span>
                  <button type="button" className={nb.line} onClick={openPlan}>
                    <Plus />
                    의뢰 담기
                  </button>
                </div>
              )}
            </section>

            {!wide && (
              <div data-project-rail="inline" className="mt-6 grid items-start gap-x-6 sm:grid-cols-2">
                {rail}
              </div>
            )}

            <CommentSection projectId={plan.id} variant="page" />
          </div>

          {/* 적는 자리는 본문 아래에 떠 있다 (매물 상세의 상담 적는 칸과 같은 자리 · 같은 모양) */}
          <div
            data-composer-dock
            className="pointer-events-none sticky bottom-0 z-[5] bg-gradient-to-b from-white/0 via-white via-40% to-white px-9 pb-3.5 pt-[18px]"
          >
            <div className="pointer-events-auto mx-auto max-w-[828px] rounded-[10px] bg-white px-3 py-1.5 shadow-[0_0_0_1px_rgba(15,15,15,0.08),0_6px_18px_rgba(15,15,15,0.08)]">
              <CommentComposer
                projectId={plan.id}
                variant="page"
                drafts={commentDrafts}
                onSave={saveComment.mutate}
                onSaved={revealLatestComment}
              />
            </div>
          </div>
        </div>

        {wide && (
          <aside
            data-project-rail="side"
            aria-label="프로젝트 정보와 사람"
            className="w-[344px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white"
          >
            <div className="px-[18px] pb-14 pt-3">{rail}</div>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={isRemoveOpen}
        onOpenChange={setIsRemoveOpen}
        title="프로젝트를 풀까요?"
        description="프로젝트와 진행 계획, 여기에 적은 코멘트가 지워집니다. 담겨 있던 의뢰와 거래는 그대로 남습니다."
        confirmLabel="풀기"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

const STEP_KIND_LABEL: Record<ProjectStep["kind"], string | null> = {
  listing_intake: "내놓음 의뢰",
  buyer_intake: "구함 의뢰",
  deal: "거래",
  manual: null,
};

/**
 * 진행 계획의 한 단계. 매물 상세의 거래 조건 카드와 같은 테두리 카드다:
 * 위 줄에 차례 · 이름 · 종류 · 지금 상태, 아래에 그 단계에 담긴 것(희망조건 · 가격 · 매칭 · 거래).
 */
function StepCard({ step, order }: { step: ProjectStep; order: number }) {
  const kindLabel = STEP_KIND_LABEL[step.kind];
  const hasDetail = step.kind !== "manual";
  return (
    <li data-project-step>
      <article
        className={cn(
          "rounded-md bg-white px-4 shadow-[0_0_0_1px_#e9e9e7]",
          hasDetail ? "pb-3 pt-3" : "py-2.5",
          step.done && "bg-[#fbfbfa]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid size-[22px] shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
              step.done ? "bg-[rgb(219,237,219)] text-[rgb(28,56,41)]" : "bg-[#f1f0ec] text-[#6f6e69]",
            )}
            title={step.done ? "끝난 단계" : undefined}
          >
            {order}
          </span>
          <h3
            className={cn(
              "min-w-0 truncate text-[15px] font-semibold leading-[1.4] text-[#37352f]",
              step.done && "font-medium text-[#37352f]/65",
            )}
            title={step.title}
          >
            {step.title}
          </h3>
          {kindLabel && <Tag className="text-[12px]">{kindLabel}</Tag>}
          <span className="flex-1" />
          <StepStateTag step={step} />
        </div>
        {(step.memo || (hasDetail && step.targetDate)) && (
          <p className="ml-8 mt-1 whitespace-pre-wrap break-keep text-[13px] leading-[1.55] text-[#37352f]/65">
            {hasDetail && step.targetDate && (
              <span className="mr-2 tabular-nums">{formatLedgerDate(step.targetDate)} 목표</span>
            )}
            {step.memo}
          </p>
        )}
        {hasDetail && (
          <div className="ml-8 mt-2.5 border-t border-[#e9e9e7] pt-2.5">
            <ProjectStepDetail step={step} />
          </div>
        )}
      </article>
    </li>
  );
}

/** 단계의 지금 상태. 거래가 있으면 거래 단계, 없으면 의뢰의 진행 · 보류 · 종료, 직접 적은 단계는 완료나 목표일. */
function StepStateTag({ step }: { step: ProjectStep }) {
  if (step.deal) {
    return step.deal.isCancelled ? (
      <Tag>거래 취소</Tag>
    ) : (
      <StatusBadge kind="dealStage" status={step.deal.stage} size="sm" />
    );
  }
  const lifecycle = step.listingIntake?.lifecycleStatus ?? step.buyerIntake?.lifecycleStatus;
  if (lifecycle) return <LifecycleTag status={lifecycle} />;
  if (step.done) {
    return (
      <Tag tone="green" dot>
        완료
      </Tag>
    );
  }
  return step.targetDate ? (
    <span className="shrink-0 text-[13px] tabular-nums text-[#37352f]/65">
      {formatLedgerDate(step.targetDate)} 목표
    </span>
  ) : null;
}

/**
 * 이 프로젝트 사람들과의 최근 상담. 상담은 사람에 달린 기록이라 프로젝트에 저장하지 않고, 볼 때 읽어 온다.
 * 그래서 이 프로젝트와 상관없는 상담도 섞여 있을 수 있다(같은 손님과의 다른 이야기).
 */
function ProjectConsultations({ people }: { people: ProjectPerson[] }) {
  const targets = people.slice(0, CONSULTATION_PEOPLE);
  const queries = useQueries({
    queries: targets.map((person) => ({
      queryKey: ["consultations", "project-person", person.contactId],
      queryFn: () =>
        api.consultations.findAll({
          contactId: person.contactId,
          page: 1,
          limit: CONSULTATIONS_PER_PERSON,
        }),
    })),
  });
  const isPending = queries.some((query) => query.isPending);
  const failed = queries.filter((query) => query.isError);
  const consultations = mergeProjectConsultations(
    targets.map((person, index) => ({ person, items: queries[index]?.data?.items ?? [] })),
  ).slice(0, CONSULTATIONS_SHOWN);

  if (targets.length === 0) return null;

  return (
    <RailSection title="최근 상담">
      <div data-project-consultations>
        {isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : consultations.length === 0 && failed.length === 0 ? (
          <p className="py-1 text-[13px] text-[#37352f]/65">이 사람들과 남긴 상담 기록이 없습니다.</p>
        ) : (
          <ol>
            {consultations.map(({ person, consultation }) => (
              <li
                key={consultation.id}
                className="py-2 [&+&]:border-t [&+&]:border-[#37352f]/[0.06]"
              >
                <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-[18px] text-[#37352f]/65">
                  <span className="tabular-nums">{formatLedgerDate(consultation.createdAt)}</span>
                  <span>{CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type}</span>
                  <span className="text-[#37352f]/25">·</span>
                  <Link
                    to="/contacts/$id"
                    params={{ id: person.contactId }}
                    className="min-w-0 truncate font-medium text-[#37352f] underline-offset-2 hover:underline"
                  >
                    {person.name}
                  </Link>
                </div>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-keep text-[13.5px] leading-5 text-[#37352f]/90 [overflow-wrap:anywhere]">
                  {consultation.content}
                </p>
              </li>
            ))}
          </ol>
        )}
        {failed.length > 0 && (
          <p className="mt-1 text-[12.5px] leading-5 text-[rgb(203,107,31)]">
            일부 상담을 불러오지 못했습니다.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-[#37352f]"
              onClick={() => failed.forEach((query) => void query.refetch())}
            >
              다시 시도
            </button>
          </p>
        )}
        <p className="mt-1.5 break-keep text-[12.5px] leading-[18px] text-[#37352f]/45">
          상담은 손님에게 적는 기록입니다. 이름을 눌러 그 손님의 연락처에서 적고 모두 봅니다.
        </p>
      </div>
    </RailSection>
  );
}
