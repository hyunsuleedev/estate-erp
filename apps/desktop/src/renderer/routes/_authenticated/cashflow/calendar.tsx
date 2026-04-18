import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import type { CashflowSummary, PipelineDeal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/cashflow/calendar')({
  component: CashflowCalendarPage,
});

function toEok(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

interface CalendarEntry {
  date: Date;
  type: 'due' | 'paid' | 'contract_deposit' | 'middle_payment' | 'final_payment';
  label: string;
  amount: number;
  status: string;
  deal: PipelineDeal;
}

function CashflowCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', year, month],
    queryFn: () => api.finance.cashflow.summary(year, month),
  });

  const prev = () =>
    setCurrentDate(new Date(year, month - 2, 1));
  const next = () =>
    setCurrentDate(new Date(year, month, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="size-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">수금 캘린더</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            오늘
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium">
            {year}년 {month}월
          </span>
          <Button variant="outline" size="icon" onClick={next}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-500" />
          수금 예정
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" />
          수금 완료
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          연체
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-blue-500" />
          잔금/중도금일
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] rounded-xl" />
      ) : data ? (
        <MonthGrid year={year} month={month} data={data} />
      ) : (
        <div className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">
          데이터를 불러올 수 없습니다.
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  data,
}: {
  year: number;
  month: number;
  data: CashflowSummary;
}) {
  const entries = useMemo(() => buildEntries(data), [data]);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month - 1 &&
    today.getDate() === d;

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const entriesByDay = new Map<number, CalendarEntry[]>();
  for (const e of entries) {
    if (
      e.date.getFullYear() === year &&
      e.date.getMonth() === month - 1
    ) {
      const d = e.date.getDate();
      if (!entriesByDay.has(d)) entriesByDay.set(d, []);
      entriesByDay.get(d)!.push(e);
    }
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // Monthly totals
  const monthDue = entries
    .filter((e) => e.type === 'due' && (e.status === 'pending' || e.status === 'overdue'))
    .reduce((s, e) => s + e.amount, 0);
  const monthCollected = entries
    .filter((e) => e.type === 'paid')
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-3">
      {/* Month summary */}
      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">수금 예정 합계: </span>
          <span className="font-semibold">{toEok(monthDue)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">수금 완료 합계: </span>
          <span className="font-semibold text-emerald-600">{toEok(monthCollected)}</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {dayNames.map((name, i) => (
            <div
              key={name}
              className={cn(
                'px-2 py-2 text-center text-xs font-medium',
                i === 0 && 'text-red-500',
                i === 6 && 'text-blue-500',
              )}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((weekDays, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {weekDays.map((day, di) => {
              const dayEntries = day ? entriesByDay.get(day) ?? [] : [];
              const dayTotal = dayEntries.reduce((s, e) => s + e.amount, 0);
              return (
                <div
                  key={di}
                  className={cn(
                    'min-h-[100px] border-r last:border-r-0 p-1',
                    day === null && 'bg-muted/20',
                    day !== null && isToday(day) && 'bg-blue-50/50 dark:bg-blue-950/20',
                  )}
                >
                  {day !== null && (
                    <>
                      <div className="flex items-center justify-between px-1">
                        <span
                          className={cn(
                            'text-xs font-medium',
                            isToday(day) &&
                              'flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
                            di === 0 && 'text-red-500',
                            di === 6 && 'text-blue-500',
                          )}
                        >
                          {day}
                        </span>
                        {dayTotal > 0 && (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {toEok(dayTotal)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEntries.slice(0, 3).map((entry, ei) => (
                          <EntryChip key={ei} entry={entry} />
                        ))}
                        {dayEntries.length > 3 && (
                          <span className="block px-1 text-[10px] text-muted-foreground">
                            +{dayEntries.length - 3}건 더
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryChip({ entry }: { entry: CalendarEntry }) {
  const colorMap: Record<string, string> = {
    due_pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    due_overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    contract_deposit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    middle_payment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    final_payment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  };

  const isOverdue =
    entry.status === 'overdue' ||
    (entry.status === 'pending' && entry.date < new Date());

  const key =
    entry.type === 'paid'
      ? 'paid'
      : entry.type === 'due'
        ? isOverdue
          ? 'due_overdue'
          : 'due_pending'
        : entry.type;

  const location = [
    entry.deal.siteName,
    entry.deal.dongName,
    entry.deal.unitName && `${entry.deal.unitName}호`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cn(
        'truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight',
        colorMap[key] ?? colorMap.due_pending,
      )}
      title={`${location} · ${entry.label} · ${toEok(entry.amount)}`}
    >
      {toEok(entry.amount)} {entry.label}
    </div>
  );
}

function buildEntries(data: CashflowSummary): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const sideLabel: Record<string, string> = {
    seller: '매도',
    buyer: '매수',
    partner: '공동',
  };

  for (const deal of data.deals) {
    // CommissionPayment due dates
    for (const p of deal.payments) {
      if (p.dueDate && (p.status === 'pending' || p.status === 'overdue')) {
        entries.push({
          date: new Date(p.dueDate),
          type: 'due',
          label: `${sideLabel[p.side] ?? p.side} 수금`,
          amount: p.expectedAmount,
          status: p.status,
          deal,
        });
      }
      if (p.paidAt && (p.status === 'collected' || p.status === 'partial')) {
        entries.push({
          date: new Date(p.paidAt),
          type: 'paid',
          label: `${sideLabel[p.side] ?? p.side} 입금`,
          amount: p.actualAmount ?? p.expectedAmount,
          status: p.status,
          deal,
        });
      }
    }

    // Deal 잔금 예정일 (DealPayment kind='balance')
    if (deal.balanceDueDate) {
      const allCollected =
        deal.payments.length > 0 &&
        deal.payments.every(
          (p) => p.status === 'collected' || p.status === 'partial' || p.status === 'waived',
        );
      if (!allCollected) {
        entries.push({
          date: new Date(deal.balanceDueDate),
          type: 'final_payment',
          label: '잔금일',
          amount: deal.commissionTotal ?? 0,
          status: 'info',
          deal,
        });
      }
    }
  }

  return entries;
}
