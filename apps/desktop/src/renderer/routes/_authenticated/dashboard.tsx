import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarEvent, DashboardSummary, Deal, Task } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatMoney } from '@/lib/format';
import {
  dealDisplayGroups,
  formatDealAmount,
  formatNextPaymentName,
  formatDaysLabel,
  getDealDisplayGroupKey,
  getDealPipelineHealth,
  getDealTitle,
  getNextDealPaymentSummary,
  sortDealsForDisplay,
  type DealPipelineHealthState,
} from './deals/-deal-view-utils';
import { getPropertyLabel } from './tasks/-task-property-label';
import {
  OfflineState,
  QueryErrorState,
  WidgetSkeleton,
  daysUntil,
  isQueryPaused,
  localDateKey,
} from './-dashboard-widgets';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/*
 * 디자인 메모 — "아침 브리핑지"
 * 카드 테두리를 쓰지 않고 여백·얇은 구분선으로 구획한다. 색은 앱의 success(녹색) 한 계열과
 * 위험(destructive)·주의(warning) 텍스트에만 쓴다. 숫자는 크게, 라벨은 작고 조용하게.
 *
 * 한 화면 원칙 — 대시보드는 스크롤 없이 한눈에 본다. 아래 영역은 남은 높이를 채우고,
 * 각 목록은 그 높이에 들어가는 행만 보여준 뒤 나머지는 '더 보기'로 해당 화면에 넘긴다.
 */

/* --------------------------------- 공통 --------------------------------- */

type Scope = 'mine' | 'all';

function byDateAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function isOpenTask(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

function isActiveDeal(deal: Deal): boolean {
  return !deal.isCancelled && getDealDisplayGroupKey(deal.stage) !== 'closed';
}

function greetingByHour(hour: number): string {
  if (hour < 5) return '늦은 시간까지 수고 많으세요';
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '오늘도 수고 많으셨어요';
}

function shortDate(iso: string): string {
  const weekday = new Date(iso).toLocaleDateString('ko-KR', { weekday: 'short' });
  return `${formatDate(iso).slice(5)} (${weekday})`;
}

/** 만원 단위 금액. 0은 "—" 대신 "0원"으로 보여 KPI가 비어 보이지 않게 한다. */
function Money({ manwon, unitClassName }: { manwon: number; unitClassName?: string }) {
  return (
    <>
      {manwon ? formatMoney(manwon) : '0'}
      <span className={cn('ml-0.5 font-medium text-muted-foreground', unitClassName)}>원</span>
    </>
  );
}

/** 섹션이 위에서부터 차례로 떠오르는 등장 모션 (reduce-motion이면 생략) */
function reveal(order: number): { className: string; style: CSSProperties } {
  return {
    className:
      'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:animation-duration-500',
    style: { animationDelay: `${order * 70}ms` },
  };
}

/** 목록 행은 모두 이 높이(h-12)로 고정한다 — 남은 높이로 들어갈 행 수를 계산하기 위해서다. */
const ROW_HEIGHT = 48;

/** 높이를 채우는 목록 영역. 좌우 여백은 행의 hover 배경·포커스 링이 잘리지 않게 하는 몫이다. */
const FIT_BODY = '-mx-2 min-h-0 flex-1 overflow-hidden px-2';

/**
 * 오프라인·로딩·오류·빈 상태 영역. 행 목록과 달리 자르지 않는다 — 작은 창에서도 '다시 시도'
 * 버튼이 가려지지 않게 내용 높이를 그대로 차지하고, 공간이 모자라면 페이지가 스크롤된다.
 */
const STATUS_BODY = '-mx-2 shrink-0 grow px-2';

/** 영역 높이에 고정 높이 행이 몇 개 들어가는지 — 창 크기가 바뀌면 다시 센다. */
function useRowCapacity(rowHeight = ROW_HEIGHT) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [capacity, setCapacity] = useState(0);
  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setCapacity(Math.floor(node.clientHeight / rowHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rowHeight]);
  return [setNode, capacity] as const;
}

