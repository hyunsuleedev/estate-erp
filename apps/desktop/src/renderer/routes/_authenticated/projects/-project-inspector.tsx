import { Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ProjectComment,
  ProjectListItem,
  ProjectPerson,
  ProjectPlan,
  UpdateProjectDto,
} from "@estate-erp/api-client";
import {
  CalendarDays,
  ChevronsUpDown,
  CircleCheck,
  EllipsisVertical,
  ListOrdered,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Unlink,
  UserCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/format";
import { announceProjectChange } from "@/lib/project-sync";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useInspectorFocus } from "@/hooks/use-inspector-focus";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { tabResourceKeys } from "@/features/tabs/lib/tabResource";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { useAuth } from "@/providers/auth-provider";
import { openProjectPlan } from "../customers/-project-plan-store";
import {
  formatLedgerDate,
  ProjectStepState,
} from "../customers-table/-customer-inspector";
import { LedgerSideTag } from "../customers-table/-ledger-chips";
import {
  commentsQueryKey,
  errorMessage,
  planQueryKey,
  useProjectRemove,
  useProjectUpdate,
} from "./-project-hooks";
import { RefreshFailedNote } from "./-project-notes";
import { ProjectStatusChip } from "./-project-status-chip";
import {
  Avatar as DetailAvatar,
  H2 as DetailH2,
  Kbd as DetailKbd,
  nb as detailButton,
} from "../properties/-detail/ui";
import {
  EmptyText,
  PropertyInspectorToolbar,
  SectionTitle,
  TextAction,
} from "../properties/-components/property-inspector-view";
import {
  COMMENT_SAVE_MUTATION_KEY,
  decideTextCommit,
  getProjectStatus,
  getProjectTitle,
  mergeCommentPages,
  PROJECT_PERSON_ROLE_LABELS,
  type CommentDraftStore,
  type CommentSaveRequest,
} from "./-project-model";

export const PROJECT_INSPECTOR_ID = "project-inspector";
/** 고객 원장 · 연락처 패널과 같은 너비 */
const PROJECT_INSPECTOR_WIDTH = 584;
const MAX_COMMENT_LENGTH = 5000;
/** 남이 적은 코멘트도 지울 수 있는 역할 (서버와 같다) */
const MODERATOR_ROLES = ["owner", "manager"];

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';


const rowLinkClassName =
  "block truncate text-sm font-medium text-[#2f2e2a] underline-offset-2 hover:underline";
/** 속성 줄의 값 자리에 놓는 단추: 평소에는 글자처럼 보이고 올리면 칸이 드러난다 */
const propertyValueButtonClassName =
  "inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[13px] text-foreground hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#2383e2] disabled:pointer-events-none disabled:opacity-60";

