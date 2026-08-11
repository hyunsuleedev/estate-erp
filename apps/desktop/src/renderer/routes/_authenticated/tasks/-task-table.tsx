/**
 * tasks 페이지 테이블 뷰 — Notion 스타일 행(전체/카테고리별) + 상태별 DnD 그룹.
 */
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext,
  DragOverlay,
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, GripVertical } from 'lucide-react';
import type { Task } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  TaskContextChips,
  TaskSourceBadge,
  boardColumns,
  categoryConfig,
  isOverdue,
  statusIcons,
  type TaskCategory,
} from './-task-shared';
import {
  DueDatePickerPopover,
  PriorityPickerPopover,
  StatusPickerPopover,
  TaskAssigneePicker,
  TaskRowActionsMenu,
  type TaskRowHandlers,
} from './-task-pickers';

export type { TaskRowHandlers };

const ROW_CONTROL_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-row-control]';

function openTaskFromRow(event: ReactMouseEvent<HTMLElement>, task: Task, onRowClick: (task: Task) => void) {
  const target = event.target;
  if (target instanceof Element) {
    const control = target.closest(ROW_CONTROL_SELECTOR);
    if (control && control !== event.currentTarget) return;
  }
  onRowClick(task);
}

function TaskTitleCell({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const completed = task.status === 'completed';

  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-5 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline',
            completed && 'text-muted-foreground line-through',
          )}
          aria-label={`${task.title} 업무 열기`}
          onClick={() => onOpen(task)}
        >
          {task.title}
        </button>
        <TaskSourceBadge source={task.source} />
      </div>
      <TaskContextChips task={task} compact className="pl-5" />
    </div>
  );
}

// ─── Notion Table Header ──────────────────────────────────

export function NotionTableHeader({
  showCategory = true,
  showCheckbox = false,
  showDragHandle = false,
  isAllSelected = false,
  onToggleAll,
}: {
  showCategory?: boolean;
  showCheckbox?: boolean;
  showDragHandle?: boolean;
  isAllSelected?: boolean;
  onToggleAll?: () => void;
}) {
  return (
    <tr className="border-b border-border/40 text-xs text-muted-foreground">
      {showDragHandle && <th className="w-[28px]" />}
      {showCheckbox && (
        <th className="w-[40px] px-2.5 py-2">
          <Checkbox checked={isAllSelected} onCheckedChange={onToggleAll} />
        </th>
      )}
      <th className="w-[50px] px-2.5 py-2 text-left font-medium">No</th>
      <th className="px-2.5 py-2 text-left font-medium">작업</th>
      <th className="w-[90px] px-2.5 py-2 text-left font-medium">상태</th>
      <th className="w-[80px] px-2.5 py-2 text-left font-medium">담당자</th>
      <th className="w-[100px] px-2.5 py-2 text-left font-medium">마감일</th>
      <th className="w-[70px] px-2.5 py-2 text-left font-medium">우선순위</th>
      {showCategory && <th className="w-[110px] px-2.5 py-2 text-left font-medium">카테고리</th>}
      <th className="w-[40px]" />
    </tr>
  );
}

// ─── Notion Table Row ─────────────────────────────────────

type NotionRowProps = TaskRowHandlers & {
  task: Task;
  index: number;
  showCategory?: boolean;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
};

export function NotionTableRow({
  task,
  index,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  employeeOptions,
  showCategory = true,
  showCheckbox = false,
  isSelected = false,
  onToggleSelect,
}: NotionRowProps) {
  const overdue = isOverdue(task);

  return (
    <tr
      onDoubleClick={(event) => openTaskFromRow(event, task, onRowClick)}
      className={cn(
        'group/row border-b border-border/40 text-sm transition-colors hover:bg-muted/30',
        overdue && 'bg-destructive-soft/30',
        isSelected && 'bg-info-soft/30',
      )}
    >
      {showCheckbox && (
        <td className="px-2.5 py-1.5">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect?.(task.id)} />
        </td>
      )}
      <NotionTableRowCells
        task={task}
        index={index}
        onRowClick={onRowClick}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
        onUpdate={onUpdate}
        employeeOptions={employeeOptions}
        showCategory={showCategory}
      />
    </tr>
  );
}

