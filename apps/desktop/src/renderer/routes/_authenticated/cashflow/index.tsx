import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Handshake,
  ReceiptText,
  RotateCw,
  Sparkles,
  SquareKanban,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  CashflowSummary,
  LedgerPayment,
  LedgerView,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/cashflow/')({
  component: CashflowDashboard,
});

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function daysFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const a = new Date(value);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function weekdayKo(d: Date): string {
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

function dateShort(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────

function CashflowDashboard() {
  const today = new Date();
  const [selected, setSelected] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }));

  const {
    data: cashflow,
    isLoading: cashflowLoading,
    isError: cashflowError,
    refetch: refetchCashflow,
  } = useQuery({
    queryKey: ['cashflow', selected.year, selected.month],
    queryFn: () => api.finance.cashflow.summary(selected.year, selected.month),
  });
  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ['finance', 'ledger', selected.year, selected.month],
    queryFn: () =>
      api.finance.ledger.get({
        preset: 'month',
        year: selected.year,
        month: selected.month,
      }),
  });

  const prev = () =>
    setSelected(({ year, month }) =>
      month === 1
        ? { year: year - 1, month: 12 }
        : { year, month: month - 1 },
    );
  const next = () =>
    setSelected(({ year, month }) =>
      month === 12
        ? { year: year + 1, month: 1 }
        : { year, month: month + 1 },
    );
  const goToday = () =>
    setSelected({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    });

  const isThisMonth =
    selected.year === today.getFullYear() &&
    selected.month === today.getMonth() + 1;

  if (cashflowLoading || ledgerLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (cashflowError || ledgerError || !cashflow || !ledger) {
    return (
      <EmptyState
        icon={Wallet}
        title="캐시플로우 데이터를 불러올 수 없습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        action={
          <Button
            variant="outline"
            onClick={() => {
              void refetchCashflow();
              void refetchLedger();
            }}
          >
            <RotateCw className="size-4" />
            다시 시도
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 상단: 월 네비 + 오늘 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-md border bg-card">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-r-none px-2"
              onClick={prev}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[100px] border-x px-3 py-1 text-center">
              <div className="text-sm font-semibold">
                {selected.year}년 {selected.month}월
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isThisMonth ? '이번 달' : `${selected.year}.${String(selected.month).padStart(2, '0')}`}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-l-none px-2"
              onClick={next}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!isThisMonth && (
            <Button variant="outline" size="sm" onClick={goToday}>
              이번 달로
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-right">
          <div>
            <div className="text-[10px] text-muted-foreground">
              {today.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}{' '}
              ({weekdayKo(today)})
            </div>
            <div className="text-sm font-medium">
              안녕하세요, 오늘 하루도 시작합니다
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <Link to="/cashflow/ledger">
                수금 원장
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" title="수금 칸반 보기">
              <Link to="/cashflow/ledger" search={{ view: 'kanban' }}>
                <SquareKanban className="size-3.5" />
                칸반
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" title="수금 캘린더 보기">
              <Link to="/cashflow/ledger" search={{ view: 'calendar' }}>
                <CalendarDays className="size-3.5" />
                캘린더
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* 메인 히어로: 이번 달 돈 흐름 스토리 */}
      <HeroBlock
        cashflow={cashflow}
        ledger={ledger}
        year={selected.year}
        month={selected.month}
      />

      {/* 월별 추이: 수금 / 고정비 / 순이익 */}
      <MonthlyTrendChart trend={cashflow.monthlyTrend} />

      {/* 2단: 오늘 처리 / 이번 달 계약 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TodayActions ledger={ledger} />
        </div>
        <div className="lg:col-span-2">
          <MonthContracts
            month={selected.month}
            year={selected.year}
            ledger={ledger}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 월별 추이 미니 차트 — 수금(막대) + 순이익(라벨)
// ─────────────────────────────────────────────────────────────

function MonthlyTrendChart({
  trend,
}: {
  trend: CashflowSummary['monthlyTrend'];
}) {
  if (!trend || trend.length < 2) return null;
  const max = Math.max(...trend.map((t) => t.collected), 1);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold">월별 수금 추이</div>
        <div className="text-[11px] text-muted-foreground">
          최근 {trend.length}개월 · 수금액 기준
        </div>
      </div>
      <div className="flex items-end gap-2">
        {trend.map((t) => {
          const pct = Math.max(2, Math.round((t.collected / max) * 100));
          const monthLabel = t.month.length >= 7 ? `${Number(t.month.slice(5, 7))}월` : t.month;
          return (
            <div
              key={t.month}
              className="group flex flex-1 flex-col items-center gap-1"
              title={`${t.month} · 수금 ${formatMoney(t.collected)} · 고정비 ${formatMoney(t.expense)} · 순이익 ${formatMoney(t.net)}`}
            >
              <span
                className={cn(
                  'text-[10px] font-medium tabular-nums',
                  t.net >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {formatMoney(t.net)}
              </span>
              <div className="flex h-24 w-full items-end rounded-sm bg-muted/50">
                <div
                  className="w-full rounded-sm bg-success/70 transition-all group-hover:bg-success"
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {monthLabel}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        막대 = 수금액 · 위 숫자 = 순이익(수금 − 고정비)
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero: 메인 블록 — 이번 달 수금·목표·순이익·받을 돈을 하나로
// ─────────────────────────────────────────────────────────────

function HeroBlock({
  cashflow,
  ledger,
  year,
  month,
}: {
  cashflow: CashflowSummary;
  ledger: LedgerView;
  year: number;
  month: number;
}) {
  const trend = cashflow.monthlyTrend;
  const thisM = trend[trend.length - 1]?.collected ?? cashflow.collected;
  const lastM = trend[trend.length - 2]?.collected ?? 0;
  const deltaPct =
    lastM > 0
      ? Math.round(((thisM - lastM) / lastM) * 100)
      : thisM > 0
        ? 100
        : 0;

  const goal = Math.max(cashflow.monthlyExpense * 4, 3000);
  const goalPct = Math.min(
    100,
    Math.round((cashflow.collected / goal) * 100),
  );

  // 선택한 연·월의 신규 발생 수수료 (연도 이동 시에도 올바른 월 범위로 집계)
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const contractedStages = new Set([
    'contracted',
    'settling',
    'completed',
    'closed',
  ]);
  let newBilledTotal = 0;
  let newContractCount = 0;
  for (const g of ledger.groups) {
    if (!contractedStages.has(g.deal.stage)) continue;
    const d = new Date(g.deal.stageChangedAt);
    if (d < startOfMonth || d > endOfMonth) continue;
    let billed = 0;
    for (const p of g.payments) {
      if (p.status === 'waived' || p.status === 'cancelled') continue;
      billed += p.expectedAmount;
    }
    if (billed > 0) {
      newBilledTotal += billed;
      newContractCount += 1;
    }
  }

  const pending = cashflow.pending + cashflow.overdue;

  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5">
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        {/* 왼쪽: 수금 + 목표 + 전월比 */}
        <div className="border-b p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3" />
            이번 달 수금
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight">
              {formatMoney(cashflow.collected)}
            </span>
            <DeltaPill pct={deltaPct} />
          </div>

          {/* 목표 진행 바 */}
          <div className="mt-5 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">
                월 목표{' '}
                <span className="font-medium text-foreground">
                  {formatMoney(goal)}
                </span>{' '}
                중
              </span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {goalPct}%
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                style={{ width: `${goalPct}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              남은 목표{' '}
              <span className="font-medium text-foreground">
                {formatMoney(Math.max(0, goal - cashflow.collected))}
              </span>
              <span className="ml-1 text-[10px]">
                · 목표는 고정비 기반 자동 추정
              </span>
            </div>
          </div>
        </div>

        {/* 오른쪽: 보조 숫자 3개 */}
        <div className="grid grid-cols-3 divide-x">
          <HeroStat
            label="순이익"
            value={formatMoney(cashflow.netProfit)}
            emphasis={cashflow.netProfit >= 0 ? 'positive' : 'negative'}
            hint={`고정비 ${formatMoney(cashflow.monthlyExpense)}`}
          />
          <HeroStat
            label="받을 돈"
            value={formatMoney(pending)}
            emphasis="neutral"
            hint={
              cashflow.overdue > 0
                ? `연체 ${formatMoney(cashflow.overdue)}`
                : `진행 ${ledger.summary.paymentCount - ledger.summary.collectedCount}건`
            }
            hintTone={cashflow.overdue > 0 ? 'red' : undefined}
          />
          <HeroStat
            label={`${month}월 계약 수수료`}
            value={formatMoney(newBilledTotal)}
            emphasis="neutral"
            hint={`신규 계약 ${newContractCount}건`}
          />
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  emphasis,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  emphasis: 'positive' | 'negative' | 'neutral';
  hint?: string;
  hintTone?: 'red';
}) {
  const valueClass =
    emphasis === 'positive'
      ? 'text-emerald-700 dark:text-emerald-300'
      : emphasis === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="flex flex-col justify-center p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-1.5 text-2xl font-bold tracking-tight', valueClass)}>
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            'mt-1 text-[11px]',
            hintTone === 'red'
              ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground',
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const positive = pct > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold',
        positive
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      )}
    >
      {positive ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {positive ? '+' : ''}
      {pct}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// 오늘 처리할 것 — 통합 타임라인
// ─────────────────────────────────────────────────────────────

type ActionItem =
  | {
      kind: 'overdue';
      id: string;
      payment: LedgerPayment;
      location: string;
      dealId: string;
      daysOverdue: number;
      remaining: number;
    }
  | {
      kind: 'adjustment';
      id: string;
      code: string | null;
      type: string;
      amount: number;
      paymentCode: string | null;
      reason: string;
    }
  | {
      kind: 'upcoming';
      id: string;
      payment: LedgerPayment;
      location: string;
      dealId: string;
      daysUntil: number;
    };

function TodayActions({ ledger }: { ledger: LedgerView }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekLater = new Date(now.getTime() + 7 * 86400000);

  const items = useMemo<ActionItem[]>(() => {
    const out: ActionItem[] = [];

    // 연체
    for (const g of ledger.groups) {
      for (const p of g.payments) {
        const isOverdue =
          p.status === 'overdue' ||
          (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now);
        if (!isOverdue) continue;
        const days = daysFrom(p.dueDate);
        out.push({
          kind: 'overdue',
          id: p.id,
          payment: p,
          location:
            [g.deal.siteName, g.deal.dongName, g.deal.unitName]
              .filter(Boolean)
              .join(' ') || '매물 미지정',
          dealId: g.deal.id,
          daysOverdue: days !== null ? -days : 0,
          remaining: p.expectedAmount - (p.actualAmount ?? 0),
        });
      }
    }

    // 조정 승인
    for (const a of ledger.adjustmentsPending) {
      out.push({
        kind: 'adjustment',
        id: a.id,
        code: a.code,
        type: a.type,
        amount: a.amount,
        paymentCode: a.paymentCode,
        reason: a.reason,
      });
    }

    // 이번 주 예정 (연체 아닌 것만)
    for (const g of ledger.groups) {
      for (const p of g.payments) {
        if (p.status !== 'pending') continue;
        if (!p.dueDate) continue;
        const d = new Date(p.dueDate);
        if (d < now || d > weekLater) continue;
        out.push({
          kind: 'upcoming',
          id: p.id,
          payment: p,
          location:
            [g.deal.siteName, g.deal.dongName, g.deal.unitName]
              .filter(Boolean)
              .join(' ') || '매물 미지정',
          dealId: g.deal.id,
          daysUntil: daysFrom(p.dueDate) ?? 0,
        });
      }
    }

    // 우선순위: 연체 > 조정 > 예정
    // 연체 내 경과일 많은 순, 예정 내 임박 순
    return out.sort((a, b) => {
      const order = { overdue: 0, adjustment: 1, upcoming: 2 };
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      if (a.kind === 'overdue' && b.kind === 'overdue')
        return b.daysOverdue - a.daysOverdue;
      if (a.kind === 'upcoming' && b.kind === 'upcoming')
        return a.daysUntil - b.daysUntil;
      return 0;
    });
  }, [ledger]);

  const overdueCount = items.filter((i) => i.kind === 'overdue').length;
  const adjustmentCount = items.filter((i) => i.kind === 'adjustment').length;
  const upcomingCount = items.filter((i) => i.kind === 'upcoming').length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">오늘 처리할 것</div>
          <Badge variant="outline" className="text-[10px]">
            {items.length}건
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-red-500" />
              연체 {overdueCount}
            </span>
          )}
          {adjustmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-500" />
              승인 {adjustmentCount}
            </span>
          )}
          {upcomingCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-sky-500" />
              예정 {upcomingCount}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <CircleCheck className="mx-auto mb-3 size-10 text-emerald-500/80" />
          <div className="text-sm font-medium">모두 처리 완료</div>
          <div className="mt-1 text-xs text-muted-foreground">
            연체/승인 대기/이번 주 예정 모두 없습니다. 커피 한 잔 ☕
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {items.map((item) => (
            <ActionRow key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  if (item.kind === 'overdue') return <OverdueRow item={item} />;
  if (item.kind === 'adjustment') return <AdjustmentRow item={item} />;
  return <UpcomingRow item={item} />;
}

function OverdueRow({
  item,
}: {
  item: Extract<ActionItem, { kind: 'overdue' }>;
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const createTask = useMutation({
    mutationFn: () =>
      api.tasks.create({
        title: `[독촉] ${item.location} · ${item.payment.code ?? ''} ${formatMoney(item.remaining)} 수금`,
        content: `${item.daysOverdue}일 경과한 ${item.payment.clientSide === 'seller' ? '매도측' : '매수측'} 수수료 ${formatMoney(item.remaining)} 독촉 필요`,
        category: 'call',
        priority: 'urgent',
        source: 'system',
        dueDate: new Date().toISOString(),
        dealId: item.dealId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleDunning = async () => {
    setLoading(true);
    try {
      await createTask.mutateAsync();
      toast.success('독촉 태스크를 생성했습니다.');
    } catch {
      toast.error('독촉 태스크 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-red-50/50 dark:hover:bg-red-950/10">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
        <AlertTriangle className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/cashflow/ledger"
            search={{ deal: item.dealId, payment: item.payment.id }}
            className="text-sm font-semibold underline-offset-2 hover:underline"
          >
            {item.location}
          </Link>
          <Badge
            variant="outline"
            className="border-0 bg-red-100 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {item.daysOverdue}일 경과
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {item.payment.code ?? ''} ·{' '}
            {item.payment.clientSide === 'seller' ? '매도측' : '매수측'}
          </span>
        </div>
        {item.payment.actualAmount !== null &&
          item.payment.actualAmount > 0 && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              수금 {formatMoney(item.payment.actualAmount)} · 잔여{' '}
              <span className="font-medium text-red-600">
                {formatMoney(item.remaining)}
              </span>
            </div>
          )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-base font-bold text-red-600 dark:text-red-400">
          {formatMoney(item.remaining)}
        </div>
      </div>
      <div className="shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
          onClick={handleDunning}
          disabled={loading}
        >
          <Bell className="size-3" />
          독촉
        </Button>
      </div>
    </div>
  );
}

function AdjustmentRow({
  item,
}: {
  item: Extract<ActionItem, { kind: 'adjustment' }>;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDecide = user?.role === 'owner';

  const approve = useMutation({
    mutationFn: () => api.finance.adjustments.approve(item.id),
    onSuccess: () => {
      toast.success('수수료 조정을 승인했습니다.');
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
    },
    onError: () => toast.error('조정 승인에 실패했습니다.'),
  });
  const reject = useMutation({
    mutationFn: () => api.finance.adjustments.reject(item.id),
    onSuccess: () => {
      toast.success('수수료 조정을 반려했습니다.');
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
    },
    onError: () => toast.error('조정 반려에 실패했습니다.'),
  });

  const typeLabel =
    item.type === 'discount'
      ? '할인 합의'
      : item.type === 'waive'
        ? '면제'
        : '대손 처리';

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-950/10">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        <ReceiptText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{typeLabel}</span>
          <Badge variant="outline" className="text-[10px]">
            {item.code ?? ''}
          </Badge>
          {item.paymentCode && (
            <span className="text-[11px] text-muted-foreground">
              · {item.paymentCode}
            </span>
          )}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {item.reason}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-base font-bold text-amber-700 dark:text-amber-300">
          {formatMoney(item.amount)}
        </div>
      </div>
      {canDecide ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || approve.isPending}
          >
            <X className="size-3" />
            반려
          </Button>
          <Button
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => approve.mutate()}
            disabled={approve.isPending || reject.isPending}
          >
            <Check className="size-3" />
            승인
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          대표 승인 대기
        </span>
      )}
    </div>
  );
}

function UpcomingRow({
  item,
}: {
  item: Extract<ActionItem, { kind: 'upcoming' }>;
}) {
  const dDay = item.daysUntil === 0 ? '오늘' : `D-${item.daysUntil}`;
  return (
    <Link
      to="/cashflow/ledger"
      search={{ deal: item.dealId, payment: item.payment.id }}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-950/10"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
        <span className="text-[10px] font-bold">{dDay}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{item.location}</span>
          <span className="text-[11px] text-muted-foreground">
            {item.payment.code ?? ''} ·{' '}
            {item.payment.clientSide === 'seller' ? '매도측' : '매수측'}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          잔금일 {dateShort(item.payment.dueDate)} (
          {weekdayKo(new Date(item.payment.dueDate!))})
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-base font-semibold">
          {formatMoney(item.payment.expectedAmount)}
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// 이번 달 계약 수수료
// ─────────────────────────────────────────────────────────────

function MonthContracts({
  month,
  year,
  ledger,
}: {
  month: number;
  year: number;
  ledger: LedgerView;
}) {
  const contracts = useMemo(() => {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const contractedStages = new Set([
      'contracted',
      'settling',
      'completed',
      'closed',
    ]);

    const list: Array<{
      dealId: string;
      location: string;
      stageDate: string;
      transactionType: string;
      billed: number;
      collected: number;
      partnerBrokerName: string | null;
      collectedRatio: number;
    }> = [];

    for (const g of ledger.groups) {
      if (!contractedStages.has(g.deal.stage)) continue;
      const d = new Date(g.deal.stageChangedAt);
      if (d < startOfMonth || d > endOfMonth) continue;
      let billed = 0;
      let collected = 0;
      for (const p of g.payments) {
        if (p.status === 'waived' || p.status === 'cancelled') continue;
        billed += p.expectedAmount;
        if (p.status === 'collected' || p.status === 'partial') {
          collected += p.actualAmount ?? 0;
        }
      }
      if (billed > 0) {
        list.push({
          dealId: g.deal.id,
          location:
            [g.deal.siteName, g.deal.dongName, g.deal.unitName]
              .filter(Boolean)
              .join(' ') || '매물 미지정',
          stageDate: g.deal.stageChangedAt,
          transactionType: g.deal.transactionType,
          billed,
          collected,
          partnerBrokerName: g.deal.partnerBroker?.name ?? null,
          collectedRatio:
            billed > 0 ? Math.round((collected / billed) * 100) : 0,
        });
      }
    }
    list.sort(
      (a, b) =>
        new Date(b.stageDate).getTime() - new Date(a.stageDate).getTime(),
    );
    return list;
  }, [year, month, ledger]);

  const billedTotal = contracts.reduce((s, c) => s + c.billed, 0);
  const collectedTotal = contracts.reduce((s, c) => s + c.collected, 0);
  const overallRatio =
    billedTotal > 0 ? Math.round((collectedTotal / billedTotal) * 100) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{month}월 계약 수수료</div>
          <Badge variant="outline" className="text-[10px]">
            {contracts.length}건
          </Badge>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          이번 달 새로 계약된 거래의 수수료 채권
        </div>

        {contracts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">총 채권</span>
              <span className="text-lg font-bold tracking-tight">
                {formatMoney(billedTotal)}
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${overallRatio}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-emerald-700 dark:text-emerald-300">
                수금 {formatMoney(collectedTotal)} ({overallRatio}%)
              </span>
              <span className="text-muted-foreground">
                미수금 {formatMoney(billedTotal - collectedTotal)}
              </span>
            </div>
          </div>
        )}
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
          이번 달 새로 계약된 거래가 없습니다
        </div>
      ) : (
        <div className="divide-y">
          {contracts.map((c) => (
            <Link
              key={c.dealId}
              to="/cashflow/ledger"
              search={{ deal: c.dealId }}
              className="block px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {c.location}
                    </span>
                    <StatusBadge
                      kind="transactionType"
                      status={c.transactionType}
                      size="sm"
                    />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>계약 {dateShort(c.stageDate)}</span>
                    {c.partnerBrokerName && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 text-violet-700 dark:text-violet-300">
                          <Handshake className="size-3" />
                          {c.partnerBrokerName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold">
                    {formatMoney(c.billed)}
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    {c.collectedRatio}%
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${c.collectedRatio}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
