import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  rectIntersection,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { ProjectStep } from "@estate-erp/api-client";
import {
  ArrowUpRight,
  Check,
  PencilLine,
  ChevronDown,
  EllipsisVertical,
  GripVertical,
  Handshake,
  House,
  Layers,
  Plus,
  SquareCheck,
  Target,
  Trash2,
  Unlink,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeDay } from "@/lib/format";
import { getStatusMeta } from "@/lib/status-config";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CandidateRow,
  isFreshCandidate,
  orderCandidateIntakes,
  OtherCustomerCandidates,
  SavedInput,
} from "../customers/-project-plan-dialog";
import { nb, Tag } from "../properties/-detail/ui";
import { planQueryKey } from "./-project-hooks";
import {
  describePlanSummary,
  planDropForMove,
  planOrderAfterDrop,
  planStageGroups,
  PLAN_STAGE_STATE_LABELS,
  type PlanDrop,
  type PlanMove,
  type PlanStageState,
  pickPlanDropTarget,
} from "./-project-model";
import { ProjectNewIntakeButtons } from "./-project-new-intake";
import { usePlanChange, usePlanReorder } from "./-project-plan-hooks";
import { LifecycleTag } from "./-project-step-detail";
import { DealFlowBlock } from "./-project-step-body";
import { isListingTitleMerged, ListingStepTable } from "./-project-listing-table";
import { BuyerStepTable, isBuyerTitleMerged } from "./-project-buyer-table";
import { ProjectIntakeTag } from "./-project-status-chip";
import { CARD_CLASS, SectionBox } from "./-project-ui";

/**
 * 진행 계획 — 차례마다 묶음 상자, 왼쪽에 차례 동그라미와 아래로 흐르는 세로선(시안 "1+2 통합안"의 진행 흐름).
 *
 * 진행 계획 창 없이 그 자리에서 고친다(사용자 지시 2026-11-23: "진행계획 고치기 버튼 버려. 드래그앤드랍으로"):
 * - 순서: 카드 왼쪽 손잡이(⋮⋮)를 잡고 끈다. 차례 상자 위에 놓으면 그 차례와 동시 진행, 차례 사이의 틈에
 *   놓으면 새 차례. 놓으면 곧바로 번호를 다시 매기고 전체 단계의 sortOrder를 보낸다(화면 먼저, 실패하면 되돌림).
 *   끌지 않고도 카드의 ⋯ 메뉴(앞으로 · 뒤로 · 앞 차례와 함께 · 따로 떼기)와 키보드(손잡이에서 Space)로 옮긴다.
 * - 단계 추가: 흐름 맨 아래 "+ 단계 추가". 의뢰 담기: 머리의 "+ 의뢰 담기" 고르기.
 * - 고치기 · 빼기: 카드에서 바로(이름 · 목표일 · 메모, "자세히" 없음). 빼기 · 지우기는 카드의 ⋯ 메뉴(확인을 거친다).
 * 순서는 사람이 정하고 시스템이 계산하지 않는다(AGENTS.md).
 */
export function ProjectPlanSection({
  projectId,
  steps,
  archived,
  primaryContactId,
  hasPrimary,
  canConsult,
  addIntakeSignal,
  onOpenDeals,
  onPickPrimary,
  onWriteTask,
  onWriteNote,
}: {
  projectId: string;
  steps: readonly ProjectStep[];
  /** 끝낸 프로젝트: 순서를 끌어 바꾸지 않는다(손잡이 없음) */
  archived: boolean;
  primaryContactId: string | null;
  hasPrimary: boolean;
  canConsult: boolean;
  /** 바뀔 때마다 "의뢰 담기" 고르기를 연다(다른 탭 · 안내에서 부른다) */
  addIntakeSignal: number;
  onOpenDeals: () => void;
  onPickPrimary: () => void;
  onWriteTask: () => void;
  onWriteNote: () => void;
}) {
  const groups = planStageGroups(steps);
  const change = usePlanChange(projectId);
  const reorder = usePlanReorder(projectId);
  const [addOpen, setAddOpen] = useState(false);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const openAdd = () => {
    addTriggerRef.current?.scrollIntoView({ block: "nearest" });
    setAddOpen(true);
  };
  const handledSignal = useRef(addIntakeSignal);
  useEffect(() => {
    if (addIntakeSignal === handledSignal.current) return;
    handledSignal.current = addIntakeSignal;
    openAdd();
  }, [addIntakeSignal]);

  const moveTo = (stepId: string, drop: PlanDrop | null) => {
    if (!drop) return;
    const order = planOrderAfterDrop(steps, stepId, drop);
    if (order) reorder.mutate(order);
  };
  const move = (stepId: string, kind: PlanMove) => moveTo(stepId, planDropForMove(steps, stepId, kind));
  const canMove = (stepId: string, kind: PlanMove) => {
    const drop = planDropForMove(steps, stepId, kind);
    return Boolean(drop && planOrderAfterDrop(steps, stepId, drop));
  };

  return (
    <SectionBox
      data-project-plan
      icon={<Layers />}
      title="진행 계획"
      badge={steps.length > 0 ? describePlanSummary(steps) : "순서는 직접 정합니다"}
      note={steps.length > 1 && !archived ? "끌어서 순서를 바꿉니다" : undefined}
      action={
        <AddIntakePicker
          projectId={projectId}
          primaryContactId={primaryContactId}
          open={addOpen}
          onOpenChange={setAddOpen}
          triggerRef={addTriggerRef}
          busy={change.isPending}
          onAddIntake={(kind, intakeId) =>
            change.mutate(() => api.projects.addIntake(projectId, { kind, intakeId }))
          }
          onAddDeal={(dealId) => change.mutate(() => api.projects.createStep(projectId, { dealId }))}
        />
      }
    >
      {groups.length > 0 ? (
        <PlanFlow
          groups={groups}
          archived={archived}
          onDrop={moveTo}
          renderStep={(step) => (
            <StepItem
              key={step.id}
              step={step}
              archived={archived}
              onOpenDeals={onOpenDeals}
              canMove={(kind) => !archived && canMove(step.id, kind)}
              onMove={(kind) => move(step.id, kind)}
              saving={change.isPending}
              onUpdate={(dto) => change.mutate(() => api.projects.updateStep(projectId, step.id, dto))}
              onRemove={() => change.mutate(() => api.projects.removeStep(projectId, step.id))}
            />
          )}
        />
      ) : (
        <ProjectStarter
          projectId={projectId}
          primaryContactId={primaryContactId}
          hasPrimary={hasPrimary}
          canConsult={canConsult}
          onPickPrimary={onPickPrimary}
          onAddIntake={openAdd}
          onWriteTask={onWriteTask}
          onWriteNote={onWriteNote}
        />
      )}
      <AddStepRow
        onAdd={(title, restore) =>
          change.mutate(() => api.projects.createStep(projectId, { title }), { onError: restore })
        }
      />
    </SectionBox>
  );
}

