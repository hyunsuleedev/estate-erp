import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Columns3,
  CalendarClock,
  List,
  Receipt,
} from 'lucide-react';
import type { CashflowSummary, PipelineDeal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LedgerView } from './-ledger';

export const Route = createFileRoute('/_authenticated/cashflow/')({
  component: CashflowPage,
});

function toEok(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

function CashflowPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['cashflow'],
    queryFn: () => api.finance.cashflow.summary(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">
        데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return <CashflowView data={data} />;
}

// ─────────────────────────────────────────────────────────────
// Stage classification (shared)
// ─────────────────────────────────────────────────────────────

type StageKey = 'negotiating' | 'contract' | 'balanceWaiting' | 'collected' | 'overdue';

const stageConfig: Array<{
  key: StageKey;
  label: string;
  bgColor: string;
  textColor: string;
  icon: string;
}> = [
  { key: 'overdue', label: '미수금', bgColor: 'bg-red-600', textColor: 'text-red-600', icon: '⚠️' },
  { key: 'balanceWaiting', label: '잔금 대기', bgColor: 'bg-amber-600', textColor: 'text-amber-600', icon: '⏳' },
  { key: 'contract', label: '계약 진행', bgColor: 'bg-blue-600', textColor: 'text-blue-600', icon: '🔵' },
  { key: 'negotiating', label: '협상중', bgColor: 'bg-slate-500', textColor: 'text-slate-600', icon: '🔘' },
  { key: 'collected', label: '수금 완료', bgColor: 'bg-emerald-600', textColor: 'text-emerald-600', icon: '✅' },
];

function classifyDeal(deal: PipelineDeal): StageKey {
  const now = new Date();
  const hasOverdue = deal.payments.some(
    (p) =>
      p.status === 'overdue' ||
      (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now),
  );
  const allCollected =
    deal.payments.length > 0 &&
    deal.payments.every(
      (p) => p.status === 'collected' || p.status === 'partial' || p.status === 'waived',
    );

  if (hasOverdue) return 'overdue';
  if (allCollected) return 'collected';
  if (deal.stage === 'completed' || deal.stage === 'closed') return 'balanceWaiting';
  if (
    deal.stage === 'contracted' ||
    deal.stage === 'settling' ||
    deal.stage === 'preContract'
  )
    return 'contract';
  return 'negotiating';
}

function dealsByStage(deals: PipelineDeal[], stageKey: StageKey): PipelineDeal[] {
  return deals.filter((d) => classifyDeal(d) === stageKey);
}

function getDealDate(deal: PipelineDeal): Date | null {
  if (deal.balanceDueDate) return new Date(deal.balanceDueDate);
  const dueDates = deal.payments
    .filter((p) => p.dueDate)
    .map((p) => new Date(p.dueDate!));
  if (dueDates.length > 0) return new Date(Math.max(...dueDates.map((d) => d.getTime())));
  const paidDates = deal.payments
    .filter((p) => p.paidAt)
    .map((p) => new Date(p.paidAt!));
  if (paidDates.length > 0) return new Date(Math.max(...paidDates.map((d) => d.getTime())));
  return null;
}

// ─────────────────────────────────────────────────────────────
// Main view with tabs
// ─────────────────────────────────────────────────────────────

function CashflowView({ data }: { data: CashflowSummary }) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="수금 완료"
          amount={data.collected}
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          className="border-emerald-200 dark:border-emerald-900"
        />
        <SummaryCard
          label="수금 예정"
          amount={data.pending}
          icon={<Clock className="size-4 text-amber-600" />}
          className="border-amber-200 dark:border-amber-900"
        />
        <SummaryCard
          label="미수금"
          amount={data.overdue}
          icon={<AlertTriangle className="size-4 text-red-600" />}
          className={cn(
            data.overdue > 0
              ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
              : 'border-border',
          )}
        />
        <SummaryCard
          label="순이익 (추정)"
          amount={data.netProfit}
          subtitle={`고정비 -${toEok(data.monthlyExpense)}`}
          icon={<Receipt className="size-4 text-primary" />}
        />
      </div>

      {/* Alerts */}
      {(data.taxInvoicePending > 0 || data.overdue > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.taxInvoicePending > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Receipt className="size-3" />
              미발행 세금계산서 {data.taxInvoicePending}건
            </Badge>
          )}
          {data.overdue > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" />
              미수금 {toEok(data.overdue)}
            </Badge>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1.5">
            <CalendarClock className="size-3.5" />
            타임라인
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5">
            <Columns3 className="size-3.5" />
            칸반
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="size-3.5" />
            리스트
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-3">
          <TimelineView data={data} />
        </TabsContent>
        <TabsContent value="kanban" className="mt-3">
          <KanbanView data={data} />
        </TabsContent>
        <TabsContent value="list" className="mt-3">
          <LedgerView />
        </TabsContent>
      </Tabs>

      {/* Monthly trend */}
      {data.monthlyTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">월별 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1">
              {data.monthlyTrend.map((m) => {
                const maxVal = Math.max(
                  ...data.monthlyTrend.map((t) => t.collected),
                  1,
                );
                const h = Math.max((m.collected / maxVal) * 80, 4);
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-medium">{toEok(m.collected)}</span>
                    <div
                      className="w-full rounded-t bg-emerald-500/80"
                      style={{ height: `${h}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {m.month.slice(5)}월
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline View
// ─────────────────────────────────────────────────────────────

interface MonthBucket {
  label: string;
  key: string;
  deals: PipelineDeal[];
  collected: number;
  pending: number;
}

function TimelineView({ data }: { data: CashflowSummary }) {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Group deals by month of their due/payment date
  const bucketMap = new Map<string, MonthBucket>();

  const ensureBucket = (key: string, label: string): MonthBucket => {
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { label, key, deals: [], collected: 0, pending: 0 });
    }
    return bucketMap.get(key)!;
  };

  for (const deal of data.deals) {
    const date = getDealDate(deal);
    let monthKey: string;
    let monthLabel: string;

    if (!date) {
      monthKey = 'undated';
      monthLabel = '일정 미정';
    } else {
      monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthLabel = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    }

    const bucket = ensureBucket(monthKey, monthLabel);
    bucket.deals.push(deal);

    const stage = classifyDeal(deal);
    const dealCollected = deal.payments
      .filter((p) => p.status === 'collected' || p.status === 'partial')
      .reduce((s, p) => s + (p.actualAmount ?? 0), 0);
    const dealPending = deal.payments
      .filter((p) => p.status === 'pending' || p.status === 'overdue')
      .reduce((s, p) => s + p.expectedAmount, 0);

    if (stage === 'collected') {
      bucket.collected += dealCollected;
    } else {
      bucket.collected += dealCollected;
      bucket.pending += dealPending;
    }
  }

  // Sort months chronologically, undated last
  const sortedKeys = Array.from(bucketMap.keys()).sort((a, b) => {
    if (a === 'undated') return 1;
    if (b === 'undated') return -1;
    return a.localeCompare(b);
  });

  // Month filter tabs
  const [activeMonth, setActiveMonth] = useState<string>('all');

  const monthTabs = [
    { key: 'all', label: '전체' },
    ...sortedKeys.map((k) => ({ key: k, label: bucketMap.get(k)!.label })),
  ];

  const visibleKeys = activeMonth === 'all' ? sortedKeys : [activeMonth];

  // Total pipeline
  const totalPipeline = data.deals.reduce((s, d) => s + (d.commissionTotal ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Month tabs */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {monthTabs.map((tab) => {
          const isActive = activeMonth === tab.key;
          const bucket = tab.key !== 'all' ? bucketMap.get(tab.key) : null;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveMonth(tab.key)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted/50',
              )}
            >
              {tab.label}
              {bucket && (bucket.collected > 0 || bucket.pending > 0) && (
                <span className="ml-1.5 text-[10px] opacity-80">
                  {toEok(bucket.collected + bucket.pending)}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto shrink-0 text-xs text-muted-foreground">
          총 파이프라인: <span className="font-semibold text-foreground">{toEok(totalPipeline)}</span>
        </div>
      </div>

      {/* Month sections */}
      {visibleKeys.map((monthKey) => {
        const bucket = bucketMap.get(monthKey)!;
        const isCurrentMonth = monthKey === currentMonthKey;
        const sortedDeals = [...bucket.deals].sort((a, b) => {
          const da = getDealDate(a);
          const db = getDealDate(b);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da.getTime() - db.getTime();
        });

        return (
          <div key={monthKey} className="space-y-2">
            {/* Month header */}
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2',
              isCurrentMonth ? 'bg-primary/5' : 'bg-muted/30',
            )}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {bucket.label}
                  {isCurrentMonth && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(이번 달)</span>
                  )}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {bucket.deals.length}건
                </Badge>
              </div>
              <div className="flex gap-4 text-xs">
                {bucket.collected > 0 && (
                  <span>
                    수금 완료 <span className="font-semibold text-emerald-600">{toEok(bucket.collected)}</span>
                  </span>
                )}
                {bucket.pending > 0 && (
                  <span>
                    예정 <span className="font-semibold text-amber-600">{toEok(bucket.pending)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Deal rows */}
            <div className="space-y-1">
              {sortedDeals.map((deal) => (
                <TimelineDealRow key={deal.id} deal={deal} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Bottom summary bar */}
      {activeMonth === 'all' && sortedKeys.length > 0 && (
        <div className="rounded-xl border p-4">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">월별 예상 수금</h3>
          <div className="space-y-1.5">
            {sortedKeys.map((key) => {
              const bucket = bucketMap.get(key)!;
              const total = bucket.collected + bucket.pending;
              const maxTotal = Math.max(
                ...sortedKeys.map((k) => {
                  const b = bucketMap.get(k)!;
                  return b.collected + b.pending;
                }),
                1,
              );
              const pct = (total / maxTotal) * 100;
              const collectedPct = total > 0 ? (bucket.collected / total) * pct : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{bucket.label.replace(/^\d{4}년 /, '')}</span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/50">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-emerald-500/70"
                      style={{ width: `${collectedPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-amber-400/50"
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-emerald-500/70"
                      style={{ width: `${collectedPct}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold">{toEok(total)}</span>
                </div>
              );
            })}
            <div className="mt-2 flex items-center gap-3 border-t pt-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">고정비</span>
              <div className="flex-1" />
              <span className="w-16 shrink-0 text-right text-xs text-red-600">-{toEok(data.monthlyExpense)}/월</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineDealRow({ deal }: { deal: PipelineDeal }) {
  const stage = classifyDeal(deal);
  const config = stageConfig.find((s) => s.key === stage)!;
  const date = getDealDate(deal);
  const location = [deal.siteName, deal.dongName, deal.unitName && `${deal.unitName}호`]
    .filter(Boolean)
    .join(' ');

  const collectedSum = deal.payments
    .filter((p) => p.status === 'collected' || p.status === 'partial')
    .reduce((s, p) => s + (p.actualAmount ?? 0), 0);
  const totalExpected = deal.payments.reduce((s, p) => s + p.expectedAmount, 0);

  return (
    <div className={cn(
      'flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30',
      stage === 'overdue' && 'border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10',
    )}>
      {/* Date column */}
      <div className="flex w-12 shrink-0 flex-col items-center text-center">
        {date ? (
          <>
            <span className="text-lg font-bold leading-none">
              {date.getDate()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {date.toLocaleDateString('ko-KR', { month: 'short' })}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">미정</span>
        )}
      </div>

      {/* Stage indicator */}
      <div className="flex w-5 shrink-0 flex-col items-center pt-1">
        <span className={cn('size-2.5 rounded-full', config.bgColor)} />
        <div className="mt-1 h-full w-px bg-border" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Row 1: location + type + price */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{location}</span>
            <Badge variant="outline" className="text-[10px]">
              {txLabel[deal.transactionType] ?? deal.transactionType}
            </Badge>
            <span className={cn('text-[10px] font-medium', config.textColor)}>
              {config.label}
            </span>
          </div>
          {deal.agreedPrice && (
            <span className="shrink-0 text-sm text-muted-foreground">{toEok(deal.agreedPrice)}</span>
          )}
        </div>

        {/* Row 2: commission + collection status */}
        <div className="flex items-center gap-4 text-xs">
          <span>
            수수료{' '}
            <span className="font-semibold">{toEok(deal.commissionTotal ?? 0)}</span>
          </span>
          {totalExpected > 0 && (
            <span>
              수금{' '}
              <span className="font-semibold text-emerald-600">{toEok(collectedSum)}</span>
              <span className="text-muted-foreground">/{toEok(totalExpected)}</span>
            </span>
          )}
        </div>

        {/* Row 3: payment pills + tax invoice */}
        {deal.payments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {deal.payments.map((p) => (
              <PaymentDetail key={p.id} payment={p} />
            ))}
          </div>
        )}

        {/* Row 4: participants */}
        {deal.participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {deal.participants.map((dp) => (
              <span key={dp.id} className="inline-flex items-center gap-0.5">
                {dp.userName}
                {dp.commissionAmount != null && (
                  <span className="font-medium text-foreground">{toEok(dp.commissionAmount)}</span>
                )}
                {dp.settlementStatus === 'settled' ? (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                ) : (
                  <Clock className="size-3 text-muted-foreground/50" />
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentDetail({ payment }: { payment: PipelineDeal['payments'][number] }) {
  const sideLabel: Record<string, string> = { seller: '매도', buyer: '매수', partner: '공동' };
  const now = new Date();
  const isOverdue =
    payment.status === 'overdue' ||
    (payment.status === 'pending' && payment.dueDate && new Date(payment.dueDate) < now);

  const statusInfo = isOverdue
    ? { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', text: '연체' }
    : payment.status === 'collected'
      ? { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', text: '' }
      : payment.status === 'partial'
        ? { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', text: '부분' }
        : { color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', text: '' };

  const amount = payment.actualAmount ?? payment.expectedAmount;
  const hasDiscount = payment.actualAmount != null && payment.actualAmount < payment.expectedAmount;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', statusInfo.color)}>
      {sideLabel[payment.side] ?? payment.side}
      {' '}{toEok(amount)}
      {hasDiscount && <span className="line-through opacity-50">{toEok(payment.expectedAmount)}</span>}
      {(payment.status === 'collected' || payment.status === 'partial') && payment.taxInvoiceStatus === 'issued' && (
        <Receipt className="size-2.5 text-emerald-600" />
      )}
      {(payment.status === 'collected' || payment.status === 'partial') && payment.taxInvoiceStatus === 'none' && (
        <Receipt className="size-2.5 opacity-40" />
      )}
      {payment.status === 'pending' && payment.dueDate && !isOverdue && (
        <span className="opacity-60">
          {new Date(payment.dueDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
        </span>
      )}
      {statusInfo.text && <span>{statusInfo.text}</span>}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Kanban View
// ─────────────────────────────────────────────────────────────

function KanbanView({ data }: { data: CashflowSummary }) {
  const { pipeline } = data;
  const mainStages = stageConfig.filter((s) => s.key !== 'overdue');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {mainStages.map((stage, idx) => {
          const bucket = pipeline[stage.key];
          const deals = dealsByStage(data.deals, stage.key);
          return (
            <div key={stage.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', stage.bgColor)} />
                  <span className="text-xs font-medium">{stage.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{bucket.count}건</span>
                  <span className="font-semibold text-foreground">{toEok(bucket.amount)}</span>
                </div>
                {idx < mainStages.length - 1 && (
                  <ArrowRight className="hidden size-3 text-muted-foreground/40 md:block" />
                )}
              </div>
              <div className="space-y-2">
                {deals.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">없음</div>
                ) : (
                  deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pipeline.overdue.count > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="size-4 text-red-600" />
            <span className="text-xs font-semibold text-red-600">
              미수금 · {pipeline.overdue.count}건 · {toEok(pipeline.overdue.amount)}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {dealsByStage(data.deals, 'overdue').map((deal) => (
              <DealCard key={deal.id} deal={deal} isOverdue />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// List View
// ─────────────────────────────────────────────────────────────

function ListView({ data }: { data: CashflowSummary }) {
  const sorted = [...data.deals].sort((a, b) => {
    const order: Record<StageKey, number> = {
      overdue: 0, balanceWaiting: 1, contract: 2, negotiating: 3, collected: 4,
    };
    return (order[classifyDeal(a)] ?? 5) - (order[classifyDeal(b)] ?? 5);
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        거래 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-3 py-2.5 text-left font-medium">상태</th>
            <th className="px-3 py-2.5 text-left font-medium">매물</th>
            <th className="px-3 py-2.5 text-left font-medium">유형</th>
            <th className="px-3 py-2.5 text-right font-medium">거래가</th>
            <th className="px-3 py-2.5 text-right font-medium">수수료</th>
            <th className="px-3 py-2.5 text-right font-medium">수금</th>
            <th className="px-3 py-2.5 text-left font-medium">잔금일</th>
            <th className="px-3 py-2.5 text-left font-medium">수금 상태</th>
            <th className="px-3 py-2.5 text-left font-medium">담당</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => (
            <ListRow key={deal.id} deal={deal} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListRow({ deal }: { deal: PipelineDeal }) {
  const stage = classifyDeal(deal);
  const config = stageConfig.find((s) => s.key === stage)!;
  const location = [deal.siteName, deal.dongName, deal.unitName && `${deal.unitName}호`]
    .filter(Boolean)
    .join(' ');
  const collectedSum = deal.payments
    .filter((p) => p.status === 'collected' || p.status === 'partial')
    .reduce((s, p) => s + (p.actualAmount ?? 0), 0);

  return (
    <tr className={cn(
      'border-b last:border-b-0 hover:bg-muted/30',
      stage === 'overdue' && 'bg-red-50/50 dark:bg-red-950/10',
    )}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', config.bgColor)} />
          <span className={cn('text-xs font-medium', config.textColor)}>{config.label}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 font-medium">{location}</td>
      <td className="px-3 py-2.5">
        <Badge variant="outline" className="text-[10px]">{txLabel[deal.transactionType] ?? deal.transactionType}</Badge>
      </td>
      <td className="px-3 py-2.5 text-right">{deal.agreedPrice ? toEok(deal.agreedPrice) : '-'}</td>
      <td className="px-3 py-2.5 text-right font-medium">{toEok(deal.commissionTotal ?? 0)}</td>
      <td className="px-3 py-2.5 text-right">
        {collectedSum > 0 ? <span className="text-emerald-600">{toEok(collectedSum)}</span> : <span className="text-muted-foreground">-</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {deal.balanceDueDate ? new Date(deal.balanceDueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          {deal.payments.map((p) => <PaymentPill key={p.id} payment={p} />)}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {deal.participants.map((dp) => (
            <span key={dp.id} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              {dp.userName}
              {dp.settlementStatus === 'settled' && <CheckCircle2 className="size-2.5 text-emerald-500" />}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared components
// ─────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, subtitle, icon, className }: {
  label: string; amount: number; subtitle?: string; icon: React.ReactNode; className?: string;
}) {
  return (
    <Card className={cn('border', className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="text-xl font-bold tracking-tight">{toEok(amount)}</div>
        {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

const txLabel: Record<string, string> = { sale: '매매', jeonse: '전세', monthly: '월세' };

function DealCard({ deal, isOverdue }: { deal: PipelineDeal; isOverdue?: boolean }) {
  const location = [deal.siteName, deal.dongName, deal.unitName && `${deal.unitName}호`].filter(Boolean).join(' ');
  const collectedSum = deal.payments.filter((p) => p.status === 'collected' || p.status === 'partial').reduce((s, p) => s + (p.actualAmount ?? 0), 0);
  const totalExpected = deal.payments.reduce((s, p) => s + p.expectedAmount, 0);

  return (
    <Card className={cn('border text-xs', isOverdue && 'border-red-300 dark:border-red-900')}>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-1">
          <span className="font-medium leading-snug">{location}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">{txLabel[deal.transactionType] ?? deal.transactionType}</Badge>
        </div>
        {deal.agreedPrice && <div className="text-muted-foreground">{toEok(deal.agreedPrice)}</div>}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">수수료</span>
          <span className="font-semibold">
            {collectedSum > 0 && totalExpected > 0 ? `${toEok(collectedSum)} / ${toEok(totalExpected)}` : toEok(deal.commissionTotal ?? 0)}
          </span>
        </div>
        {deal.balanceDueDate && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>잔금일</span>
            <span>{new Date(deal.balanceDueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
        {deal.payments.length > 0 && (
          <div className="flex gap-1 pt-0.5">{deal.payments.map((p) => <PaymentPill key={p.id} payment={p} />)}</div>
        )}
        {deal.participants.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t pt-1.5">
            {deal.participants.map((dp) => (
              <span key={dp.id} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                {dp.userName}
                {dp.commissionAmount != null && <span className="font-medium text-foreground">{toEok(dp.commissionAmount)}</span>}
                {dp.settlementStatus === 'settled' && <CheckCircle2 className="size-2.5 text-emerald-500" />}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentPill({ payment }: { payment: PipelineDeal['payments'][number] }) {
  const sideLabel: Record<string, string> = { seller: '매도', buyer: '매수', partner: '공동' };
  const statusColor: Record<string, string> = {
    collected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    waived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  };
  const isOverdue = payment.status === 'overdue' || (payment.status === 'pending' && payment.dueDate && new Date(payment.dueDate) < new Date());

  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium', isOverdue ? statusColor.overdue : (statusColor[payment.status] ?? statusColor.pending))}>
      {sideLabel[payment.side] ?? payment.side}
      {payment.taxInvoiceStatus === 'none' && (payment.status === 'collected' || payment.status === 'partial') && <Receipt className="size-2.5 opacity-60" />}
    </span>
  );
}
