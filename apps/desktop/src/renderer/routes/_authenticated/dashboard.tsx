import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Building,
  BookUser,
  Handshake,
  FileText,
  ListTodo,
  CalendarDays,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function toEok(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

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
  const cashflow = useQuery({
    queryKey: ['cashflow'],
    queryFn: () => api.finance.cashflow.summary(),
  });

  const isLoading = properties.isLoading || contacts.isLoading;

  const stats = [
    { label: '총 매물', value: properties.data?.pagination?.total ?? 0, icon: Building },
    { label: '연락처', value: contacts.data?.pagination?.total ?? 0, icon: BookUser },
    { label: '진행 매칭', value: matches.data ? matches.data.filter((m) => m.stage !== 'closed').length : 0, icon: Handshake },
    { label: '진행 거래', value: deals.data ? deals.data.filter((d) => d.stage !== 'closed').length : 0, icon: FileText },
    { label: '미완료 업무', value: tasks.data ? tasks.data.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length : 0, icon: ListTodo },
    { label: '오늘 일정', value: events.data?.length ?? 0, icon: CalendarDays },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* KPI grid */}
      <div className="grid auto-rows-min gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-muted/50 p-4">
            <div className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <span className="mt-1 block text-2xl font-semibold tracking-tight">{value}</span>
            )}
          </div>
        ))}
      </div>

      {/* Cashflow summary (compact) → link to full page */}
      {cashflow.isLoading ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : cashflow.data ? (
        <Link to="/cashflow" className="block">
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4 transition-colors hover:bg-muted/70">
            <div className="flex items-center gap-3">
              <Wallet className="size-5 text-muted-foreground" />
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">수금 완료 </span>
                  <span className="font-semibold">{toEok(cashflow.data.collected)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">수금 예정 </span>
                  <span className="font-semibold">{toEok(cashflow.data.pending)}</span>
                </div>
                {cashflow.data.overdue > 0 && (
                  <div>
                    <span className="text-red-600">미수금 </span>
                    <span className="font-semibold text-red-600">{toEok(cashflow.data.overdue)}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">순이익 </span>
                  <span className="font-semibold">{toEok(cashflow.data.netProfit)}</span>
                </div>
              </div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
        </Link>
      ) : null}

      {/* Bottom panels */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-muted/50">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">미완료 업무</h2>
          </div>
          <div className="px-4 pb-4">
            {tasks.data?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length === 0 ? (
              <p className="text-sm text-muted-foreground">모든 업무를 완료했습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {tasks.data
                  ?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
                  .slice(0, 5)
                  .map((task) => (
                    <li key={task.id} className="flex items-center gap-2.5 text-[13px]">
                      <span className="size-1.5 shrink-0 rounded-full bg-orange-500" />
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.dueDate && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(task.dueDate).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-muted/50">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">오늘 일정</h2>
          </div>
          <div className="px-4 pb-4">
            {events.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">오늘 일정이 없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {events.data?.slice(0, 5).map((event) => (
                  <li key={event.id} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color || '#4f46e5' }}
                    />
                    <span className="flex-1 truncate">{event.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
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