/** "11.21 14:05" (올해가 아니면 연도까지) */
function formatCommentTime(value: string) {
  const date = new Date(value);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${formatLedgerDate(value)} ${time}`;
}

/** "14:05" — 날짜 줄 아래에서는 시각만 적는다 */
function formatClock(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function useIsSavingComment(projectId: string) {
  return (
    useIsMutating({
      mutationKey: COMMENT_SAVE_MUTATION_KEY,
      predicate: (mutation) =>
        (mutation.state.variables as CommentSaveRequest | undefined)?.projectId === projectId,
    }) > 0
  );
}

export function ProjectInspector({
  project,
  closing,
  animate,
  assigneeOptions,
  drafts,
  onClose,
  onExited,
  onSaveComment,
}: {
  /** 목록의 그 줄. 패널은 이것으로 바로 그리고, 자세한 것은 따로 읽는다. */
  project: ProjectListItem;
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  assigneeOptions: ReadonlyArray<{ value: string; label: string }>;
  drafts: CommentDraftStore;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  onSaveComment: (request: CommentSaveRequest) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  // 키보드로 열었을 때(미끄러짐 없이 열림)만 포커스를 패널로 옮긴다
  useInspectorFocus(panelRef, !animate, project.id);

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  // Esc는 안쪽부터 닫는다: 떠 있는 창·메뉴 → 적고 있는 칸(그 칸이 직접 되돌린다) → 패널
  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      const active = document.activeElement;
      if (
        (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
        panelRef.current?.contains(active)
      ) {
        return;
      }
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [onClose]);

  const planQuery = useQuery({
    queryKey: planQueryKey(project.id),
    queryFn: () => api.projects.findOne(project.id),
  });
  const plan = planQuery.data;

  const update = useProjectUpdate(project.id);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const remove = useProjectRemove(project.id, () => {
    setIsRemoveOpen(false);
    onClose(false);
  });

  // 연락처·매물관리 패널과 같다: 전체 화면을 새 탭으로 열고(이미 열려 있으면 그 탭으로 가고) 패널은 닫는다.
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const openInNewTab = () => {
    const route = `/projects/${project.id}`;
    const meta = getRouteMeta(route);
    openOrRevealResource({
      route,
      kind: meta.kind,
      title: getProjectTitle({ ...project, title: plan?.title ?? project.title }) || meta.title,
      resourceKey: tabResourceKeys.entity("project", project.id),
    });
    onClose(false);
  };

  const title = plan?.title ?? project.title;
  const archivedAt = plan ? plan.archivedAt : project.archivedAt;
  const displayTitle = getProjectTitle({ ...project, title });

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      id={PROJECT_INSPECTOR_ID}
      data-project-inspector
      data-property-inspector
      data-state={closing ? "closed" : "open"}
      data-motion={animate ? "slide" : "none"}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="프로젝트 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      style={{ width: PROJECT_INSPECTOR_WIDTH, maxWidth: "100%" }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "transform") {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar
        onClose={onClose}
        onOpenNewTab={openInNewTab}
        headerActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${displayTitle} 작업 메뉴`}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {archivedAt ? (
                <DropdownMenuItem onSelect={() => update.mutate({ archived: false })}>
                  <RotateCcw className="size-3.5" />
                  다시 열기
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => update.mutate({ archived: true })}>
                  <CircleCheck className="size-3.5" />
                  끝내기
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setIsRemoveOpen(true)}
              >
                <Unlink className="size-3.5" />
                프로젝트 풀기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <ProjectInspectorContent
        project={project}
        plan={plan}
        isPlanPending={planQuery.isPending}
        isPlanError={planQuery.isError}
        onRetryPlan={() => void planQuery.refetch()}
        assigneeOptions={assigneeOptions}
        drafts={drafts}
        onUpdate={update.mutate}
        onSaveComment={onSaveComment}
      />

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
    </aside>
  );
}

