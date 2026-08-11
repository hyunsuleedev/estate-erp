/**
 * tasks 페이지 인라인 수정 피커 — 상태/우선순위/마감일/담당자 Popover + 행 액션 메뉴.
 */
import {
  ArrowRight,
  CheckCircle2,
  Edit,
  MoreHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Employee, Task } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/domain';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DueDateText,
  TASK_STATUSES,
  priorityConfig,
  statusIcons,
  taskStatusLabel,
  type TaskPriority,
  type TaskUpdatePatch,
} from './-task-shared';

// ─── 공통 행 핸들러 타입 ───────────────────────────────────

export type TaskRowHandlers = {
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
  employeeOptions: Employee[];
};

// ─── 인라인 선택 팝오버 ────────────────────────────────────

export function StatusPickerPopover({ task, onUpdate }: { task: Task; onUpdate?: (id: string, dto: TaskUpdatePatch) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center rounded-md transition-all hover:ring-2 hover:ring-ring/20">
          <StatusBadge kind="taskStatus" status={task.status} size="sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-1" align="start">
        <div className="flex flex-col">
          {TASK_STATUSES.map((key) => (
            <button
              key={key}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                task.status === key && 'bg-accent',
              )}
              onClick={() => onUpdate?.(task.id, { status: key })}
            >
              {statusIcons[key]}
              <span>{taskStatusLabel(key)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPickerPopover({ task, onUpdate }: { task: Task; onUpdate?: (id: string, dto: TaskUpdatePatch) => void }) {
  const pCfg = priorityConfig[task.priority as TaskPriority];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center rounded-md transition-all hover:ring-2 hover:ring-ring/20">
          <Badge className={cn(pCfg?.color, 'text-xs')}>{pCfg?.label}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[140px] p-1" align="start">
        <div className="flex flex-col">
          {Object.entries(priorityConfig).map(([key, { label, icon }]) => (
            <button
              key={key}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                task.priority === key && 'bg-accent',
              )}
              onClick={() => onUpdate?.(task.id, { priority: key })}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DueDatePickerPopover({ task, onUpdate }: { task: Task; onUpdate?: (id: string, dto: TaskUpdatePatch) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center rounded-md transition-all hover:ring-2 hover:ring-ring/20">
          <DueDateText task={task} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">마감일</p>
          <Input
            type="date"
            className="h-8 text-xs"
            defaultValue={task.dueDate ? task.dueDate.substring(0, 10) : ''}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate?.(task.id, { dueDate: val || null });
            }}
          />
          {task.dueDate && (
            <button
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-accent"
              onClick={() => onUpdate?.(task.id, { dueDate: null })}
            >
              <X className="size-3" />
              마감일 제거
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TaskAssigneePicker({
  task,
  employeeOptions,
  onUpdate,
}: {
  task: Task;
  employeeOptions: Employee[];
  onUpdate?: (id: string, dto: TaskUpdatePatch) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex w-full items-center rounded-md transition-all hover:ring-2 hover:ring-ring/20">
          {task.assignedTo ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Avatar className="size-5 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {task.assignedTo.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-muted-foreground">
                {task.assignedTo.name}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">미배정</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start">
        <div className="flex flex-col gap-1">
          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">담당자</p>
          <button
            className={cn(
              'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              !task.assignedToId && 'bg-accent',
            )}
            onClick={() => onUpdate?.(task.id, { assignedToId: null })}
          >
            <User className="size-3" />
            미배정
          </button>
          {employeeOptions.map((employee) => (
            <button
              key={employee.id}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                task.assignedToId === employee.id && 'bg-accent',
              )}
              onClick={() => onUpdate?.(task.id, { assignedToId: employee.id })}
            >
              <Avatar className="size-5">
                <AvatarFallback className="text-[10px]">
                  {employee.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{employee.name}</span>
            </button>
          ))}
          {employeeOptions.length === 0 && (
            <p className="px-1 py-1 text-xs text-muted-foreground">활성 직원 없음</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TaskRowActionsMenu({ task, onRowClick, onStatusChange, onDelete }: {
  task: Task;
  onRowClick: (task: Task) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="size-6 p-0" aria-label={`${task.title} 업무 작업 메뉴`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRowClick(task)}>
          <Edit className="mr-2 size-4" />수정
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
          <ArrowRight className="mr-2 size-4" />진행중으로 변경
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(task.id, 'completed')}>
          <CheckCircle2 className="mr-2 size-4" />완료로 변경
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
          <Trash2 className="mr-2 size-4" />삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
