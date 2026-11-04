/**
 * tasks 페이지 인라인 수정 피커 — 완료 체크 / 상태 / 우선순위 / 마감일 / 담당자 Popover + 행 액션 메뉴.
 * 모든 피커는 값을 고르면 바로 닫힌다.
 */
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Edit,
  MoreHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Employee, Task } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DueDateText,
  TASK_STATUSES,
  TaskPriorityLabel,
  TaskStatusText,
  priorityConfig,
  statusIcons,
  taskStatusLabel,
  type StatusChangeOptions,
  type TaskPriority,
  type TaskUpdatePatch,
} from './-task-shared';

// ─── 공통 행 핸들러 타입 ───────────────────────────────────

export type TaskRowHandlers = {
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string, options?: StatusChangeOptions) => void;
  /** 행 앞 체크 한 단계 진행 — 다음 상태는 페이지가 최신 캐시에서 계산한다 (연속 클릭 안전) */
  onCycleCheck: (id: string) => void;
  onDelete: (task: Task) => void;
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
  employeeOptions: Employee[];
};

/** 셀 안 인라인 편집 트리거 — 평소엔 텍스트처럼, hover 시 옅은 배경. 음수 마진으로 열 머리글과 글자 정렬 유지 */
const pickerTriggerClassName =
  '-mx-1.5 inline-flex h-7 max-w-[calc(100%+0.75rem)] items-center rounded-md px-1.5 transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

const pickerOptionClassName =
  'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none';

/** 아이콘 하나짜리 트리거 (목록 행의 우선순위·담당자) */
const compactTriggerClassName =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

