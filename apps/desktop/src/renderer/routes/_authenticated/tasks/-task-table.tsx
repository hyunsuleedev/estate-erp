/**
 * tasks 페이지 목록 — 열 제목 없는 한 줄 행 + 회색 띠 묶음 머리.
 *
 * 행: [선택] [우선순위] [상태 체크] 제목 ··· [고객·매물 칩] [카테고리] [담당자] [마감일] [메뉴]
 * 값이 없는 정보는 칩을 그리지 않고, 담당자·마감일은 오른쪽 끝 같은 자리에 정렬한다.
 * 묶기(상태·마감일·카테고리·담당자·없음)와 정렬은 표시 메뉴에서 고르며,
 * 상태별 + 직접 정렬일 때만 행을 끌어서 순서·상태를 바꾼다(StatusView).
 */
import {
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type MouseEvent as ReactMouseEvent,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlarmClock,
  AlignLeft,
  Calendar,
  CalendarOff,
  CalendarRange,
  ChevronRight,
  GripVertical,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
} from 'lucide-react';
import type { Task } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TaskCategoryPill,
  TaskContextChips,
  TaskSourceBadge,
  categoryConfig,
  getCategoryConfig,
  statusIcons,
  taskStatusLabel,
  type TaskStatus,
} from './-task-shared';
import {
  ASSIGNEE_GROUP_UNASSIGNED,
  groupTasks,
  heldStatusOf,
  isTaskActive,
  type HeldTaskState,
  type TaskGroup,
} from './-task-filters';
import type { TaskGroupBy, TaskSortBy, TaskVisibleProps } from './-task-display';
import {
  DueDatePickerPopover,
  PriorityPickerPopover,
  TaskAssigneeAvatar,
  TaskAssigneePicker,
  TaskCompleteToggle,
  TaskRowActionsMenu,
  type TaskRowHandlers,
} from './-task-pickers';

export type { TaskRowHandlers };

/** 묶음 머리의 + 버튼으로 새 업무를 만들 때 미리 채울 값 */
export type TaskCreatePreset = { status?: string; category?: string };

export type TaskSelection = {
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (taskId: string) => void;
};

type TaskListCommonProps = TaskRowHandlers &
  TaskSelection & {
    visible: TaskVisibleProps;
    onAddTask?: (preset: TaskCreatePreset) => void;
  };

const CATEGORY_ORDER = Object.keys(categoryConfig);

const ROW_CONTROL_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="checkbox"], [role="menuitem"], [data-row-control]';

function openTaskFromRow(event: ReactMouseEvent<HTMLElement>, task: Task, onRowClick: (task: Task) => void) {
  const target = event.target;
  if (target instanceof Element) {
    const control = target.closest(ROW_CONTROL_SELECTOR);
    if (control && control !== event.currentTarget) return;
  }
  onRowClick(task);
}

// ─── 행 ───────────────────────────────────────────────────

type TaskLineProps = TaskRowHandlers &
  TaskSelection & {
    task: Task;
    visible: TaskVisibleProps;
    isDragging?: boolean;
    rowRef?: Ref<HTMLDivElement>;
    style?: CSSProperties;
    /** 끌기 — 행 어디서든 누른 채 움직이면 시작 (클릭은 그대로 동작) */
    dragProps?: HTMLAttributes<HTMLDivElement>;
    /** 키보드 끌기용 숨은 손잡이 */
    dragHandle?: ReactNode;
  };