function Section({
  title,
  meta,
  action,
  children,
  order,
  className,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  order: number;
  className?: string;
}) {
  const motion = reveal(order);
  return (
    <section
      className={cn('flex min-h-0 flex-col', motion.className, className)}
      style={motion.style}
    >
      <header className="flex min-h-8 shrink-0 items-center gap-2 pb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {meta != null && (
          <span className="text-sm text-muted-foreground tabular-nums">{meta}</span>
        )}
        {action && <div className="ml-auto flex items-center gap-3">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function MoreLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowRight
        className="size-3 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

/** 목록 열 맨 아래의 '더 보기' 자리 — 세 열의 바닥선을 맞춘다. */
function ColumnFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex h-9 shrink-0 items-center border-t border-border/70">{children}</div>
  );
}

/* -------------------------------- 인사 헤더 -------------------------------- */

function Briefing({
  now,
  officeName,
  userName,
  events,
  openTasks,
  overdueCount,
  status,
}: {
  now: Date;
  officeName?: string;
  userName?: string;
  events: number;
  openTasks: number;
  overdueCount: number;
  /** unavailable: 업무·일정을 불러오지 못했거나 오프라인 — 요약 문장을 단정하지 않고 비워 둔다 */
  status: 'pending' | 'ready' | 'unavailable';
}) {
  const motion = reveal(0);
  return (
    <header className={cn('shrink-0', motion.className)} style={motion.style}>
      <p className="text-[12.5px] leading-5 font-medium text-muted-foreground">
        {now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
        {officeName ? ` · ${officeName}` : ''}
      </p>
      <h1 className="mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.02em]">
        {greetingByHour(now.getHours())}
        {userName ? `, ${userName}님` : ''}
      </h1>
      <div className="mt-1 min-h-6 text-sm leading-6 text-muted-foreground">
        {status === 'unavailable' ? null : status === 'pending' ? (
          <Skeleton className="h-4 w-80" />
        ) : events === 0 && openTasks === 0 ? (
          <p>오늘은 예정된 일정과 남은 업무가 없어요.</p>
        ) : (
          <p>
            오늘 일정 <strong className="font-semibold text-foreground">{events}건</strong>, 남은
            업무 <strong className="font-semibold text-foreground">{openTasks}건</strong>이
            있어요.
            {overdueCount > 0 && (
              <>
                {' '}
                그중{' '}
                <strong className="font-semibold text-destructive-strong">
                  {overdueCount}건
                </strong>
                은 기한이 지났어요.
              </>
            )}
          </p>
        )}
      </div>
    </header>
  );
}

/* ------------------------------- 핵심 숫자 띠 ------------------------------- */

/**
 * 금액 셋은 기준이 서로 달라 비율로 합치지 않는다.
 * - 수금: paidAt이 이번달인 실수금액 (지난달 만기분을 이번달에 받은 것도 포함)
 * - 만기 미수: dueDate가 이번달인 미수금 (이미 기한이 지난 이번달 만기분도 포함)
 * - 연체: 기간 무관, 기한이 지났거나 overdue로 표시된 미수금 전체
 */
function KpiRow({ summary }: { summary: DashboardSummary }) {
  const { thisMonth: month, counts } = summary;
  const cells: Array<{
    to: LinkProps['to'];
    label: string;
    hint?: string;
    value: ReactNode;
    foot: ReactNode;
  }> = [
    {
      to: '/cashflow',
      label: '이번달 수금',
      hint: '이번달에 입금 확인된 수수료',
      value: <Money manwon={month.collectedAmount} unitClassName="text-sm" />,
      foot:
        month.overdueAmount > 0 ? (
          <span className="font-medium text-destructive-strong">
            연체 <Money manwon={month.overdueAmount} unitClassName="text-destructive-strong" />
          </span>
        ) : (
          '연체 없음'
        ),
    },
    {
      to: '/cashflow',
      label: '이번달 만기 미수',
      hint: '이번달이 만기인 미수금 — 연체와 겹칠 수 있음',
      value: <Money manwon={month.expectedAmount} unitClassName="text-sm" />,
      foot: '이번달이 만기인 미수금',
    },
    {
      to: '/deals',
      label: '진행 거래',
      value: (
        <>
          {counts.activeDeals}
          <span className="ml-0.5 text-sm font-medium text-muted-foreground">건</span>
        </>
      ),
      foot: `이번달 계약 ${month.contractCount}건 · 매칭 ${counts.activeMatches}건`,
    },
    {
      to: '/properties',
      label: '거래 가능 매물',
      value: (
        <>
          {counts.activeListings}
          <span className="ml-0.5 text-sm font-medium text-muted-foreground">건</span>
        </>
      ),
      // 0이어도 전부 확인됐다는 뜻이 아니다 — 확인 기한 지남·부재중 매물은 이 숫자에 들어가지 않는다.
      foot:
        counts.unverifiedListings > 0 ? (
          <span>
            <span className="font-medium text-warning-strong">
              미확인 {counts.unverifiedListings}건
            </span>{' '}
            · 신규 접수 {month.newIntakeCount}건
          </span>
        ) : (
          `미확인 매물 없음 · 신규 접수 ${month.newIntakeCount}건`
        ),
    },
  ];

  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-xl bg-muted/80">
      {cells.map((cell, index) => (
        <Link
          key={cell.label}
          to={cell.to}
          title={cell.hint}
          className={cn(
            'group flex min-w-0 flex-col px-5 py-3.5 transition-colors hover:bg-black/[0.025] focus-visible:bg-black/[0.03] focus-visible:outline-none',
            index > 0 && 'border-l border-black/[0.06]',
          )}
        >
          <span className="flex items-center justify-between text-[12.5px] font-medium text-muted-foreground">
            {cell.label}
            <ChevronRight
              className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
              aria-hidden="true"
            />
          </span>
          <span className="mt-1 truncate text-2xl leading-8 font-semibold tracking-[-0.02em] tabular-nums">
            {cell.value}
          </span>
          <span className="mt-0.5 truncate text-xs text-muted-foreground">{cell.foot}</span>
        </Link>
      ))}
    </div>
  );
}