function ProjectInspectorContent({
  project,
  plan,
  isPlanPending,
  isPlanError,
  onRetryPlan,
  assigneeOptions,
  drafts,
  onUpdate,
  onSaveComment,
}: {
  project: ProjectListItem;
  plan: ProjectPlan | undefined;
  isPlanPending: boolean;
  isPlanError: boolean;
  onRetryPlan: () => void;
  assigneeOptions: ReadonlyArray<{ value: string; label: string }>;
  drafts: CommentDraftStore;
  onUpdate: (dto: UpdateProjectDto) => void;
  onSaveComment: (request: CommentSaveRequest) => void;
}) {
  // 자세한 것이 오기 전에는 목록의 줄로 그린다.
  const title = plan ? plan.title : project.title;
  const memo = plan ? plan.memo : project.memo;
  const archivedAt = plan ? plan.archivedAt : project.archivedAt;
  const primaryContact = plan ? plan.primaryContact : project.primaryContact;
  const assignedTo = plan ? plan.assignedTo : project.assignedTo;
  const customerName = plan ? (plan.people[0]?.name ?? null) : project.customerName;
  const fallbackTitle = getProjectTitle({
    title: null,
    customerName,
    firstStepTitle: project.firstStepTitle,
  });

  const steps = useMemo(
    () => [...(plan?.steps ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [plan?.steps],
  );
  // 같은 번호는 동시 진행이다. 번호는 1부터 다시 매겨 보여 준다.
  const orders = useMemo(() => [...new Set(steps.map((step) => step.sortOrder))], [steps]);
  const buyerCount = plan
    ? plan.steps.filter((step) => step.kind === "buyer_intake").length
    : project.buyerIntakeCount;
  const listingCount = plan
    ? plan.steps.filter((step) => step.kind === "listing_intake").length
    : project.listingIntakeCount;

  const openPlan = () =>
    openProjectPlan({ kind: "case", projectId: project.id, customerName });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const revealLatestComment = () => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* 머리 영역: 이름 → 속성(대표 고객 · 담당 · 시작) → 상태와 구분 */}
      <div className="shrink-0 border-b border-[#ecebe8] px-6 pb-4">
        <SavedText
          label="프로젝트 이름"
          value={title}
          placeholder={fallbackTitle}
          maxLength={100}
          className="-mx-1.5 w-[calc(100%+12px)] rounded-[6px] px-1.5 text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a] placeholder:text-[#b4b2ad]"
          onSave={(next) => onUpdate({ title: next })}
        />
        <dl className="mt-2.5 grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-[13px]">
          <PropertyLabel icon={<UserRound />}>대표 고객</PropertyLabel>
          <dd className="flex min-w-0 items-center gap-2">
            <PrimaryContactField
              value={primaryContact}
              onChange={(contactId) => onUpdate({ primaryContactId: contactId })}
            />
            {primaryContact?.phone && (
              <a
                href={`tel:${primaryContact.phone}`}
                className="shrink-0 tabular-nums text-[#5f5e5b] underline-offset-2 hover:underline"
              >
                {formatPhone(primaryContact.phone)}
              </a>
            )}
          </dd>
          <PropertyLabel icon={<UserCheck />}>담당</PropertyLabel>
          <dd className="min-w-0">
            <AssigneeField
              value={assignedTo}
              options={assigneeOptions}
              onChange={(userId) => onUpdate({ assignedToId: userId })}
            />
          </dd>
          <PropertyLabel icon={<CalendarDays />}>시작</PropertyLabel>
          <dd className="px-1.5 tabular-nums text-foreground">
            {formatLedgerDate(project.createdAt)}
            {archivedAt && (
              <span className="text-muted-foreground"> → {formatLedgerDate(archivedAt)} 끝냄</span>
            )}
          </dd>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ProjectStatusChip
            status={getProjectStatus({
              archivedAt,
              stepCount: plan ? plan.steps.length : project.stepCount,
              doneStepCount: plan
                ? plan.steps.filter((step) => step.done).length
                : project.doneStepCount,
            })}
          />
          {buyerCount > 0 && <LedgerSideTag side="buy" />}
          {listingCount > 0 && <LedgerSideTag side="sell" />}
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-project-scroller
        className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-8 pt-5"
      >
        <section data-project-memo>
          <SectionTitle>메모</SectionTitle>
          <SavedText
            multiline
            label="프로젝트 메모"
            value={memo}
            placeholder="이 프로젝트가 어떤 일인지 한두 줄로 적어 두세요."
            maxLength={2000}
            className="-mx-1.5 w-[calc(100%+12px)] rounded-[6px] px-1.5 py-1 text-[13.5px] leading-[1.6] text-foreground placeholder:text-[#a9a7a1]"
            onSave={(next) => onUpdate({ memo: next })}
          />
        </section>

        {isPlanError && !plan ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[#fbfaf8] px-3 py-2.5 text-[12.5px] text-muted-foreground">
            사람들과 진행 계획을 불러오지 못했습니다.
            <Button variant="outline" size="xs" onClick={onRetryPlan}>
              다시 시도
            </Button>
          </div>
        ) : (
          <>
            {/* 앞서 읽은 것은 있는데 다시 읽다가 실패했다. 예전 내용일 수 있음을 알린다. */}
            {isPlanError && plan && (
              <RefreshFailedNote what="최신 프로젝트 내용을" onRetry={onRetryPlan} />
            )}
            <section data-project-people>
              <SectionTitle count={plan?.people.length || undefined}>사람</SectionTitle>
              {isPlanPending ? (
                <Skeleton className="h-9 w-full" />
              ) : plan && plan.people.length > 0 ? (
                <div className="divide-y divide-[#f1f0ec]">
                  {plan.people.map((person) => (
                    <PersonRow key={person.contactId} person={person} />
                  ))}
                </div>
              ) : (
                <EmptyText>대표 고객을 정하거나 의뢰를 담으면 여기에 사람이 나옵니다.</EmptyText>
              )}
            </section>

            <section data-project-plan>
              <SectionTitle
                count={steps.length || undefined}
                action={
                  <TextAction
                    icon={<ListOrdered />}
                    label={steps.length > 0 ? "진행 계획 고치기" : "의뢰 담기"}
                    onClick={openPlan}
                  />
                }
              >
                진행 계획
              </SectionTitle>
              {isPlanPending ? (
                <Skeleton className="h-16 w-full" />
              ) : steps.length > 0 ? (
                <ol className="space-y-1.5">
                  {steps.map((step) => (
                    <li key={step.id} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                      <span className="grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] tabular-nums text-muted-foreground shadow-[inset_0_0_0_1px_#dcdad6]">
                        {orders.indexOf(step.sortOrder) + 1}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          step.done && "text-muted-foreground",
                        )}
                        title={step.title}
                      >
                        {step.title}
                      </span>
                      <ProjectStepState step={step} />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyText>
                  아직 담은 의뢰나 정한 단계가 없습니다. 이 손님의 구함·내놓음 의뢰를 담고 순서를
                  정해 두세요.
                </EmptyText>
              )}
            </section>
          </>
        )}

        <CommentSection projectId={project.id} />
      </div>

      {/* 아래 막대: 코멘트를 적는 자리는 늘 열려 있다. */}
      <div className="shrink-0 border-t border-[#ecebe8] px-6 py-3">
        <CommentComposer
          projectId={project.id}
          drafts={drafts}
          onSave={onSaveComment}
          onSaved={revealLatestComment}
        />
      </div>
    </div>
  );
}

export function PropertyLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <dt className="inline-flex h-7 items-center gap-1.5 text-muted-foreground [&>svg]:size-3.5 [&>svg]:text-[#a9a7a1]">
      {icon}
      {children}
    </dt>
  );
}

