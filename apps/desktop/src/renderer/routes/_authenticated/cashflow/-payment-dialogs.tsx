/**
 * 수수료 청구 다이얼로그 모음. 원장 표, 거래 상세, 캐시플로우가 같은 것을 쓴다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LedgerPayment, LedgerView } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  adjustmentProblem,
  type AdjustmentProblem,
  checkReceivedAmount,
  nextCollectedTotal,
  ourRatioFrom,
  partnerRatioOf,
  paymentRemaining,
  paymentWithAdjustment,
  planDealDistribution,
  shortDate,
  splitAmount,
  toDayKey,
} from './-cashflow-utils';

export type LedgerAdjustment = LedgerView['adjustmentsPending'][number];

export const ADJUSTMENT_LABEL: Record<string, string> = {
  discount: '할인 합의',
  waive: '면제',
  bad_debt: '대손 처리',
};

/** 입력칸 기본값. toISOString은 UTC라 한국 오전에 어제 날짜가 된다. */
const todayInput = () => toDayKey(new Date()) ?? '';

export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
    qc.invalidateQueries({ queryKey: ['cashflow'] });
    qc.invalidateQueries({ queryKey: ['deals'] });
  };
}

/** 입력한 만원 값을 실제 금액으로 바로 보여 준다 (15800 → 1억 5,800만원) */
function moneyHint(value: string) {
  const n = Number(value);
  return n > 0 ? `= ${formatMoney(n)}원` : '';
}

// ── 수금 처리 ────────────────────────────────────────────

