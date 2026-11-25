import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useRef, useState } from "react";
import type { Task } from "@estate-erp/api-client";
import { CalendarDays, Check, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { describeDue, isTaskOverdue } from "../tasks/-task-filters";
import { RailSection } from "../properties/-detail/rail";
import { nb } from "../properties/-detail/ui";
import { splitProjectTasks, toDueDateKey } from "./-project-model";
import { CARD_CLASS } from "./-project-ui";

/**
 * 프로젝트의 업무 (오른쪽 열 맨 위). 업무는 프로젝트에 직접 달린다(Task.projectId) — 대표 고객도 의뢰도 없는
 * 빈 프로젝트에서도 적을 수 있다.
 *
 * - 맨 위 한 줄: 적고 Enter면 이 프로젝트의 업무가 생긴다. 담당은 나, 마감은 고르면(오늘 · 내일 · 날짜) 붙는다.
 * - 목록: 안 끝난 업무를 마감이 빠른 것부터. 지난 마감은 빨갛게. 체크하면 완료(되돌리기 있음).
 * - 끝낸 업무는 "완료 n건"으로 접어 둔다.
 * - 제목을 누르면 업무 화면이 그 업무를 연다(대시보드 · 연락처 상세와 같은 길: /tasks?task=).
 *
 * 업무 화면과 같은 저장 규칙을 따른다: 두 번 눌러도 한 건만 만들고, 바뀐 것은 ['tasks'] 전체를 다시 읽게 한다
 * (업무 화면 · 대시보드가 같은 업무를 보여 준다).
 */

export const projectTasksQueryKey = (projectId: string) => ["tasks", "project", projectId] as const;

/**
 * 이 프로젝트에 적은 업무(모든 상태). 업무 칸과 "빈 프로젝트인가"(업무가 있으면 지우기가 아니라 풀기) 판단이
 * 같은 이름표로 함께 쓴다. 업무 화면 · 다른 탭에서 끝내거나 고친 것이 돌아오면 보이게 돌아올 때마다 다시 읽는다.
 */
export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: projectTasksQueryKey(projectId),
    // 서버가 이 거르기를 모르면(재빌드 전의 옛 서버) 사무소의 모든 업무를 돌려준다. 남의 업무가
    // 이 프로젝트의 업무처럼 보이지 않게 여기서도 한 번 더 거른다.
    queryFn: async () =>
      (await api.tasks.findAll({ projectId })).filter((task) => task.projectId === projectId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** 내 달력의 날짜 키("2026-11-22")를 그날 0시(내 시간)로 */
function parseDueKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(base: Date, days: number) {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** 다음 주 월요일 (업무 화면의 마감 고르기와 같다) */
function nextMonday(base: Date) {
  const diff = ((8 - base.getDay()) % 7) || 7;
  return addDays(base, diff);
}

export const ProjectTasks = forwardRef<HTMLInputElement, { projectId: string }>(function ProjectTasks(
  { projectId },
  inputRef,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const queryKey = projectTasksQueryKey(projectId);
  const tasksQuery = useProjectTasks(projectId);
  // 방금 체크한 업무는 끝냈어도 그 자리에 둔다(아래 줄이 커서 밑으로 올라오지 않게). 접어 둔 완료를 펴거나
  // 새 업무를 적으면 제자리로 보낸다.
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const { open, done } = splitProjectTasks(tasksQuery.data ?? [], held);
  const openCount = open.filter((task) => task.status !== "completed").length;
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  // 엔터를 연달아 쳐도 한 건만 만든다(isPending은 다음 그리기에야 바뀐다).
  const creating = useRef(false);
  const create = useMutation({
    mutationFn: (input: { title: string; due: string | null }) =>
      api.tasks.create({
        title: input.title,
        projectId,
        dueDate: input.due ?? undefined,
        // 담당은 적은 사람(비워 두면 '내 담당'에서 사라진 것처럼 보인다 — 연락처 상세의 업무 추가와 같다)
        ...(user?.id ? { assignedToId: user.id } : {}),
        category: "other",
        priority: "medium",
        status: "pending",
        source: "manual",
      }),
    onSuccess: (created, input) => {
      // 그 사이 더 적었으면 지우지 않는다
      setTitle((current) => (current.trim() === input.title ? "" : current));
      setHeld(new Set());
      queryClient.setQueryData<Task[]>(queryKey, (current) =>
        current ? [...current.filter((task) => task.id !== created.id), created] : [created],
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "업무를 추가하지 못했습니다. 적은 글은 남아 있습니다."));
    },
    onSettled: () => {
      creating.current = false;
    },
  });

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || creating.current) return;
    creating.current = true;
    create.mutate({ title: trimmed, due });
  };

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: string; previous: string; undo?: boolean }) =>
      api.tasks.update(input.id, { status: input.status }),
    onMutate: (input) => {
      void queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<Task[]>(queryKey);
      queryClient.setQueryData<Task[]>(queryKey, (current) =>
        current?.map((task) =>
          task.id === input.id
            ? { ...task, status: input.status, updatedAt: new Date().toISOString() }
            : task,
        ),
      );
      return { snapshot };
    },
    onSuccess: (_task, input) => {
      if (input.undo) return;
      if (input.status === "completed") {
        toast.success("업무를 완료했습니다", {
          action: {
            label: "되돌리기",
            onClick: () =>
              setStatus.mutate({ id: input.id, status: input.previous, previous: input.status, undo: true }),
          },
        });
      }
    },
    onError: (error, _input, context) => {
      if (context?.snapshot) queryClient.setQueryData(queryKey, context.snapshot);
      toast.error(apiErrorMessage(error, "업무 상태를 바꾸지 못했습니다. 다시 시도해 주세요."));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const toggle = (task: Task) => {
    const completed = task.status === "completed";
    if (!completed) setHeld((current) => new Set(current).add(task.id));
    setStatus.mutate({
      id: task.id,
      status: completed ? "pending" : "completed",
      previous: task.status,
    });
  };

  return (
    <RailSection title="업무" count={openCount} className="pt-0.5">
      <div data-project-tasks>
        <form
          data-project-task-input
          className="flex h-9 items-center gap-1 rounded-lg bg-white px-2 ring-1 ring-[#dcdbd7] focus-within:ring-2 focus-within:ring-info/45"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Plus className="size-[15px] shrink-0 text-[#37352f]/45" />
          <input
            ref={inputRef}
            value={title}
            maxLength={200}
            readOnly={create.isPending}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // 폼이 알아서 보내지 않게 막고 여기서 보낸다.
                // 한글 조합 중 Enter는 글자 확정이다. 조합이 끝난 Enter만 업무를 만든다.
                event.preventDefault();
                if (!event.nativeEvent.isComposing && event.keyCode !== 229) submit();
                return;
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                event.currentTarget.blur();
              }
            }}
            placeholder="업무 적고 Enter"
            aria-label="이 프로젝트에 업무 추가"
            className={cn(
              "h-8 min-w-0 flex-1 bg-transparent text-[14px] text-[#37352f] outline-none placeholder:text-[#37352f]/45",
              create.isPending && "opacity-60",
            )}
          />
          <DuePicker value={due} onChange={setDue} />
        </form>

        {tasksQuery.isPending ? (
          <Skeleton className="mt-2 h-14 w-full" />
        ) : tasksQuery.isError && !tasksQuery.data ? (
          <p className="mt-2 text-[12.5px] leading-5 text-[rgb(203,107,31)]">
            업무를 불러오지 못했습니다.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-[#37352f]"
              onClick={() => void tasksQuery.refetch()}
            >
              다시 시도
            </button>
          </p>
        ) : (
          <>
            {open.length === 0 ? (
              <p className="mt-2 break-keep text-[13px] leading-5 text-[#37352f]/45">
                {done.length > 0
                  ? "남은 업무가 없습니다."
                  : "이 프로젝트로 해야 할 일을 적어 두세요. 통화하며 바로 적어도 됩니다."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {open.map((task) => (
                  <TaskLine key={task.id} task={task} onToggle={() => toggle(task)} />
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <div className="mt-1">
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => {
                    setShowDone((value) => !value);
                    setHeld(new Set());
                  }}
                  className="-ml-0.5 inline-flex h-6 items-center gap-1 rounded pl-0.5 pr-1.5 text-[12.5px] text-[#37352f]/65 hover:bg-[#37352f]/[0.06] hover:text-[#37352f]"
                >
                  <ChevronRight
                    className={cn("size-3.5 text-[#37352f]/45 transition-transform", showDone && "rotate-90")}
                  />
                  완료 {done.length}건
                </button>
                {showDone && (
                  <ul className="mt-1 space-y-1.5">
                    {done.map((task) => (
                      <TaskLine key={task.id} task={task} onToggle={() => toggle(task)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tasksQuery.isError && tasksQuery.data && (
              <p className="mt-1 text-[12px] text-[#8f6b1f]">
                최신 업무를 불러오지 못했습니다. 보이는 내용이 예전 것일 수 있습니다.
              </p>
            )}
          </>
        )}
      </div>
    </RailSection>
  );
});

function TaskLine({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const completed = task.status === "completed";
  const overdue = isTaskOverdue(task);
  return (
    <li
      data-project-task
      data-overdue={overdue || undefined}
      className={cn(
        CARD_CLASS,
        "flex items-start gap-2.5 px-2.5 py-2 transition-colors hover:bg-[rgba(55,53,47,0.03)]",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={completed ? `${task.title} 완료 취소` : `${task.title} 완료로 표시`}
        title={completed ? "완료 취소" : "완료로 표시"}
        onClick={onToggle}
        className={cn(
          "mt-[3px] grid size-4 shrink-0 place-items-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40",
          completed
            ? "bg-success text-white hover:brightness-95"
            : "shadow-[inset_0_0_0_1.5px_rgba(55,53,47,0.3)] hover:bg-[#37352f]/[0.06]",
        )}
      >
        {completed && <Check className="size-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <Link
          to="/tasks"
          search={{ task: task.id }}
          title={`${task.title} — 업무 화면에서 열기`}
          className={cn(
            "block break-keep text-[14px] leading-[22px] text-[#37352f] underline-offset-2 hover:underline [overflow-wrap:anywhere]",
            completed && "text-[#37352f]/45",
          )}
        >
          {task.title}
        </Link>
        {(task.dueDate || task.assignedTo) && (
          <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-[18px] text-[#37352f]/65">
            {task.dueDate && <TaskDue task={task} />}
            {task.dueDate && task.assignedTo && <span className="text-[#37352f]/25">·</span>}
            {task.assignedTo && <span className="min-w-0 truncate">{task.assignedTo.name}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * 마감 표기는 업무 화면과 같은 말("3일 지남" · "오늘" · "내일" · "11.6 (금)"). 색은 이 화면의 말씨를 따른다:
 * 지난 마감은 빨강, 오늘은 파랑, 그 밖은 회색, 끝낸 업무는 흐리게.
 */
function TaskDue({ task }: { task: Task }) {
  const due = describeDue(task);
  if (!due) return null;
  return (
    <span
      className={cn(
        "tabular-nums",
        due.tone === "overdue" && "font-medium text-destructive",
        due.tone === "today" && "font-medium text-info",
        due.tone === "normal" && "text-[#37352f]/65",
        due.tone === "muted" && "text-[#37352f]/40",
      )}
    >
      {due.text}
    </span>
  );
}

/** 새 업무의 마감: 오늘 · 내일 · 다음 주 · 달력에서 고르기 · 마감 없음. 업무 화면의 마감 고르기와 같은 모양. */
function DuePicker({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const selected = value ? parseDueKey(value) : undefined;
  const choose = (date: Date | null) => {
    setOpen(false);
    onChange(date ? toDueDateKey(date) : null);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `마감 ${formatRelativeDay(selected)}, 바꾸기` : "마감 정하기"}
          title="마감"
          className={cn(
            nb.ghost,
            "h-6 gap-1 px-1.5 text-[12.5px]",
            value && "text-[#37352f] [&_svg]:text-[#37352f]/65",
          )}
        >
          <CalendarDays className="!size-3.5" />
          {value ? formatRelativeDay(selected) : "마감"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex gap-1 border-b border-[#e9e9e7] p-2">
          {[
            { label: "오늘", date: today },
            { label: "내일", date: addDays(today, 1) },
            { label: "다음 주", date: nextMonday(today) },
          ].map((pick) => (
            <button
              key={pick.label}
              type="button"
              className={cn(nb.line, "h-7 flex-1 text-[13px]")}
              onClick={() => choose(pick.date)}
            >
              {pick.label}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          onSelect={(date) => {
            if (date) choose(date);
          }}
        />
        {value && (
          <div className="border-t border-[#e9e9e7] p-1">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-1.5 rounded-sm px-2 text-left text-[13px] text-[#37352f]/65 hover:bg-[#37352f]/[0.06] hover:text-[#37352f]"
              onClick={() => choose(null)}
            >
              <X className="size-3.5" />
              마감 없음
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