function TaskLine({
  task,
  visible,
  selectedIds,
  onToggleSelect,
  isDragging = false,
  rowRef,
  style,
  dragProps,
  dragHandle,
  onRowClick,
  onStatusChange,
  onCycleCheck,
  onDelete,
  onUpdate,
  employeeOptions,
}: TaskLineProps) {
  const selected = selectedIds.has(task.id);
  const selecting = selectedIds.size > 0;
  const done = !isTaskActive(task);

  return (
    <div
      {...dragProps}
      ref={rowRef}
      role="row"
      aria-selected={selected}
      data-task-row={task.id}
      style={style}
      onDoubleClick={(event) => openTaskFromRow(event, task, onRowClick)}
      className={cn(
        'group/row flex h-10 items-center pr-2 pl-1 transition-colors hover:bg-muted/40',
        selected && 'bg-info-soft/40 hover:bg-info-soft/50',
        isDragging && 'opacity-40',
      )}
    >
      <div role="cell" className="flex w-7 shrink-0 justify-center">
        {dragHandle}
        <Checkbox
          aria-label={`${task.title} 선택`}
          checked={selected}
          onCheckedChange={() => onToggleSelect(task.id)}
          className={cn(
            'transition-opacity',
            selected || selecting ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
          )}
        />
      </div>
      <div role="cell" className="flex w-7 shrink-0 justify-center">
        <PriorityPickerPopover task={task} onUpdate={onUpdate} iconOnly />
      </div>
      <div role="cell" className="flex w-7 shrink-0 justify-center">
        <TaskCompleteToggle task={task} onCycle={onCycleCheck} />
      </div>

      <div role="cell" className="flex min-w-0 flex-1 items-center gap-1.5 pr-3 pl-2">
        <button
          type="button"
          className={cn(
            'min-w-0 truncate text-left text-[13.5px] font-medium leading-5 tracking-[-0.005em] underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
            done && 'text-muted-foreground',
          )}
          aria-label={`${task.title} 업무 열기`}
          onClick={() => onRowClick(task)}
        >
          {task.title}
        </button>
        {task.source === 'ai' && (
          <span className="inline-flex shrink-0 text-violet" title="AI가 만든 업무 (통화 분석·외부 AI)">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span className="sr-only">AI가 만든 업무</span>
          </span>
        )}
        {task.source === 'system' && <TaskSourceBadge source="system" />}
        {task.content?.trim() && (
          <span
            className="inline-flex shrink-0 text-muted-foreground/60"
            title={task.content.length > 120 ? `${task.content.slice(0, 120)}…` : task.content}
          >
            <AlignLeft className="size-3" aria-hidden="true" />
            <span className="sr-only">설명 있음</span>
          </span>
        )}
      </div>

      <div role="cell" className={cn('flex shrink-0 items-center gap-1.5', done && 'opacity-60')}>
        {visible.context && <TaskContextChips task={task} variant="pill" limit={2} />}
        {visible.category && <TaskCategoryPill category={task.category} />}
      </div>
      {visible.assignee && (
        <div role="cell" className="ml-1 flex w-9 shrink-0 justify-center">
          <TaskAssigneePicker task={task} employeeOptions={employeeOptions} onUpdate={onUpdate} compact />
        </div>
      )}
      {visible.due && (
        <div role="cell" className="flex w-[84px] shrink-0 justify-end">
          <DueDatePickerPopover task={task} onUpdate={onUpdate} compact />
        </div>
      )}
      <div role="cell" className="flex w-8 shrink-0 justify-end">
        <TaskRowActionsMenu
          task={task}
          onRowClick={onRowClick}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        />
      </div>
    </div>
  );
}

// ─── 묶음 머리 ─────────────────────────────────────────────

function TaskGroupHeader({
  icon,
  label,
  count,
  collapsed,
  onToggle,
  onAdd,
  highlight = false,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  /** 접힌 묶음 위로 끌고 왔을 때 */
  highlight?: boolean;
}) {
  const addLabel = `${label} 업무 추가`;
  return (
    <div
      role="row"
      className={cn(
        'group/header sticky top-0 z-[5] flex h-9 items-center gap-1 border-y border-[#efeeec] bg-[#f7f7f5] pr-3 pl-2 dark:border-border dark:bg-muted',
        highlight && 'bg-info-soft/70',
      )}
    >
      <div role="cell" className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
            aria-hidden="true"
          />
          <span className="flex shrink-0 items-center [&>svg]:size-3.5">{icon}</span>
          <span className="truncate">{label}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
        </button>
        {onAdd && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-muted-foreground opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100"
            onClick={onAdd}
            aria-label={addLabel}
            title={addLabel}
          >
            <Plus />
          </Button>
        )}
      </div>
    </div>
  );
}

const DUE_GROUP_META: Record<string, { label: string; icon: ReactNode }> = {
  overdue: { label: '기한 지남', icon: <AlarmClock className="text-destructive" /> },
  today: { label: '오늘', icon: <Sun className="text-orange" /> },
  tomorrow: { label: '내일', icon: <Sunrise className="text-muted-foreground" /> },
  week: { label: '7일 이내', icon: <CalendarRange className="text-muted-foreground" /> },
  later: { label: '나중', icon: <Calendar className="text-muted-foreground/70" /> },
  none: { label: '마감일 없음', icon: <CalendarOff className="text-muted-foreground/70" /> },
};

function CategoryDot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

function groupMeta(
  groupBy: TaskGroupBy,
  group: TaskGroup,
  currentUserId: string | null,
): { label: string; icon: ReactNode; addPreset?: TaskCreatePreset } {
  const { key, tasks } = group;
  const isStatusKey = key in statusIcons;
  if (groupBy === 'status' || (groupBy === 'due' && isStatusKey)) {
    return {
      label: taskStatusLabel(key),
      icon: statusIcons[key as TaskStatus] ?? null,
      addPreset: groupBy === 'status' && key !== 'cancelled' ? { status: key } : undefined,
    };
  }
  if (groupBy === 'due') return DUE_GROUP_META[key] ?? { label: key, icon: null };
  if (groupBy === 'category') {
    const cfg = getCategoryConfig(key);
    return { label: cfg.label, icon: <CategoryDot color={cfg.dot} />, addPreset: { category: key } };
  }
  if (groupBy === 'assignee') {
    if (key === ASSIGNEE_GROUP_UNASSIGNED) {
      return { label: '미배정', icon: <TaskAssigneeAvatar name={null} className="size-[18px]" /> };
    }
    const name = tasks[0]?.assignedTo?.name ?? '담당자';
    return {
      label: key === currentUserId ? `${name} (나)` : name,
      icon: <TaskAssigneeAvatar name={name} className="size-[18px] [&_[data-slot=avatar-fallback]]:text-[9.5px]" />,
    };
  }
  return { label: '', icon: null };
}

