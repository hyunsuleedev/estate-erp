import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  FileSignature,
  FilePlus2,
  FileText,
  Handshake,
  ListTodo,
  SearchX,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/domain';
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

/* --------------------------------- KPI 카드 --------------------------------- */

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  to: LinkProps['to'];
  /** 대상 라우트로 전달할 검색 파라미터 (라우트별 validateSearch 정의에 의존) */
  search?: Record<string, unknown>;
  valueClassName?: string;
  loading?: boolean;
}

function StatCard({
  label,
  icon: Icon,
  value,
  to,
  search,
  valueClassName,
  loading,
}: StatCardProps) {
  return (
    <Link
      to={to}
      search={search as never}
      className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <span
          className={cn(
            'mt-1 block truncate text-xl font-semibold tracking-tight tabular-nums',
            valueClassName,
          )}
        >
          {value}
        </span>
      )}
    </Link>
  );
}

function countText(n: number | undefined, unit = '건'): string {
  return `${(n ?? 0).toLocaleString()}${unit}`;
}

/* --------------------------------- 페이지 --------------------------------- */

function DashboardPage() {
  const todayKey = localDateKey();

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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="대시보드"
        description={`${formatDate(new Date())} 기준 사무소 현황`}
        className="mb-0"
      />

      {summary.isError ? (
        <div className="rounded-lg border bg-card">
          <QueryErrorState onRetry={() => void summary.refetch()} />
        </div>
      ) : (
        <>
          {/* 이번달 실적 KPI */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">이번달 실적</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label="수금 완료"
                icon={Wallet}
                to="/cashflow"
                loading={loading}
                value={formatMoney(month?.collectedAmount)}
              />
              <StatCard
                label="수금 예정"
                icon={CircleDollarSign}
                to="/cashflow"
                loading={loading}
                value={formatMoney(month?.expectedAmount)}
              />
              <StatCard
                label="미수금"
                icon={TriangleAlert}
                to="/cashflow/ledger"
                loading={loading}
                value={formatMoney(month?.overdueAmount)}
                valueClassName={
                  (month?.overdueAmount ?? 0) > 0 ? 'text-destructive' : undefined
                }
              />
              <StatCard
                label="이번달 계약"
                icon={FileSignature}
                to="/contracts"
                loading={loading}
                value={countText(month?.contractCount)}
              />
              <StatCard
                label="신규 의뢰"
                icon={FilePlus2}
                to="/properties"
                loading={loading}
                value={countText(month?.newIntakeCount)}
              />
              <StatCard
                label="신규 구매고객"
                icon={UserPlus}
                to="/buyer-requirements"
                loading={loading}
                value={countText(month?.newBuyerCount)}
              />
            </div>
          </section>

          {/* 진행 현황 카운트 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">진행 현황</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <StatCard
                label="미확인 매물"
                icon={SearchX}
                to="/properties"
                search={{ checkStatus: 'unverified' }}
                loading={loading}
                value={counts?.unverifiedListings ?? 0}
                valueClassName={
                  (counts?.unverifiedListings ?? 0) > 0 ? 'text-warning' : undefined
                }
              />
              <StatCard
                label="진행 매칭"
                icon={Handshake}
                to="/matches"
                loading={loading}
                value={counts?.activeMatches ?? 0}
              />
              <StatCard
                label="진행 거래"
                icon={FileText}
                to="/deals"
                loading={loading}
                value={counts?.activeDeals ?? 0}
              />
              <StatCard
                label="미완료 업무"
                icon={ListTodo}
                to="/tasks"
                loading={loading}
                value={counts?.pendingTasks ?? 0}
              />
              <StatCard
                label="오늘 일정"
                icon={CalendarDays}
                to="/calendar"
                loading={loading}
                value={counts?.todayEvents ?? 0}
              />
            </div>
          </section>
        </>
      )}

      {/* 캐시플로우 누적 요약 바 → /cashflow */}
      {cashflow.isLoading ? (
        <Skeleton className="h-[60px] rounded-lg" />
      ) : cashflow.isError ? (
        <div className="rounded-lg border bg-card">
          <QueryErrorState onRetry={() => void cashflow.refetch()} className="py-4" />
        </div>
      ) : cashflow.data ? (
        <Link to="/cashflow" className="block">
          <div className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-semibold">캐시플로우</span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
                <div>
                  <span className="text-muted-foreground">수금 완료 </span>
                  <span className="font-semibold">{formatMoney(cashflow.data.collected)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">수금 예정 </span>
                  <span className="font-semibold">{formatMoney(cashflow.data.pending)}</span>
                </div>
                {cashflow.data.overdue > 0 && (
                  <div>
                    <span className="text-destructive">미수금 </span>
                    <span className="font-semibold text-destructive">
                      {formatMoney(cashflow.data.overdue)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">순이익 </span>
                  <span className="font-semibold">{formatMoney(cashflow.data.netProfit)}</span>
                </div>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
        </Link>
      ) : null}

      {/* 위젯 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ExpiringTenantsWidget />
        <UpcomingBalancesWidget />
        <TodayEventsWidget />
        <PendingTasksWidget />
      </div>
    </div>
  );
}