function NotionTableRowCells({
  task,
  index,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  employeeOptions,
  showCategory = true,
}: TaskRowHandlers & {
  task: Task;
  index: number;
  showCategory?: boolean;
}) {
  const cCfg = categoryConfig[task.category as TaskCategory] ?? categoryConfig.other;

  return (
    <>
      <td className="px-2.5 py-1.5 tabular-nums text-muted-foreground">{index}</td>
      <td className="px-2.5 py-1.5">
        <TaskTitleCell task={task} onOpen={onRowClick} />
      </td>

      {/* 상태 — 클릭 시 인라인 선택 */}
      <td className="px-2.5 py-1.5">
        <StatusPickerPopover task={task} onUpdate={onUpdate} />
      </td>

      {/* 담당자 — 클릭 시 인라인 표시 */}
      <td className="px-2.5 py-1.5">
        <TaskAssigneePicker task={task} employeeOptions={employeeOptions} onUpdate={onUpdate} />
      </td>

      {/* 마감일 — 클릭 시 인라인 날짜 선택 */}
      <td className="px-2.5 py-1.5">
        <DueDatePickerPopover task={task} onUpdate={onUpdate} />
      </td>

      {/* 우선순위 — 클릭 시 인라인 선택 */}
      <td className="px-2.5 py-1.5">
        <PriorityPickerPopover task={task} onUpdate={onUpdate} />
      </td>

      {showCategory && (
        <td className="px-2.5 py-1.5">
          <Badge className={cn(cCfg.color, 'gap-1 text-xs')}>
            {cCfg.icon}
            {cCfg.label}
          </Badge>
        </td>
      )}
      <td className="px-2 py-1.5">
        <TaskRowActionsMenu task={task} onRowClick={onRowClick} onStatusChange={onStatusChange} onDelete={onDelete} />
      </td>
    </>
  );
}

// ─── Status View (상위 DndContext — 크로스 그룹 이동 지원) ──