/** 완료·취소 묶음은 기본으로 접는다 — 단, 그 묶음 하나뿐이면 펼친다(완료만 걸러 본 경우 등) */
const DEFAULT_COLLAPSED = new Set(['completed', 'cancelled']);

function useGroupCollapse(groupCount: number) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isCollapsed = (key: string) => overrides.get(key) ?? (DEFAULT_COLLAPSED.has(key) && groupCount > 1);
  const toggle = (key: string) => {
    const next = !isCollapsed(key);
    setOverrides((prev) => new Map(prev).set(key, next));
  };
  return { isCollapsed, toggle };
}

// ─── 묶음 목록 (끌기 없음) ─────────────────────────────────

export function TaskGroupedList({
  tasks,
  groupBy,
  sortBy,
  heldTasks,
  currentUserId,
  visible,
  selectedIds,
  onToggleSelect,
  onAddTask,
  ...handlers
}: TaskListCommonProps & {
  tasks: Task[];
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
  heldTasks?: ReadonlyMap<string, HeldTaskState>;
  currentUserId: string | null;
}) {
  const groups = useMemo(
    () => groupTasks(tasks, groupBy, { sortBy, held: heldTasks, currentUserId, categoryOrder: CATEGORY_ORDER }),
    [tasks, groupBy, sortBy, heldTasks, currentUserId],
  );
  const collapse = useGroupCollapse(groups.length);

  const renderRows = (rows: Task[]) =>
    rows.map((task) => (
      <TaskLine
        key={task.id}
        task={task}
        visible={visible}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        {...handlers}
      />
    ));

  return (
    <div role="table" aria-label="업무 목록" className="@container/tasklist">
      {groups.map((group) => {
        if (groupBy === 'none') {
          return (
            <div role="rowgroup" key={group.key} className="pt-1">
              {renderRows(group.tasks)}
            </div>
          );
        }
        const meta = groupMeta(groupBy, group, currentUserId);
        const collapsed = collapse.isCollapsed(group.key);
        const preset = meta.addPreset;
        return (
          <div role="rowgroup" key={group.key}>
            <TaskGroupHeader
              icon={meta.icon}
              label={meta.label}
              count={group.tasks.length}
              collapsed={collapsed}
              onToggle={() => collapse.toggle(group.key)}
              onAdd={preset && onAddTask ? () => onAddTask(preset) : undefined}
            />
            {!collapsed && renderRows(group.tasks)}
          </div>
        );
      })}
    </div>
  );
}

// ─── 상태별 + 직접 정렬 (끌어서 순서·상태 변경) ─────────────────

