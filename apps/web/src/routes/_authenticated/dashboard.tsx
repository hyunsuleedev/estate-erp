import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Building,
  BookUser,
  Handshake,
  FileText,
  ListTodo,
  CalendarDays,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice } from '@estate-erp/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

// ── Deal pipeline stages ────────────────────────────────────────

const dealStages = [
  { key: 'selection', label: '매물선정', color: 'bg-slate-400' },
  { key: 'deposit', label: '계약금', color: 'bg-amber-400' },
  { key: 'contract', label: '계약', color: 'bg-blue-400' },
  { key: 'completed', label: '완료', color: 'bg-emerald-400' },
];

const matchStages = [
  { key: 'suggested', label: '제안' },
  { key: 'buyerContacted', label: '연락' },
  { key: 'viewing', label: '임장' },
  { key: 'ownerContacted', label: '협의' },
  { key: 'negotiating', label: '협상' },
  { key: 'dealCreated', label: '거래생성' },
];

function DashboardPage() {
  const properties = useQuery({
    queryKey: ['properties', 'count'],
    queryFn: () => api.properties.findAll({ limit: 1 }),
  });

  const contacts = useQuery({
    queryKey: ['contacts', 'count'],
    queryFn: () => api.contacts.findAll({ limit: 1 }),
  });

  const matches = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

  const deals = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.findAll(),
  });

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const events = useQuery({
    queryKey: ['calendar-events', 'today'],
    queryFn: () => api.calendarEvents.findAll({ start: todayStart, end: todayEnd }),
  });

  const isLoading = properties.isLoading || contacts.isLoading;

  // Active deals (not closed)
  const activeDeals = deals.data?.filter((d) => d.stage !== 'closed') ?? [];
  const activeMatches = matches.data?.filter((m) => m.stage !== 'closed') ?? [];
  const pendingTasks = tasks.data?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled') ?? [];

  // Pipeline counts by stage
  const dealsByStage = dealStages.map((s) => ({
    ...s,
    count: activeDeals.filter((d) => d.stage === s.key).length,
  }));

  const matchesByStage = matchStages.map((s) => ({
    ...s,
    count: activeMatches.filter((m) => m.stage === s.key).length,
  }));

  const maxDealCount = Math.max(1, ...dealsByStage.map((s) => s.count));

  // Total commissions in pipeline
  const totalCommission = activeDeals.reduce((sum, d) => sum + (d.commissionTotal ?? 0), 0);

  const stats = [
    {
      label: '총 매물',
      value: properties.data?.pagination?.total ?? 0,
      icon: Building,
      href: '/properties',
    },
    {
      label: '연락처',
      value: contacts.data?.pagination?.total ?? 0,
      icon: BookUser,
      href: '/contacts',
    },
    {
      label: '진행 매칭',
      value: activeMatches.length,
      icon: Handshake,
      href: '/matches',
    },
    {
      label: '진행 거래',
      value: activeDeals.length,
      icon: FileText,
      href: '/deals',
    },
    {
      label: '미완료 업무',
      value: pendingTasks.length,
      icon: ListTodo,
      href: '/tasks',
    },
    {
      label: '오늘 일정',
      value: events.data?.length ?? 0,
      icon: CalendarDays,
      href: '/calendar',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPI grid */}
      <div className="grid auto-rows-min gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} to={href} className="group rounded-xl border border-border/50 bg-muted/40 p-4 transition-colors hover:bg-muted/70">
            <div className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <span className="mt-1 block text-2xl font-semibold tracking-tight">{value}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Deal pipeline funnel + match pipeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Deal pipeline */}
        <div className="rounded-xl border border-border/50 bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">거래 파이프라인</h2>
              {totalCommission > 0 && (
                <span className="text-[11px] text-emerald-600 font-medium">
                  예상 수수료 {formatPrice(totalCommission)}
                </span>
              )}
            </div>
            <Link to="/deals" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              전체 보기 <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="px-4 pb-4">
            {deals.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : activeDeals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">진행 중인 거래가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {dealsByStage.map((stage) => (
                  <div key={stage.key} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">{stage.label}</span>
                    <div className="flex-1 relative h-6 rounded bg-muted/50">
                      <div
                        className={cn('h-full rounded transition-all', stage.color)}
                        style={{ width: `${Math.max(4, (stage.count / maxDealCount) * 100)}%`, opacity: stage.count === 0 ? 0.2 : 1 }}
                      />
                    </div>
                    <span className="w-5 shrink-0 text-right text-[11px] font-medium tabular-nums">
                      {stage.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Match pipeline summary */}
        <div className="rounded-xl border border-border/50 bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">매칭 파이프라인</h2>
              <TrendingUp className="size-3.5 text-muted-foreground" />
            </div>
            <Link to="/matches" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              전체 보기 <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="px-4 pb-4">
            {matches.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : activeMatches.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">진행 중인 매칭이 없습니다.</p>
            ) : (
              <div className="flex items-end gap-2 h-24">
                {matchesByStage.map((stage) => {
                  const maxCount = Math.max(1, ...matchesByStage.map((s) => s.count));
                  const heightPct = stage.count === 0 ? 8 : Math.max(12, (stage.count / maxCount) * 100);
                  return (
                    <div key={stage.key} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-medium tabular-nums text-foreground">{stage.count > 0 ? stage.count : ''}</span>
                      <div
                        className="w-full rounded-t bg-blue-400/60 transition-all"
                        style={{ height: `${heightPct}%`, opacity: stage.count === 0 ? 0.25 : 1 }}
                      />
                      <span className="text-[9px] text-muted-foreground text-center leading-tight">{stage.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Tasks + Today's Schedule */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">미완료 업무</h2>
            <Link to="/tasks" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              전체 보기 <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="px-4 pb-4">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">모든 업무를 완료했습니다. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {pendingTasks.slice(0, 6).map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 text-[13px]">
                    <span className="size-1.5 shrink-0 rounded-full bg-orange-400" />
                    <span className="flex-1 truncate">{task.title}</span>
                    {task.dueDate && (
                      <span className={cn(
                        'shrink-0 text-[11px] tabular-nums',
                        new Date(task.dueDate) < new Date()
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground',
                      )}>
                        {new Date(task.dueDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    )}
                  </li>
                ))}
                {pendingTasks.length > 6 && (
                  <li className="text-[11px] text-muted-foreground pl-4">
                    +{pendingTasks.length - 6}개 더
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">오늘 일정</h2>
            <Link to="/calendar" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              캘린더 보기 <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="px-4 pb-4">
            {events.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : events.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">오늘 일정이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {events.data?.slice(0, 6).map((event) => (
                  <li key={event.id} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color || '#4f46e5' }}
                    />
                    <span className="flex-1 truncate">{event.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {new Date(event.start).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
