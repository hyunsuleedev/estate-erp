import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Handshake,
  ReceiptText,
  RotateCw,
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
import { Button } from '@/components/ui/button';
import { RequireRole } from '@/components/layout/require-role';

export const Route = createFileRoute('/_authenticated/cashflow/')({
  component: () => (
    <RequireRole roles={['owner', 'manager']} fallback="/cashflow/my-settlement">
      <CashflowDashboard />
    </RequireRole>
  ),
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

/** 카드 헤더 건수 알약 */
function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full bg-secondary px-2 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
      {children}
    </span>
  );
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
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3.5">
      {/* 헤더: 월 네비 + 수금 원장 (제목은 상단 앱 헤더가 표시) */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border bg-card">
            <button
              type="button"
              onClick={prev}
              aria-label="이전 달"
              className="flex w-[30px] cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="inline-flex items-center gap-1.5 border-x px-3">
              <span className="whitespace-nowrap text-[12.5px] font-bold">
                {selected.year}년 {selected.month}월
              </span>
              <span className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                {isThisMonth
                  ? '이번 달'
                  : `${selected.year}.${String(selected.month).padStart(2, '0')}`}
              </span>
            </span>
            <button
              type="button"
              onClick={next}
              aria-label="다음 달"
              className="flex w-[30px] cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          {!isThisMonth && (
            <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
              이번 달로
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="h-8 font-semibold">
            <Link to="/cashflow/ledger">
              수금 원장
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 요약 카드: 다크 카드 + 라이트 카드 (다른 정산 페이지와 동일한 패턴) */}
      <SummaryCards
        cashflow={cashflow}
        ledger={ledger}
        year={selected.year}
        month={selected.month}
      />

      {/* 2단: 오늘 처리 / 이번 달 계약 */}
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-5">
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
// 요약 카드 — 이번 달 수금(다크) + 순이익/받을 돈/계약 수수료(라이트)
// ─────────────────────────────────────────────────────────────

function SummaryCards({
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
      {/* 다크 카드: 이번 달 수금 + 목표 진행 */}
      <div className="rounded-xl bg-primary px-[17px] py-[15px] text-primary-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-primary-foreground/60">
            이번 달 수금
          </span>
          <DeltaPill pct={deltaPct} />
        </div>
        <div className="mt-1.5 text-[27px] font-semibold tracking-tight tabular-nums">
          {formatMoney(cashflow.collected)}
        </div>
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between text-[10.5px] text-primary-foreground/60">
            <span>월 목표 {formatMoney(goal)}</span>
            <span className="font-bold tabular-nums text-emerald-300">
              {goalPct}%
            </span>
          </div>
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-primary-foreground/15">
            <div
              className="h-full rounded-full bg-emerald-300/90 transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10.5px] text-primary-foreground/60">
            남은 목표 {formatMoney(Math.max(0, goal - cashflow.collected))} ·
            고정비 기반 자동 추정
          </div>
        </div>
      </div>

      {/* 라이트 카드 3개 */}
      <StatCard
        label="순이익"
        value={formatMoney(cashflow.netProfit)}
        valueClass={
          cashflow.netProfit >= 0 ? 'text-success' : 'text-destructive'
        }
        hint={`수금 − 고정비 ${formatMoney(cashflow.monthlyExpense)}`}
      />
      <StatCard
        label="받을 돈"
        value={formatMoney(pending)}
        hint={
          cashflow.overdue > 0
            ? `연체 ${formatMoney(cashflow.overdue)} 포함`
            : `진행 ${ledger.summary.paymentCount - ledger.summary.collectedCount}건`
        }
        hintClass={
          cashflow.overdue > 0 ? 'font-semibold text-destructive' : undefined
        }
      />
      <StatCard
        label={`${month}월 계약 수수료`}
        value={formatMoney(newBilledTotal)}
        hint={`신규 계약 ${newContractCount}건`}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  hint,
  hintClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/60 px-[17px] py-[15px]">
      <div className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 text-[22px] font-semibold tracking-tight tabular-nums',
          valueClass,
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            'mt-1 whitespace-nowrap text-[11.5px] text-muted-foreground',
            hintClass,
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
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-foreground/10 px-2 py-0.5 text-[10.5px] font-bold">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 tabular-nums',
          positive ? 'text-emerald-300' : 'text-red-300',
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
      <span className="font-medium text-primary-foreground/50">전월비</span>
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
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-[13.5px] font-bold">오늘 처리할 것</span>
        <CountPill>{items.length}건</CountPill>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 text-[10.5px] text-muted-foreground">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-destructive" />
              연체 {overdueCount}
            </span>
          )}
          {adjustmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-warning" />
              승인 {adjustmentCount}
            </span>
          )}
          {upcomingCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-info" />
              예정 {upcomingCount}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <CircleCheck className="mx-auto mb-3 size-10 text-success/80" />
          <div className="text-sm font-medium">모두 처리 완료</div>
          <div className="mt-1 text-xs text-muted-foreground">
            연체/승인 대기/이번 주 예정 모두 없습니다. 커피 한 잔 ☕
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
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
    <div className="flex items-center gap-3 px-4 py-[11px] transition-colors hover:bg-muted/40">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-destructive-soft text-destructive">
        <AlertTriangle className="size-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/cashflow/ledger"
            search={{ deal: item.dealId, payment: item.payment.id }}
            className="text-[12.5px] font-bold underline-offset-2 hover:underline"
          >
            {item.location}
          </Link>
          <span className="inline-flex h-[17px] items-center rounded-full bg-destructive-soft px-1.5 text-[9.5px] font-bold text-destructive">
            {item.daysOverdue}일 경과
          </span>
          <span className="text-[11px] text-muted-foreground">
            {item.payment.code ?? ''} ·{' '}
            {item.payment.clientSide === 'seller' ? '매도측' : '매수측'}
          </span>
        </div>
        {item.payment.actualAmount !== null &&
          item.payment.actualAmount > 0 && (
            <div className="mt-0.5 text-[10.5px] text-muted-foreground">
              수금 {formatMoney(item.payment.actualAmount)} · 잔여{' '}
              <span className="font-medium text-destructive">
                {formatMoney(item.remaining)}
              </span>
            </div>
          )}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-destructive">
        {formatMoney(item.remaining)}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-destructive/25 px-2.5 text-[11.5px] text-destructive hover:bg-destructive-soft/50 hover:text-destructive"
        onClick={handleDunning}
        disabled={loading}
      >
        <Bell className="size-3" />
        독촉
      </Button>
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
    <div className="flex items-center gap-3 px-4 py-[11px] transition-colors hover:bg-muted/40">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-warning-soft text-warning">
        <ReceiptText className="size-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-bold">{typeLabel}</span>
          <span className="inline-flex h-[17px] items-center rounded-full bg-secondary px-1.5 text-[9.5px] font-bold text-muted-foreground">
            {item.code ?? ''}
          </span>
          {item.paymentCode && (
            <span className="text-[11px] text-muted-foreground">
              · {item.paymentCode}
            </span>
          )}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">
          {item.reason}
        </div>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-warning">
        {formatMoney(item.amount)}
      </span>
      {canDecide ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11.5px] font-medium"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || approve.isPending}
          >
            <X className="size-3" />
            반려
          </Button>
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11.5px] font-semibold"
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
      className="flex items-center gap-3 px-4 py-[11px] transition-colors hover:bg-muted/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-info-soft text-info">
        <span className="text-[10px] font-bold tabular-nums">{dDay}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-bold">{item.location}</span>
          <span className="text-[11px] text-muted-foreground">
            {item.payment.code ?? ''} ·{' '}
            {item.payment.clientSide === 'seller' ? '매도측' : '매수측'}
          </span>
        </div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">
          잔금일 {dateShort(item.payment.dueDate)} (
          {weekdayKo(new Date(item.payment.dueDate!))})
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatMoney(item.payment.expectedAmount)}
      </span>
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
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold">{month}월 계약 수수료</span>
          <span className="ml-auto">
            <CountPill>{contracts.length}건</CountPill>
          </span>
        </div>
        <div className="mt-0.5 text-[11px] break-keep text-muted-foreground">
          이번 달 새로 계약된 거래의 수수료 채권이에요
        </div>

        {contracts.length > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground">총 채권</span>
              <span className="text-[17px] font-bold tabular-nums">
                {formatMoney(billedTotal)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${overallRatio}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10.5px]">
              <span className="font-semibold text-success">
                수금 {formatMoney(collectedTotal)} ({overallRatio}%)
              </span>
              <span className="text-muted-foreground">
                미수 {formatMoney(billedTotal - collectedTotal)}
              </span>
            </div>
          </div>
        )}
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-9 text-center text-xs text-muted-foreground/70">
          이번 달 새로 계약된 거래가 없어요
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {contracts.map((c) => (
            <Link
              key={c.dealId}
              to="/cashflow/ledger"
              search={{ deal: c.dealId }}
              className="block px-4 py-[11px] transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold">
                  {c.location}
                </span>
                <StatusBadge
                  kind="transactionType"
                  status={c.transactionType}
                  size="sm"
                  className="shrink-0"
                />
                <span className="ml-auto shrink-0 text-[12.5px] font-bold tabular-nums">
                  {formatMoney(c.billed)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span>계약 {dateShort(c.stageDate)}</span>
                {c.partnerBrokerName && (
                  <span className="inline-flex items-center gap-0.5 text-violet">
                    <Handshake className="size-[11px]" />
                    {c.partnerBrokerName}
                  </span>
                )}
                <span className="ml-auto font-semibold tabular-nums text-success">
                  {c.collectedRatio}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success"
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
