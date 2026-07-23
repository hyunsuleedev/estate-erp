import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Hourglass, Inbox, SearchX, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  isUpcomingBalance,
  localDateKey,
} from './-dashboard-widgets';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/* ------------------------------- 긴급 액션 카드 ------------------------------- */

interface ActionCardProps {
  icon: LucideIcon;
  /** 아이콘 버블 + 제목 색상 (토큰 조합, 예: 'bg-warning-soft text-warning') */
  bubbleClassName: string;
  titleClassName: string;
  title: string;
  desc: string;
  to: LinkProps['to'];
  /** 대상 라우트로 전달할 검색 파라미터 (라우트별 validateSearch 정의에 의존) */
  search?: Record<string, unknown>;
  loading?: boolean;
}

function ActionCard({
  icon: Icon,
  bubbleClassName,
  titleClassName,
  title,
  desc,
  to,
  search,
  loading,
}: ActionCardProps) {
  return (
    <Link
      to={to}
      search={search as never}
      className="flex items-center gap-[11px] rounded-[11px] border bg-card px-[13px] py-3 transition-colors hover:bg-muted/50"
    >
      <span
        className={cn(
          'flex size-[34px] shrink-0 items-center justify-center rounded-[9px]',
          bubbleClassName,
        )}
      >
        <Icon className="size-[17px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          <div
            className={cn(
              'whitespace-nowrap text-[12.5px] font-bold tabular-nums',
              titleClassName,
            )}
          >
            {title}
          </div>
        )}
        <div className="mt-px truncate text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
}

/* ------------------------------ 거래 파이프라인 스트립 ------------------------------ */

const PIPELINE_ITEMS = [
  { key: 'negotiating', label: '협상중', dotClassName: 'bg-info' },
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

  // 업무함 긴급 뱃지용 — 실패해도 뱃지만 생략 (별도 에러 UI 없음)
  const urgentInbox = useQuery({
    queryKey: ['proposals', { status: 'pending', priority: 'urgent' }],
    queryFn: () => api.proposals.list({ status: 'pending', priority: 'urgent' }),
    select: (rows) => rows.length,
  });

  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: () => api.finance.cashflow.summary(),
  });

  const month = summary.data?.thisMonth;
  const counts = summary.data?.counts;
  const loading = summary.isLoading;
  const urgentCount = urgentInbox.data ?? 0;

  // 30일 내 잔금 예정 거래 수 (UpcomingBalancesWidget과 동일 기준)
  const upcomingBalanceCount = (cashflow.data?.deals ?? []).filter(isUpcomingBalance).length;

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
            {formatDate(new Date())} 기준 · 이번달 수금 완료 {formatMoney(month?.collectedAmount)}{' '}
            · 수금 예정 {formatMoney(month?.expectedAmount)} · 계약{' '}
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
          {/* 긴급 액션 레인 */}
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <ActionCard
              icon={SearchX}
              bubbleClassName="bg-warning-soft text-warning"
              titleClassName="text-warning"
              title={`미확인 매물 ${counts?.unverifiedListings ?? 0}건`}
              desc="확인 상태 점검이 필요합니다"
              to="/properties"
              search={{ checkStatus: 'unverified' }}
              loading={loading}
            />
            <ActionCard
              icon={Wallet}
              bubbleClassName="bg-info-soft text-info"
              titleClassName="text-info"
              title={`임박 잔금 ${upcomingBalanceCount}건`}
              desc="30일 내 잔금일이 도래합니다"
              to="/cashflow/ledger"
              search={{ view: 'calendar' }}
              loading={cashflow.isLoading}
            />
            <ActionCard
              icon={Hourglass}
              bubbleClassName="bg-orange-soft text-orange"
              titleClassName="text-orange"
              title={`만기 임박 세입자 ${counts?.expiringTenants ?? 0}명`}
              desc="60일 내 계약이 만료됩니다"
              to="/contacts"
              loading={loading}
            />
            <ActionCard
              icon={Inbox}
              bubbleClassName={
                urgentCount > 0
                  ? 'bg-destructive-soft text-destructive'
                  : 'bg-violet-soft text-violet'
              }
              titleClassName={urgentCount > 0 ? 'text-destructive' : 'text-violet'}
              title={`AI 검토 대기 ${counts?.pendingInbox ?? 0}건`}
              desc={urgentCount > 0 ? `긴급 ${urgentCount}건 검토 필요` : '확인·수정·승인 요청을 확인하세요'}
              to="/inbox"
              loading={loading}
            />
          </div>

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
          <ArrowRight className="ml-2.5 size-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
