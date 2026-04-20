import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CirclePause,
  CirclePlus,
  CircleSlash,
  Handshake,
  ReceiptText,
  Search,
} from 'lucide-react';
import type {
  LedgerDealGroup,
  LedgerPayment,
  LedgerView,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─────────────────────────────────────────────────────────────
// 원장 스타일 정의
// ─────────────────────────────────────────────────────────────

const paymentStatusMeta: Record<
  string,
  { label: string; dotClass: string; pillClass: string }
> = {
  pending: {
    label: '예정',
    dotClass: 'bg-sky-500',
    pillClass: 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40',
  },
  partial: {
    label: '일부수금',
    dotClass: 'bg-amber-500',
    pillClass: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
  },
  collected: {
    label: '수금완료',
    dotClass: 'bg-emerald-500',
    pillClass: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  },
  overdue: {
    label: '연체',
    dotClass: 'bg-red-500',
    pillClass: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40',
  },
  waived: {
    label: '면제',
    dotClass: 'bg-zinc-400',
    pillClass: 'text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900',
  },
  cancelled: {
    label: '취소',
    dotClass: 'bg-zinc-400',
    pillClass: 'text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900',
  },
};

const transactionTypeLabel: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

// Deal stage 를 4단계 마일스톤 으로 요약
const stageMilestone = (stage: string): { filled: number; total: number; label: string } => {
  switch (stage) {
    case 'selection':
    case 'negotiating':
      return { filled: 1, total: 4, label: '선정·협상' };
    case 'preContract':
      return { filled: 2, total: 4, label: '가계약' };
    case 'contracted':
      return { filled: 2, total: 4, label: '계약' };
    case 'settling':
      return { filled: 3, total: 4, label: '중도/잔금' };
    case 'completed':
    case 'closed':
      return { filled: 4, total: 4, label: '종결' };
    default:
      return { filled: 0, total: 4, label: stage };
  }
};

function toManwon(value: number): string {
  return `${value.toLocaleString()}만`;
}

function toDateLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

function daysFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

function relativeDateLabel(value: string | null | undefined): string {
  const d = daysFrom(value);
  if (d === null) return '-';
  if (d === 0) return '오늘';
  if (d > 0) return `${d}일 후`;
  return `${-d}일 경과`;
}

// ─────────────────────────────────────────────────────────────
// Top-level Ledger view
// ─────────────────────────────────────────────────────────────

export function LedgerView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'ledger', year, month],
    queryFn: () => api.finance.ledger.get(year, month),
  });

  const filtered = useMemo<LedgerDealGroup[]>(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.groups.filter((g) => {
      if (typeFilter !== 'all' && g.deal.transactionType !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'all') {
        const hasMatch = g.payments.some((p) => p.status === statusFilter);
        if (!hasMatch) return false;
      }
      if (query) {
        const hay = [
          g.deal.siteName,
          g.deal.dongName,
          g.deal.unitName,
          g.deal.partnerBroker?.name,
          ...g.payments.map((p) => p.code ?? ''),
          g.deal.buyerContactName,
          g.deal.sellerContactName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, typeFilter]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">
        원장 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 조정 승인 대기 배너 */}
      {data.adjustmentsPending.length > 0 && (
        <AdjustmentBanner items={data.adjustmentsPending} />
      )}

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <MonthSelector
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="호수·ID·메모·공동중개…"
            className="h-9 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="전체 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(paymentStatusMeta).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="거래유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="sale">매매</SelectItem>
            <SelectItem value="jeonse">전세</SelectItem>
            <SelectItem value="monthly">월세</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI 요약 바 */}
      <SummaryBar summary={data.summary} />

      {/* 원장 테이블 */}
      <LedgerTable groups={filtered} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Adjustment banner
// ─────────────────────────────────────────────────────────────

function AdjustmentBanner({
  items,
}: {
  items: LedgerView['adjustmentsPending'];
}) {
  const [selected, setSelected] = useState<LedgerView['adjustmentsPending'][number] | null>(null);
  const total = items.reduce((s, a) => s + a.amount, 0);
  return (
    <>
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
        <AlertTriangle className="mt-0.5 size-5 text-red-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            수수료 조정 승인 대기 · {items.length}건 · 총{' '}
            <span className="text-red-700">
              {total >= 0 ? '+' : ''}
              {toManwon(total)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            담당자가 요청한 할인·면제·대손 처리입니다. 클릭하여 개별 검토하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 6).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted/60"
              title={a.reason}
            >
              <span className="font-mono text-muted-foreground">{a.code ?? '—'}</span>
              <span>
                {a.type === 'discount'
                  ? '할인 합의'
                  : a.type === 'waive'
                    ? '면제'
                    : '대손 처리'}
              </span>
              <span className="font-semibold text-red-600">{toManwon(a.amount)}</span>
            </button>
          ))}
        </div>
      </div>

      <AdjustmentDecisionDialog
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        adjustment={selected}
      />
    </>
  );
}

