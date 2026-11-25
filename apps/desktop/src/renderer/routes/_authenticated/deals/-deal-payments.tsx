import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MoreVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { DealContract as Contract, Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog, StatusBadge } from '@/components/domain';
import { DateQuickInput, isoToDateInput, ManwonInput, SectionTitle } from './-deal-shared';
import {
  formatDaysLabel,
  formatPaymentKind,
  getContractPaymentDifferences,
  getDaysUntil,
  getDealTransactionType,
  paymentKindLabels,
  type DealPayment,
} from './-deal-view-utils';
import { invalidateDealData } from '@/queries/deals';

function getErrorMessage(error: unknown, fallback = '요청을 처리하지 못했습니다. 다시 시도해 주세요.') {
  return apiErrorMessage(error, fallback);
}

function todayInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 받침이 있으면 "과", 없으면 "와" (매매가와 · 보증금과 · 전세금과) */
function withAndParticle(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '와';
  return code % 28 === 0 ? '와' : '과';
}

/** 돈이 오가는 순서: 가계약금 → 계약금 → 중도금(차수) → 잔금 → 환불 */
const PAYMENT_KIND_ORDER: Record<string, number> = {
  pre_contract: 0,
  contract: 1,
  interim: 2,
  balance: 3,
  refund: 4,
};

export function sortDealPayments(payments: DealPayment[]) {
  return payments
    .slice()
    .sort(
      (left, right) =>
        (PAYMENT_KIND_ORDER[left.kind] ?? 9) - (PAYMENT_KIND_ORDER[right.kind] ?? 9) ||
        left.sequence - right.sequence,
    );
}

/** 대금 일정의 기준 총액: 매매가·전세금, 월세는 보증금. 계약서에 적힌 금액이 있으면 그것을 쓴다. */
function getDealTotalAmount(deal: Deal, contract: Contract | null) {
  const type = getDealTransactionType(deal);
  if (contract?.totalPrice) return contract.totalPrice;
  if (type === 'monthly') return deal.agreedDeposit ?? null;
  return deal.agreedPrice ?? deal.agreedDeposit ?? null;
}

/**
 * 계약금 + 중도금 + 잔금 합계. 가계약금은 보통 계약금에 들어가므로 계약금 줄이 없을 때만 더한다.
 * 환불·취소한 줄은 빼고 센다.
 */
export function sumScheduledPayments(payments: DealPayment[], options?: { exclude?: string }) {
  const active = payments.filter(
    (payment) => payment.status !== 'cancelled' && payment.kind !== 'refund' && payment.id !== options?.exclude,
  );
  const hasContract = active.some((payment) => payment.kind === 'contract');
  return active
    .filter((payment) => payment.kind !== 'pre_contract' || !hasContract)
    .reduce((sum, payment) => sum + payment.scheduledAmount, 0);
}

/**
 * 다음에 넣을 가능성이 큰 종류. 가계약 단계면 가계약금, 그 밖에는 계약금이 없으면 계약금,
 * 잔금이 없으면 잔금, 그다음 중도금.
 */
function suggestNextKind(payments: DealPayment[], stage?: string) {
  const kinds = new Set(payments.filter((payment) => payment.status !== 'cancelled').map((payment) => payment.kind));
  if (stage === 'preContract' && !kinds.has('pre_contract')) return 'pre_contract';
  if (!kinds.has('contract')) return 'contract';
  if (!kinds.has('balance')) return 'balance';
  return 'interim';
}

/**
 * 계약서 요약과 거래 대금 일정이 다르면 알려 주고, 사람이 "계약서 값으로 맞추기"를 누르게 한다.
 * 계약서를 저장해도 거래 쪽은 자동으로 덮지 않는다. 거래 대금 탭과 계약서 옆 패널이 같이 쓴다.
 */