// ── 끌어다 놓기 ─────────────────────────────────────────────────

const GROUP_PREFIX = "group:";
const GAP_PREFIX = "gap:";

/**
 * 놓을 곳 고르기. 손(포인터)으로 끌 때는 **지금 화면의 자리**를 직접 재서 본다.
 *
 * dnd-kit이 들고 있는 놓을 곳의 자리(droppableRects)는 잰 순간의 값이다. 끄는 중에 화면이 저절로 스크롤되면
 * (긴 계획에서 맨 끝으로 가져갈 때) 그 값이 실제 자리와 어긋나, 손이 틈 위에 있어도 알아보지 못하거나
 * 엉뚱한 차례에 놓인다(실제 창 높이 720px에서 재현). 그래서 판정할 때마다 DOM에서 다시 잰다.
 *
 * - 틈과 상자가 함께 걸리면(가장자리) 틈을 고른다: 새 차례로 넣으려는 손이 더 정확하다.
 * - 흐름의 위·아래로 벗어난 자리(맨 끝 틈 아래의 "단계 추가" 줄, 그 아래 빈 곳)는 맨 앞·맨 끝 틈으로 본다.
 *   옆으로 벗어난 자리(오른쪽 열 등)는 아무 데도 아니다 — 거기서 놓으면 취소다.
 * - 키보드로 옮길 때는 포인터가 없으므로 끄는 카드와 가장 많이 겹치는 곳을 본다.
 */
export const planCollision: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return rectIntersection(args);
  const live = args.droppableContainers.flatMap((container) => {
    const node = container.node.current;
    return node ? [{ id: container.id, rect: node.getBoundingClientRect() }] : [];
  });
  const picked = pickPlanDropTarget(
    pointer,
    live.map(({ id, rect }) => ({
      id: String(id),
      gap: String(id).startsWith(GAP_PREFIX),
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    })),
  );
  return picked === null ? [] : [{ id: picked }];
};

/**
 * 키보드로 옮길 때(손잡이에서 Space): 위 · 아래 화살표가 놓을 곳(차례 상자와 틈)을 하나씩 건너뛴다.
 * 끄는 카드의 가운데를 다음 놓을 곳의 가운데에 맞춘다.
 */
const planKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  const { collisionRect, droppableRects } = context;
  if (!collisionRect) return undefined;
  event.preventDefault();
  const center = collisionRect.top + collisionRect.height / 2;
  const targets = [...droppableRects.values()]
    .map((rect) => rect.top + rect.height / 2)
    .sort((left, right) => left - right);
  const next =
    event.code === "ArrowDown"
      ? targets.find((y) => y > center + 1)
      : [...targets].reverse().find((y) => y < center - 1);
  if (next === undefined) return undefined;
  return { x: collisionRect.left, y: next - collisionRect.height / 2 };
};

function PlanFlow({
  groups,
  archived,
  onDrop,
  renderStep,
}: {
  groups: ReturnType<typeof planStageGroups<ProjectStep>>;
  archived: boolean;
  onDrop: (stepId: string, drop: PlanDrop) => void;
  renderStep: (step: ProjectStep) => ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // 조금 움직여야 끌기가 시작된다(손잡이를 눌렀다 떼면 아무 일도 없다).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: planKeyboardCoordinates }),
  );
  const steps = groups.flatMap((group) => group.steps);
  const active = activeId ? (steps.find((step) => step.id === activeId) ?? null) : null;
  const activeGroup = active ? groups.find((group) => group.steps.some((step) => step.id === active.id)) : null;

  const describeTarget = (id: string | number) => {
    const key = String(id);
    if (key.startsWith(GROUP_PREFIX)) {
      const group = groups.find((item) => String(item.order) === key.slice(GROUP_PREFIX.length));
      return group ? `${group.index}단계와 함께` : "그 차례와 함께";
    }
    const index = Number(key.slice(GAP_PREFIX.length));
    return index >= groups.length ? "맨 끝의 새 차례" : `${index + 1}단계 앞의 새 차례`;
  };
  const titleOf = (id: string | number) => steps.find((step) => step.id === String(id))?.title ?? "단계";
  const announcements: Announcements = {
    onDragStart: ({ active: item }) => `${titleOf(item.id)} 단계를 잡았습니다. 화살표로 옮기고 Space로 놓습니다.`,
    onDragOver: ({ active: item, over }) =>
      over ? `${titleOf(item.id)}: ${describeTarget(over.id)}` : `${titleOf(item.id)}: 놓을 곳 밖입니다.`,
    onDragEnd: ({ active: item, over }) =>
      over ? `${titleOf(item.id)} 단계를 ${describeTarget(over.id)}(으)로 옮겼습니다.` : `${titleOf(item.id)} 단계를 제자리에 두었습니다.`,
    onDragCancel: ({ active: item }) => `${titleOf(item.id)} 단계 옮기기를 취소했습니다.`,
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const handleDragEnd = (event: DragEndEvent) => {
    const stepId = String(event.active.id);
    setActiveId(null);
    const over = event.over ? String(event.over.id) : null;
    if (!over) return;
    if (over.startsWith(GROUP_PREFIX)) {
      onDrop(stepId, { kind: "join", order: Number(over.slice(GROUP_PREFIX.length)) });
    } else if (over.startsWith(GAP_PREFIX)) {
      onDrop(stepId, { kind: "gap", index: Number(over.slice(GAP_PREFIX.length)) });
    }
  };

  const dragging = active !== null;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={planCollision}
      // 끄기가 시작되면 틈이 넓어져 상자들의 자리가 바뀐다. 놓을 곳의 자리를 늘 다시 잰다
      // (시작할 때 잰 자리로 보면 손 밑이 아니라 그 아래 상자에 놓인다).
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "단계를 옮기려면 Space를 누르고 화살표로 놓을 곳을 고른 뒤 Space로 놓습니다. Esc를 누르면 취소합니다.",
        },
      }}
    >
      <RemeasureAfterExpand dragging={dragging} />
      <ol data-project-flow-stages data-dragging={dragging || undefined} className="mt-1">
        {/* 맨 앞의 틈(끄는 동안에만 자리를 차지한다) */}
        {!archived && (
          <li aria-hidden={!dragging} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span />
            <GapZone index={0} dragging={dragging} leading />
          </li>
        )}
        {groups.map((group, index) => (
          <StageRow
            key={group.order}
            order={group.order}
            index={group.index}
            state={group.state}
            count={group.steps.length}
            last={index === groups.length - 1}
            dragging={dragging}
            isSource={activeGroup?.order === group.order}
            gapIndex={archived ? null : index + 1}
          >
            {group.steps.map((step) => renderStep(step))}
          </StageRow>
        ))}
      </ol>
      <DragOverlay dropAnimation={null}>{active ? <StepDragPreview step={active} /> : null}</DragOverlay>
    </DndContext>
  );
}