export function StatusView({
  filteredTasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  onReorder,
  employeeOptions,
}: TaskRowHandlers & {
  filteredTasks: Task[];
  onReorder?: (orderedIds: string[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // 로컬 순서 관리 (status별)
  const [localTaskMap, setLocalTaskMap] = useState<Record<string, Task[]>>(() => {
    const map: Record<string, Task[]> = {};
    for (const col of boardColumns) {
      map[col.status] = filteredTasks.filter((t) => t.status === col.status);
    }
    return map;
  });

  // prop sync: task 멤버십 또는 status가 바뀔 때 동기화
  // (status를 시그니처에 포함 — 인라인 상태 변경/낙관적 캐시 롤백 시 그룹 재배치)
  const prevIdsRef = useRef('');
  const propIds = useMemo(
    () => filteredTasks.map((t) => `${t.id}:${t.status}`).sort().join(','),
    [filteredTasks],
  );
  if (propIds !== prevIdsRef.current) {
    prevIdsRef.current = propIds;
    const propMap = new Map(filteredTasks.map((t) => [t.id, t]));
    const newMap: Record<string, Task[]> = {};
    for (const col of boardColumns) {
      const colPropTasks = filteredTasks.filter((t) => t.status === col.status);
      const prev = localTaskMap[col.status] || [];
      const prevOrder = prev.map((t) => t.id);
      // 기존 로컬 순서 유지 + 데이터 업데이트
      const synced = prevOrder.filter((id) => propMap.has(id) && propMap.get(id)!.status === col.status).map((id) => propMap.get(id)!);
      // 새로 추가된 task (이 status에 새로 들어온 것)
      const syncedIds = new Set(synced.map((t) => t.id));
      const added = colPropTasks.filter((t) => !syncedIds.has(t.id));
      newMap[col.status] = [...synced, ...added];
    }
    setLocalTaskMap(newMap);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // task ID → status 매핑
  const findContainer = (taskId: string): string | null => {
    for (const [status, tasks] of Object.entries(localTaskMap)) {
      if (tasks.some((t) => t.id === taskId)) return status;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    // over가 task ID인지 container ID인지 확인
    let overContainer = findContainer(over.id as string);
    if (!overContainer) {
      // over.id가 status 이름(container)일 수 있음
      if (boardColumns.some((c) => c.status === over.id)) {
        overContainer = over.id as string;
      }
    }

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      // 같은 그룹 내 리오더
      if (active.id === over.id) return;
      const tasks = localTaskMap[activeContainer];
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(tasks, oldIndex, newIndex);
      setLocalTaskMap((prev) => ({ ...prev, [activeContainer]: reordered }));
      onReorder?.(reordered.map((t) => t.id));
    } else {
      // 다른 그룹으로 이동 → status 변경
      const task = localTaskMap[activeContainer].find((t) => t.id === active.id);
      if (!task) return;
      // 로컬 상태 즉시 업데이트
      const fromTasks = localTaskMap[activeContainer].filter((t) => t.id !== active.id);
      const toTasks = [...localTaskMap[overContainer]];
      // over가 task라면 그 위치에 삽입, 아니면 끝에 추가
      const overIndex = toTasks.findIndex((t) => t.id === over.id);
      const movedTask = { ...task, status: overContainer };
      if (overIndex !== -1) {
        toTasks.splice(overIndex, 0, movedTask);
      } else {
        toTasks.push(movedTask);
      }
      setLocalTaskMap((prev) => ({
        ...prev,
        [activeContainer]: fromTasks,
        [overContainer]: toTasks,
      }));
      // 서버에 status 변경 전송
      onStatusChange(active.id as string, overContainer);
    }
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
      <div>
        {boardColumns.map((column) => (
          <StatusGroup
            key={column.status}
            column={column}
            tasks={localTaskMap[column.status] || []}
            onRowClick={onRowClick}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            onUpdate={onUpdate}
            employeeOptions={employeeOptions}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center rounded-md border border-border bg-background text-sm opacity-90 shadow-lg">
            <div className="flex w-[28px] shrink-0 items-center justify-center px-1 py-2">
              <GripVertical className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1 truncate px-3 py-2">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Status Group (droppable + sortable) ─────────────────

function StatusGroup({
  column,
  tasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  employeeOptions,
}: TaskRowHandlers & {
  column: typeof boardColumns[number];
  tasks: Task[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="mb-6">
      <div
        className="flex cursor-pointer items-center gap-2 rounded py-2 hover:bg-muted/30"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('text-xs transition-transform', !isCollapsed && 'rotate-90')}>▶</span>
        {statusIcons[column.status]}
        <span className="font-medium">{column.title}</span>
        <span className="text-sm text-muted-foreground">{tasks.length}</span>
      </div>
      {!isCollapsed && (
        <>
          {/* Header row */}
          <div className="flex items-center border-b border-border/40 text-xs text-muted-foreground">
            <div className="w-[28px] shrink-0" />
            <div className="w-[50px] shrink-0 px-2.5 py-2 font-medium">No</div>
            <div className="flex-1 px-2.5 py-2 font-medium">작업</div>
            <div className="w-[90px] shrink-0 px-2.5 py-2 font-medium">상태</div>
            <div className="w-[80px] shrink-0 px-2.5 py-2 font-medium">담당자</div>
            <div className="w-[100px] shrink-0 px-2.5 py-2 font-medium">마감일</div>
            <div className="w-[70px] shrink-0 px-2.5 py-2 font-medium">우선순위</div>
            <div className="w-[110px] shrink-0 px-2.5 py-2 font-medium">카테고리</div>
            <div className="w-[40px] shrink-0" />
          </div>
          <div ref={setNodeRef} className={cn('min-h-[40px] rounded transition-colors', isOver && 'bg-accent/50')}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task, idx) => (
                <SortableTableRow
                  key={task.id}
                  task={task}
                  index={idx + 1}
                  onRowClick={onRowClick}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  employeeOptions={employeeOptions}
                />
              ))}
              {tasks.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  여기에 드롭하여 상태 변경
                </div>
              )}
            </SortableContext>
          </div>
          <div className="py-2 text-center text-xs text-muted-foreground">
            완료 {completedCount}/{tasks.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sortable Table Row (DnD wrapper) ────────────────────

function SortableTableRow(props: TaskRowHandlers & { task: Task; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  const overdue = isOverdue(props.task);
  const cCfg = categoryConfig[props.task.category as TaskCategory] ?? categoryConfig.other;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onDoubleClick={(event) => openTaskFromRow(event, props.task, props.onRowClick)}
      className={cn(
        'group/row flex items-center border-b border-border/40 text-sm transition-colors hover:bg-muted/30',
        overdue && 'bg-destructive-soft/30',
        isDragging && 'z-10 rounded-md bg-muted/50 shadow-md',
      )}
    >
      {/* Drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        data-row-control
        className="flex w-[28px] shrink-0 cursor-grab touch-none items-center justify-center px-1 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="size-4 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>
      {/* No */}
      <div className="w-[50px] shrink-0 px-2.5 py-1.5 tabular-nums text-muted-foreground">{props.index}</div>
      {/* 작업 */}
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        <TaskTitleCell task={props.task} onOpen={props.onRowClick} />
      </div>
      {/* 상태 */}
      <div className="w-[90px] shrink-0 px-2.5 py-1.5">
        <StatusPickerPopover task={props.task} onUpdate={props.onUpdate} />
      </div>
      {/* 담당자 */}
      <div className="w-[80px] shrink-0 px-2.5 py-1.5">
        <TaskAssigneePicker task={props.task} employeeOptions={props.employeeOptions} onUpdate={props.onUpdate} />
      </div>
      {/* 마감일 */}
      <div className="w-[100px] shrink-0 px-2.5 py-1.5">
        <DueDatePickerPopover task={props.task} onUpdate={props.onUpdate} />
      </div>
      {/* 우선순위 */}
      <div className="w-[70px] shrink-0 px-2.5 py-1.5">
        <PriorityPickerPopover task={props.task} onUpdate={props.onUpdate} />
      </div>
      {/* 카테고리 */}
      <div className="w-[110px] shrink-0 px-2.5 py-1.5">
        <Badge className={cn(cCfg.color, 'gap-1 text-xs')}>
          {cCfg.icon}
          {cCfg.label}
        </Badge>
      </div>
      {/* 액션 */}
      <div className="w-[40px] shrink-0 px-2 py-1.5">
        <TaskRowActionsMenu task={props.task} onRowClick={props.onRowClick} onStatusChange={props.onStatusChange} onDelete={props.onDelete} />
      </div>
    </div>
  );
}

// ─── Category Task Table (카테고리별 그룹) ────────────────

export function CategoryTaskTable({
  categoryData,
  tasks,
  onRowClick,
  onStatusChange,
  onDelete,
  onUpdate,
  employeeOptions,
}: TaskRowHandlers & {
  categoryData: { label: string; icon: React.ReactNode; color: string };
  tasks: Task[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="mb-6">
      <div
        className="flex cursor-pointer items-center gap-2 rounded py-2 hover:bg-muted/30"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className={cn('text-xs transition-transform', !isCollapsed && 'rotate-90')}>▶</span>
        {categoryData.icon}
        <span className="font-medium">{categoryData.label}</span>
        <span className="text-sm text-muted-foreground">{tasks.length}</span>
      </div>
      {!isCollapsed && (
        <>
          <table className="w-full">
            <thead>
              <NotionTableHeader showCategory={false} />
            </thead>
            <tbody>
              {tasks.map((task, idx) => (
                <NotionTableRow
                  key={task.id}
                  task={task}
                  index={idx + 1}
                  onRowClick={onRowClick}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  employeeOptions={employeeOptions}
                  showCategory={false}
                />
              ))}
            </tbody>
          </table>
          <div className="py-2 text-center text-xs text-muted-foreground">
            완료 {completedCount}/{tasks.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