/**
 * 누르면 그 자리에서 고치는 글 칸. 칸을 벗어나면(또는 한 줄 칸에서 Enter) 저장하고, Esc는 되돌린다.
 *
 * - 고치는 중에는 바깥 값을 따라가지 않는다: 다른 탭이 고친 값이나 저장 응답이 적던 글을 덮지 않는다.
 * - 저장할지는 칸에 들어갈 때의 값 · 적은 글 · 지금 값을 견줘 정한다(decideTextCommit).
 *   손대지 않고 나왔는데 그 사이에 다른 곳에서 바뀌었으면 바뀐 값을 받아들이고 저장하지 않는다
 *   (예전 글로 새 값을 덮어쓰지 않는다). 양쪽에서 바뀌었으면 덮지 않고 어느 쪽을 남길지 묻는다.
 */
export function SavedText({
  label,
  value,
  placeholder,
  maxLength,
  multiline = false,
  className,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
  className?: string;
  onSave: (next: string | null) => void;
}) {
  const current = value ?? "";
  const [draft, setDraft] = useState(current);
  const [editing, setEditing] = useState(false);
  // 이 칸에서도 바꾸고 다른 곳에서도 바뀌었다. 사용자가 고를 때까지 적은 글을 그대로 둔다.
  const [conflict, setConflict] = useState(false);
  // 이 칸이 딛고 선 값: 칸에 들어갈 때의 값이고, 내가 보낸 저장이 반영되면 그 값으로 옮긴다.
  const base = useRef(current);
  // 내가 마지막으로 보낸 글. 지금 값이 이것으로 바뀌면 다른 곳의 변경이 아니라 내 저장의 결과다.
  const lastSent = useRef<string | null>(null);
  // Esc로 되돌린 뒤 따라오는 blur가 저장하지 않게 한다.
  const cancelled = useRef(false);
  useEffect(() => {
    // 저장한 글은 응답을 기다리지 않고 바로 지금 값이 된다. 그 순간 칸에 다시 들어와 있을 수 있으므로
    // 딛고 선 값을 옮겨 둔다(옮기지 않으면 이어서 고친 글이 "양쪽에서 바뀜"으로 오인된다).
    if (lastSent.current !== null && current.trim() === lastSent.current) {
      base.current = current;
      lastSent.current = null;
    }
  }, [current]);
  useEffect(() => {
    if (!editing && !conflict) setDraft(current);
  }, [conflict, current, editing]);

  const save = (text: string) => {
    lastSent.current = text;
    onSave(text || null);
  };

  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      setConflict(false);
      setDraft(current);
      return;
    }
    const decision = decideTextCommit({ draft, base: base.current, current });
    if (decision.kind === "conflict") {
      setConflict(true);
      return;
    }
    setConflict(false);
    if (decision.kind === "adopt") setDraft(current);
    if (decision.kind === "save") save(decision.value);
  };

  const shared = {
    "aria-label": label,
    value: draft,
    placeholder,
    maxLength,
    onFocus: () => {
      // 다시 들어오면 지금 값 위에서 고치는 것으로 본다.
      base.current = current;
      setEditing(true);
    },
    onBlur: commit,
    className: cn(
      "block bg-transparent outline-none transition-colors hover:bg-[rgba(55,53,47,0.04)] focus:bg-[rgba(55,53,47,0.04)]",
      className,
    ),
  };

  const field = multiline ? (
    <textarea
      {...shared}
      rows={1}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={cn(shared.className, "min-h-[30px] resize-none [field-sizing:content]")}
    />
  ) : (
    <input
      {...shared}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );

  return (
    <>
      {field}
      {conflict && !editing && (
        <p
          role="alert"
          data-saved-text-conflict
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#8f6b1f]"
        >
          다른 곳에서 이 칸이 바뀌었습니다. 저장하지 않았습니다.
          <button
            type="button"
            className="rounded-sm underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setConflict(false);
              save(draft.trim());
            }}
          >
            내가 적은 것으로 저장
          </button>
          <button
            type="button"
            className="rounded-sm underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setConflict(false);
              setDraft(current);
            }}
          >
            바뀐 내용으로 두기
          </button>
        </p>
      )}
    </>
  );
}