/**
 * 끄기가 시작되면 틈이 150ms 동안 넓어지며 상자들이 아래로 밀린다. 다 넓어진 뒤 놓을 곳들의 자리를 다시 잰다
 * (넓어지는 도중에 잰 자리로 보면 손 밑의 틈 · 상자를 알아보지 못한다).
 */
function RemeasureAfterExpand({ dragging }: { dragging: boolean }) {
  const { measureDroppableContainers, droppableContainers } = useDndContext();
  useEffect(() => {
    if (!dragging) return;
    const timer = window.setTimeout(
      () => measureDroppableContainers([...droppableContainers.keys()]),
      200,
    );
    return () => window.clearTimeout(timer);
    // 끄기가 시작될 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);
  return null;
}

/**
 * 차례 사이의 틈. 끄는 동안에만 넓어지고, 손이 올라오면 파란 선과 "여기에 새 차례"가 보인다.
 * 평소에는 차례 상자 사이의 간격(12px) 구실만 한다.
 */
function GapZone({ index, dragging, leading = false }: { index: number; dragging: boolean; leading?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${GAP_PREFIX}${index}`, disabled: !dragging });
  return (
    <div
      ref={setNodeRef}
      data-project-plan-gap={index}
      className={cn(
        "relative flex items-center transition-[height] duration-150 ease-out motion-reduce:transition-none",
        dragging ? "h-8" : leading ? "h-0" : "h-3",
      )}
    >
      {dragging && isOver && (
        <>
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-info" />
          <span className="relative ml-3 rounded bg-white px-1.5 text-[12px] font-medium text-info">여기에 새 차례</span>
        </>
      )}
    </div>
  );
}

// ── 차례 줄: 왼쪽 동그라미 · 세로선, 오른쪽 묶음 상자 ─────────────────

const DOT_CLASS: Record<PlanStageState, string> = {
  done: "bg-success text-white",
  current: "bg-info text-white ring-4 ring-info/15",
  next: "bg-warning-soft text-warning-strong inset-ring-[1.5px] inset-ring-warning",
  upcoming: "bg-secondary text-[#37352f]/55 inset-ring-[1.5px] inset-ring-[#dcdbd7]",
};

const LINE_CLASS: Record<PlanStageState, string> = {
  done: "bg-success/40",
  current: "bg-info/40",
  next: "bg-[#e3e2df]",
  upcoming: "bg-[#e3e2df]",
};

const ARROW_CLASS: Record<PlanStageState, string> = {
  done: "text-success/70",
  current: "text-info/70",
  next: "text-[#c9c8c4]",
  upcoming: "text-[#c9c8c4]",
};

const STAGE_BOX_CLASS: Record<PlanStageState, string> = {
  done: "bg-white ring-1 ring-[#e9e9e7]",
  current: "bg-info/[0.04] ring-1 ring-info/40",
  next: "bg-white ring-1 ring-[#e9e9e7]",
  upcoming: "bg-white ring-1 ring-[#e9e9e7]",
};

const STAGE_STATUS_CLASS: Record<PlanStageState, string> = {
  done: "text-success",
  current: "text-info",
  next: "text-orange",
  upcoming: "text-[#37352f]/45",
};

/** 왼쪽 동그라미와 아래로 흐르는 선. 마지막 차례에는 선이 없다. */
function Spine({ state, label, last }: { state: PlanStageState; label: ReactNode; last: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col items-center pt-[9px]">
      <span
        className={cn(
          "grid size-[26px] shrink-0 place-items-center rounded-full text-[12.5px] font-semibold tabular-nums",
          DOT_CLASS[state],
        )}
      >
        {label}
      </span>
      {!last && (
        <>
          <span className={cn("mt-1 min-h-3 w-0.5 flex-1 rounded-full", LINE_CLASS[state])} />
          <ChevronDown className={cn("-mt-1.5 mb-0.5 size-3.5", ARROW_CLASS[state])} strokeWidth={2.5} />
        </>
      )}
    </div>
  );
}

function StageRow({
  order,
  index,
  state,
  count,
  last,
  dragging,
  isSource,
  gapIndex,
  children,
}: {
  order: number;
  index: number;
  state: PlanStageState;
  count: number;
  last: boolean;
  dragging: boolean;
  /** 끄는 카드가 원래 있던 차례(그 위에 놓아도 제자리다) */
  isSource: boolean;
  /** 이 차례 바로 뒤의 틈. 끝낸 프로젝트는 틈이 없다. */
  gapIndex: number | null;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP_PREFIX}${order}`, disabled: !dragging });
  const joining = dragging && isOver && !isSource;
  return (
    <li data-project-stage={state} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <Spine state={state} last={last} label={state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : index} />
      <div className="min-w-0">
        <div
          ref={setNodeRef}
          data-project-stage-box={order}
          className={cn(
            "rounded-[10px] px-3.5 pb-3.5 pt-2.5 transition-shadow duration-150",
            STAGE_BOX_CLASS[state],
            joining && "ring-2 ring-info",
          )}
        >
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-semibold text-[#37352f]">{index}단계</span>
            {count > 1 && (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-info-soft/50 px-2 text-[12px] font-medium text-info-strong inset-ring inset-ring-info/25">
                <Layers className="size-3" />
                동시 진행 {count}건
              </span>
            )}
            {joining && <span className="text-[12.5px] font-medium text-info">이 차례와 함께</span>}
            <span className="flex-1" />
            <span className={cn("text-[13px] font-semibold", STAGE_STATUS_CLASS[state])}>
              {PLAN_STAGE_STATE_LABELS[state]}
            </span>
          </div>
          <ul className="mt-2 space-y-2">{children}</ul>
        </div>
        {gapIndex !== null ? <GapZone index={gapIndex} dragging={dragging} /> : !last && <div className="h-3" />}
      </div>
    </li>
  );
}

// ── 단계 카드 (Notion 카드) ───────────────────────────────────────

const KIND_META: Record<ProjectStep["kind"], { label: string | null; icon: typeof House }> = {
  listing_intake: { label: "매물 의뢰", icon: House },
  buyer_intake: { label: "구매 의뢰", icon: Target },
  deal: { label: "거래", icon: Handshake },
  manual: { label: null, icon: SquareCheck },
};

/** 꼬리표와 같은 말로 끝나는 단계 이름은 그 말을 떼고 보인다("고덕 101동 매물 의뢰" → 꼬리표 + "고덕 101동"). */
function displayStepTitle(step: ProjectStep) {
  const label = KIND_META[step.kind].label;
  if (!label) return step.title;
  const trimmed = step.title.replace(new RegExp(`\\s*${label}$`), "").trim();
  return trimmed || step.title;
}

/** 종류 꼬리표: 의뢰는 목록 표 · 머리와 같은 꼬리표(ProjectIntakeTag), 거래는 초록 Tag */
function KindTag({ kind }: { kind: ProjectStep["kind"] }) {
  if (kind === "listing_intake") return <ProjectIntakeTag kind="listing" />;
  if (kind === "buyer_intake") return <ProjectIntakeTag kind="buyer" />;
  if (kind === "deal") return <Tag tone="green" className="text-[12px]">거래</Tag>;
  return null;
}

type StepUpdate = { title?: string; targetDate?: string | null; memo?: string | null; done?: boolean };

/**
 * 단계 카드. "자세히 / 접기"는 없다(사용자 요청 2026-11-23: "좀 더 자연스럽고 깨끗하게. 자세히는 그냥 펼쳐") —
 * 고치는 것(이름 · 목표일 · 메모)은 그 자리에서, 보는 것은 카드 본문에 늘 펴 둔다.
 *
 * - 첫 줄: 종류 아이콘 · 이름(누르면 고친다) · 종류 꼬리표 · ↗(올렸을 때) … 오른쪽에 목표일 · 상태 · ⋯.
 *   목표일 · 메모가 없으면 숨기고, 올렸을 때 · 포커스 때만 흐린 "+ 목표일" · "+ 메모"가 보인다(키보드로 닿는다).
 *   "+ 메모"를 이름 아래가 아니라 첫 줄 오른쪽에 두는 것은, 올릴 때마다 카드가 늘었다 줄며 밑의 것이 흔들리지 않게.
 * - 매물 의뢰 · 구매 의뢰 카드의 본문은 매물관리 · 희망매물 표의 한 줄과 그 화면의 매칭 패널 · 묶음이다(사용자 요청
 *   2026-11-24: "매물관리 페이지를 보면 매칭 펼쳤을 때 리스트로 잘 나오잖아", "희망매물 페이지 참고해서").
 *   이름이 기본 이름(주소 + "매물 의뢰 · 매도", "매매 구매 의뢰")이면 표의 줄과 겹치므로 첫 줄을 따로 두지 않고,
 *   표 머리 오른쪽 끝에 단계의 단추(목표일 · + 메모 · ↗ · ⋯)를 얹는다. 이름은 ⋯의 "이름 붙이기"로 붙인다.
 * - 거래 단계 카드는 첫 줄 아래 메모 한 줄과 거래 묶음.
 * 순서는 손잡이로만 끈다(카드 안을 눌러 고치는 것과 겹치지 않는다).
 */
function StepItem({
  step,
  archived,
  onOpenDeals,
  canMove,
  onMove,
  saving,
  onUpdate,
  onRemove,
}: {
  step: ProjectStep;
  archived: boolean;
  onOpenDeals: () => void;
  canMove: (kind: PlanMove) => boolean;
  onMove: (kind: PlanMove) => void;
  /** 저장이 진행 중인지(끝났는데도 서버 값과 다르면 저장되지 않은 글로 표시한다) */
  saving: boolean;
  onUpdate: (dto: StepUpdate) => void;
  onRemove: () => void;
}) {
  const meta = KIND_META[step.kind];
  const Icon = meta.icon;
  // "+ 메모"를 눌러 연 빈 메모 칸(아무것도 적지 않고 나가면 닫힌다)
  const [memoOpen, setMemoOpen] = useState(false);
  // ⋯ "이름 붙이기": 이름 줄을 따로 두지 않는 카드에서 이름 칸을 잠깐 연다
  const [naming, setNaming] = useState(false);
  const tableKind = step.kind === "listing_intake" ? "listing" : step.kind === "buyer_intake" ? "buyer" : null;
  const merged =
    !naming &&
    (tableKind === "listing" ? isListingTitleMerged(step) : tableKind === "buyer" ? isBuyerTitleMerged(step) : false);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: step.id,
    disabled: archived,
  });

  // 카드에 올리면 왼쪽(차례 상자의 여백)에 손잡이가 보인다. 카드 안의 단추 · 링크 · 체크는 그대로 눌린다.
  const handle = !archived && (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`${step.title} 단계 옮기기`}
      title="끌어서 순서를 바꿉니다"
      data-project-step-handle
      className={cn(
        "absolute -left-[15px] grid h-6 w-4 cursor-grab place-items-center rounded text-[#37352f]/35 opacity-0 transition-opacity hover:bg-[rgba(55,53,47,0.06)] hover:text-[#37352f]/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40 active:cursor-grabbing group-hover/step:opacity-100",
        // 표 머리(36px)가 첫 줄인 카드는 그 가운데에
        merged ? "top-1.5" : "top-2.5",
      )}
    >
      <GripVertical className="size-3.5" />
    </button>
  );

  const menu = (
    <StepMenu
      step={step}
      archived={archived}
      canMove={canMove}
      onMove={onMove}
      onRemove={onRemove}
      onRename={merged ? () => setNaming(true) : undefined}
    />
  );
  const showMemo = Boolean(step.memo) || memoOpen;
  const memoAdd = !showMemo && <MemoAddButton step={step} onClick={() => setMemoOpen(true)} />;
  const memoField = showMemo && (
    <StepMemoField
      step={step}
      saving={saving}
      autoFocus={memoOpen && !step.memo}
      onSave={(memo) => onUpdate({ memo })}
      onClose={() => setMemoOpen(false)}
    />
  );

  // 직접 적은 단계: 같은 카드에 한 줄(체크 상자 + 제목 + 오른쪽 목표일). 제목 · 목표일 · 메모는 그 자리에서 고친다.
  if (step.kind === "manual") {
    return (
      <li ref={setNodeRef} data-project-step data-step-title={step.title} className={cn("group/step relative", isDragging && "opacity-40")}>
        {handle}
        <article className={cn(CARD_CLASS, "flex min-w-0 items-start gap-2.5 py-2 pl-3.5 pr-2")}>
          <button
            type="button"
            role="checkbox"
            aria-checked={step.done}
            aria-label={step.done ? `${step.title} 끝내기 취소` : `${step.title} 끝냄으로 표시`}
            title={step.done ? "끝내기 취소" : "끝냄으로 표시"}
            onClick={() => onUpdate({ done: !step.done })}
            className={cn(
              "mt-[6px] grid size-[18px] shrink-0 place-items-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40",
              step.done
                ? "bg-info text-white"
                : "shadow-[inset_0_0_0_1.5px_rgba(55,53,47,0.3)] hover:bg-[rgba(55,53,47,0.04)]",
            )}
          >
            {step.done && <Check className="size-3" strokeWidth={3} />}
          </button>
          <div className="min-w-0 flex-1">
            <SavedInput
              saving={saving}
              ariaLabel="단계 이름"
              value={step.title}
              maxLength={100}
              required
              className={cn(
                "h-[30px] w-full text-[15px] font-semibold text-[#37352f]",
                step.done && "text-[#37352f]/45",
              )}
              onSave={(title) => onUpdate({ title })}
            />
            {memoField}
          </div>
          <div className="mt-[3px] flex shrink-0 items-center gap-0.5">
            {memoAdd}
            <TargetDateField step={step} onSave={(targetDate) => onUpdate({ targetDate })} />
            {menu}
          </div>
        </article>
      </li>
    );
  }

  const titleLine = (withState: boolean) => (
    <div className="flex min-h-7 min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-[#37352f]/45" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <StepTitleField
          step={step}
          saving={saving}
          onSave={(title) => onUpdate({ title })}
          startEditing={naming}
          onEditEnd={() => setNaming(false)}
        />
        {displayStepTitle(step) !== meta.label && <KindTag kind={step.kind} />}
        <StepOpenLink step={step} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {memoAdd}
        <TargetDateField step={step} onSave={(targetDate) => onUpdate({ targetDate })} />
        {withState && <StepStateTag step={step} />}
        {menu}
      </div>
    </div>
  );

  // 매물 의뢰 · 구매 의뢰: 표의 한 줄 + 그 화면의 매칭 패널 · 묶음. 상태(매물상태 · 희망 조건 상태)는 줄의 알약이 보인다.
  if (tableKind) {
    // 이름 줄을 두지 않을 때 표 머리 오른쪽 끝에 얹는 단계의 단추. 목표일이 있으면 늘, 없으면 올렸을 때 · 포커스 때만 바탕을 깐다.
    const controls = merged && (
      <div
        data-project-step-controls
        className={cn(
          "absolute right-1 top-1/2 z-[2] flex -translate-y-1/2 items-center gap-0.5 rounded-md pl-1",
          step.targetDate
            ? "bg-white shadow-[0_0_0_4px_#fff]"
            : "group-focus-within/step:bg-white group-focus-within/step:shadow-[0_0_0_4px_#fff] group-hover/step:bg-white group-hover/step:shadow-[0_0_0_4px_#fff]",
        )}
      >
        {memoAdd}
        <TargetDateField step={step} onSave={(targetDate) => onUpdate({ targetDate })} />
        <StepOpenLink step={step} />
        {menu}
      </div>
    );
    return (
      <li
        ref={setNodeRef}
        data-project-step
        data-step-title={step.title}
        data-step-merged={merged || undefined}
        className={cn("group/step relative", isDragging && "opacity-40")}
      >
        {handle}
        <article className={cn(CARD_CLASS, "overflow-hidden")}>
          {!merged && <div className="border-b border-border pb-1.5 pl-4 pr-2 pt-2">{titleLine(false)}</div>}
          {tableKind === "listing" ? (
            <ListingStepTable step={step} controls={controls || undefined} onOpenDeals={onOpenDeals} />
          ) : (
            <BuyerStepTable step={step} controls={controls || undefined} onOpenDeals={onOpenDeals} />
          )}
          {memoField && <div className="px-2.5 py-1">{memoField}</div>}
        </article>
      </li>
    );
  }

  // 거래 단계: 첫 줄 · 메모 한 줄 · 거래 묶음(흐름까지)
  return (
    <li ref={setNodeRef} data-project-step data-step-title={step.title} className={cn("group/step relative", isDragging && "opacity-40")}>
      {handle}
      <article className={cn(CARD_CLASS, "pb-3 pl-4 pr-2 pt-2")}>
        {titleLine(true)}
        <div className="ml-6 mr-2">
          {memoField}
          <DealFlowBlock step={step} onOpenDeals={onOpenDeals} />
        </div>
      </article>
    </li>
  );
}

