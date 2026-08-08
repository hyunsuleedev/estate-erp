import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Task } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { getStatusMeta, PIPELINE_STEPS } from '@/lib/status-config';
import { consultationTypeLabels } from './consultations/-consultation-badges';
import { QueryErrorState, WidgetSkeleton, daysUntil, localDateKey } from './-dashboard-widgets';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/* --------------------------------- 공통 --------------------------------- */

function byDateAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

/** 상태 tone → 파이프라인 점 색 (텍스트 아님 — 라벨이 의미를 전달) */
const TONE_DOT: Record<string, string> = {
  gray: 'bg-muted-foreground/50',
  violet: 'bg-violet',
  info: 'bg-info',
  orange: 'bg-orange',
  warning: 'bg-warning',
  success: 'bg-success',
  neutral: 'bg-neutral-strong',
  destructive: 'bg-destructive',
};

function greetingByHour(hour: number): string {
  if (hour < 5) return '늦은 시간까지 수고 많으세요';
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '오늘도 수고 많으셨어요';
}

/* -------------------------------- 카드 프레임 -------------------------------- */

function DashCard({
  title,
  count,
  moreTo,
  moreLabel,
  children,
}: {
  title: string;
  count?: number;
  moreTo?: LinkProps['to'];
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center px-4 pt-3 pb-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {moreTo && (
          <Link
            to={moreTo}
            className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {moreLabel ?? '전체 보기'} <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="px-4 pt-0.5 pb-3.5">{children}</div>
    </section>
  );
}

/* -------------------------------- 미완료 업무 -------------------------------- */

function isPendingTask(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

function TaskDue({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="w-[76px]" />;
  const days = daysUntil(dueDate);
  const overdue = days != null && days < 0;
  const today = days === 0;
  return (
    <span
      className={cn(
        'w-[76px] shrink-0 text-right text-[11px] tabular-nums',
        overdue
          ? 'font-semibold text-destructive-strong'
          : today
            ? 'font-semibold text-warning-strong'
            : 'text-muted-foreground',
      )}
    >
      {today ? '오늘' : formatDate(dueDate)}
    </span>
  );
}

function PendingTasksCard() {
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const toggle = useMutation({
    mutationFn: (task: Task) =>
      api.tasks.update(task.id, {
        status: isPendingTask(task) ? 'completed' : 'pending',
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const pending = (tasks.data ?? [])
    .filter(isPendingTask)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));

  return (
    <DashCard
      title="미완료 업무"
      count={tasks.data ? pending.length : undefined}
      moreTo="/tasks"
      moreLabel="업무 전체"
    >
      {tasks.isLoading ? (
        <WidgetSkeleton rows={5} />
      ) : tasks.isError ? (
        <QueryErrorState onRetry={() => void tasks.refetch()} />
      ) : pending.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">모든 업무를 완료했습니다.</p>
      ) : (
        <ul>
          {pending.slice(0, 7).map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2.5 border-b border-border/60 py-[7px] last:border-b-0"
            >
              <button
                type="button"
                aria-label={`${task.title} 완료 처리`}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(task)}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm border-[1.5px] border-input text-transparent transition-colors hover:border-foreground hover:bg-foreground hover:text-primary-foreground"
              >
                <Check className="size-2.5" aria-hidden="true" />
              </button>
              <Link to="/tasks" className="min-w-0 flex-1 truncate text-[12.5px] hover:underline">
                {task.title}
              </Link>
              {task.assignedTo?.name && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {task.assignedTo.name}
                </span>
              )}
              <TaskDue dueDate={task.dueDate} />
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

/* -------------------------------- 오늘 일정 -------------------------------- */

function TodayScheduleCard() {
  const now = new Date();
  const todayKey = localDateKey(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const events = useQuery({
    queryKey: ['calendar-events', 'today', todayKey],
    queryFn: () => api.calendarEvents.findAll({ start: todayStart, end: todayEnd }),
  });

  const rows = [...(events.data ?? [])].sort((a, b) => byDateAsc(a.start, b.start));

  return (
    <DashCard title="오늘 일정" moreTo="/calendar" moreLabel="캘린더">
      {events.isLoading ? (
        <WidgetSkeleton rows={3} />
      ) : events.isError ? (
        <QueryErrorState onRetry={() => void events.refetch()} />
      ) : rows.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">오늘 일정이 없습니다.</p>
      ) : (
        <ul>
          {rows.slice(0, 4).map((event) => (
            <li
              key={event.id}
              className="flex items-center gap-2.5 border-b border-border/60 py-[7px] last:border-b-0"
            >
              <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {event.allDay
                  ? '종일'
                  : new Date(event.start).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
              </span>
              <span
                className="h-4 w-[2.5px] shrink-0 rounded-full"
                style={{ backgroundColor: event.color || 'var(--color-info)' }}
                aria-hidden="true"
              />
              <Link
                to="/calendar"
                className="min-w-0 flex-1 truncate text-[12.5px] hover:underline"
              >
                {event.title}
              </Link>
              {event.user?.name && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {event.user.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

/* -------------------------------- 최근 활동 -------------------------------- */

function timeAgoShort(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간`;
  return formatDate(iso).slice(5); // "MM.DD"
}

function RecentActivityCard() {
  const consultations = useQuery({
    queryKey: ['consultations', 'recent'],
    queryFn: () => api.consultations.getRecent(6),
  });

  const rows = consultations.data ?? [];

  return (
    <DashCard title="최근 활동" moreTo="/consultations" moreLabel="상담기록">
      {consultations.isLoading ? (
        <WidgetSkeleton rows={4} />
      ) : consultations.isError ? (
        <QueryErrorState onRetry={() => void consultations.refetch()} />
      ) : rows.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">최근 상담 기록이 없습니다.</p>
      ) : (
        <ul>
          {rows.slice(0, 6).map((consultation) => (
            <li
              key={consultation.id}
              className="flex items-center gap-2 border-b border-border/60 py-[6.5px] last:border-b-0"
            >
              <span className="w-9 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {timeAgoShort(consultation.createdAt)}
              </span>
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-sm bg-muted px-1.5 text-[11px] font-medium text-muted-foreground-strong">
                {consultationTypeLabels[consultation.type] ?? consultation.type}
              </span>
              <Link
                to="/consultations"
                className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline"
              >
                {consultation.contact?.name && (
                  <span className="font-medium">{consultation.contact.name} · </span>
                )}
                {consultation.content}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

/* ------------------------------ 거래 파이프라인 ------------------------------ */

const PIPELINE_STAGES = (PIPELINE_STEPS.dealStage ?? []).filter((stage) => stage !== 'closed');

function DealPipelineStrip() {
  const deals = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const countByStage = new Map<string, number>();
  for (const deal of deals.data ?? []) {
    if (deal.isCancelled) continue;
    countByStage.set(deal.stage, (countByStage.get(deal.stage) ?? 0) + 1);
  }

  return (
    <Link
      to="/deals"
      className="flex items-center gap-0 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <span className="mr-4 shrink-0 text-[12.5px] font-semibold">거래 파이프라인</span>
      {deals.isLoading ? (
        <Skeleton className="h-4 flex-1" />
      ) : deals.isError ? (
        <span className="flex-1 text-xs text-muted-foreground">
          거래 현황을 불러오지 못했습니다.
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center">
          {PIPELINE_STAGES.map((stage) => {
            const meta = getStatusMeta('dealStage', stage);
            return (
              <span key={stage} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    TONE_DOT[meta.tone] ?? 'bg-muted-foreground/50',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate text-xs text-muted-foreground-strong">{meta.label}</span>
                <span className="text-[13px] font-semibold tabular-nums">
                  {countByStage.get(stage) ?? 0}
                </span>
              </span>
            );
          })}
        </span>
      )}
      <ArrowRight className="ml-2.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/* --------------------------------- 페이지 --------------------------------- */

function DashboardPage() {
  const { user } = useAuth();
  const todayKey = localDateKey();

  const summary = useQuery({
    queryKey: ['dashboard', 'summary', todayKey],
    queryFn: () => api.dashboard.summary(),
  });

  const counts = summary.data?.counts;
  const month = summary.data?.thisMonth;
  const loading = summary.isLoading;

  return (
    <div className="flex max-w-[1180px] flex-col gap-3.5">
      {/* 브리핑 */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          {greetingByHour(new Date().getHours())}
          {user?.name ? `, ${user.name}님` : ''}
        </h1>
        {summary.isError ? (
          <div className="mt-2 max-w-md rounded-lg border bg-card">
            <QueryErrorState onRetry={() => void summary.refetch()} className="py-4" />
          </div>
        ) : loading ? (
          <Skeleton className="mt-1.5 h-4 w-64" />
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            오늘 일정 {counts?.todayEvents ?? 0}건 · 미완료 업무 {counts?.pendingTasks ?? 0}건 ·
            진행 거래 {counts?.activeDeals ?? 0}건 · 이번달 수금{' '}
            {formatMoney(month?.collectedAmount)}
          </p>
        )}
      </div>

      {/* 미완료 업무 | 오늘 일정 + 최근 활동 */}
      <div className="grid items-start gap-3.5 xl:grid-cols-[1.15fr_1fr]">
        <PendingTasksCard />
        <div className="flex flex-col gap-3.5">
          <TodayScheduleCard />
          <RecentActivityCard />
        </div>
      </div>

      {/* 거래 파이프라인 */}
      <DealPipelineStrip />
    </div>
  );
}
