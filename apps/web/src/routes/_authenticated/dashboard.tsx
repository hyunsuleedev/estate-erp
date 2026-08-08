import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatMoney } from '@/lib/format';
import {
  ExpiringTenantsWidget,
  PendingTasksWidget,
  QueryErrorState,
  TodayEventsWidget,
  UpcomingBalancesWidget,
  localDateKey,
} from './-dashboard-widgets';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/* ------------------------------ 거래 파이프라인 스트립 ------------------------------ */

const PIPELINE_ITEMS = [
  { key: 'preparing', label: '계약 준비', dotClassName: 'bg-info' },
  { key: 'contract', label: '계약', dotClassName: 'bg-violet' },
  { key: 'balanceWaiting', label: '잔금 대기', dotClassName: 'bg-warning' },
  { key: 'collected', label: '수금 완료', dotClassName: 'bg-success' },
  { key: 'overdue', label: '연체', dotClassName: 'bg-destructive' },
] as const;

/* --------------------------------- 페이지 --------------------------------- */

function DashboardPage() {
  const todayKey = localDateKey();
  const { user } = useAuth();

  const summary = useQuery({
    queryKey: ['dashboard', 'summary', todayKey],
    queryFn: () => api.dashboard.summary(),
  });

  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: () => api.finance.cashflow.summary(),
  });

  const month = summary.data?.thisMonth;
  const counts = summary.data?.counts;
  const loading = summary.isLoading;

  return (
    <div className="flex max-w-[1180px] flex-col gap-3.5">
      {/* 인사말 브리핑 */}
      <div>
        <h2 className="text-[19px] font-bold tracking-[-0.02em] text-foreground">
          {user?.name ? `안녕하세요, ${user.name}님` : '안녕하세요'}
        </h2>
        {loading ? (
          <Skeleton className="mt-1.5 h-4 w-72" />
        ) : (
          <p className="mt-1 break-keep text-[12.5px] text-muted-foreground tabular-nums">
            {formatDate(new Date())} 기준 · 이번달 수금 완료 {formatMoney(month?.collectedAmount)} ·
            수금 예정 {formatMoney(month?.expectedAmount)} · 계약{' '}
            {(month?.contractCount ?? 0).toLocaleString()}건 · 오늘 일정{' '}
            {(counts?.todayEvents ?? 0).toLocaleString()}건
          </p>
        )}
      </div>

      {summary.isError ? (
        <div className="rounded-[12px] border bg-card">
          <QueryErrorState onRetry={() => void summary.refetch()} />
        </div>
      ) : (
        <>
          {/* 메인: 미완료 업무 | 일정·현황 */}
          <div className="grid items-start gap-3.5 lg:grid-cols-[1.15fr_1fr]">
            <PendingTasksWidget />
            <div className="flex flex-col gap-3.5">
              <TodayEventsWidget />
              <ExpiringTenantsWidget />
              <UpcomingBalancesWidget />
            </div>
          </div>
        </>
      )}

      {/* 거래 파이프라인 스트립 → /cashflow */}
      {cashflow.isLoading ? (
        <Skeleton className="h-[52px] rounded-[12px]" />
      ) : cashflow.isError ? (
        <div className="rounded-[12px] border bg-card">
          <QueryErrorState onRetry={() => void cashflow.refetch()} className="py-4" />
        </div>
      ) : cashflow.data ? (
        <Link
          to="/cashflow"
          className="flex items-center rounded-[12px] border bg-card px-[18px] py-[13px] transition-colors hover:bg-muted/50"
        >
          <span className="mr-[18px] whitespace-nowrap text-[12.5px] font-bold text-foreground">
            거래 파이프라인
          </span>
          <div className="flex flex-1 items-center gap-3 overflow-x-auto">
            {PIPELINE_ITEMS.map((item) => (
              <div key={item.key} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn('size-2 shrink-0 rounded-full', item.dotClassName)}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {item.label}
                </span>
                <span className="text-[13px] font-bold text-foreground tabular-nums">
                  {cashflow.data.pipeline[item.key].count}
                </span>
              </div>
            ))}
          </div>
          <ArrowRight
            className="ml-2.5 size-[15px] shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