/**
 * 의뢰 · 거래 단계의 이름: 평소에는 글(꼬리표와 같은 끝말은 떼고), 누르면 그 자리에서 고치는 칸(전체 이름).
 * 칸은 진행 계획 창의 칸과 같다(벗어나거나 Enter면 저장, Esc는 되돌림, 다른 곳과 겹치면 덮지 않음).
 * 저장이 끝나지 않았거나 저장하지 못한 글이 칸에 남아 있는 동안은 칸을 그대로 둔다 — 글로 돌아가면 적은 글이 사라진다.
 */
function StepTitleField({
  step,
  saving,
  onSave,
  startEditing = false,
  onEditEnd,
}: {
  step: ProjectStep;
  saving: boolean;
  onSave: (title: string) => void;
  /** 칸을 연 채로 시작한다(⋯ "이름 붙이기") */
  startEditing?: boolean;
  /** 칸이 닫혀 글로 돌아갔을 때(startEditing으로 열었을 때만) */
  onEditEnd?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [held, setHeld] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!held || editing) return;
    const input = boxRef.current?.querySelector("input");
    if (!input || input.value.trim() === step.title.trim()) setHeld(false);
  }, [editing, held, saving, step.title]);
  useEffect(() => {
    if (startEditing && !editing && !held) onEditEnd?.();
    // 칸이 닫힐 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, held]);

  if (!editing && !held) {
    return (
      <h3 className="flex min-w-0">
        <button
          type="button"
          data-project-step-title
          onClick={() => setEditing(true)}
          title={`${step.title} · 눌러서 이름을 고칩니다`}
          className={cn(
            "-mx-1.5 min-w-0 truncate rounded-sm px-1.5 text-left text-[15px] font-semibold leading-[26px] text-[#37352f] transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40",
            step.done && "text-[#37352f]/45",
          )}
        >
          {displayStepTitle(step)}
        </button>
      </h3>
    );
  }
  return (
    <h3 className="flex min-w-0">
      <span
        ref={boxRef}
        className="flex min-w-0"
        onFocus={() => setEditing(true)}
        onBlur={(event) => {
          setEditing(false);
          setHeld((event.target as HTMLInputElement).value.trim() !== step.title.trim());
        }}
      >
        <SavedInput
          autoFocus={editing}
          saving={saving}
          ariaLabel="단계 이름"
          value={step.title}
          maxLength={100}
          required
          className="h-[26px] min-w-[8em] max-w-full text-[15px] font-semibold text-[#37352f] [field-sizing:content]"
          onSave={onSave}
        />
      </span>
    </h3>
  );
}

/**
 * 제목 옆 ↗: 매물 의뢰는 매물 화면, 구매 의뢰는 희망 조건 화면, 거래 단계는 거래 화면.
 * 카드에 올렸을 때 · 포커스 때만 보인다. 희망 조건이 여럿인 구매 의뢰는 ↗를 두지 않는다 —
 * 어느 조건을 열지 알 수 없어서, 줄마다 예산을 눌러 자기 조건을 연다.
 */
function StepOpenLink({ step }: { step: ProjectStep }) {
  const className = cn(
    nb.icon,
    "size-6 shrink-0 text-[#37352f]/45 opacity-0 hover:text-[#37352f] focus-visible:opacity-100 group-focus-within/step:opacity-100 group-hover/step:opacity-100 [&_svg]:size-3.5",
  );
  if (step.listingIntake) {
    return (
      <Link
        to="/properties/$id"
        params={{ id: step.listingIntake.propertyId }}
        aria-label={`${displayStepTitle(step)} 매물 화면 열기`}
        title="매물 화면을 엽니다"
        data-project-step-open
        className={className}
      >
        <ArrowUpRight />
      </Link>
    );
  }
  const requirements = step.buyerIntake?.requirements ?? [];
  if (requirements.length === 1) {
    return (
      <Link
        to="/buyer-requirements/$id"
        params={{ id: requirements[0].id }}
        aria-label={`${displayStepTitle(step)} 희망 조건 화면 열기`}
        title="희망 조건 화면을 엽니다"
        data-project-step-open
        className={className}
      >
        <ArrowUpRight />
      </Link>
    );
  }
  if (step.kind === "deal" && step.deal) {
    return (
      <Link
        to="/deals/$id"
        params={{ id: step.deal.id }}
        aria-label={`${displayStepTitle(step)} 거래 화면 열기`}
        title="거래 화면을 엽니다"
        data-project-step-open
        className={className}
      >
        <ArrowUpRight />
      </Link>
    );
  }
  return null;
}

/** 메모가 없을 때 첫 줄 오른쪽의 "+ 메모"(올렸을 때 · 포커스 때만) */
function MemoAddButton({ step, onClick }: { step: ProjectStep; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${step.title} 메모 추가`}
      data-project-step-memo-add
      className="h-6 shrink-0 rounded px-1.5 text-[13px] text-[#37352f]/40 opacity-0 transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-[#37352f]/70 focus-visible:opacity-100 group-focus-within/step:opacity-100 group-hover/step:opacity-100"
    >
      + 메모
    </button>
  );
}

/** 메모 한 줄. 누르면 고친다. 비우고 나가면(또는 열기만 하고 나가면) 줄이 닫힌다. */
function StepMemoField({
  step,
  saving,
  autoFocus,
  onSave,
  onClose,
}: {
  step: ProjectStep;
  saving: boolean;
  autoFocus: boolean;
  onSave: (memo: string | null) => void;
  onClose: () => void;
}) {
  return (
    <span
      className="block"
      onBlur={(event) => {
        if (!(event.target as HTMLInputElement).value.trim()) onClose();
      }}
    >
      <SavedInput
        autoFocus={autoFocus}
        saving={saving}
        ariaLabel={`${step.title} 메모`}
        value={step.memo ?? ""}
        maxLength={2000}
        placeholder="메모 추가"
        data-project-step-memo
        className="h-6 w-full max-w-[760px] text-[13px] text-[#37352f]/65"
        onSave={(memo) => onSave(memo || null)}
      />
    </span>
  );
}

/** 끄는 동안 커서를 따라오는 카드의 축소본 */
function StepDragPreview({ step }: { step: ProjectStep }) {
  const Icon = KIND_META[step.kind].icon;
  return (
    <div
      className={cn(
        CARD_CLASS,
        "flex w-[320px] max-w-[70vw] cursor-grabbing items-center gap-2 px-3 py-2 shadow-[0_0_0_1px_rgba(55,53,47,0.09),0_8px_24px_rgba(15,15,15,0.12)]",
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-[#37352f]/40" />
      <Icon aria-hidden="true" className="size-4 shrink-0 text-[#37352f]/45" />
      <span className="min-w-0 truncate text-[14px] font-semibold text-[#37352f]">{displayStepTitle(step)}</span>
      {displayStepTitle(step) !== KIND_META[step.kind].label && <KindTag kind={step.kind} />}
    </div>
  );
}

/**
 * 목표일: 평소에는 "11.28 (금) 목표"(없으면 카드에 올렸을 때만 "+ 목표일"), 누르면 날짜 칸이 열린다.
 * 날짜를 덜 채우고 나가면 저장된 목표일을 지우지 않는다. 지우기는 날짜 칸을 비우고 나가면 된다.
 */
function TargetDateField({
  step,
  onSave,
}: {
  step: ProjectStep;
  onSave: (targetDate: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const current = step.targetDate ? step.targetDate.slice(0, 10) : "";
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label={`${step.title} 목표일`}
        defaultValue={current}
        onBlur={(event) => {
          setEditing(false);
          if (event.currentTarget.validity.badInput) return;
          const next = event.currentTarget.value;
          if (next !== current) onSave(next || null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.stopPropagation();
            setEditing(false);
          }
        }}
        className="h-7 shrink-0 rounded px-1.5 text-[13px] text-[#37352f] shadow-[inset_0_0_0_1px_rgba(55,53,47,0.16)] outline-none focus:shadow-[inset_0_0_0_1px_#2383e2]"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={step.targetDate ? `${step.title} 목표일 ${formatRelativeDay(step.targetDate)}, 바꾸기` : `${step.title} 목표일 정하기`}
      className={cn(
        "h-6 shrink-0 rounded px-1.5 text-[13px] tabular-nums transition-colors hover:bg-[rgba(55,53,47,0.06)]",
        step.targetDate ? "text-[#37352f]/55" : "text-[#37352f]/40",
        !step.targetDate && "opacity-0 focus-visible:opacity-100 group-focus-within/step:opacity-100 group-hover/step:opacity-100",
      )}
    >
      {step.targetDate ? `${formatRelativeDay(step.targetDate)} 목표` : "+ 목표일"}
    </button>
  );
}

/** 카드의 ⋯ 메뉴: 옮기기(끌지 않고) · 빼기/지우기. 빼기 · 지우기는 확인을 거친다. */
function StepMenu({
  step,
  archived,
  canMove,
  onMove,
  onRemove,
  onRename,
}: {
  step: ProjectStep;
  archived: boolean;
  canMove: (kind: PlanMove) => boolean;
  onMove: (kind: PlanMove) => void;
  onRemove: () => void;
  /** 이름 줄을 따로 두지 않는 카드: 이름 칸을 연다 */
  onRename?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  // "이름 붙이기"를 골랐다: 메뉴가 닫히며 포커스를 단추로 돌려놓는 대신 이름 칸을 연다(돌려놓으면 칸이 곧장 닫힌다)
  const renameRequested = useRef(false);
  const manual = step.kind === "manual";
  const moves: Array<{ kind: PlanMove; label: string }> = [
    { kind: "earlier", label: "앞으로" },
    { kind: "later", label: "뒤로" },
    { kind: "withPrevious", label: "앞 차례와 함께" },
    { kind: "split", label: "따로 떼기" },
  ];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${step.title} 단계 메뉴`}
            data-project-step-menu
            className={cn(
              nb.icon,
              "size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-focus-within/step:opacity-100 group-hover/step:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-4",
            )}
          >
            <EllipsisVertical />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onCloseAutoFocus={(event) => {
            if (!renameRequested.current) return;
            renameRequested.current = false;
            event.preventDefault();
            onRename?.();
          }}
        >
          {onRename && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  renameRequested.current = true;
                }}
              >
                <PencilLine className="size-3.5" />
                이름 붙이기
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {!archived &&
            moves.map((item) => (
              <DropdownMenuItem key={item.kind} disabled={!canMove(item.kind)} onSelect={() => onMove(item.kind)}>
                {item.label}
              </DropdownMenuItem>
            ))}
          {!archived && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            {manual ? <Trash2 className="size-3.5" /> : <Unlink className="size-3.5" />}
            {manual ? "지우기" : "프로젝트에서 빼기"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={manual ? "이 단계를 지울까요?" : step.kind === "deal" ? "이 거래를 프로젝트에서 뺄까요?" : "이 의뢰를 프로젝트에서 뺄까요?"}
        description={
          manual
            ? "직접 적은 단계와 메모가 지워지고 되돌릴 수 없습니다."
            : step.kind === "deal"
              ? "거래는 그대로 남고, 이 프로젝트의 진행 계획에서만 빠집니다."
              : "의뢰와 거래는 그대로 남고, 이 프로젝트의 진행 계획에서만 빠집니다."
        }
        confirmLabel={manual ? "지우기" : "프로젝트에서 빼기"}
        destructive
        onConfirm={() => {
          setConfirm(false);
          onRemove();
        }}
      />
    </>
  );
}

/**
 * 단계의 지금 상태: 의뢰는 진행 중 · 보류 · 종료, 끝낸 단계는 완료.
 * 거래 단계(계약 준비 · 본계약 …)와 거래 취소는 본문의 거래 묶음이 보여 주므로 여기에 다시 두지 않는다.
 */
function StepStateTag({ step }: { step: ProjectStep }) {
  const lifecycle = step.listingIntake?.lifecycleStatus ?? step.buyerIntake?.lifecycleStatus;
  // 진행 중(open)은 기본 상태라 꼬리표를 달지 않는다 — 거의 모든 카드에 같은 초록 꼬리표가 붙어
  // 정작 눈에 띄어야 할 보류 · 종료가 묻힌다. 차례의 진행 상태는 차례 상자의 머리가 말한다.
  if (lifecycle === "open") return null;
  if (lifecycle) return <LifecycleTag status={lifecycle} />;
  if (step.deal) return null;
  if (step.done) {
    return (
      <Tag tone="green" dot>
        완료
      </Tag>
    );
  }
  return null;
}

// ── 단계 추가 · 의뢰 담기 ─────────────────────────────────────────

/**
 * 흐름 맨 아래의 "+ 단계 추가": 누르면 그 자리에 제목 칸이 열리고 Enter로 만든다(한글 조합 중 Enter는 무시),
 * Esc로 닫는다. 보내는 즉시 비우고, 저장하지 못하면 적은 글을 돌려준다(그 사이 다른 글을 쳤으면 그대로 둔다).
 */
function AddStepRow({ onAdd }: { onAdd: (title: string, restore: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        data-project-add-step
        onClick={() => setOpen(true)}
        className="ml-10 mt-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13.5px] text-[#37352f]/55 transition-colors hover:bg-[rgba(55,53,47,0.04)] hover:text-[#37352f]"
      >
        <Plus className="size-3.5" />
        단계 추가
      </button>
    );
  }
  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    onAdd(trimmed, () => setTitle((current) => current || trimmed));
  };
  return (
    <div className="ml-10 mt-2 flex items-center gap-2">
      <Plus className="size-3.5 shrink-0 text-[#37352f]/40" />
      <input
        autoFocus
        value={title}
        maxLength={100}
        aria-label="추가할 단계 이름"
        placeholder="단계 이름 (예: 대출 실행, 이사) — Enter로 추가, Esc로 닫기"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.nativeEvent.isComposing && event.keyCode !== 229) submit();
            return;
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        className="h-8 min-w-0 flex-1 rounded-md bg-white px-2 text-[14px] text-[#37352f] outline-none ring-1 ring-[#dcdbd7] placeholder:text-[#37352f]/40 focus:ring-2 focus:ring-info/45"
      />
    </div>
  );
}