function CollectDialog({
  payment,
  label,
  onClose,
}: {
  payment: LedgerPayment;
  label: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidateFinance();
  const remaining = paymentRemaining(payment);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState('transfer');
  const [paidAt, setPaidAt] = useState(todayInput);
  const [note, setNote] = useState('');

  const received = Number(amount);
  const problem = checkReceivedAmount(received, remaining);
  const isPartial = problem === null && received < remaining;
  // 입금일은 청구마다 하나만 저장된다. 달이 바뀌면 앞선 수금액도 새 달로 집계된다.
  const previous = payment.actualAmount ?? 0;
  const movesMonth =
    previous > 0 &&
    toDayKey(payment.paidAt)?.slice(0, 7) !== paidAt.slice(0, 7);

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.collect(payment.id, {
        actualAmount: nextCollectedTotal(payment, received),
        method,
        paidAt,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(
        isPartial
          ? `부분수금으로 기록했습니다. 남은 금액 ${formatMoney(remaining - received)}`
          : '수금 완료로 기록했습니다.',
      );
      invalidate();
      onClose();
    },
    onError: () => toast.error('수금 처리에 실패했습니다.'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수금 처리</DialogTitle>
          <DialogDescription>
            {label} · 남은 금액 {formatMoney(remaining)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="collect-amount">이번에 받은 금액 (만원)</Label>
            <Input
              id="collect-amount"
              type="number"
              min={1}
              className="tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {problem === 'over' ? (
              <p className="text-xs text-destructive-strong">
                남은 금액 {formatMoney(remaining)}보다 많습니다.
              </p>
            ) : problem === 'fraction' ? (
              <p className="text-xs text-destructive-strong">
                만원 단위 정수로 입력해 주세요.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {moneyHint(amount)}
                {isPartial &&
                  ` · 부분수금으로 기록되고 ${formatMoney(remaining - received)}이 남습니다`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="collect-date">입금일</Label>
              <Input
                id="collect-date"
                type="date"
                className="tabular-nums"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="collect-note">메모 (선택)</Label>
            <Input
              id="collect-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 잔여분 11월 16일 입금 약속"
            />
          </div>
          {movesMonth && (
            <p className="text-xs leading-normal text-warning-strong">
              {shortDate(payment.paidAt)}에 받은 {formatMoney(previous)}도 이번
              입금일이 속한 달의 수금으로 집계됩니다. 입금일을 청구마다 하나만
              저장하기 때문입니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || problem !== null}
          >
            수금 기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 세금계산서 ───────────────────────────────────────────

function TaxInvoiceDialog({
  payment,
  label,
  onClose,
}: {
  payment: LedgerPayment;
  label: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidateFinance();
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(todayInput);

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.issueTaxInvoice(payment.id, {
        taxInvoiceNo,
        taxInvoiceDate,
      }),
    onSuccess: () => {
      toast.success('세금계산서 발행을 기록했습니다.');
      invalidate();
      onClose();
    },
    onError: () => toast.error('세금계산서 발행 기록에 실패했습니다.'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>세금계산서 기록</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="tax-no">세금계산서 번호</Label>
            <Input
              id="tax-no"
              className="tabular-nums"
              value={taxInvoiceNo}
              onChange={(e) => setTaxInvoiceNo(e.target.value)}
              placeholder="예) 2026-11-00042"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tax-date">발행일</Label>
            <Input
              id="tax-date"
              type="date"
              className="tabular-nums"
              value={taxInvoiceDate}
              onChange={(e) => setTaxInvoiceDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !taxInvoiceNo.trim()}
          >
            기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 조정 요청 ────────────────────────────────────────────

function AdjustmentRequestDialog({
  payment,
  label,
  onClose,
}: {
  payment: LedgerPayment;
  label: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidateFinance();
  const [type, setType] = useState<'discount' | 'waive' | 'bad_debt'>('discount');
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
      toast.success('조정을 요청했습니다. 대표가 승인하면 반영됩니다.');
      invalidate();
      onClose();
    },
    onError: () => toast.error('조정 요청에 실패했습니다.'),
  });

  // 남은 금액보다 많이 깎으면 이미 받은 돈이 청구액을 넘는다.
  const remaining = paymentRemaining(payment);
  const discountProblem =
    type === 'discount' ? checkReceivedAmount(Number(amount), remaining) : null;
  const valid = reason.trim().length > 0 && discountProblem === null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수수료 조정 요청</DialogTitle>
          <DialogDescription>
            {label} · 청구 {formatMoney(payment.expectedAmount)}. 대표가 승인하면
            반영됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>조정 유형</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
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
              <Label htmlFor="adjust-amount">할인 금액 (만원)</Label>
              <Input
                id="adjust-amount"
                type="number"
                min={1}
                className="tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예) 200"
              />
              {discountProblem === 'over' ? (
                <p className="text-xs text-destructive-strong">
                  남은 금액 {formatMoney(remaining)}까지 깎을 수 있습니다.
                </p>
              ) : discountProblem === 'fraction' ? (
                <p className="text-xs text-destructive-strong">
                  만원 단위 정수로 입력해 주세요.
                </p>
              ) : discountProblem === null ? (
                <p className="text-xs text-muted-foreground">
                  청구 {formatMoney(payment.expectedAmount)} →{' '}
                  {formatMoney(payment.expectedAmount - Number(amount))}
                </p>
              ) : null}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-reason">요청 사유</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 고객 요청 협의"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valid}
          >
            요청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 조정 승인 ────────────────────────────────────────────

function adjustmentProblemText(problem: AdjustmentProblem, remaining: number) {
  return problem === 'over-remaining'
    ? `요청 뒤 수금이 들어와 남은 금액 ${formatMoney(remaining)}보다 큽니다. 승인하면 청구액이 받은 돈보다 작아지므로, 반려한 뒤 다시 요청해 주세요.`
    : '요청 뒤 수금이 끝나 조정할 금액이 남아 있지 않습니다. 반려해 주세요.';
}

const ADJUSTMENT_PAYMENT_MISSING = '이 조정의 청구를 찾지 못해 승인할 수 없습니다.';

class AdjustmentBlockedError extends Error {}

/**
 * 조정 승인. 화면에 보이는 값은 띄워 둔 사이 낡을 수 있어 누르는 순간 청구를 다시 읽어 판단한다.
 * 서버 승인 API는 남은 금액을 확인하지 않는다.
 */
async function approveAdjustment({
  adjustment,
  note,
}: {
  adjustment: LedgerAdjustment;
  note?: string;
}) {
  const payments = await api.finance.commissionPayments.listByDeal(
    adjustment.dealId,
  );
  const payment = paymentWithAdjustment(payments, adjustment.id);
  if (!payment) throw new AdjustmentBlockedError(ADJUSTMENT_PAYMENT_MISSING);
  const problem = adjustmentProblem(adjustment, payment);
  if (problem) {
    throw new AdjustmentBlockedError(
      adjustmentProblemText(problem, paymentRemaining(payment)),
    );
  }
  return api.finance.adjustments.approve(adjustment.id, note);
}

export function useAdjustmentDecision() {
  const invalidate = useInvalidateFinance();
  const approve = useMutation({
    mutationFn: approveAdjustment,
    onSuccess: () => {
      toast.success('수수료 조정을 승인했습니다.');
      invalidate();
    },
    onError: (error) => {
      // 화면의 값이 낡았다는 뜻이므로 다시 읽어 지금 상태를 보여 준다.
      invalidate();
      toast.error(
        error instanceof AdjustmentBlockedError
          ? error.message
          : '조정 승인에 실패했습니다.',
      );
    },
  });
  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.finance.adjustments.reject(id, note),
    onSuccess: () => {
      toast.success('수수료 조정을 반려했습니다.');
      invalidate();
    },
    onError: () => toast.error('조정 반려에 실패했습니다.'),
  });
  return { approve, reject };
}

export function AdjustmentDecisionDialog({
  adjustment,
  label,
  onClose,
}: {
  adjustment: LedgerAdjustment;
  label?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const canDecide = user?.role === 'owner';
  const [note, setNote] = useState('');
  const { approve, reject } = useAdjustmentDecision();
  const pending = approve.isPending || reject.isPending;
  const decisionNote = note || undefined;

  // 요청 뒤 수금이 들어왔을 수 있어 창을 열 때 지금 청구를 읽어 이유를 미리 보여 준다.
  const paymentsQuery = useQuery({
    queryKey: ['finance', 'ledger', 'deal-payments', adjustment.dealId],
    queryFn: () => api.finance.commissionPayments.listByDeal(adjustment.dealId),
    enabled: canDecide,
    refetchOnMount: 'always',
  });
  const payment = paymentsQuery.data
    ? paymentWithAdjustment(paymentsQuery.data, adjustment.id)
    : null;
  const problem = payment ? adjustmentProblem(adjustment, payment) : null;
  const paymentMissing = paymentsQuery.isSuccess && !payment;
  const approveBlocked =
    paymentsQuery.isFetching ||
    paymentsQuery.isError ||
    paymentMissing ||
    problem !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ADJUSTMENT_LABEL[adjustment.type] ?? '수수료 조정'} 검토
          </DialogTitle>
          <DialogDescription>
            {[label, adjustment.paymentCode, adjustment.code]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">조정 금액</dt>
          <dd className="font-semibold tabular-nums">
            {formatMoney(adjustment.amount)}
          </dd>
          <dt className="text-muted-foreground">사유</dt>
          <dd className="leading-normal whitespace-pre-wrap">
            {adjustment.reason}
          </dd>
        </dl>
        {canDecide && problem && payment && (
          <p className="text-xs leading-normal text-destructive-strong">
            {adjustmentProblemText(problem, paymentRemaining(payment))}
          </p>
        )}
        {canDecide && paymentMissing && (
          <p className="text-xs leading-normal text-destructive-strong">
            {ADJUSTMENT_PAYMENT_MISSING}
          </p>
        )}
        {canDecide && paymentsQuery.isError && (
          <p className="text-xs leading-normal text-destructive-strong">
            청구 상태를 확인하지 못해 승인할 수 없습니다. 다시 열어 주세요.
          </p>
        )}
        {canDecide ? (
          <div className="grid gap-1.5">
            <Label htmlFor="decision-note">결정 메모 (선택)</Label>
            <Input
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 원칙대로 승인"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            조정 승인과 반려는 대표만 할 수 있습니다.
          </p>
        )}
        <DialogFooter>
          {canDecide ? (
            <>
              <Button
                variant="outline"
                className="sm:mr-auto"
                disabled={pending}
                onClick={() =>
                  reject.mutate(
                    { id: adjustment.id, note: decisionNote },
                    { onSuccess: onClose },
                  )
                }
              >
                반려
              </Button>
              <Button variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button
                disabled={pending || approveBlocked}
                onClick={() =>
                  approve.mutate(
                    { adjustment, note: decisionNote },
                    { onSuccess: onClose },
                  )
                }
              >
                승인
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 청구 확정 ────────────────────────────────────────────

function ConfirmDraftDialog({
  payment,
  label,
  onClose,
}: {
  payment: LedgerPayment;
  label: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidateFinance();
  const [dueDate, setDueDate] = useState(payment.dueDate?.slice(0, 10) ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.confirmDraft(
        payment.id,
        dueDate ? { dueDate } : undefined,
      ),
    onSuccess: () => {
      toast.success('청구를 확정했습니다.');
      invalidate();
      onClose();
    },
    onError: () => toast.error('청구 확정에 실패했습니다.'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>청구 확정</DialogTitle>
          <DialogDescription>
            {label} · {formatMoney(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="draft-due">수금 예정일 (선택)</Label>
          <Input
            id="draft-due"
            type="date"
            className="tabular-nums"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="text-xs leading-normal text-muted-foreground">
            비워 두면 잔금일을 기준으로 관리합니다. 확정한 뒤에는 일정을 바꿀 수
            없습니다.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? '확정 중…' : '청구 확정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 분배 수정 ────────────────────────────────────────────

export function DistributionEditDialog({
  open,
  onOpenChange,
  payment,
  dealId,
  defaultPartnerBrokerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
  dealId: string;
  defaultPartnerBrokerId: string | null;
}) {
  const invalidate = useInvalidateFinance();
  const currentPartner = payment.distributions.find(
    (d) => d.recipientType === 'partner_broker',
  );
  const initialPartnerRatio = partnerRatioOf(payment.distributions);
  const initialPartnerId =
    currentPartner?.partnerBrokerId ?? defaultPartnerBrokerId ?? '';

  const [partnerRatio, setPartnerRatio] = useState(initialPartnerRatio);
  const [partnerBrokerId, setPartnerBrokerId] = useState(initialPartnerId);
  const [applyToDeal, setApplyToDeal] = useState(false);

  useEffect(() => {
    if (open) {
      setPartnerRatio(initialPartnerRatio);
      setPartnerBrokerId(initialPartnerId);
      setApplyToDeal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment.id]);

  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: open,
  });

  const ourRatio = ourRatioFrom(partnerRatio);
  const { our: ourShare, partner: partnerShare } = splitAmount(
    payment.expectedAmount,
    partnerRatio,
  );
  const needsPartnerPicker = partnerRatio > 0 && !partnerBrokerId;

  const buildItems = () => {
    const items: Array<{
      recipientType: 'our_office' | 'partner_broker';
      partnerBrokerId?: string;
      shareRatio: number;
    }> = [];
    if (ourRatio > 0) {
      items.push({ recipientType: 'our_office', shareRatio: ourRatio });
    }
    if (partnerRatio > 0) {
      items.push({
        recipientType: 'partner_broker',
        partnerBrokerId,
        shareRatio: partnerRatio,
      });
    }
    return items;
  };

  const saved = (message: string) => () => {
    toast.success(message);
    invalidate();
    onOpenChange(false);
  };
  const saveSingle = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.replaceDistributions(
        payment.id,
        buildItems(),
      ),
    onSuccess: saved('수수료 분배를 저장했습니다.'),
    onError: () => toast.error('분배 저장에 실패했습니다.'),
  });
  const saveBulk = useMutation({
    mutationFn: () => applyDealDistribution(dealId, buildItems()),
    onSuccess: (result) => {
      reportBulkDistribution(result);
      invalidate();
      onOpenChange(false);
    },
    onError: () => {
      // 건별 적용이 중간에 실패하면 앞선 청구는 이미 바뀌었으므로 다시 읽는다.
      invalidate();
      toast.error('분배 저장에 실패했습니다.');
    },
  });
  const pending = saveSingle.isPending || saveBulk.isPending;
  const error = saveSingle.error ?? saveBulk.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수수료 분배 수정</DialogTitle>
          <DialogDescription>
            {payment.code ?? '청구'} · {formatMoney(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[13px] tabular-nums">
              <span>
                우리 <b className="font-semibold">{ourRatio}%</b> ·{' '}
                {formatMoney(ourShare)}
              </span>
              <span>
                파트너 <b className="font-semibold">{partnerRatio}%</b> ·{' '}
                {formatMoney(partnerShare)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label="파트너 분배 비율"
              value={partnerRatio}
              onChange={(e) => setPartnerRatio(Number(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="partner-ratio" className="text-xs text-muted-foreground">
                파트너 %
              </Label>
              <Input
                id="partner-ratio"
                type="number"
                min={0}
                max={100}
                value={partnerRatio}
                onChange={(e) =>
                  setPartnerRatio(
                    Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  )
                }
                className="h-8 w-20 tabular-nums"
              />
            </div>
          </div>

          {partnerRatio > 0 && (
            <div className="grid gap-1.5">
              <Label>파트너 중개사</Label>
              <Select
                value={partnerBrokerId || undefined}
                onValueChange={setPartnerBrokerId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="파트너 선택" />
                </SelectTrigger>
                <SelectContent>
                  {partnersQuery.data?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.phone ? ` · ${b.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsPartnerPicker && (
                <p className="text-xs text-destructive-strong">
                  파트너 비율이 0%보다 크면 파트너를 골라야 합니다.
                </p>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-[13px]">
            <Checkbox
              checked={applyToDeal}
              onCheckedChange={(v) => setApplyToDeal(!!v)}
              className="mt-0.5 size-3.5"
            />
            <span>
              이 거래의 모든 청구에 적용
              <span className="mt-0.5 block text-xs text-muted-foreground">
                수금이 끝났거나 면제, 정산된 청구는 건너뜁니다.
              </span>
            </span>
          </label>

          {error && (
            <p className="text-xs text-destructive-strong">
              {(error as Error).message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button
            onClick={() => (applyToDeal ? saveBulk.mutate() : saveSingle.mutate())}
            disabled={needsPartnerPicker || pending}
          >
            {pending ? '저장 중…' : applyToDeal ? '거래 전체 저장' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DistributionItems = Parameters<
  typeof api.finance.commissionPayments.applyDistributionsToDeal
>[1];

/**
 * 거래 전체 분배 변경. 화면의 청구 목록은 기간 필터를 탔고 초안이 빠져 있어,
 * 대상은 서버에서 거래의 청구를 전부 읽어 정한다.
 */
export async function applyDealDistribution(
  dealId: string,
  items: DistributionItems,
): Promise<{ updated: string[]; skipped: Array<{ id: string }> }> {
  const payments = await api.finance.commissionPayments.listByDeal(dealId);
  const { useServerBulk, targets, skipped } = planDealDistribution(payments);
  if (useServerBulk) {
    return api.finance.commissionPayments.applyDistributionsToDeal(dealId, items);
  }
  const updated: string[] = [];
  for (const payment of targets) {
    try {
      await api.finance.commissionPayments.replaceDistributions(payment.id, items);
    } catch (cause) {
      // 건별 호출은 한 번에 되돌릴 수 없으니 앞선 청구가 바뀌었다는 사실을 알린다.
      if (updated.length === 0) throw cause;
      throw new Error(
        `청구 ${updated.length}건만 바뀌고 나머지 ${targets.length - updated.length}건은 저장하지 못했습니다.`,
      );
    }
    updated.push(payment.id);
  }
  return { updated, skipped: skipped.map((p) => ({ id: p.id })) };
}

/** 거래 전체 적용은 끝난 청구를 건너뛰므로 실제로 바뀐 건수를 알려 준다. */
export function reportBulkDistribution(result: {
  updated: string[];
  skipped: Array<{ id: string }>;
}) {
  if (result.updated.length === 0) {
    toast.error('분배를 바꿀 수 있는 청구가 없습니다.');
    return;
  }
  toast.success(
    result.skipped.length > 0
      ? `청구 ${result.updated.length}건의 분배를 바꿨습니다. 바꿀 수 없는 청구 ${result.skipped.length}건은 그대로입니다.`
      : `청구 ${result.updated.length}건의 분배를 바꿨습니다.`,
  );
}

// ── 공용 진입점 ──────────────────────────────────────────

export type PaymentDialogKind = 'collect' | 'tax' | 'adjust' | 'confirmDraft';

export interface PaymentDialogState {
  kind: PaymentDialogKind;
  payment: LedgerPayment;
  /** 어떤 청구인지 알려 주는 문구. 예) 고덕한신 3동 1203호 · 매도측 */
  label: string;
}

/** 행마다 다이얼로그를 띄워 두지 않고 화면에 하나만 둔다. */
export function PaymentDialogHost({
  state,
  onClose,
}: {
  state: PaymentDialogState | null;
  onClose: () => void;
}) {
  if (!state) return null;
  const props = { payment: state.payment, label: state.label, onClose };
  const key = `${state.kind}:${state.payment.id}`;
  if (state.kind === 'collect') return <CollectDialog key={key} {...props} />;
  if (state.kind === 'tax') return <TaxInvoiceDialog key={key} {...props} />;
  if (state.kind === 'adjust') return <AdjustmentRequestDialog key={key} {...props} />;
  return <ConfirmDraftDialog key={key} {...props} />;
}

// ── 독촉 업무 ────────────────────────────────────────────

export interface DunningTarget {
  payment: LedgerPayment;
  location: string;
  dealId: string;
}

export function useCreateDunningTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targets: DunningTarget[]) =>
      Promise.all(
        targets.map(({ payment, location, dealId }) =>
          api.tasks.create({
            title: `[독촉] ${location} · ${payment.code ?? ''} ${formatMoney(paymentRemaining(payment))} 수금`,
            content: `${payment.clientSide === 'seller' ? '매도측' : '매수측'} 수수료 ${formatMoney(paymentRemaining(payment))} 독촉`,
            category: 'call',
            priority: 'urgent',
            source: 'system',
            dueDate: new Date().toISOString(),
            dealId,
          }),
        ),
      ),
    onSuccess: (_data, targets) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`독촉 업무 ${targets.length}건을 만들었습니다.`);
    },
    onError: () => toast.error('독촉 업무를 만들지 못했습니다.'),
  });
}