/** 담당자 머리글자 동그라미 — 미배정은 점선 동그라미 */
export function TaskAssigneeAvatar({ name, className }: { name: string | null; className?: string }) {
  if (!name) {
    return (
      <span
        className={cn(
          'inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60',
          className,
        )}
      >
        <User className="size-3" />
      </span>
    );
  }
  return (
    <Avatar className={cn('size-[22px] shrink-0', className)}>
      <AvatarFallback className="text-[10.5px] font-semibold">{name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

// ─── 상태 체크 (대기 → 진행중 → 완료 순환) ─────────────────

const CHECK_COPY: Record<string, { aria: string; title: string }> = {
  pending: { aria: '진행중으로 표시', title: '진행중으로 표시 · 한 번 더 누르면 완료' },
  in_progress: { aria: '완료로 표시', title: '완료로 표시' },
  completed: { aria: '대기로 되돌리기', title: '완료 취소 (대기로 되돌리기)' },
};

export function TaskCompleteToggle({
  task,
  onCycle,
  className,
}: {
  task: Task;
  onCycle: (id: string) => void;
  className?: string;
}) {
  const completed = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  const inProgress = task.status === 'in_progress';
  const copy = CHECK_COPY[task.status] ?? CHECK_COPY.pending;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed ? true : inProgress ? 'mixed' : false}
      aria-label={`${task.title} ${copy.aria}`}
      title={cancelled ? '취소된 업무' : copy.title}
      disabled={cancelled}
      onClick={() => onCycle(task.id)}
      className={cn(
        'group/check relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        completed
          ? 'border-success bg-success text-white hover:opacity-80'
          : inProgress
            ? 'border-info text-transparent hover:border-success hover:bg-success-soft hover:text-success'
            : 'border-muted-foreground/45 text-transparent hover:border-info',
        cancelled && 'cursor-not-allowed border-dashed opacity-50',
        className,
      )}
    >
      {/* 진행중: 오른쪽 반이 채워진 원. 대기에서 hover하면 다음 단계(반체크)를 미리 보여준다 */}
      {(inProgress || (!completed && !cancelled)) && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-[2.5px] rounded-full bg-info [clip-path:inset(0_0_0_50%)]',
            inProgress ? 'group-hover/check:hidden' : 'opacity-0 group-hover/check:opacity-40',
          )}
        />
      )}
      {(completed || inProgress) && (
        <Check
          className={cn('size-2.5', inProgress && 'hidden group-hover/check:block')}
          strokeWidth={3.5}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ─── 인라인 선택 팝오버 ────────────────────────────────────

export function StatusPickerPopover({
  task,
  onChange,
}: {
  task: Task;
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={pickerTriggerClassName} aria-label={`상태: ${taskStatusLabel(task.status)}`}>
          <TaskStatusText status={task.status} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-1" align="start">
        <div className="flex flex-col">
          {TASK_STATUSES.map((key) => (
            <button
              key={key}
              type="button"
              className={cn(pickerOptionClassName, task.status === key && 'bg-accent')}
              onClick={() => {
                setOpen(false);
                if (key !== task.status) onChange(key);
              }}
            >
              {statusIcons[key]}
              <span>{taskStatusLabel(key)}</span>
              {task.status === key && <Check className="ml-auto size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPickerPopover({
  task,
  onUpdate,
  iconOnly = false,
}: {
  task: Task;
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
  /** 목록 행 맨 앞 — 막대 아이콘만 */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pCfg = priorityConfig[task.priority as TaskPriority];
  const label = `우선순위: ${pCfg?.label ?? task.priority}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={iconOnly ? compactTriggerClassName : pickerTriggerClassName}
          aria-label={label}
          title={iconOnly ? label : undefined}
        >
          <TaskPriorityLabel priority={task.priority} showLabel={!iconOnly} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[140px] p-1" align="start">
        <div className="flex flex-col">
          {Object.entries(priorityConfig).map(([key, { label, icon, textClass }]) => (
            <button
              key={key}
              type="button"
              className={cn(pickerOptionClassName, task.priority === key && 'bg-accent')}
              onClick={() => {
                setOpen(false);
                if (key !== task.priority) onUpdate?.(task.id, { priority: key });
              }}
            >
              {icon}
              <span className={textClass}>{label}</span>
              {task.priority === key && <Check className="ml-auto size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** 다음 주 월요일 */
function nextMonday(base: Date): Date {
  const day = base.getDay(); // 0=일
  const diff = ((8 - day) % 7) || 7;
  return addDays(base, diff);
}

export function DueDatePickerPopover({
  task,
  onUpdate,
  compact = false,
}: {
  task: Task;
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
  /** 목록 행 오른쪽 끝 — 오른쪽 정렬, 마감일이 없으면 행에 마우스를 올렸을 때만 안내 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateKey(task.dueDate);
  const today = new Date();
  const quickPicks = [
    { label: '오늘', date: addDays(today, 0) },
    { label: '내일', date: addDays(today, 1) },
    { label: '다음 주', date: nextMonday(today) },
  ];

  const commit = (date: Date | null) => {
    setOpen(false);
    const next = date ? toDateKey(date) : null;
    if (next === (task.dueDate ? task.dueDate.substring(0, 10) : null)) return;
    onUpdate?.(task.id, { dueDate: next });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(pickerTriggerClassName, compact && 'justify-end')}
          aria-label="마감일 변경"
        >
          {task.dueDate ? (
            <DueDateText task={task} />
          ) : (
            <span
              className={cn(
                'text-xs text-muted-foreground/60',
                compact && 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100',
              )}
            >
              마감일 없음
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={compact ? 'end' : 'start'}>
        <div className="flex gap-1 border-b border-border p-2">
          {quickPicks.map((pick) => (
            <Button
              key={pick.label}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => commit(pick.date)}
            >
              {pick.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          onSelect={(date) => {
            if (date) commit(date);
          }}
        />
        {task.dueDate && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              className={cn(pickerOptionClassName, 'w-full text-destructive')}
              onClick={() => commit(null)}
            >
              <X className="size-3" />
              마감일 제거
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function TaskAssigneePicker({
  task,
  employeeOptions,
  onUpdate,
  compact = false,
}: {
  task: Task;
  employeeOptions: Employee[];
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
  /** 목록 행 — 이름 없이 동그란 머리글자만 (이름은 툴팁) */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const commit = (assignedToId: string | null) => {
    setOpen(false);
    if (assignedToId !== (task.assignedToId ?? null)) onUpdate?.(task.id, { assignedToId });
  };
  const label = `담당자: ${task.assignedTo?.name ?? '미배정'}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={compact ? compactTriggerClassName : pickerTriggerClassName}
          aria-label={label}
          title={compact ? (task.assignedTo?.name ?? '미배정') : undefined}
        >
          {compact ? (
            <TaskAssigneeAvatar name={task.assignedTo?.name ?? null} />
          ) : task.assignedTo ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar className="size-5 shrink-0">
                <AvatarFallback className="text-[10px]">{task.assignedTo.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-foreground/80">{task.assignedTo.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40">
                <User className="size-3" />
              </span>
              미배정
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align={compact ? 'end' : 'start'}>
        <div className="flex max-h-72 flex-col overflow-y-auto">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">담당자</p>
          <button
            type="button"
            className={cn(pickerOptionClassName, !task.assignedToId && 'bg-accent')}
            onClick={() => commit(null)}
          >
            <User className="size-3" />
            미배정
          </button>
          {employeeOptions.map((employee) => (
            <button
              key={employee.id}
              type="button"
              className={cn(pickerOptionClassName, task.assignedToId === employee.id && 'bg-accent')}
              onClick={() => commit(employee.id)}
            >
              <Avatar className="size-5">
                <AvatarFallback className="text-[10px]">{employee.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{employee.name}</span>
              {task.assignedToId === employee.id && <Check className="ml-auto size-3.5 text-muted-foreground" />}
            </button>
          ))}
          {employeeOptions.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">활성 직원 없음</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TaskRowActionsMenu({
  task,
  onRowClick,
  onStatusChange,
  onDelete,
  className,
}: {
  task: Task;
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('size-7 p-0 text-muted-foreground', className)}
          aria-label={`${task.title} 업무 작업 메뉴`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRowClick(task)}>
          <Edit className="mr-2 size-4" />
          열기·수정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {task.status !== 'pending' && (
          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'pending')}>
            <Circle className="mr-2 size-4" />
            대기로 변경
          </DropdownMenuItem>
        )}
        {task.status !== 'in_progress' && (
          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
            <ArrowRight className="mr-2 size-4" />
            진행중으로 변경
          </DropdownMenuItem>
        )}
        {task.status !== 'completed' && (
          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'completed')}>
            <CheckCircle2 className="mr-2 size-4" />
            완료로 변경
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
          <Trash2 className="mr-2 size-4" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
