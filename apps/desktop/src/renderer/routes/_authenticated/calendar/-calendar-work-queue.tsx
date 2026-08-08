import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CircleHelp,
  Inbox,
  ListTodo,
  UserRoundX,
} from "lucide-react";
import type { Task } from "@estate-erp/api-client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DueDateText,
  categoryConfig,
  isOverdue,
} from "@/routes/_authenticated/tasks/-task-shared";

export type CalendarTaskQueueBucket =
  | "overdue"
  | "today"
  | "unassigned"
  | "verify";

const QUEUE_BUCKETS: Array<{
  id: CalendarTaskQueueBucket;
  label: string;
  icon: typeof AlertTriangle;
}> = [
  { id: "overdue", label: "지연", icon: AlertTriangle },
  { id: "today", label: "오늘", icon: CalendarClock },
  { id: "unassigned", label: "미배정", icon: UserRoundX },
  { id: "verify", label: "확인", icon: CircleHelp },
];

function isActiveTask(task: Task) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function isDueToday(task: Task) {
  if (!task.dueDate || !isActiveTask(task)) return false;
  const dueDate = new Date(task.dueDate);
  const today = new Date();
  return (
    dueDate.getFullYear() === today.getFullYear() &&
    dueDate.getMonth() === today.getMonth() &&
    dueDate.getDate() === today.getDate()
  );
}

function needsVerification(task: Task) {
  return (
    isActiveTask(task) &&
    (task.category === "verify" ||
      /확인|갱신|회신/.test(`${task.title} ${task.content ?? ""}`))
  );
}

function matchesBucket(task: Task, bucket: CalendarTaskQueueBucket) {
  if (!isActiveTask(task)) return false;
  if (bucket === "overdue") return isOverdue(task);
  if (bucket === "today") return isDueToday(task);
  if (bucket === "unassigned") return !task.assignedToId;
  return needsVerification(task);
}

function sortQueueTasks(left: Task, right: Task) {
  const leftDue = left.dueDate
    ? new Date(left.dueDate).getTime()
    : Number.POSITIVE_INFINITY;
  const rightDue = right.dueDate
    ? new Date(right.dueDate).getTime()
    : Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;

  const priorityWeight: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const priorityDifference =
    (priorityWeight[left.priority] ?? 4) -
    (priorityWeight[right.priority] ?? 4);
  if (priorityDifference !== 0) return priorityDifference;
  return left.title.localeCompare(right.title, "ko");
}

export function getCalendarTaskQueueCounts(tasks: Task[]) {
  const counts = Object.fromEntries(
    QUEUE_BUCKETS.map(({ id }) => [
      id,
      tasks.filter((task) => matchesBucket(task, id)).length,
    ]),
  ) as Record<CalendarTaskQueueBucket, number>;

  const actionableIds = new Set(
    tasks
      .filter((task) => QUEUE_BUCKETS.some(({ id }) => matchesBucket(task, id)))
      .map((task) => task.id),
  );

  return { ...counts, total: actionableIds.size };
}

function priorityDotClass(priority: string) {
  if (priority === "urgent") return "bg-destructive";
  if (priority === "high") return "bg-orange";
  if (priority === "medium") return "bg-warning";
  return "bg-muted-foreground/45";
}

export function CalendarWorkQueue({
  tasks,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onSchedule,
  onComplete,
  completingTaskId,
  variant = "rail",
  showHeading = true,
}: {
  tasks: Task[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: (task: Task) => void;
  onSchedule: (task: Task) => void;
  onComplete: (task: Task) => void;
  completingTaskId?: string;
  variant?: "rail" | "drawer";
  showHeading?: boolean;
}) {
  const navigate = useNavigate();
  const [bucket, setBucket] = useState<CalendarTaskQueueBucket>("overdue");
  const counts = useMemo(() => getCalendarTaskQueueCounts(tasks), [tasks]);
  const bucketTasks = useMemo(
    () =>
      tasks.filter((task) => matchesBucket(task, bucket)).sort(sortQueueTasks),
    [bucket, tasks],
  );
  const visibleTasks = bucketTasks.slice(0, variant === "rail" ? 3 : 12);

  return (
    <section aria-label="캘린더 업무함" className="min-w-0">
      {showHeading ? (
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <Inbox className="size-3.5 text-muted-foreground" />
            <h3 className="text-[11px] font-semibold text-muted-foreground">
              업무함
            </h3>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
              {counts.total}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/tasks" })}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            전체 보기
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "mt-2 grid grid-cols-4 gap-1",
          variant === "rail" && "grid-cols-2",
        )}
      >
        {QUEUE_BUCKETS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={bucket === id}
            onClick={() => setBucket(id)}
            className={cn(
              "flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              bucket === id
                ? "bg-foreground text-background"
                : "bg-muted/65 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
            <span className="tabular-nums opacity-70">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 min-h-0">
        {isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: variant === "rail" ? 3 : 5 }).map(
              (_, index) => (
                <Skeleton key={index} className="h-[58px] w-full rounded-md" />
              ),
            )}
          </div>
        ) : isError ? (
          <div className="rounded-md bg-destructive-soft px-3 py-4 text-center">
            <p className="text-[11px] leading-5 text-destructive">
              업무를 불러오지 못했습니다.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 text-xs"
              onClick={onRetry}
            >
              다시 시도
            </Button>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-md bg-muted/40 px-3 py-5 text-center">
            <Check className="mx-auto size-4 text-success" />
            <p className="mt-2 text-[11px] font-medium text-foreground">
              처리할 업무가 없습니다
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
              {bucket === "overdue"
                ? "밀린 업무 없이 깔끔합니다."
                : "다른 업무함도 확인해 보세요."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {visibleTasks.map((task) => {
              const category =
                categoryConfig[task.category as keyof typeof categoryConfig];
              const isCompleting = completingTaskId === task.id;

              return (
                <li
                  key={task.id}
                  className="group relative min-w-0 overflow-hidden rounded-md border border-transparent bg-background transition-colors hover:border-border hover:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="flex min-h-[58px] w-full min-w-0 items-start gap-2 px-2.5 py-2 pr-[74px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                    title={`${task.title} 업무 열기`}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        priorityDotClass(task.priority),
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-foreground">
                        {task.title}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="truncate">
                          {category?.label ?? "기타"}
                        </span>
                        <span aria-hidden="true">·</span>
                        {task.dueDate ? (
                          <DueDateText task={task} className="text-[10px]" />
                        ) : (
                          <span>{task.assignedTo?.name ?? "미배정"}</span>
                        )}
                      </span>
                    </span>
                  </button>

                  <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8 bg-background/85 text-muted-foreground hover:text-success"
                      onClick={() => onComplete(task)}
                      disabled={isCompleting}
                      aria-label={`${task.title} 완료 처리`}
                      title="완료 처리"
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8 bg-background/85 text-muted-foreground hover:text-foreground"
                      onClick={() => onSchedule(task)}
                      aria-label={`${task.title} 캘린더에 배치`}
                      title="캘린더에 배치"
                    >
                      <CalendarClock className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bucketTasks.length > visibleTasks.length ? (
        <button
          type="button"
          onClick={() => void navigate({ to: "/tasks" })}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ListTodo className="size-3" />
          {bucketTasks.length - visibleTasks.length}개 더 보기
        </button>
      ) : null}
    </section>
  );
}