export function ContractPaymentMismatch({
  deal,
  contract,
  className,
}: {
  deal: Pick<Deal, 'id' | 'payments' | 'isCancelled'>;
  contract: Contract | null | undefined;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const differences = getContractPaymentDifferences(deal, contract);
  const mutation = useMutation({
    mutationFn: () => api.deals.matchPaymentsToContract(deal.id),
    onSuccess: ({ changed, skipped }) => {
      invalidateDealData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      if (changed > 0) {
        toast.success('대금 일정을 계약서 값으로 맞췄습니다.', {
          description: skipped.length ? skipped.join(' ') : undefined,
        });
      } else if (skipped.length) {
        toast.warning(skipped.join(' '));
      } else {
        toast.success('대금 일정이 이미 계약서와 같습니다.');
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, '대금 일정을 맞추지 못했습니다. 다시 시도해 주세요.')),
  });
  if (!contract || deal.isCancelled || differences.length === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-md border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[12.5px]',
        className,
      )}
    >
      <p className="min-w-0 text-warning">
        <span className="font-medium">계약서와 다릅니다:</span>{' '}
        {differences
          .map((difference) => `${difference.label} 계약서 ${difference.contractText} ↔ 거래 ${difference.dealText}`)
          .join(' · ')}
      </p>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="shrink-0"
        disabled={mutation.isPending}
        onClick={() => {
          if (!mutation.isPending) mutation.mutate();
        }}
      >
        계약서 값으로 맞추기
      </Button>
    </div>
  );
}