function AdjustmentDecisionDialog({
  open,
  onOpenChange,
  adjustment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adjustment: LedgerView['adjustmentsPending'][number] | null;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const approve = useMutation({
    mutationFn: () =>
      api.finance.adjustments.approve(adjustment!.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setNote('');
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      api.finance.adjustments.reject(adjustment!.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setNote('');
    },
  });

  if (!adjustment) return null;

  const typeLabel =
    adjustment.type === 'discount'
      ? '할인 합의'
      : adjustment.type === 'waive'
        ? '면제'
        : '대손 처리';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            수수료 조정 검토 · {adjustment.code ?? ''}
          </DialogTitle>
          <DialogDescription>
            {adjustment.paymentCode ? `${adjustment.paymentCode} · ` : ''}
            {typeLabel} · {toManwon(adjustment.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-[11px] text-muted-foreground">요청 사유</div>
            <div className="mt-1 whitespace-pre-wrap">{adjustment.reason}</div>
          </div>

          <div className="grid gap-1.5">
            <Label>결정 메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 원칙대로 승인"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || approve.isPending}
          >
            <CircleSlash className="size-3.5" />
            반려
          </Button>
          <Button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || reject.isPending}
          >
            <CircleCheck className="size-3.5" />
            승인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Month selector
// ─────────────────────────────────────────────────────────────

function MonthSelector({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (y: number, m: number) => void;
}) {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background">
      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={prev}>
        ‹
      </Button>
      <span className="min-w-[72px] text-center text-sm font-medium">
        {year}.{String(month).padStart(2, '0')}
      </span>
      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={next}>
        ›
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: LedgerView['summary'];
}) {
  const items = [
    { label: '청구 건수', value: `${summary.paymentCount}건`, accent: '' },
    { label: '합계 금액', value: toManwon(summary.billedTotal), accent: 'text-foreground' },
    { label: '평균', value: toManwon(summary.average), accent: '' },
    {
      label: '수금 완료',
      value: `${toManwon(summary.collectedTotal)} (${summary.collectedCount}건)`,
      accent: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      label: '연체',
      value: `${summary.overdueCount}건`,
      accent: summary.overdueCount > 0 ? 'text-red-700 dark:text-red-300' : '',
    },
    {
      label: '일부수금',
      value: `${summary.partialCount}건`,
      accent: summary.partialCount > 0 ? 'text-amber-700 dark:text-amber-300' : '',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-xl border bg-card md:grid-cols-3 lg:grid-cols-6">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            'px-4 py-3',
            i < items.length - 1 && 'border-r last:border-r-0',
          )}
        >
          <div className="text-[11px] text-muted-foreground">{it.label}</div>
          <div className={cn('mt-0.5 text-base font-semibold tracking-tight', it.accent)}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Ledger table
// ─────────────────────────────────────────────────────────────

function LedgerTable({ groups }: { groups: LedgerDealGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        조건에 맞는 청구 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="w-10 px-2 py-2.5"></th>
            <th className="px-3 py-2.5 text-left font-medium">거래 · 호수</th>
            <th className="px-3 py-2.5 text-left font-medium">파이프라인</th>
            <th className="px-3 py-2.5 text-left font-medium">수수료 합계 · 수금</th>
            <th className="px-3 py-2.5 text-left font-medium">잔금일</th>
            <th className="px-3 py-2.5 text-left font-medium">담당</th>
            <th className="px-3 py-2.5 text-left font-medium">공동</th>
            <th className="px-3 py-2.5 text-left font-medium">빠른 작업</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <DealGroupRow key={g.deal.id} group={g} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Deal 그룹 상위 행 + 하위 payment 행 (아코디언 토글)
// ─────────────────────────────────────────────────────────────

function DealGroupRow({ group }: { group: LedgerDealGroup }) {
  const [expanded, setExpanded] = useState(true);
  const { deal, payments } = group;
  const location = [deal.siteName, deal.dongName, deal.unitName]
    .filter(Boolean)
    .join(' ');

  const worstStatus = payments.some((p) => p.status === 'overdue')
    ? 'overdue'
    : payments.some((p) => p.status === 'partial')
      ? 'partial'
      : payments.every((p) => p.status === 'collected')
        ? 'collected'
        : 'pending';
  const meta = paymentStatusMeta[worstStatus] ?? paymentStatusMeta.pending;

  const milestone = stageMilestone(deal.stage);

  return (
    <>
      <tr className="border-b bg-muted/10 hover:bg-muted/20">
        <td className="px-2 py-3 align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex size-6 items-center justify-center rounded hover:bg-background"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{location || '매물 미지정'}</span>
            <Badge variant="outline" className="text-[10px]">
              {transactionTypeLabel[deal.transactionType] ?? deal.transactionType}
            </Badge>
            <span className="text-[10px] text-muted-foreground">매도+매수</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            계약 {toDateLabel(deal.stageChangedAt)}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <MilestoneIndicator filled={milestone.filled} total={milestone.total} />
          <div className="mt-1 text-[11px] text-muted-foreground">
            {milestone.filled}/{milestone.total} {milestone.label}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', meta.dotClass)} />
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.pillClass)}>
              {meta.label}
            </span>
            <span className="text-sm font-semibold">
              {toManwon(deal.summary.billed)}
            </span>
          </div>
          {deal.summary.collected > 0 && (
            <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              수금 {toManwon(deal.summary.collected)}
            </div>
          )}
        </td>
        <td className="px-3 py-3 align-top text-xs text-muted-foreground">
          {toDateLabel(deal.balanceDueDate)}
          <div className="text-[10px]">{relativeDateLabel(deal.balanceDueDate)}</div>
        </td>
        <td className="px-3 py-3 align-top">
          {deal.participants.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {deal.participants.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[10px]"
                >
                  {p.userName}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          {deal.partnerBroker ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              <Handshake className="size-3" />
              {deal.partnerBroker.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-3 align-top text-xs text-muted-foreground">—</td>
      </tr>

      {expanded &&
        payments.map((p) => <PaymentRow key={p.id} payment={p} />)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 하위 payment 행
// ─────────────────────────────────────────────────────────────

function PaymentRow({ payment }: { payment: LedgerPayment }) {
  const meta = paymentStatusMeta[payment.status] ?? paymentStatusMeta.pending;
  const [collectOpen, setCollectOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const sideLabel = payment.clientSide === 'seller' ? '매도측 청구' : '매수측 청구';

  const remaining =
    payment.actualAmount != null && payment.status === 'partial'
      ? payment.expectedAmount - payment.actualAmount
      : null;

  return (
    <>
      <tr className="border-b last:border-b-0 hover:bg-muted/10">
        <td className="w-10 px-2 py-2.5 align-top" />
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-2 pl-4">
            <Badge
              variant="outline"
              className={cn(
                'border-0 text-[10px]',
                payment.clientSide === 'seller'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
              )}
            >
              {sideLabel}
            </Badge>
            {payment.code && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {payment.code}
              </span>
            )}
          </div>
          {payment.note && (
            <div className="mt-1 pl-4 text-[11px] text-muted-foreground">
              {payment.note}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          {payment.collectedByOffice === 'partner' ? (
            <span className="text-[11px] text-muted-foreground">파트너 수금</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">우리 수금</span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', meta.dotClass)} />
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.pillClass)}>
              {meta.label}
            </span>
            {payment.pendingAdjustments > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                승인대기
              </span>
            )}
            <span className="text-sm font-semibold">
              {toManwon(payment.expectedAmount)}
            </span>
          </div>
          {payment.status === 'collected' && (
            <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              전액 수금
              {payment.paidAt && ` · ${toDateLabel(payment.paidAt)}`}
            </div>
          )}
          {payment.status === 'partial' && (
            <div className="mt-1 text-[11px]">
              수금 {toManwon(payment.actualAmount ?? 0)} (
              {Math.round(((payment.actualAmount ?? 0) / payment.expectedAmount) * 100)}%)
              {payment.paidAt && ` · ${toDateLabel(payment.paidAt)}`}
              {remaining !== null && (
                <>
                  {' '}
                  · 잔여 {toManwon(remaining)}
                  {payment.agreedRemainingDate &&
                    ` · ${toDateLabel(payment.agreedRemainingDate)} 예정`}
                </>
              )}
            </div>
          )}
          {payment.status === 'overdue' && payment.dueDate && (
            <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">
              {relativeDateLabel(payment.dueDate)}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
          {toDateLabel(payment.dueDate)}
        </td>
        <td className="px-3 py-2.5 align-top" />
        <td className="px-3 py-2.5 align-top">
          {payment.distributions.some((d) => d.recipientType === 'partner_broker') && (
            <span className="text-[10px] text-muted-foreground">
              분배:{' '}
              {payment.distributions
                .map(
                  (d) =>
                    `${d.recipientType === 'our_office' ? '우리' : d.partnerBrokerName ?? '파트너'} ${d.shareRatio}%`,
                )
                .join(' · ')}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex flex-wrap gap-1">
            {payment.status !== 'collected' &&
              payment.status !== 'waived' &&
              payment.status !== 'cancelled' && (
                <Button
                  size="xs"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setCollectOpen(true)}
                >
                  <CircleCheck className="size-3" />
                  수금 처리
                </Button>
              )}
            {(payment.status === 'collected' || payment.status === 'partial') &&
              payment.taxInvoiceStatus === 'none' && (
                <Button
                  size="xs"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setTaxOpen(true)}
                >
                  <ReceiptText className="size-3" />
                  계산서
                </Button>
              )}
            {payment.taxInvoiceStatus !== 'none' && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground">
                <ReceiptText className="size-3" />
                {payment.taxInvoiceNo ?? '발행됨'}
              </span>
            )}
            {payment.status !== 'waived' && payment.status !== 'cancelled' && (
              <Button
                size="xs"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-muted-foreground"
                onClick={() => setAdjustOpen(true)}
              >
                <CircleSlash className="size-3" />
                조정
              </Button>
            )}
          </div>
        </td>
      </tr>

      <CollectDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        payment={payment}
      />
      <TaxInvoiceDialog
        open={taxOpen}
        onOpenChange={setTaxOpen}
        payment={payment}
      />
      <AdjustmentRequestDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        payment={payment}
      />
    </>
  );
}

function AdjustmentRequestDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<'discount' | 'waive' | 'bad_debt'>(
    'discount',
  );
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.adjustments.request({
        paymentId: payment.id,
        type,
        amount:
          type === 'discount'
            ? -Math.abs(Number(amount))
            : -payment.expectedAmount,
        reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setAmount('');
      setReason('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수수료 조정 요청</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · 예정 {toManwon(payment.expectedAmount)} ·
            승인 후 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>조정 유형</Label>
            <Select
              value={type}
              onValueChange={(v) =>
                setType(v as 'discount' | 'waive' | 'bad_debt')
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">할인 합의</SelectItem>
                <SelectItem value="waive">면제</SelectItem>
                <SelectItem value="bad_debt">대손 처리</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'discount' && (
            <div className="grid gap-1.5">
              <Label>할인 금액 (만원)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예) 200"
              />
              <p className="text-[11px] text-muted-foreground">
                음수로 저장됩니다. 최종 청구액 = {toManwon(payment.expectedAmount)} − 입력값.
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>요청 사유</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 고객 요청 협의"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !reason}
          >
            <CirclePlus className="size-3.5" />
            요청 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// 파이프라인 마일스톤 indicator
// ─────────────────────────────────────────────────────────────

function MilestoneIndicator({
  filled,
  total,
}: {
  filled: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const active = i < filled;
        return (
          <span
            key={i}
            className={cn(
              'h-1.5 w-6 rounded-full',
              active ? 'bg-emerald-500' : 'bg-muted',
            )}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 수금 처리 다이얼로그
// ─────────────────────────────────────────────────────────────

function CollectDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(payment.expectedAmount));
  const [method, setMethod] = useState('transfer');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.collect(payment.id, {
        actualAmount: Number(amount),
        method,
        paidAt,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수금 처리</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · 예정 {toManwon(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>수금액 (만원)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              예정액보다 적으면 자동으로 일부수금으로 처리됩니다.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>지급 방식</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">계좌이체</SelectItem>
                <SelectItem value="cash">현금</SelectItem>
                <SelectItem value="card">카드</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>입금일</Label>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 잔여 4/28 지급약정"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <CirclePlus className="size-3.5" />
            수금 기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// 세금계산서 발행 다이얼로그
// ─────────────────────────────────────────────────────────────

function TaxInvoiceDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.issueTaxInvoice(payment.id, {
        taxInvoiceNo,
        taxInvoiceDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>세금계산서 발행 기록</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · {toManwon(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>세금계산서 번호</Label>
            <Input
              value={taxInvoiceNo}
              onChange={(e) => setTaxInvoiceNo(e.target.value)}
              placeholder="예) 2026-04-00042"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>발행일</Label>
            <Input
              type="date"
              value={taxInvoiceDate}
              onChange={(e) => setTaxInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !taxInvoiceNo}
          >
            <ReceiptText className="size-3.5" />
            발행 기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 사용하지 않는 아이콘 정리용 export (typecheck 경고 방지)
export const _icons = { CirclePause, CircleSlash };