function KpiRowSkeleton() {
  return <Skeleton className="h-[100px] rounded-xl" />;
}

/* -------------------------------- 확인할 것 -------------------------------- */

interface AttentionItem {
  key: string;
  label: string;
  value: ReactNode;
  to: LinkProps['to'];
  tone: 'danger' | 'warning';
}

/**
 * @param incomplete 일부 원천 데이터(요약·업무·거래)를 불러오지 못한 상태.
 *   이때는 항목이 0개여도 '확인할 항목 없음'을 단정하지 않는다.
 */
function AttentionList({ items, incomplete }: { items: AttentionItem[]; incomplete: boolean }) {
  if (items.length === 0) {
    return incomplete ? (
      <p className="flex items-start gap-2 py-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        일부 데이터를 불러오지 못해 확인 항목을 모두 계산하지 못했습니다.
      </p>
    ) : (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft/40 px-3 py-3 text-sm text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        지금 확인할 항목이 없습니다.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border/70 border-y border-border/70">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="group -mx-2 flex h-10 items-center gap-3 rounded-md px-2 transition-colors hover:bg-muted/70"
            >
              <span
                className={cn(
                  'h-4 w-[3px] shrink-0 rounded-full',
                  item.tone === 'danger' ? 'bg-destructive' : 'bg-warning',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  item.tone === 'danger' ? 'text-destructive-strong' : 'text-foreground',
                )}
              >
                {item.value}
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
      {incomplete && (
        <p className="pt-2 text-xs text-muted-foreground">일부 항목은 불러오지 못했습니다.</p>
      )}
    </>
  );
}

/* ---------------------------------- 오늘 ---------------------------------- */

function ScopeToggle({ value, onChange }: { value: Scope; onChange: (next: Scope) => void }) {
  const options: Array<{ value: Scope; label: string }> = [
    { value: 'mine', label: '내 담당' },
    { value: 'all', label: '사무소 전체' },
  ];
  return (
    <div role="group" aria-label="표시 범위" className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded-md px-3 text-xs font-medium transition-all',
            value === option.value
              ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return '종일';
  return new Date(event.start).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex h-7 shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground tabular-nums">
      {children}
    </h3>
  );
}

type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'none';

function taskBucket(task: Task): TaskBucket {
  const days = daysUntil(task.dueDate);
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return 'upcoming';
}

type QueryView = 'offline' | 'pending' | 'error' | 'ready';

function queryView(query: { isPending: boolean; isError: boolean; fetchStatus: string }): QueryView {
  if (isQueryPaused(query)) return 'offline';
  if (query.isPending) return 'pending';
  if (query.isError) return 'error';
  return 'ready';
}

function TodayCard({
  scope,
  onScopeChange,
  userId,
  tasks,
  events,
  openTasks,
  todayEvents,
}: {
  scope: Scope;
  onScopeChange: (next: Scope) => void;
  userId: string | undefined;
  tasks: ReturnType<typeof useTasksQuery>;
  events: ReturnType<typeof useTodayEventsQuery>;
  openTasks: Task[];
  todayEvents: CalendarEvent[];
}) {
  const queryClient = useQueryClient();
  const complete = useMutation({
    mutationFn: (task: Task) => api.tasks.update(task.id, { status: 'completed' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const [eventListRef, eventCapacity] = useRowCapacity();
  const [taskListRef, taskCapacity] = useRowCapacity();

  const mine = scope === 'mine' && Boolean(userId);
  const eventView = queryView(events);
  const taskView = queryView(tasks);
  const shownEvents = todayEvents.slice(0, eventCapacity);
  const hiddenEvents = todayEvents.length - shownEvents.length;
  const shownTasks = openTasks.slice(0, taskCapacity);
  const hiddenTasks = openTasks.length - shownTasks.length;
  const overdueTasks = openTasks.filter((task) => taskBucket(task) === 'overdue').length;
  const eventStatus =
    eventView === 'offline' ? (
      <OfflineState className="justify-start py-3" />
    ) : eventView === 'pending' ? (
      <WidgetSkeleton rows={3} />
    ) : eventView === 'error' ? (
      <QueryErrorState onRetry={() => void events.refetch()} className="py-4" />
    ) : todayEvents.length === 0 ? (
      <Quiet>오늘 잡힌 일정이 없습니다.</Quiet>
    ) : null;
  const taskStatus =
    taskView === 'offline' ? (
      <OfflineState className="justify-start py-3" />
    ) : taskView === 'pending' ? (
      <WidgetSkeleton rows={4} />
    ) : taskView === 'error' ? (
      <QueryErrorState onRetry={() => void tasks.refetch()} className="py-4" />
    ) : openTasks.length === 0 ? (
      <Quiet>{mine ? '내게 배정된 남은 업무가 없습니다.' : '남은 업무가 없습니다.'}</Quiet>
    ) : null;
  const personLabel = (id: string | null, name: string | null | undefined) =>
    id && id === userId ? '나' : (name ?? '미배정');

  return (
    <Section
      order={2}
      title="오늘"
      action={<ScopeToggle value={scope} onChange={onScopeChange} />}
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-x-8">
        {/* 일정 타임라인 */}
        <div className="flex min-h-0 flex-col">
          <SubLabel>일정{eventView === 'ready' ? ` ${todayEvents.length}` : ''}</SubLabel>
          {eventStatus ? (
            <div className={STATUS_BODY}>{eventStatus}</div>
          ) : (
            <div ref={eventListRef} className={FIT_BODY}>
              <ol>
                {shownEvents.map((event, index) => {
                  const last = index === shownEvents.length - 1;
                  const meta = [
                    event.property?.site?.name,
                    scope === 'all' && event.user?.name
                      ? personLabel(event.userId, event.user.name)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li
                      key={event.id}
                      className="grid h-12 grid-cols-[44px_14px_minmax(0,1fr)] gap-x-3"
                    >
                      <span className="pt-1.5 text-[13px] leading-5 font-semibold tabular-nums">
                        {eventTimeLabel(event)}
                      </span>
                      <span className="relative flex justify-center" aria-hidden="true">
                        <span
                          className="relative z-10 mt-3 size-2 rounded-full ring-4 ring-background"
                          style={{ backgroundColor: event.color || 'var(--color-success)' }}
                        />
                        {!last && (
                          <span className="absolute top-5 -bottom-3 w-px bg-foreground/15" />
                        )}
                      </span>
                      <div className="min-w-0 py-1.5">
                        <Link
                          to="/calendar"
                          className="block truncate text-sm leading-5 font-medium hover:underline"
                        >
                          {event.title}
                        </Link>
                        {meta && (
                          <p className="truncate text-xs leading-4 text-muted-foreground">{meta}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <ColumnFooter>
            <MoreLink to="/calendar">
              {hiddenEvents > 0 ? `일정 ${hiddenEvents}건 더 보기` : '캘린더로'}
            </MoreLink>
          </ColumnFooter>
        </div>

        {/* 업무 — 기한 빠른 순 */}
        <div className="flex min-h-0 flex-col">
          <SubLabel>
            업무{taskView === 'ready' ? ` ${openTasks.length}` : ''}
            {taskView === 'ready' && overdueTasks > 0 && (
              <span className="text-destructive-strong">· 기한 지남 {overdueTasks}</span>
            )}
          </SubLabel>
          {taskStatus ? (
            <div className={STATUS_BODY}>{taskStatus}</div>
          ) : (
            <div ref={taskListRef} className={FIT_BODY}>
              <ul className="divide-y divide-border/70">
                {shownTasks.map((task) => {
                  const completing = complete.isPending && complete.variables?.id === task.id;
                  const bucket = taskBucket(task);
                  const days = daysUntil(task.dueDate);
                  const meta = [
                    task.property ? getPropertyLabel(task) : null,
                    scope === 'all' ? personLabel(task.assignedToId, task.assignedTo?.name) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        'flex h-12 items-center gap-3 transition-opacity',
                        completing && 'opacity-40',
                      )}
                    >
                      <button
                        type="button"
                        aria-label={`${task.title} 완료 처리`}
                        disabled={completing}
                        onClick={() => complete.mutate(task)}
                        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/40 text-transparent transition-colors hover:border-success hover:bg-success hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Check className="size-2.5" strokeWidth={3.5} aria-hidden="true" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/tasks"
                          className="block truncate text-sm leading-5 hover:underline"
                        >
                          {task.title}
                        </Link>
                        {meta && (
                          <p className="truncate text-xs leading-4 text-muted-foreground">{meta}</p>
                        )}
                      </div>
                      {task.dueDate && (
                        <span
                          title={formatDate(task.dueDate)}
                          className={cn(
                            'shrink-0 text-xs tabular-nums',
                            bucket === 'overdue'
                              ? 'font-semibold text-destructive-strong'
                              : bucket === 'today'
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground',
                          )}
                        >
                          {bucket === 'overdue' && days != null
                            ? `${Math.abs(days)}일 지남`
                            : bucket === 'today'
                              ? '오늘'
                              : shortDate(task.dueDate)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <ColumnFooter>
            <MoreLink to="/tasks">
              {hiddenTasks > 0 ? `업무 ${hiddenTasks}건 더 보기` : '업무 화면으로'}
            </MoreLink>
          </ColumnFooter>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------ 거래 파이프라인 ------------------------------ */

const PIPELINE_GROUPS = dealDisplayGroups.filter((group) => group.key !== 'closed');
/** 단계가 진행될수록 짙어지는 단일 색상 램프 (순서형 데이터 — 무지개 대신 명도로 구분) */
const STAGE_SHADE = [28, 46, 64, 82, 100];

function stageColor(index: number): string {
  return `color-mix(in oklab, var(--color-success) ${STAGE_SHADE[index] ?? 100}%, white)`;
}

const HEALTH_TEXT: Record<Exclude<DealPipelineHealthState, 'healthy'>, string> = {
  overdue: 'text-destructive-strong',
  stale: 'text-warning-strong',
  unscheduled: 'text-muted-foreground',
};

function PipelineCard({ deals }: { deals: ReturnType<typeof useDealsQuery> }) {
  const [dealListRef, dealCapacity] = useRowCapacity();
  const view = queryView(deals);
  const active = (deals.data ?? []).filter(isActiveDeal);
  const countByGroup = new Map<string, number>();
  for (const deal of active) {
    const key = getDealDisplayGroupKey(deal.stage);
    countByGroup.set(key, (countByGroup.get(key) ?? 0) + 1);
  }
  const sorted = sortDealsForDisplay(active);
  const shown = sorted.slice(0, dealCapacity);
  const hidden = sorted.length - shown.length;
  // 헤더 숫자는 KPI '진행 거래'(서버: completed·closed 제외)와 같은 기준으로 센다.
  const inProgressCount = active.length - (countByGroup.get('completed') ?? 0);
  const status =
    view === 'offline' ? (
      <OfflineState className="justify-start py-3" />
    ) : view === 'pending' ? (
      <WidgetSkeleton rows={4} />
    ) : view === 'error' ? (
      <QueryErrorState onRetry={() => void deals.refetch()} className="py-4" />
    ) : sorted.length === 0 ? (
      <Quiet>진행 중인 거래가 없습니다.</Quiet>
    ) : null;

  return (
    <Section
      order={4}
      title="거래 진행"
      meta={view === 'ready' ? inProgressCount : undefined}
      className="flex-1"
    >
      {view === 'ready' && (
        <div className="shrink-0">
          <div
            className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={PIPELINE_GROUPS.map(
              (group) => `${group.label} ${countByGroup.get(group.key) ?? 0}건`,
            ).join(', ')}
          >
            {PIPELINE_GROUPS.map((group, index) => {
              const count = countByGroup.get(group.key) ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={group.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ flexGrow: count, backgroundColor: stageColor(index) }}
                />
              );
            })}
          </div>
          <dl className="mt-2.5 grid grid-cols-5 gap-2">
            {PIPELINE_GROUPS.map((group, index) => {
              const count = countByGroup.get(group.key) ?? 0;
              return (
                <div key={group.key} className="min-w-0">
                  <dt
                    className="flex items-center gap-1 truncate text-[11.5px] text-muted-foreground"
                    title={group.label}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stageColor(index) }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{group.label}</span>
                  </dt>
                  <dd
                    className={cn(
                      'text-lg leading-7 font-semibold tabular-nums',
                      count === 0 && 'text-muted-foreground/50',
                    )}
                  >
                    {count}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {status ? (
        <div className={STATUS_BODY}>{status}</div>
      ) : (
        <div ref={dealListRef} className={cn(FIT_BODY, 'mt-2')}>
          <ul className="divide-y divide-border/70">
            {shown.map((deal) => (
              <FocusDealRow key={deal.id} deal={deal} />
            ))}
          </ul>
        </div>
      )}
      <ColumnFooter>
        <MoreLink to="/deals">{hidden > 0 ? `거래 ${hidden}건 더 보기` : '거래관리로'}</MoreLink>
      </ColumnFooter>
    </Section>
  );
}

function FocusDealRow({ deal }: { deal: Deal }) {
  const health = getDealPipelineHealth(deal);
  const nextPayment = getNextDealPaymentSummary(deal);
  const group = PIPELINE_GROUPS.find((item) => item.key === getDealDisplayGroupKey(deal.stage));
  const amount = formatDealAmount(deal);

  return (
    <li className="h-12">
      <Link
        to="/deals"
        search={{ dealId: deal.id }}
        className="group -mx-2 flex h-full items-center gap-3 rounded-md px-2 transition-colors hover:bg-muted/70"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-5 font-medium">{getDealTitle(deal)}</span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {group?.label ?? deal.stage}
            {amount !== '—' && ` · ${amount}`}
          </span>
        </span>
        {health.state !== 'healthy' ? (
          <span
            title={health.description}
            className={cn('shrink-0 text-xs font-semibold', HEALTH_TEXT[health.state])}
          >
            {health.label}
          </span>
        ) : nextPayment?.payment.scheduledDate ? (
          <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {formatNextPaymentName(nextPayment)}
            <span
              className={cn(
                'ml-1.5 font-semibold',
                nextPayment.isUrgent ? 'text-warning-strong' : 'text-foreground',
              )}
            >
              {formatDaysLabel(nextPayment.daysUntil)}
            </span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/* --------------------------------- 쿼리 --------------------------------- */

function useTasksQuery() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => api.tasks.findAll() });
}

function useDealsQuery() {
  return useQuery({ queryKey: ['deals'], queryFn: () => api.deals.findAll() });
}

function useTodayEventsQuery(todayKey: string) {
  return useQuery({
    queryKey: ['calendar-events', 'today', todayKey],
    queryFn: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return api.calendarEvents.findAll({ start: start.toISOString(), end: end.toISOString() });
    },
  });
}

/* --------------------------------- 페이지 --------------------------------- */

function DashboardPage() {
  const { user } = useAuth();
  const todayKey = localDateKey();
  const [scope, setScope] = useState<Scope>(user?.role === 'agent' ? 'mine' : 'all');

  const summary = useQuery({
    queryKey: ['dashboard', 'summary', todayKey],
    queryFn: () => api.dashboard.summary(),
  });
  const tasks = useTasksQuery();
  const deals = useDealsQuery();
  const events = useTodayEventsQuery(todayKey);

  const now = new Date();
  const mine = scope === 'mine' && Boolean(user?.id);
  const scopedOpenTasks = (tasks.data ?? [])
    .filter(isOpenTask)
    .filter((task) => !mine || task.assignedToId === user?.id)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));
  const scopedEvents = (events.data ?? [])
    .filter((event) => !mine || event.userId === user?.id)
    .sort((a, b) => byDateAsc(a.start, b.start));
  const scopedOverdue = scopedOpenTasks.filter((task) => taskBucket(task) === 'overdue').length;

  // 확인할 것은 범위 토글과 무관하게 사무소 전체 기준이다.
  const overdueTaskCount = (tasks.data ?? []).filter(
    (task) => isOpenTask(task) && taskBucket(task) === 'overdue',
  ).length;
  // '일정 미정'(unscheduled)도 isAtRisk지만 지연·정체는 아니므로 라벨과 맞게 두 상태만 센다.
  const delayedDealCount = (deals.data ?? [])
    .filter(isActiveDeal)
    .filter((deal) => {
      const { state } = getDealPipelineHealth(deal, now);
      return state === 'overdue' || state === 'stale';
    }).length;

  // 세 원천이 모두 끝나야 '확인할 항목 없음'을 말할 수 있다. 실패한 원천이 있으면 incomplete.
  // isLoading이 아니라 isPending — 오프라인 대기(paused) 중에도 아직 '결과 없음'이 아니다.
  const attentionSources = [summary, tasks, deals];
  const attentionOffline = attentionSources.some(isQueryPaused);
  const attentionPending = attentionSources.some((query) => query.isPending);
  const attentionIncomplete = summary.isError || tasks.isError || deals.isError;

  const attention: AttentionItem[] = [];
  if (tasks.data && overdueTaskCount > 0)
    attention.push({
      key: 'tasks',
      label: '기한 지난 업무',
      value: `${overdueTaskCount}건`,
      to: '/tasks',
      tone: 'danger',
    });
  if (summary.data && summary.data.thisMonth.overdueAmount > 0)
    attention.push({
      key: 'overdue',
      label: '연체 수수료',
      value: <Money manwon={summary.data.thisMonth.overdueAmount} unitClassName="text-current" />,
      to: '/cashflow',
      tone: 'danger',
    });
  if (deals.data && delayedDealCount > 0)
    attention.push({
      key: 'deals',
      label: '지연·정체 거래',
      value: `${delayedDealCount}건`,
      to: '/deals',
      tone: 'warning',
    });
  if (summary.data) {
    const { counts } = summary.data;
    if (counts.unverifiedListings > 0)
      attention.push({
        key: 'listings',
        label: '미확인 매물',
        value: `${counts.unverifiedListings}건`,
        to: '/properties',
        tone: 'warning',
      });
    if (counts.expiringTenants > 0)
      attention.push({
        key: 'tenants',
        label: '60일 내 계약만료 세입자',
        value: `${counts.expiringTenants}명`,
        to: '/sites',
        tone: 'warning',
      });
  }

  const kpiMotion = reveal(1);

  return (
    // flex-1 min-h-0: 탭 영역 높이를 그대로 받는다. min-h-0이 없으면 이미 그린 행들이 최소 높이가 되어
    // 창을 줄여도 목록이 줄지 않는다. 창이 아주 낮으면 아래 영역의 min-h 만큼만 넘쳐 스크롤된다.
    <div className="flex min-h-0 w-full max-w-[1280px] flex-1 flex-col gap-6 px-1">
      <Briefing
        now={now}
        officeName={user?.office?.name}
        userName={user?.name}
        events={scopedEvents.length}
        openTasks={scopedOpenTasks.length}
        overdueCount={scopedOverdue}
        status={
          tasks.isError || events.isError || isQueryPaused(tasks) || isQueryPaused(events)
            ? 'unavailable'
            : tasks.isPending || events.isPending
              ? 'pending'
              : 'ready'
        }
      />

      <div className={cn('shrink-0', kpiMotion.className)} style={kpiMotion.style}>
        {summary.isError ? (
          <div className="rounded-xl bg-muted/80">
            <QueryErrorState onRetry={() => void summary.refetch()} className="py-6" />
          </div>
        ) : isQueryPaused(summary) ? (
          <div className="rounded-xl bg-muted/80">
            <OfflineState />
          </div>
        ) : summary.isPending ? (
          <KpiRowSkeleton />
        ) : (
          <KpiRow summary={summary.data} />
        )}
      </div>

      <div className="grid min-h-[320px] flex-1 grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] grid-rows-[minmax(0,1fr)] gap-x-10">
        <TodayCard
          scope={scope}
          onScopeChange={setScope}
          userId={user?.id}
          tasks={tasks}
          events={events}
          openTasks={scopedOpenTasks}
          todayEvents={scopedEvents}
        />

        <aside className="flex min-h-0 flex-col gap-6">
          <Section
            order={3}
            title="확인할 것"
            meta={attentionPending || attention.length === 0 ? undefined : attention.length}
            className="shrink-0"
          >
            {attentionOffline ? (
              <OfflineState className="justify-start py-3" />
            ) : attentionPending ? (
              <WidgetSkeleton rows={3} />
            ) : (
              <AttentionList items={attention} incomplete={attentionIncomplete} />
            )}
          </Section>
          <PipelineCard deals={deals} />
        </aside>
      </div>
    </div>
  );
}
