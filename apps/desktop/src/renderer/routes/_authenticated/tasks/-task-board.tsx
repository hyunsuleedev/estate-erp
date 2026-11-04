/**
 * tasks 페이지 보드(칸반) 뷰 — 대기 / 진행 중 / 완료 3컬럼, 카드 드래그로 상태 변경.
 */
import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { Task } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DueDateText,
  TaskCategoryTag,
  TaskContextChips,
  TaskPriorityLabel,
  TaskSourceBadge,
  TaskStatusIcon,
  boardColumns,
  isOverdue,
} from './-task-shared';
import { TaskCompleteToggle, TaskRowActionsMenu } from './-task-pickers';
import { heldStatusOf, type HeldTaskState } from './-task-filters';
import type { StatusChangeOptions } from './-task-shared';

type BoardHandlers = {
  onEdit: (task: Task) => void;
  onStatusChange: (id: string, status: string, options?: StatusChangeOptions) => void;
  onCycleCheck: (id: string) => void;
  onDelete: (task: Task) => void;
  onAddTask: (status: string) => void;
};

/** DragOverlay 미리보기 카드는 조작하지 않는다 */
const noop = () => undefined;

const CARD_CONTROL_SELECTOR = 'button, a, input, [role="button"], [role="checkbox"], [role="menuitem"]';

export function BoardView({
  tasks,
  heldTasks,
  ...handlers
}: BoardHandlers & {
  tasks: Task[];
  /** 방금 체크·메뉴로 상태를 바꾼 카드 — 바꾸기 전 컬럼에 그대로 둔다 */
  heldTasks?: ReadonlyMap<string, HeldTaskState>;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const task = activeTask;
    setActiveTask(null);
    const { over } = event;
    if (!over || !task) return;
    const newStatus = over.id as string;
    // 카드가 보이는 컬럼 기준으로 비교 (제자리 유지 중인 카드는 실제 상태와 컬럼이 다를 수 있음)
    const shownStatus = heldStatusOf(task, heldTasks);
    if (boardColumns.some((c) => c.status === newStatus) && newStatus !== shownStatus) {
      handlers.onStatusChange(task.id, newStatus, { fromDrag: true });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid min-h-full grid-cols-3 gap-3 pt-3">
        {boardColumns.map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            tasks={tasks.filter((t) => heldStatusOf(t, heldTasks) === column.status)}
            {...handlers}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="pointer-events-none w-72 rotate-1 opacity-95 shadow-lg">
            <KanbanCard
              task={activeTask}
              onEdit={noop}
              onStatusChange={noop}
              onCycleCheck={noop}
              onDelete={noop}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  column,
  tasks,
  onEdit,
  onStatusChange,
  onCycleCheck,
  onDelete,
  onAddTask,
}: BoardHandlers & { column: (typeof boardColumns)[number]; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <section aria-label={`${column.title} ${tasks.length}건`} className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <TaskStatusIcon status={column.status} />
          {column.title}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{tasks.length}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => onAddTask(column.status)}
          aria-label={`${column.title} 상태로 업무 추가`}
          title={`${column.title} 상태로 업무 추가`}
        >
          <Plus />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-lg p-1.5 transition-shadow',
          column.columnBg,
          isOver && 'ring-2 ring-info/40',
        )}
      >
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <DraggableBoardCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onCycleCheck={onCycleCheck}
              onDelete={onDelete}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start text-muted-foreground hover:bg-background/70"
            onClick={() => onAddTask(column.status)}
          >
            <Plus className="size-4" />새 업무
          </Button>
        </div>
      </div>
    </section>
  );
}

type CardProps = {
  task: Task;
  onEdit: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onCycleCheck: (id: string) => void;
  onDelete: (task: Task) => void;
};

function DraggableBoardCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-board-draggable
      aria-label={`${props.task.title} 카드 — 끌어서 상태 변경`}
      className={cn('touch-none rounded-md', isDragging && 'opacity-40')}
    >
      <KanbanCard {...props} />
    </div>
  );
}

function KanbanCard({ task, onEdit, onStatusChange, onCycleCheck, onDelete }: CardProps) {
  const overdue = isOverdue(task);
  const completed = task.status === 'completed';

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    // 완료 체크·메뉴(포털 포함)·칩 클릭은 각자 동작 — 카드 열기와 분리.
    // 드래그 래퍼(role=button)는 컨트롤로 보지 않는다.
    const control =
      event.target instanceof Element ? event.target.closest(CARD_CONTROL_SELECTOR) : null;
    if (control && !control.hasAttribute('data-board-draggable')) return;
    onEdit(task);
  };

  return (
    <div
      className={cn(
        'group/card cursor-pointer rounded-md border border-border/70 bg-background p-2.5 shadow-xs transition-shadow hover:shadow-sm',
        overdue && 'shadow-[inset_2px_0_0_var(--color-destructive)]',
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <TaskCompleteToggle task={task} onCycle={onCycleCheck} className="mt-px" />
        <h4
          className={cn(
            'min-w-0 flex-1 text-[13px] leading-5 font-medium',
            completed && 'text-muted-foreground line-through decoration-muted-foreground/50',
          )}
        >
          {task.title}
        </h4>
        <TaskSourceBadge source={task.source} className="mt-0.5" />
        <TaskRowActionsMenu
          task={task}
          onRowClick={onEdit}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          className="-mt-0.5 -mr-1 size-6 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        />
      </div>

      <TaskContextChips task={task} compact className="mt-1 pl-[26px]" />

      {/* 메타 한 줄: 우선순위 · 카테고리 ……… 마감 · 담당 */}
      <div className="mt-2.5 flex items-center gap-3 pl-[26px]">
        <TaskPriorityLabel priority={task.priority} />
        <TaskCategoryTag category={task.category} className="min-w-0" />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {task.dueDate && <DueDateText task={task} />}
          {task.assignedTo ? (
            <Avatar className="size-5" title={task.assignedTo.name}>
              <AvatarFallback className="text-[10px]">{task.assignedTo.name.charAt(0)}</AvatarFallback>
            </Avatar>
          ) : (
            <span
              className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground"
              title="미배정"
            >
              ?
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