/**
 * "+ 의뢰 담기" 고르기(창이 아니라 단추 아래에 열린다): 이 프로젝트 사람들의 담을 수 있는 매물 의뢰 · 구매 의뢰 ·
 * 거래, 다른 고객 명의의 의뢰, 그리고 처음 받은 의뢰를 등록하러 가는 단추. 고르면 맨 끝 차례로 들어간다.
 * 후보 부품은 진행 계획 창의 것을 그대로 쓴다(목록 · 옆 패널 · 고객 원장은 그 창을 계속 쓴다).
 */
function AddIntakePicker({
  projectId,
  primaryContactId,
  open,
  onOpenChange,
  triggerRef,
  busy,
  onAddIntake,
  onAddDeal,
}: {
  projectId: string;
  primaryContactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  busy: boolean;
  onAddIntake: (kind: "listing" | "buyer", intakeId: string) => void;
  onAddDeal: (dealId: string) => void;
}) {
  const candidatesQuery = useQuery({
    queryKey: [...planQueryKey(projectId), "candidates"],
    queryFn: () => api.projects.candidates(projectId),
    enabled: open,
    // 다른 탭에서 새 의뢰를 등록하고 돌아와 열면 그 의뢰가 바로 보이게 늘 새로 읽는다.
    staleTime: 0,
  });
  const candidates = candidatesQuery.data;
  const count = candidates
    ? candidates.listingIntakes.length + candidates.buyerIntakes.length + candidates.deals.length
    : 0;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button ref={triggerRef} type="button" data-project-add-intake className={cn(nb.line, "h-7 text-[13px]")}>
          <Plus />
          의뢰 담기
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-project-add-intake-picker
        className="max-h-[min(70vh,560px)] w-[440px] max-w-[calc(100vw-32px)] overflow-y-auto p-0"
      >
        <div className="px-6 pb-2 pt-3">
          <h3 className="text-[13px] font-semibold text-[#37352f]">이 프로젝트 고객의 의뢰 · 거래</h3>
          {candidatesQuery.isPending ? (
            <p className="mt-1 text-xs text-muted-foreground">불러오는 중</p>
          ) : candidatesQuery.isError ? (
            <p className="mt-1 text-xs text-destructive" role="alert">
              담을 의뢰를 불러오지 못했습니다.
            </p>
          ) : count === 0 || !candidates ? (
            <p className="mt-1 break-keep text-xs text-muted-foreground">
              이 프로젝트 고객에게 더 담을 의뢰가 없습니다. 새로 받은 의뢰면 아래에서 등록한 뒤 돌아와 담으세요.
            </p>
          ) : (
            <ul className="mt-1 divide-y text-sm">
              {orderCandidateIntakes(candidates).map((item) => (
                <CandidateRow
                  key={`${item.kind}-${item.id}`}
                  kind={item.kind === "listing" ? "매물 의뢰" : "구매 의뢰"}
                  label={
                    (item.kind === "listing" ? item.label : `${item.label} 구매 의뢰`) +
                    (item.lifecycleStatus === "closed" ? " (종료된 의뢰)" : "")
                  }
                  fresh={isFreshCandidate(item.createdAt)}
                  disabled={busy}
                  onAdd={() => onAddIntake(item.kind, item.id)}
                />
              ))}
              {candidates.deals.map((deal) => (
                <CandidateRow
                  key={`deal-${deal.id}`}
                  kind="거래"
                  label={
                    [deal.propertyLabel, getStatusMeta("dealStage", deal.stage).label].filter(Boolean).join(" · ") ||
                    "거래"
                  }
                  disabled={busy}
                  onAdd={() => onAddDeal(deal.id)}
                />
              ))}
            </ul>
          )}
        </div>
        <OtherCustomerCandidates
          projectId={projectId}
          disabled={busy}
          onAddIntake={onAddIntake}
          onAddDeal={onAddDeal}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-6 py-2.5 text-[12.5px] text-[#37352f]/55">
          <span>처음 받은 의뢰</span>
          <ProjectNewIntakeButtons
            projectId={projectId}
            primaryContactId={primaryContactId}
            className="[&_button]:h-7 [&_button]:text-[12.5px]"
            onOpen={() => onOpenChange(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── 빈 프로젝트: 시작 안내(흐름 모양의 흐린 상자) ─────────────────────

/**
 * 빈 프로젝트에서 "여기서 무엇을 하면 되는지". 순서대로 하지 않아도 된다 — 각 줄의 단추가 그 일을 하는 자리로
 * 데려간다(대표 고객 고르기 · 의뢰 담기 고르기 · 업무 칸 · 상담 · 코멘트 칸). 진행 흐름과 같은 모양(동그라미 · 세로선)에
 * 점선 상자로 아직 비어 있음을 보인다.
 */
function ProjectStarter({
  projectId,
  primaryContactId,
  hasPrimary,
  canConsult,
  onPickPrimary,
  onAddIntake,
  onWriteTask,
  onWriteNote,
}: {
  projectId: string;
  primaryContactId: string | null;
  hasPrimary: boolean;
  canConsult: boolean;
  onPickPrimary: () => void;
  onAddIntake: () => void;
  onWriteTask: () => void;
  onWriteNote: () => void;
}) {
  const lines: Array<{ title: string; description: string; action?: ReactNode; done?: boolean }> = [
    {
      title: "누구의 일인지 정하기",
      description: "대표 고객을 정하면 여기서 바로 전화하고 상담을 적습니다.",
      done: hasPrimary,
      action: !hasPrimary && (
        <button type="button" className={nb.line} onClick={onPickPrimary}>
          <UserRound />
          대표 고객 정하기
        </button>
      ),
    },
    {
      title: "의뢰 담기",
      description:
        "이미 등록한 매물 의뢰 · 구매 의뢰를 담습니다. 담은 뒤에는 카드를 끌어 순서를 정합니다. 처음 받은 의뢰면 먼저 등록합니다.",
      action: (
        <span className="flex flex-wrap items-center gap-1">
          <button type="button" className={nb.line} onClick={onAddIntake}>
            <Plus />
            의뢰 담기
          </button>
          <ProjectNewIntakeButtons projectId={projectId} primaryContactId={primaryContactId} />
        </span>
      ),
    },
    {
      title: "업무 적기",
      description: "해야 할 일을 업무 칸에 적으면 업무 화면 · 대시보드에도 나옵니다.",
      action: (
        <button type="button" className={nb.line} onClick={onWriteTask}>
          업무 적기
        </button>
      ),
    },
    {
      title: "상담 · 코멘트 남기기",
      description:
        "손님과 나눈 이야기는 상담(그 사람에게 저장), 직원끼리 남길 글은 코멘트(이 프로젝트에 저장)로 적습니다.",
      action: (
        <button type="button" className={nb.line} onClick={onWriteNote}>
          {canConsult ? "상담 적기" : "코멘트 적기"}
        </button>
      ),
    },
  ];
  // 아직 하지 않은 첫 줄이 지금 할 일이다.
  const currentIndex = lines.findIndex((line) => !line.done);
  return (
    <div data-project-starter>
      <p className="mb-2.5 text-[14px] leading-[22px] text-[#37352f]/65">
        아직 담은 의뢰나 정한 단계가 없습니다. 이 프로젝트에서 할 수 있는 일:
      </p>
      <ol>
        {lines.map((line, index) => {
          const state: PlanStageState = line.done ? "done" : index === currentIndex ? "current" : "upcoming";
          const last = index === lines.length - 1;
          return (
            <li key={line.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <Spine state={state} last={last} label={line.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1} />
              <div className={cn("min-w-0", !last && "pb-3")}>
                <div
                  className={cn(
                    "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[10px] px-3.5 py-3 outline-1 -outline-offset-1 outline-dashed",
                    state === "current" ? "bg-info/[0.04] outline-info/50" : "bg-white outline-[#d6d5d1]",
                  )}
                >
                  <div className="min-w-[220px] flex-1">
                    <p className={cn("text-[14px] font-semibold leading-[22px]", line.done && "text-[#37352f]/55")}>
                      {line.title}
                      {line.done && <span className="ml-1.5 text-[12.5px] font-normal text-success">정함</span>}
                    </p>
                    <p className="break-keep text-[13px] leading-5 text-[#37352f]/65">{line.description}</p>
                  </div>
                  {line.action && <div className="shrink-0">{line.action}</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
