/**
 * 대시보드 위젯 모음 — 만기 임박 세입자 / 오늘 일정 / 미완료 업무 / 다가오는 잔금.
 * 각 위젯이 자체 쿼리를 소유하며 로딩 스켈레톤·에러(재시도)·빈 상태를 모두 처리한다.
 */
import { Link, type LinkProps } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Hourglass,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { PipelineDeal, Task, Tenant } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain';
import { formatDate, formatDday, formatMoney, formatPhone } from '@/lib/format';

/* ---------------------------------- 공통 유틸 ---------------------------------- */

/** 로컬 기준 'YYYY-MM-DD' — queryKey에 날짜를 포함해 자정 경과 시 캐시 재사용을 방지 */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** 오늘(달력일)부터 대상일까지 남은 일수. 과거면 음수. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((t1 - t0) / 86_400_000);
}

/* --------------------------------- 공통 컴포넌트 --------------------------------- */

export function QueryErrorState({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', className)}
    >
      <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> 다시 시도
      </Button>
    </div>
  );
}

export function WidgetSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

function WidgetFrame({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          {count != null && count > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function MoreLink({
  to,
  search,
  label = '전체 보기',
}: {
  to: LinkProps['to'];
  search?: Record<string, unknown>;
  label?: string;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {label} <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

function Dday({ date, redWithin = 30 }: { date: string; redWithin?: number }) {
  const days = daysUntil(date);
  return (
    <span
      className={cn(
        'shrink-0 text-[11px] font-semibold tabular-nums',
        days != null && days <= redWithin ? 'text-destructive' : 'text-warning',
      )}
    >
      {formatDday(date)}
    </span>
  );
}

const ROW_CLASS =
  '-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted';

/* ------------------------------ 만기 임박 세입자 ------------------------------ */

function byDateAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function ExpiringTenantsWidget() {
  const todayKey = localDateKey();
  const tenants = useQuery({
    queryKey: ['tenants', 'expiring', { days: 60 }, todayKey],
    queryFn: () => api.tenants.findExpiring(60),
  });

  const rows = [...(tenants.data ?? [])].sort((a, b) => byDateAsc(a.contractEnd, b.contractEnd));

  return (
    <WidgetFrame title="만기 임박 세입자" count={rows.length} action={undefined}>
      {tenants.isLoading ? (
        <WidgetSkeleton />
      ) : tenants.isError ? (
        <QueryErrorState onRetry={() => void tenants.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="60일 내 계약 만료 예정 세입자가 없습니다"
          className="py-6"
        />
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((tenant) => (
            <li key={tenant.id}>
              <TenantRow tenant={tenant} />
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate font-medium">
        {tenant.contact?.name ?? '이름 미상'}
        {tenant.contact?.phone && (
          <span className="ml-2 font-normal text-muted-foreground">
            {formatPhone(tenant.contact.phone)}
          </span>
        )}
      </span>
      {tenant.contractEnd && (
        <>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDate(tenant.contractEnd)}
          </span>
          <Dday date={tenant.contractEnd} redWithin={30} />
        </>
      )}
    </>
  );

  if (tenant.contact) {
    return (
      <Link to="/contacts/$id" params={{ id: tenant.contact.id }} className={ROW_CLASS}>
        {body}
      </Link>
    );
  }
  return <div className={cn(ROW_CLASS, 'hover:bg-transparent')}>{body}</div>;
}

/* -------------------------------- 오늘 일정 -------------------------------- */

export function TodayEventsWidget() {
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
    <WidgetFrame title="오늘 일정" count={rows.length} action={<MoreLink to="/calendar" />}>
      {events.isLoading ? (
        <WidgetSkeleton />
      ) : events.isError ? (
        <QueryErrorState onRetry={() => void events.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="오늘 일정이 없습니다" className="py-6" />
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((event) => (
            <li key={event.id}>
              <Link to="/calendar" className={ROW_CLASS}>
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color || '#4f46e5' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{event.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(event.start).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

/* -------------------------------- 미완료 업무 -------------------------------- */

function isPendingTask(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

export function PendingTasksWidget() {
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const pending = (tasks.data ?? [])
    .filter(isPendingTask)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));

  return (
    <WidgetFrame title="미완료 업무" count={pending.length} action={<MoreLink to="/tasks" />}>
      {tasks.isLoading ? (
        <WidgetSkeleton />
      ) : tasks.isError ? (
        <QueryErrorState onRetry={() => void tasks.refetch()} />
      ) : pending.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="모든 업무를 완료했습니다" className="py-6" />
      ) : (
        <ul className="space-y-0.5">
          {pending.slice(0, 5).map((task) => {
            const overdue = task.dueDate != null && (daysUntil(task.dueDate) ?? 0) < 0;
            return (
              <li key={task.id}>
                <Link to="/tasks" className={ROW_CLASS}>
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      overdue ? 'bg-destructive' : 'bg-orange-500',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.dueDate && (
                    <span
                      className={cn(
                        'shrink-0 text-[11px]',
                        overdue ? 'font-semibold text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {formatDate(task.dueDate)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetFrame>
  );
}

/* ------------------------------- 다가오는 잔금 ------------------------------- */

function isUpcomingBalance(deal: PipelineDeal): boolean {
  if (deal.isCancelled || !deal.balanceDueDate) return false;
  if (deal.stage === 'completed' || deal.stage === 'closed') return false;
  const days = daysUntil(deal.balanceDueDate);
  return days != null && days >= 0 && days <= 30;
}

function dealLabel(deal: PipelineDeal): string {
  const label = [deal.siteName, deal.dongName, deal.unitName].filter(Boolean).join(' ');
  return label || '단지 미지정 거래';
}

export function UpcomingBalancesWidget() {
  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: () => api.finance.cashflow.summary(),
  });

  const upcoming = (cashflow.data?.deals ?? [])
    .filter(isUpcomingBalance)
    .sort((a, b) => byDateAsc(a.balanceDueDate, b.balanceDueDate));

  return (
    <WidgetFrame
      title="다가오는 잔금일"
      count={upcoming.length}
      action={<MoreLink to="/cashflow/ledger" search={{ view: 'calendar' }} label="수금 캘린더" />}
    >
      {cashflow.isLoading ? (
        <WidgetSkeleton />
      ) : cashflow.isError ? (
        <QueryErrorState onRetry={() => void cashflow.refetch()} />
      ) : upcoming.length === 0 ? (
        <EmptyState icon={Wallet} title="30일 내 예정된 잔금이 없습니다" className="py-6" />
      ) : (
        <ul className="space-y-0.5">
          {upcoming.slice(0, 5).map((deal) => (
            <li key={deal.id}>
              <Link to="/cashflow/ledger" search={{ deal: deal.id }} className={ROW_CLASS}>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {dealLabel(deal)}
                  {deal.agreedPrice != null && deal.agreedPrice !== 0 && (
                    <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                      {formatMoney(deal.agreedPrice)}
                    </span>
                  )}
                </span>
                {deal.balanceDueDate && (
                  <>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDate(deal.balanceDueDate)}
                    </span>
                    <Dday date={deal.balanceDueDate} redWithin={7} />
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