export function StatusView({
  filteredTasks,
  heldTasks,
  columns,
  onReorder,
  visible,
  selectedIds,
  onToggleSelect,
  onAddTask,
  ...handlers
}: TaskListCommonProps & {
  filteredTasks: Task[];
  /** 방금 체크·선택으로 상태를 바꾼 업무 — 바꾸기 전 묶음에 그대로 둔다 */
  heldTasks?: ReadonlyMap<string, HeldTaskState>;
  /** 보여 줄 상태 묶음 (위에서부터) */
  columns: readonly TaskStatus[];
  onReorder?: (orderedIds: string[]) => void;
}) {
  const { onStatusChange } = handlers;
  const [activeId, setActiveId] = useState<string | null>(null);

  // 로컬에는 상태별 "순서(id)"만 둔다 — 업무 데이터는 항상 props에서 읽어 인라인 수정이 즉시 보인다.
  const [order, setOrder] = useState<Record<string, string[]>>({});
  // 묶음 간 드롭 직후 낙관적 캐시가 반영되기 전 한 프레임 동안만 쓰는 상태 덮어쓰기
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [seenTasks, setSeenTasks] = useState(filteredTasks);
  if (seenTasks !== filteredTasks) {
    setSeenTasks(filteredTasks);
    if (Object.keys(statusOverrides).length > 0) setStatusOverrides({});
  }

  const localTaskMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const status of columns) {
      const colTasks = filteredTasks
        .filter((t) => (statusOverrides[t.id] ?? heldStatusOf(t, heldTasks)) === status)
        .map((t) => (statusOverrides[t.id] ? { ...t, status: statusOverrides[t.id] } : t));
      const byId = new Map(colTasks.map((t) => [t.id, t]));
      const ordered = (order[status] ?? []).flatMap((id) => {
        const task = byId.get(id);
        return task ? [task] : [];
      });
      const orderedIds = new Set(ordered.map((t) => t.id));
      map[status] = [...ordered, ...colTasks.filter((t) => !orderedIds.has(t.id))];
    }
    return map;
  }, [columns, filteredTasks, heldTasks, order, statusOverrides]);

  const nonEmptyCount = columns.filter((status) => (localTaskMap[status]?.length ?? 0) > 0).length;
  const collapse = useGroupCollapse(nonEmptyCount);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): string | null => {
    if ((columns as readonly string[]).includes(id)) return id;
    for (const [status, tasks] of Object.entries(localTaskMap)) {
      if (tasks.some((t) => t.id === id)) return status;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      if (active.id === over.id) return;
      const tasks = localTaskMap[activeContainer];
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reorderedIds = arrayMove(tasks, oldIndex, newIndex).map((t) => t.id);
      setOrder((prev) => ({ ...prev, [activeContainer]: reorderedIds }));
      onReorder?.(reorderedIds);
      return;
    }

    // 다른 묶음으로 이동 → status 변경 (드롭한 위치에 삽입)
    const movedId = active.id as string;
    const toIds = localTaskMap[overContainer].map((t) => t.id);
    const overIndex = toIds.indexOf(over.id as string);
    if (overIndex !== -1) toIds.splice(overIndex, 0, movedId);
    else toIds.push(movedId);
    setOrder((prev) => ({ ...prev, [overContainer]: toIds }));
    setStatusOverrides((prev) => ({ ...prev, [movedId]: overContainer }));
    onStatusChange(movedId, overContainer, { fromDrag: true });
  };

  const activeTask = activeId
    ? Object.values(localTaskMap).flat().find((t) => t.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div role="table" aria-label="상태별 업무" className="@container/tasklist">
        {columns.map((status) => (
          <StatusGroup
            key={status}
            status={status}
            tasks={localTaskMap[status] ?? []}
            collapsed={collapse.isCollapsed(status)}
            onToggle={() => collapse.toggle(status)}
            visible={visible}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onAddTask={onAddTask}
            {...handlers}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[13px] shadow-lg">
            <GripVertical className="size-4 text-muted-foreground" />
            <span className="truncate font-medium">{activeTask.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StatusGroup({
  status,
  tasks,
  collapsed,
  onToggle,
  onAddTask,
  ...rowProps
}: TaskListCommonProps & {
  status: TaskStatus;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = taskStatusLabel(status);

  return (
    <div role="rowgroup" ref={setNodeRef}>
      <TaskGroupHeader
        icon={statusIcons[status]}
        label={label}
        count={tasks.length}
        collapsed={collapsed}
        onToggle={onToggle}
        onAdd={onAddTask && status !== 'cancelled' ? () => onAddTask({ status }) : undefined}
        highlight={isOver && collapsed}
      />
      {!collapsed && (
        <div className={cn('transition-colors', isOver && 'bg-accent/40')}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <SortableTaskLine key={task.id} task={task} {...rowProps} />
            ))}
            {tasks.length === 0 && (
              <div className="mx-3 my-2 rounded-md border border-dashed border-border py-2.5 text-center text-xs text-muted-foreground">
                여기로 끌어 놓으면 ‘{label}’ 상태로 바뀝니다
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function SortableTaskLine(props: TaskRowHandlers & TaskSelection & { task: Task; visible: TaskVisibleProps }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  });
  // dnd-kit은 리스너를 Function으로 내려주므로 React 이벤트 핸들러로 좁힌다
  const onPointerDown = listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined;
  const onKeyDown = listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined;

  return (
    <TaskLine
      {...props}
      rowRef={setNodeRef}
      isDragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // 마우스: 행 어디서든 8px 이상 끌면 시작 — 짧은 클릭은 체크·칩·제목에 그대로 전달
      dragProps={{ onPointerDown }}
      // 키보드: 행 안 버튼의 Enter/Space가 끌기를 시작하지 않도록 따로 둔 숨은 손잡이에서만
      dragHandle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onKeyDown={onKeyDown}
          data-row-control
          aria-label={`${props.task.title} 끌어서 순서·상태 변경`}
          className="sr-only"
        />
      }
    />
  );
}

// ─── Loading ──────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="업무 불러오는 중">
      <div className="flex h-9 items-center border-y border-border/60 bg-muted/40 px-4">
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-4">
          <Skeleton className="size-3.5 rounded-sm" />
          <Skeleton className="size-[18px] rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${50 - (i % 3) * 10}%` }} />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="size-[22px] rounded-full" />
            <Skeleton className="h-3.5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