/** 대표 고객: 연락처를 찾아 고르거나 비운다. 누구의 일인지는 사용자가 정한다. */
export function PrimaryContactField({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (contactId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["contacts", { search, limit: 8 }],
    queryFn: () => api.contacts.findAll({ search: search || undefined, limit: 8 }),
    enabled: open,
  });
  const contacts = data?.items ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={value ? `대표 고객 ${value.name}, 바꾸기` : "대표 고객 정하기"}
          className={propertyValueButtonClassName}
        >
          {value ? (
            <span className="truncate font-medium">{value.name}</span>
          ) : (
            <span className="text-[#a9a7a1]">정하지 않음</span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 text-[#a9a7a1]" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="이름·전화번호 검색" />
          <CommandList>
            <CommandEmpty>{isLoading ? "검색 중..." : "검색 결과가 없습니다."}</CommandEmpty>
            {contacts.map((contact) => (
              <CommandItem
                key={contact.id}
                value={contact.id}
                onSelect={() => {
                  if (contact.id !== value?.id) onChange(contact.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{contact.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatPhone(contact.phone)}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        {value && (
          <div className="border-t p-1">
            <button
              type="button"
              className="flex h-8 w-full items-center rounded-sm px-2 text-left text-[13px] text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              대표 고객 비우기
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AssigneeField({
  value,
  options,
  onChange,
}: {
  value: { id: string; name: string } | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (userId: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={value ? `담당 ${value.name}, 바꾸기` : "담당 정하기"}
          className={propertyValueButtonClassName}
        >
          {value ? (
            <span className="truncate">{value.name}</span>
          ) : (
            <span className="text-[#a9a7a1]">담당 없음</span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 text-[#a9a7a1]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] w-48 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              if (option.value !== value?.id) onChange(option.value);
            }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
        {value && (
          <>
            {options.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onChange(null)}>담당 없음</DropdownMenuItem>
          </>
        )}
        {options.length === 0 && !value && (
          <p className="px-2 py-2 text-[12px] text-muted-foreground">
            고를 수 있는 직원이 없습니다.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 프로젝트의 한 사람: 이름(연락처 화면으로) · 어떻게 걸려 있나 · 전화 */
export function PersonRow({ person }: { person: ProjectPerson }) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-2">
      <Link
        to="/contacts/$id"
        params={{ id: person.contactId }}
        className={cn(rowLinkClassName, "min-w-0 shrink")}
      >
        {person.name}
      </Link>
      <span className="min-w-0 truncate text-[12px] text-muted-foreground">
        {PROJECT_PERSON_ROLE_LABELS[person.role]}
      </span>
      {person.phone ? (
        <a
          href={`tel:${person.phone}`}
          className="ml-auto shrink-0 text-[13px] tabular-nums text-[#5f5e5b] underline-offset-2 hover:underline"
        >
          {formatPhone(person.phone)}
        </a>
      ) : (
        <span className="ml-auto shrink-0 text-[12px] text-[#a9a7a1]">전화번호 없음</span>
      )}
    </div>
  );
}

// ── 코멘트 ─────────────────────────────────────────────────────

/**
 * 프로젝트에 적는 코멘트. 직원이 이 일에 대해 적어 두는 글이다.
 * 손님과 나눈 대화는 여기가 아니라 그 손님의 상담에 적는다.
 */
/** panel: 옆 패널(매물관리 패널과 같은 모양). page: 상세 페이지(매물 상세 2판의 "기록"과 같은 모양). */
export type ProjectPartVariant = "panel" | "page";

export function CommentSection({
  projectId,
  variant = "panel",
}: {
  projectId: string;
  variant?: ProjectPartVariant;
}) {
  const page = variant === "page";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // 최근 쪽부터 받고, "이전 코멘트 더 보기"로 더 오래된 쪽을 끝까지 이어 받는다.
  const commentsQuery = useInfiniteQuery({
    queryKey: commentsQueryKey(projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.projects.comments(projectId, { before: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });
  const comments = useMemo(
    () => mergeCommentPages(commentsQuery.data?.pages),
    [commentsQuery.data?.pages],
  );
  const total = commentsQuery.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = commentsQuery;

  // 더 오래된 코멘트가 위에 붙어도 보던 자리가 밀리지 않게, 붙기 전의 아래쪽 거리를 지킨다.
  const listRef = useRef<HTMLOListElement>(null);
  const loadOlder = async () => {
    const scroller = listRef.current?.closest<HTMLElement>("[data-project-scroller]");
    const fromBottom = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
    await fetchNextPage();
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight - fromBottom;
    });
  };

  // 코멘트를 고치거나 지운 뒤: 이 탭의 목록을 새로 받고 다른 탭에도 알린다.
  const refresh = () => {
    announceProjectChange("changed", projectId);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] }),
    ]);
  };

  const [removing, setRemoving] = useState<ProjectComment | null>(null);
  const remove = useMutation({
    mutationFn: (commentId: string) => api.projects.removeComment(projectId, commentId),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "코멘트를 지우지 못했습니다."));
    },
  });

  return (
    <section data-project-comments id={page ? "comments" : undefined}>
      {page ? (
        <DetailH2 title="코멘트" count={total} hint="직원끼리 남기는 글" />
      ) : (
        <SectionTitle count={total || undefined}>코멘트</SectionTitle>
      )}
      {commentsQuery.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : commentsQuery.isError && comments.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-[#fbfaf8] px-3 py-2.5 text-[12.5px] text-muted-foreground">
          코멘트를 불러오지 못했습니다.
          <Button variant="outline" size="xs" onClick={() => void commentsQuery.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : comments.length === 0 ? (
        page ? (
          <p className="text-[14px] text-[#37352f]/45">
            아직 적은 코멘트가 없습니다. 진행하면서 알게 된 것, 다음에 할 일을 아래에 적어 두세요.
          </p>
        ) : (
          <EmptyText>
            아직 적은 코멘트가 없습니다. 진행하면서 알게 된 것, 다음에 할 일을 아래에 적어 두세요.
          </EmptyText>
        )
      ) : (
        <>
          {commentsQuery.isError && !isFetchNextPageError && (
            <RefreshFailedNote
              what="최신 코멘트를"
              onRetry={() => void commentsQuery.refetch()}
              className="mb-1.5"
            />
          )}
          {hasNextPage && (
            <div className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
              <button
                type="button"
                data-project-comments-older
                disabled={isFetchingNextPage}
                className="rounded-sm underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none"
                onClick={() => void loadOlder()}
              >
                {isFetchingNextPage
                  ? "불러오는 중"
                  : isFetchNextPageError
                    ? "이전 코멘트를 불러오지 못했습니다. 다시 시도"
                    : "이전 코멘트 더 보기"}
              </button>
              <span className="tabular-nums">
                {comments.length} / {total}
              </span>
            </div>
          )}
          <ol ref={listRef} className={page ? undefined : "divide-y divide-[#f1f0ec]"}>
            {comments.map((comment, index) => (
              <CommentRow
                key={comment.id}
                projectId={projectId}
                comment={comment}
                variant={variant}
                // 상세 페이지는 날짜가 바뀌는 곳에 날짜 줄을 넣는다(매물 상세의 기록과 같다).
                dateHeading={
                  page &&
                  (index === 0 ||
                    formatDate(comments[index - 1].createdAt) !== formatDate(comment.createdAt))
                    ? formatDate(comment.createdAt)
                    : null
                }
                canEdit={comment.author?.id === user?.id}
                canRemove={
                  comment.author?.id === user?.id ||
                  MODERATOR_ROLES.includes(user?.role ?? "")
                }
                onRemove={() => setRemoving(comment)}
                onChanged={refresh}
              />
            ))}
          </ol>
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="코멘트를 지울까요?"
        description="지운 코멘트는 되돌릴 수 없습니다."
        confirmLabel="지우기"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
    </section>
  );
}

function CommentRow({
  projectId,
  comment,
  variant,
  dateHeading,
  canEdit,
  canRemove,
  onRemove,
  onChanged,
}: {
  projectId: string;
  comment: ProjectComment;
  variant: ProjectPartVariant;
  /** 이 줄 위에 넣을 날짜. 상세 페이지에서 날짜가 바뀌는 줄에만 온다. */
  dateHeading: string | null;
  canEdit: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const save = useMutation({
    mutationFn: (body: string) => api.projects.updateComment(projectId, comment.id, body),
    onSuccess: async () => {
      await onChanged();
      setEditing(false);
    },
    onError: (error) => {
      toast.error(errorMessage(error, "코멘트를 고치지 못했습니다. 적은 글은 남아 있습니다."));
    },
  });
  // 1초 넘게 차이 나면 고친 글로 본다(만들 때 두 시각이 조금 어긋날 수 있다).
  const wasEdited =
    new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;
  const trimmed = draft.trim();

  const page = variant === "page";
  const authorName = comment.author?.name ?? "지워진 직원";
  const actionButtonClassName = page
    ? cn(detailButton.icon, "size-6 [&_svg]:size-3.5")
    : "inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground";

  const actions = !editing && (canEdit || canRemove) && (
    <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 [@media(hover:none)]:opacity-100">
      {canEdit && (
        <button
          type="button"
          aria-label="코멘트 고치기"
          className={actionButtonClassName}
          onClick={() => {
            setDraft(comment.body);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {canRemove && (
        <button
          type="button"
          aria-label="코멘트 지우기"
          className={actionButtonClassName}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </span>
  );

  const body = editing ? (
    <form
      className="mt-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || save.isPending) return;
        if (trimmed === comment.body) {
          setEditing(false);
          return;
        }
        save.mutate(trimmed);
      }}
    >
      <textarea
        autoFocus
        aria-label="코멘트 고치기"
        value={draft}
        maxLength={MAX_COMMENT_LENGTH}
        readOnly={save.isPending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.stopPropagation();
            setEditing(false);
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className={cn(
          "block max-h-[220px] min-h-[60px] w-full resize-none outline-none [field-sizing:content]",
          page
            ? "rounded px-2.5 py-2 text-[14px] leading-[1.65] text-[#37352f] shadow-[inset_0_0_0_1px_rgba(55,53,47,0.16)] focus:shadow-[inset_0_0_0_1px_#2383e2]"
            : "rounded-[8px] bg-[#fbfaf8] px-3 py-2 text-[13.5px] leading-[1.6] focus:shadow-[inset_0_0_0_1px_#dcdad6]",
        )}
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        {page ? (
          <>
            <button
              type="button"
              className={detailButton.ghost}
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              취소
            </button>
            <button
              type="submit"
              className={detailButton.solid}
              disabled={!trimmed || save.isPending}
            >
              {save.isPending ? "저장 중" : "저장"}
            </button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
            <Button type="submit" size="xs" disabled={!trimmed || save.isPending}>
              {save.isPending ? "저장 중" : "저장"}
            </Button>
          </>
        )}
      </div>
    </form>
  ) : page ? (
    <p className="mt-0.5 whitespace-pre-wrap break-keep text-[14px] leading-[1.65] text-[#37352f]/90 [overflow-wrap:anywhere]">
      {comment.body}
    </p>
  ) : (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-[1.6] text-foreground">
      {comment.body}
    </p>
  );

  // 상세 페이지: 매물 상세의 기록 줄과 같은 모양 (얼굴 · 이름 · 시각은 오른쪽 · 본문).
  if (page) {
    return (
      <>
        {dateHeading && (
          <li
            aria-hidden="true"
            className="pb-1 pt-3.5 text-[12px] font-semibold tabular-nums text-[#37352f]/65 first:pt-1"
          >
            {dateHeading}
          </li>
        )}
        <li
          data-project-comment
          className="group/comment -mx-1.5 flex gap-2.5 rounded px-1.5 py-2 hover:bg-[#37352f]/[0.03]"
        >
          <span className="mt-px">
            <DetailAvatar name={authorName} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-h-[22px] min-w-0 items-center gap-1.5 text-[14px] leading-[22px]">
              <span className="shrink-0 font-semibold text-[#37352f]">{authorName}</span>
              {wasEdited && <span className="text-[12px] text-[#37352f]/45">고침</span>}
              <span className="flex-1" />
              {actions}
              <span className="shrink-0 pl-1 text-[12px] tabular-nums text-[#37352f]/45">
                {formatClock(comment.createdAt)}
              </span>
            </div>
            {body}
          </div>
        </li>
      </>
    );
  }

  return (
    <li data-project-comment className="group/comment py-2.5">
      <div className="flex min-h-5 items-center gap-2 text-[12px] text-muted-foreground">
        <span className="font-medium text-[#5f5e5b]">{authorName}</span>
        <span className="tabular-nums">{formatCommentTime(comment.createdAt)}</span>
        {wasEdited && <span>고침</span>}
        {actions && <span className="ml-auto">{actions}</span>}
      </div>
      {body}
    </li>
  );
}

export function CommentComposer({
  projectId,
  drafts,
  onSave,
  onSaved,
  variant = "panel",
}: {
  projectId: string;
  variant?: ProjectPartVariant;
  drafts: CommentDraftStore;
  onSave: (request: CommentSaveRequest) => void;
  /** 저장이 끝나 새 코멘트가 목록에 들어온 뒤 */
  onSaved: () => void;
}) {
  // 패널을 닫았다 열어도, 다른 프로젝트에 다녀와도 적던 글에서 이어 적는다.
  const [content, setContent] = useState(() => drafts.get(projectId) ?? "");
  const isSaving = useIsSavingComment(projectId);
  const [failed, setFailed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 저장이 끝났을 때: 글이 지워졌으면(성공) 칸을 비우고, 남아 있으면(실패) 그 자리에서 알린다.
  const wasSaving = useRef(isSaving);
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      if (drafts.has(projectId)) {
        setFailed(true);
        textareaRef.current?.focus({ preventScroll: true });
      } else {
        setContent("");
        onSaved();
      }
    }
    wasSaving.current = isSaving;
  }, [drafts, isSaving, onSaved, projectId]);

  const change = (next: string) => {
    setContent(next);
    setFailed(false);
    if (next.trim()) drafts.set(projectId, next);
    else drafts.delete(projectId);
  };

  const trimmed = content.trim();
  const submit = () => {
    if (!trimmed || isSaving) return;
    setFailed(false);
    // 보낸 글을 그대로 기억해 둔다. 저장이 끝나면 이것과 같을 때만 지운다.
    drafts.set(projectId, content);
    onSave({ projectId, body: trimmed });
  };

  const textareaProps = {
    ref: textareaRef,
    "aria-label": "코멘트 적기",
    value: content,
    rows: 1,
    maxLength: MAX_COMMENT_LENGTH,
    // 저장하는 동안 더 적으면 보낸 글과 남은 글이 달라져 같은 내용이 두 번 들어갈 수 있다.
    readOnly: isSaving,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => change(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        // 적던 글은 남기고 칸에서만 나온다.
        event.stopPropagation();
        event.currentTarget.blur();
      }
    },
  };

  // 상세 페이지: 매물 상세의 아래 적는 칸과 같은 모양 (얼굴 · 글 칸 · 파란 단추).
  if (variant === "page") {
    return (
      <form
        data-project-comment-composer
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2.5 py-0.5">
          <span className="mb-[3px]">
            <DetailAvatar name="나" />
          </span>
          <textarea
            {...textareaProps}
            placeholder="코멘트 남기기… 진행하며 알게 된 것, 다음에 할 일"
            className={cn(
              "block max-h-[200px] min-h-[34px] min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 text-[14px] leading-[1.6] text-[#37352f] outline-none [field-sizing:content] placeholder:text-[#37352f]/45",
              isSaving && "opacity-70",
            )}
          />
          <button
            type="submit"
            className={cn(detailButton.solid, "mb-[3px]")}
            disabled={!trimmed || isSaving}
          >
            {isSaving ? "적는 중" : "적기"}
            <DetailKbd>⌘↵</DetailKbd>
          </button>
        </div>
        {failed && (
          <p role="alert" className="pb-1 pl-[38px] text-[12.5px] text-[rgb(212,76,71)]">
            저장하지 못했습니다. 적은 글은 남아 있습니다. 다시 눌러 주세요.
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      data-project-comment-composer
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          {...textareaProps}
          placeholder="이 프로젝트에 코멘트 적기"
          className={cn(
            "block max-h-[168px] min-h-[36px] min-w-0 flex-1 resize-none rounded-[10px] bg-[#f7f6f3] px-3 py-2 text-[13.5px] leading-[1.5] outline-none [field-sizing:content] placeholder:text-[#a9a7a1] focus:shadow-[inset_0_0_0_1px_#dcdad6]",
            isSaving && "opacity-70",
          )}
        />
        <button
          type="submit"
          disabled={!trimmed || isSaving}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#2f2e2a] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1f1e1b] disabled:pointer-events-none disabled:opacity-40"
        >
          <Send className="size-3.5" />
          {isSaving ? "적는 중" : "적기"}
        </button>
      </div>
      <p
        role={failed ? "alert" : undefined}
        className={cn(
          "mt-1.5 text-[12px]",
          failed ? "text-destructive" : "text-[#a9a7a1]",
        )}
      >
        {failed
          ? "저장하지 못했습니다. 적은 글은 남아 있습니다. 다시 눌러 주세요."
          : "손님과 나눈 대화는 그 손님의 상담에 적습니다. ⌘/Ctrl + Enter로 적기"}
      </p>
    </form>
  );
}