/** 대금 일정 — 행 추가/수정/삭제 + 입금 확인, 합계 검산 */
export function DealPaymentsSection({
  deal,
  contract = null,
  referenceDate,
  addRequest = null,
}: {
  deal: Deal;
  contract?: Contract | null;
  referenceDate: Date;
  /** "지금 할 일"의 "○○ 일정 넣기"를 눌렀을 때: 바로 추가 창을 그 종류로 연다(seq가 바뀔 때마다 한 번) */
  addRequest?: { seq: number; kind?: string } | null;
}) {
  const queryClient = useQueryClient();
  const payments = sortDealPayments(deal.payments ?? []);
  const total = getDealTotalAmount(deal, contract);
  const scheduledSum = sumScheduledPayments(payments);
  const difference = total != null ? total - scheduledSum : null;
  // 가계약금을 뺀 나머지를 계약금으로 적으면 꼭 가계약금만큼 모자란다. 왜 모자란지 알려 준다.
  const preContractSum = payments
    .filter((payment) => payment.kind === 'pre_contract' && payment.status !== 'cancelled')
    .reduce((sum, payment) => sum + payment.scheduledAmount, 0);
  const shortByPreContract =
    preContractSum > 0 &&
    difference === preContractSum &&
    payments.some((payment) => payment.kind === 'contract' && payment.status !== 'cancelled');
  const isMonthly = getDealTransactionType(deal) === 'monthly';
  const totalLabel = isMonthly ? '보증금' : getDealTransactionType(deal) === 'jeonse' ? '전세금' : '매매가';

  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<string | undefined>(undefined);
  const handledAddRequestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!addRequest || handledAddRequestRef.current === addRequest.seq || deal.isCancelled) return;
    handledAddRequestRef.current = addRequest.seq;
    setAddKind(addRequest.kind);
    setAddOpen(true);
  }, [addRequest, deal.isCancelled]);
  const [editTarget, setEditTarget] = useState<DealPayment | null>(null);
  const [paidTarget, setPaidTarget] = useState<DealPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DealPayment | null>(null);

  const invalidate = () => {
    invalidateDealData(queryClient);
  };

  // 잘못 누른 입금 확인을 되돌린다 (예정 상태로)
  const undoPaidMutation = useMutation({
    mutationFn: (payment: DealPayment) =>
      api.deals.updatePayment(deal.id, payment.id, { paidAmount: null, paidAt: null, status: 'pending' }),
    onSuccess: (_, payment) => {
      invalidate();
      toast.success(`${formatPaymentKind(payment.kind, payment.sequence)} 입금 확인을 취소했습니다.`);
    },
    onError: (error) => toast.error(getErrorMessage(error, '입금 확인을 취소하지 못했습니다. 다시 시도해 주세요.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (payment: DealPayment) => api.deals.removePayment(deal.id, payment.id),
    onSuccess: () => {
      invalidate();
      toast.success('대금 일정을 삭제했습니다.');
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(getErrorMessage(error, '대금 일정을 삭제하지 못했습니다. 다시 시도해 주세요.')),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionTitle>대금 일정</SectionTitle>
          {deal.preContractCarriedOver ? (
            <Badge className="rounded bg-info-soft px-1.5 text-[10px] text-info">가계약금 → 계약금 승계</Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            setAddKind(undefined);
            setAddOpen(true);
          }}
        >
          <Plus className="size-3" />
          일정 추가
        </Button>
      </div>

      <div className="space-y-1.5">
        {payments.length > 0 ? (
          payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              referenceDate={referenceDate}
              onConfirmPaid={() => setPaidTarget(payment)}
              onUndoPaid={() => undoPaidMutation.mutate(payment)}
              onEdit={() => setEditTarget(payment)}
              onDelete={() => setDeleteTarget(payment)}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
            등록된 대금 일정이 없습니다. 일정 추가로 계약금·중도금·잔금을 넣으면 다음 일정과 D-day가 목록에 표시됩니다.
          </div>
        )}
      </div>

      {/* 합계 검산: 계약금 + 중도금 + 잔금 = 총액인지 */}
      {payments.length > 0 && total != null ? (
        <div
          className={cn(
            'flex items-baseline justify-between gap-3 px-1 pt-1 text-[12.5px]',
            difference === 0 ? 'text-muted-foreground' : 'text-warning',
          )}
          aria-live="polite"
        >
          <span>
            일정 합계 <span className="font-medium tabular-nums">{formatMoney(scheduledSum)}</span>
            {' · '}
            {totalLabel} <span className="tabular-nums">{formatMoney(total)}</span>
          </span>
          <span className="shrink-0 font-medium">
            {difference === 0
              ? `${totalLabel}${withAndParticle(totalLabel)} 맞습니다`
              : difference! > 0
                ? shortByPreContract
                  ? `${formatMoney(difference)} 모자랍니다 · 계약금에 가계약금을 포함해 적어 주세요`
                  : `${formatMoney(difference)} 모자랍니다`
                : `${formatMoney(Math.abs(difference!))} 넘칩니다`}
          </span>
        </div>
      ) : null}

      <ContractPaymentMismatch deal={deal} contract={contract} className="mt-1" />

      {addOpen ? (
        <AddPaymentDialog
          deal={deal}
          payments={payments}
          total={total}
          contractDate={contract?.contractDate ?? null}
          initialKind={addKind}
          onOpenChange={setAddOpen}
          onSaved={invalidate}
        />
      ) : null}
      <EditPaymentDialog
        deal={deal}
        payment={editTarget}
        payments={payments}
        total={total}
        contractDate={contract?.contractDate ?? null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSaved={invalidate}
      />
      <ConfirmPaidDialog
        deal={deal}
        payment={paidTarget}
        onOpenChange={(open) => {
          if (!open) setPaidTarget(null);
        }}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="대금 일정 삭제"
        description={
          deleteTarget
            ? `${formatPaymentKind(deleteTarget.kind, deleteTarget.sequence)} ${formatMoney(deleteTarget.scheduledAmount)} 일정을 삭제할까요?`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget && !deleteMutation.isPending) deleteMutation.mutate(deleteTarget);
        }}
      />
    </div>
  );
}

function PaymentRow({
  payment,
  referenceDate,
  onConfirmPaid,
  onUndoPaid,
  onEdit,
  onDelete,
}: {
  payment: DealPayment;
  referenceDate: Date;
  onConfirmPaid: () => void;
  onUndoPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const paid = payment.status === 'paid';
  const cancelled = payment.status === 'cancelled';
  const daysUntil = payment.scheduledDate
    ? getDaysUntil(new Date(payment.scheduledDate), referenceDate)
    : null;
  const urgent = !paid && !cancelled && daysUntil !== null && daysUntil <= 3;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2.5',
        paid
          ? 'border-success/30 bg-success-soft/50'
          : urgent
            ? 'border-warning/40 bg-warning-soft/50'
            : 'border-border bg-muted/40',
        cancelled && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full',
          paid ? 'bg-success text-white' : 'border-2 border-border bg-background text-transparent',
        )}
      >
        {paid ? <CheckCircle2 className="size-3.5" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">
            {formatPaymentKind(payment.kind, payment.sequence)}
          </p>
          <StatusBadge kind="dealPaymentStatus" status={payment.status} size="sm" />
        </div>
        <p className="text-xs text-muted-foreground">
          {payment.scheduledDate ? formatDate(payment.scheduledDate) : '날짜 미정'}
          {payment.paidAmount != null
            ? ` · 입금 ${formatMoney(payment.paidAmount)}${payment.paidAt ? ` (${formatDate(payment.paidAt)})` : ''}`
            : ''}
        </p>
        {payment.memo ? <p className="text-xs text-muted-foreground">{payment.memo}</p> : null}
      </div>
      <div className="text-right text-sm font-semibold tabular-nums text-foreground">
        {formatMoney(payment.scheduledAmount)}
      </div>
      {!paid && !cancelled ? (
        <Badge
          className={cn(
            'rounded px-1.5 text-[10px]',
            daysUntil !== null && daysUntil < 0
              ? 'bg-destructive-soft text-destructive'
              : urgent
                ? 'bg-warning-soft text-warning'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {formatDaysLabel(daysUntil)}
        </Badge>
      ) : null}
      {!paid && !cancelled ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="shrink-0"
          onClick={onConfirmPaid}
        >
          받음
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`${formatPaymentKind(payment.kind, payment.sequence)} 작업`}>
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {!paid && !cancelled ? (
            <DropdownMenuItem onSelect={onConfirmPaid}>
              <CheckCircle2 className="size-4" />
              입금 확인
            </DropdownMenuItem>
          ) : null}
          {payment.paidAmount != null ? (
            <DropdownMenuItem onSelect={onUndoPaid}>입금 확인 취소</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onEdit}>수정</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 날짜 순서 점검: 잔금이 계약일·계약금일보다 앞서거나, 중도금이 잔금보다 늦으면 알려 준다. 막지는 않는다. */
function getDateWarning(
  kind: string,
  date: string,
  payments: DealPayment[],
  contractDate: string | null,
  excludeId?: string,
) {
  if (!date) return null;
  const others = payments.filter((payment) => payment.id !== excludeId && payment.scheduledDate);
  const day = (value: string) => isoToDateInput(value);
  const contractPayment = others.find((payment) => payment.kind === 'contract');
  const balance = others.find((payment) => payment.kind === 'balance');
  const contractDay = contractDate ? day(contractDate) : contractPayment ? day(contractPayment.scheduledDate!) : null;
  if ((kind === 'balance' || kind === 'interim') && contractDay && date < contractDay) {
    return `${paymentKindLabels[kind]} 날짜가 계약일(${formatDate(contractDay)})보다 앞섭니다.`;
  }
  if (kind === 'interim' && balance && date > day(balance.scheduledDate!)) {
    return `중도금 날짜가 잔금일(${formatDate(balance.scheduledDate!)})보다 늦습니다.`;
  }
  if (kind === 'balance') {
    const lateInterim = others.find((payment) => payment.kind === 'interim' && day(payment.scheduledDate!) > date);
    if (lateInterim) return `잔금일이 중도금 날짜(${formatDate(lateInterim.scheduledDate!)})보다 앞섭니다.`;
  }
  return null;
}

function AddPaymentDialog({
  deal,
  payments,
  total,
  contractDate,
  initialKind,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payments: DealPayment[];
  total: number | null;
  contractDate: string | null;
  /** 정해진 종류로 열 때 (지금 할 일의 "계약금 일정 넣기" 등). 없으면 다음 차례를 짐작해 고른다 */
  initialKind?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const startKind = initialKind ?? suggestNextKind(payments, deal.stage);
  const [kind, setKind] = useState(startKind);
  // 가계약금은 계약금에 들어간다(합계도 그렇게 센다). 가계약금만 있는 거래에 계약금을 넣을 때는
  // 가계약금을 뺀 나머지가 아니라 가계약금을 포함한 계약금 전체를 넣어야 합계가 맞는다.
  const activePreContract = payments
    .filter((payment) => payment.kind === 'pre_contract' && payment.status !== 'cancelled')
    .reduce((sum, payment) => sum + payment.scheduledAmount, 0);
  const hasContractRow = payments.some(
    (payment) => payment.kind === 'contract' && payment.status !== 'cancelled',
  );
  const remainingFor = (nextKind: string) => {
    if (total == null) return null;
    const scheduled = sumScheduledPayments(payments);
    return nextKind === 'contract' && !hasContractRow ? total - scheduled + activePreContract : total - scheduled;
  };
  const remaining = remainingFor(kind);
  const suggestAmount = (nextKind: string) => {
    const left = remainingFor(nextKind);
    return nextKind === 'balance' && left != null && left > 0 ? String(left) : '';
  };
  const [amount, setAmount] = useState(() => suggestAmount(startKind));
  const includesPreContract = kind === 'contract' && !hasContractRow && activePreContract > 0;
  const [date, setDate] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.createPayment(deal.id, {
        kind,
        scheduledAmount: Number(amount),
        scheduledDate: date || undefined,
      }),
    onSuccess: () => {
      onSaved();
      toast.success(`${paymentKindLabels[kind] ?? '대금'} 일정을 추가했습니다.`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '대금 일정을 추가하지 못했습니다. 다시 시도해 주세요.')),
  });

  const valid = Number(amount) > 0;
  const dateWarning = getDateWarning(kind, date, payments, contractDate);
  const contractBase = contractDate ?? payments.find((payment) => payment.kind === 'contract')?.scheduledDate ?? null;

  return (
    <Dialog open onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>대금 일정 추가</DialogTitle>
          <DialogDescription>
            {remaining != null && remaining > 0
              ? `아직 일정에 넣지 않은 금액은 ${formatMoney(remaining)}입니다.`
              : '가계약금·계약금·중도금·잔금 예정액을 넣습니다.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>종류 *</Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                setKind(next);
                if (!amount || amount === suggestAmount(kind)) setAmount(suggestAmount(next));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(paymentKindLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                    {value === 'interim' ? ' (차수 자동)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-payment-amount">예정 금액 *</Label>
            <ManwonInput id="deal-payment-amount" value={amount} onChange={setAmount} placeholder="예: 5,000" />
            {includesPreContract ? (
              <p className="text-[12px] text-muted-foreground">
                가계약금 {formatMoney(activePreContract)}을 포함한 계약금 전체를 넣습니다.
              </p>
            ) : null}
            {kind === 'balance' && remaining != null && remaining > 0 && amount !== String(remaining) ? (
              <button
                type="button"
                className="w-fit text-[12px] text-info hover:underline"
                onClick={() => setAmount(String(remaining))}
              >
                남은 금액 {formatMoney(remaining)} 넣기
              </button>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-payment-date">예정일</Label>
            <DateQuickInput
              id="deal-payment-date"
              value={date}
              onChange={setDate}
              baseDate={kind === 'contract' || kind === 'pre_contract' ? null : contractBase}
              baseLabel="계약"
            />
            {dateWarning ? <p className="text-xs text-warning">{dateWarning}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPaymentDialog({
  deal,
  payment,
  payments,
  total,
  contractDate,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payment: DealPayment | null;
  payments: DealPayment[];
  total: number | null;
  contractDate: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return payment ? (
    <EditPaymentDialogInner
      key={payment.id}
      deal={deal}
      payment={payment}
      payments={payments}
      total={total}
      contractDate={contractDate}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  ) : null;
}

function EditPaymentDialogInner({
  deal,
  payment,
  payments,
  total,
  contractDate,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payment: DealPayment;
  payments: DealPayment[];
  total: number | null;
  contractDate: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.scheduledAmount));
  const [date, setDate] = useState(isoToDateInput(payment.scheduledDate));

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.updatePayment(deal.id, payment.id, {
        scheduledAmount: Number(amount),
        scheduledDate: date || null,
      }),
    onSuccess: () => {
      onSaved();
      toast.success('대금 일정을 수정했습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '대금 일정을 수정하지 못했습니다. 다시 시도해 주세요.')),
  });

  const remaining = total != null ? total - sumScheduledPayments(payments, { exclude: payment.id }) : null;
  const dateWarning = getDateWarning(payment.kind, date, payments, contractDate, payment.id);
  const contractBase = contractDate ?? payments.find((item) => item.kind === 'contract')?.scheduledDate ?? null;

  return (
    <Dialog open onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{formatPaymentKind(payment.kind, payment.sequence)} 수정</DialogTitle>
          <DialogDescription>예정 금액과 예정일을 바꿉니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="deal-payment-edit-amount">예정 금액 *</Label>
            <ManwonInput id="deal-payment-edit-amount" value={amount} onChange={setAmount} />
            {payment.kind === 'balance' && remaining != null && remaining > 0 && amount !== String(remaining) ? (
              <button
                type="button"
                className="w-fit text-[12px] text-info hover:underline"
                onClick={() => setAmount(String(remaining))}
              >
                남은 금액 {formatMoney(remaining)} 넣기
              </button>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-payment-edit-date">예정일</Label>
            <DateQuickInput
              id="deal-payment-edit-date"
              value={date}
              onChange={setDate}
              baseDate={payment.kind === 'contract' || payment.kind === 'pre_contract' ? null : contractBase}
              baseLabel="계약"
            />
            {dateWarning ? <p className="text-xs text-warning">{dateWarning}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={Number(amount) <= 0 || mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPaidDialog({
  deal,
  payment,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payment: DealPayment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return payment ? (
    <ConfirmPaidDialogInner
      key={payment.id}
      deal={deal}
      payment={payment}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  ) : null;
}

function ConfirmPaidDialogInner({
  deal,
  payment,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payment: DealPayment;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [paidAmount, setPaidAmount] = useState(String(payment.paidAmount ?? payment.scheduledAmount));
  const [paidAt, setPaidAt] = useState(todayInput());
  const [method, setMethod] = useState('transfer');
  const [payerName, setPayerName] = useState(payment.payerName ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.updatePayment(deal.id, payment.id, {
        paidAmount: Number(paidAmount),
        paidAt: paidAt || undefined,
        method,
        payerName: payerName || null,
      }),
    onSuccess: () => {
      onSaved();
      toast.success(`${formatPaymentKind(payment.kind, payment.sequence)} 입금을 확인했습니다.`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '입금 확인을 저장하지 못했습니다. 다시 시도해 주세요.')),
  });

  const partial = Number(paidAmount) > 0 && Number(paidAmount) < payment.scheduledAmount;
  // 받지 않은 돈을 앞날 입금일로 적으면 받은 것처럼 보인다
  const paidAtInFuture = Boolean(paidAt) && paidAt > todayInput();

  return (
    <Dialog open onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>입금 확인 · {formatPaymentKind(payment.kind, payment.sequence)}</DialogTitle>
          <DialogDescription>
            예정액 {formatMoney(payment.scheduledAmount)}. 실제로 받은 금액이 적으면 일부 입금으로 기록됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="deal-paid-amount">실제 입금액 *</Label>
            <ManwonInput id="deal-paid-amount" value={paidAmount} onChange={setPaidAmount} />
            {partial ? <p className="text-xs text-warning">예정액보다 적어 일부 입금으로 기록됩니다.</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-paid-at">입금일 *</Label>
            <Input
              id="deal-paid-at"
              type="date"
              max={todayInput()}
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
            {paidAtInFuture ? (
              <p className="text-xs text-destructive">입금일은 오늘이나 그 전 날짜만 적을 수 있습니다. 앞으로 받을 돈은 예정일로 둡니다.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>입금 방법</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">계좌이체</SelectItem>
                <SelectItem value="cash">현금</SelectItem>
                <SelectItem value="check">수표</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-paid-payer">입금자명</Label>
            <Input id="deal-paid-payer" value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="예: 김매수" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={Number(paidAmount) <= 0 || !paidAt || paidAtInFuture || mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            입금 확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
