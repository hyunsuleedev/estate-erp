/**
 * 수수료 청구 다이얼로그 모음. 원장 표, 거래 상세, 캐시플로우가 같은 것을 쓴다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LedgerPayment, LedgerView } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage as sharedApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
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
  checkReceiptInput,
  checkReceivedAmount,
  clientSideLabel,
  formatWon,
  ourRatioFrom,
  parseWonInput,
  partnerRatioOf,
  paymentRemaining,
  paymentWithAdjustment,
  planDealDistribution,
  remainingSupplyWon,
  splitAmount,
  toDayKey,
  WON_PER_MANWON,
  withVatWon,
  withoutVatWon,
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
    qc.invalidateQueries({ queryKey: ['finance', 'receipts'] });
    qc.invalidateQueries({ queryKey: ['cashflow'] });
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['commission-payments'] });
    // 입금이 바뀌면 직원 정산의 계산도 바뀐다
    qc.invalidateQueries({ queryKey: ['settlement'] });
  };
}

/** 입력한 만원 값을 실제 금액으로 바로 보여 준다 (15800 → 1억 5,800만원) */
function moneyHint(value: string) {
  const n = Number(value);
  return n > 0 ? `= ${formatMoney(n)}원` : '';
}

/**
 * 서버가 돌려준 안내 문구. 다른 화면(거래 담당)이 이 이름으로 가져다 쓰므로 이름은 두고,
 * 앱 공용 규칙(@/lib/api-error: 서버 문구 → 그것, 서버에 못 닿음 → 연결 안내, 그 밖 → fallback)을 그대로 부른다.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NoticeError) return error.message;
  return sharedApiErrorMessage(error, fallback);
}

/** 화면이 직접 만든 안내(예: "청구 2건만 바뀌고…"). 서버 오류가 아니라서 문구를 그대로 보여 준다. */
export class NoticeError extends Error {}

/** 원 단위 입력칸에 쓰는 값: 1234000 → "1,234,000" */
const wonInputText = (won: number) => (won > 0 ? won.toLocaleString('ko-KR') : '');

/**
 * 치는 동안의 글 다듬기. 숫자만 쳤으면 "1,234,000"처럼 쉼표를 넣고, "1324만 4천"처럼 단위가 있으면 친 그대로 둔다
 * (치는 도중에 숫자로 바꿔 끼우면 "만" 뒤를 이어 칠 수 없다). 읽은 값은 아래 "= …원"으로 되비춘다.
 */
const tidyWonText = (text: string) => {
  const digits = text.replace(/[,\s]/g, '');
  return /^\d+$/.test(digits) ? wonInputText(Number(digits)) : text;
};

const METHOD_OPTIONS = [
  { value: 'transfer', label: '계좌이체' },
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'other', label: '기타' },
];

/** 둘 가운데 하나를 고르는 작은 단추 묶음 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-px rounded-md bg-[#f1f0ec] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={cn(
            'h-7 rounded-[5px] px-2 text-[13px] text-muted-foreground transition-colors',
            value === option.value && 'bg-white font-medium text-foreground shadow-xs',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── 수금 처리 ────────────────────────────────────────────

/**
 * 통장에 들어온 금액을 원 단위 그대로 적는다. 부가세를 포함해 받았는지 고르면
 * 부가세를 뺀 수수료로 바꿔 청구액과 비교한다(직원 정산도 부가세를 뺀 금액으로 나눈다).
 * 예전에는 만원 단위 정수만 받아 1,672,000원처럼 부가세가 붙은 금액을 적을 수 없었다.
 */
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
  const left = remainingSupplyWon(payment);
  const [vat, setVat] = useState<'included' | 'none'>('included');
  const fullAmount = vat === 'included' ? withVatWon(left) : left;
  const [amountText, setAmountText] = useState(wonInputText(withVatWon(left)));
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState('transfer');
  const [paidAt, setPaidAt] = useState(todayInput);
  const [note, setNote] = useState('');

  const amountWon = parseWonInput(amountText);
  const vatIncluded = vat === 'included';
  const problem = checkReceiptInput(amountWon, vatIncluded, left);
  const supplyWon = problem === 'empty' ? 0 : vatIncluded ? Math.min(left, withoutVatWon(amountWon)) : amountWon;
  const leftAfter = Math.max(0, left - supplyWon);
  // 1원 차이는 서버가 남은 금액에 맞춰 다 받음으로 닫는다
  const closes = problem === null && leftAfter <= (vatIncluded ? 1 : 0);
  const futureDate = paidAt > todayInput();
  const receivedBefore = payment.receivedAmountWon ?? 0;

  const changeVat = (next: 'included' | 'none') => {
    setVat(next);
    // 손대지 않은 금액은 고른 방식의 남은 금액으로 바꿔 준다
    if (!touched) setAmountText(wonInputText(next === 'included' ? withVatWon(left) : left));
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.addReceipt(payment.id, {
        amountWon,
        vat,
        method,
        receivedAt: paidAt,
        memo: note.trim() || undefined,
      }),
    onSuccess: (updated) => {
      toast.success(
        updated.status === 'collected'
          ? '수금을 기록했습니다. 이 청구는 다 받았습니다.'
          : `수금을 기록했습니다. 남은 수수료 ${formatWon(leftAfter)} (부가세 별도)`,
      );
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, '수금을 기록하지 못했습니다.')),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수금 처리</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px] [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
          <dt>청구 수수료</dt>
          <dd>
            {formatWon(payment.expectedAmount * WON_PER_MANWON)}
            <span className="text-muted-foreground"> · 부가세 별도</span>
          </dd>
          {receivedBefore !== 0 && (
            <>
              <dt>지금까지 받은 돈</dt>
              <dd>{formatWon(receivedBefore)}</dd>
            </>
          )}
          <dt>남은 수수료</dt>
          <dd className="font-semibold">
            {formatWon(left)}
            <span className="font-normal text-muted-foreground">
              {' '}
              · 부가세 포함 {formatWon(withVatWon(left))}
            </span>
          </dd>
        </dl>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>부가세</Label>
            <Choice
              label="부가세"
              value={vat}
              onChange={changeVat}
              options={[
                { value: 'included', label: '부가세 포함해서 받음' },
                { value: 'none', label: '부가세 없이 받음' },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="collect-amount">받은 금액 (원)</Label>
              {amountWon !== fullAmount && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline decoration-[#d8d6d0] underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setAmountText(wonInputText(fullAmount));
                    setTouched(false);
                  }}
                >
                  남은 금액 전부 {formatWon(fullAmount)}
                </button>
              )}
            </div>
            <Input
              id="collect-amount"
              inputMode="numeric"
              className="text-right tabular-nums"
              value={amountText}
              onChange={(e) => {
                setTouched(true);
                setAmountText(tidyWonText(e.target.value));
              }}
              placeholder="예: 13,244,000 또는 1324만 4천"
              autoFocus
            />
            {Number.isFinite(amountWon) && amountWon > 0 && (
              <p className="text-xs font-medium text-foreground tabular-nums">= {formatWon(amountWon)}</p>
            )}
            {problem === 'over' ? (
              <p className="text-xs text-destructive-strong">
                남은 금액보다 많습니다. {vatIncluded ? `부가세 포함 ${formatWon(withVatWon(left))}` : formatWon(left)}
                까지 받을 수 있습니다.
              </p>
            ) : problem === 'empty' && amountText.trim() ? (
              <p className="text-xs text-destructive-strong">
                금액을 읽을 수 없습니다. 예: 13,244,000 또는 1324만 4천
              </p>
            ) : problem === null ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {vatIncluded
                  ? `수수료 ${formatWon(supplyWon)} + 부가세 ${formatWon(amountWon - supplyWon)}`
                  : `수수료 ${formatWon(supplyWon)} · 부가세 없음`}
                {closes ? ' · 다 받음' : ` · 남는 수수료 ${formatWon(leftAfter)}`}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>입금 방법</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="collect-date">입금일</Label>
              <Input
                id="collect-date"
                type="date"
                max={todayInput()}
                className="tabular-nums"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
              {futureDate && (
                <p className="text-xs text-destructive-strong">오늘 이후 날짜는 적을 수 없습니다.</p>
              )}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || problem !== null || !paidAt || futureDate}
          >
            {mutation.isPending ? '기록 중…' : '수금 기록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 돌려준 돈 ────────────────────────────────────────────

/** 받은 수수료를 손님에게 돌려줬을 때. 지난 입금은 그대로 두고 돌려준 기록을 하나 더한다. */
function RefundDialog({
  payment,
  label,
  onClose,
}: {
  payment: LedgerPayment;
  label: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidateFinance();
  const received = payment.receivedAmountWon ?? 0;
  const [amountText, setAmountText] = useState('');
  const [refundedAt, setRefundedAt] = useState(todayInput);
  const [memo, setMemo] = useState('');
  const amountWon = parseWonInput(amountText);
  const over = Number.isFinite(amountWon) && amountWon > received;
  const valid = Number.isFinite(amountWon) && amountWon > 0 && !over && memo.trim().length > 0;
  const futureDate = refundedAt > todayInput();

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.refund(payment.id, {
        amountWon,
        refundedAt,
        memo: memo.trim(),
      }),
    onSuccess: () => {
      toast.success('돌려준 돈을 기록했습니다.', {
        description: '이미 정산한 돈이면 다음 정산에서 직원 몫이 빠집니다.',
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, '돌려준 돈을 기록하지 못했습니다.')),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>돌려준 돈 기록</DialogTitle>
          <DialogDescription>
            {label} · 받은 돈 {formatWon(received)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="refund-amount">돌려준 금액 (원)</Label>
            <Input
              id="refund-amount"
              inputMode="numeric"
              className="text-right tabular-nums"
              value={amountText}
              onChange={(e) => setAmountText(tidyWonText(e.target.value))}
              placeholder="예: 1,100,000 또는 110만"
              autoFocus
            />
            {Number.isFinite(amountWon) && amountWon > 0 && (
              <p className="text-xs font-medium text-foreground tabular-nums">= {formatWon(amountWon)}</p>
            )}
            {over ? (
              <p className="text-xs text-destructive-strong">
                받은 돈 {formatWon(received)}보다 많이 돌려줄 수 없습니다.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                잘못 적은 입금이면 돌려준 돈이 아니라 입금 기록을 취소해 주세요.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="refund-date">돌려준 날</Label>
            <Input
              id="refund-date"
              type="date"
              max={todayInput()}
              className="tabular-nums"
              value={refundedAt}
              onChange={(e) => setRefundedAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="refund-memo">사유</Label>
            <Input
              id="refund-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예) 계약 해제로 수수료 반환"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valid || !refundedAt || futureDate}
          >
            {mutation.isPending ? '기록 중…' : '기록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 현금영수증·세금계산서 ────────────────────────────────

export const TAX_DOC_LABEL: Record<string, string> = {
  issued: '세금계산서',
  sent: '세금계산서',
  cash_receipt: '현금영수증',
};

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
  // 개인 손님이 대부분이라 현금영수증을 먼저 둔다
  const [kind, setKind] = useState<'cash_receipt' | 'tax_invoice'>('cash_receipt');
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(todayInput);
  const isCash = kind === 'cash_receipt';

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.issueTaxInvoice(payment.id, {
        kind,
        taxInvoiceNo: taxInvoiceNo.trim(),
        taxInvoiceDate,
      }),
    onSuccess: () => {
      toast.success(`${isCash ? '현금영수증' : '세금계산서'} 발행을 기록했습니다.`);
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, '발행 기록을 저장하지 못했습니다.')),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>현금영수증·세금계산서 기록</DialogTitle>
          <DialogDescription>
            {label}
            {(payment.receivedAmountWon ?? 0) > 0 && ` · 받은 돈 ${formatWon(payment.receivedAmountWon)}`}
            . 발행은 홈택스 등에서 하고 여기에는 번호만 남깁니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Choice
            label="발행 종류"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'cash_receipt', label: '현금영수증' },
              { value: 'tax_invoice', label: '세금계산서' },
            ]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="tax-no">{isCash ? '승인번호' : '세금계산서 번호'}</Label>
            <Input
              id="tax-no"
              className="tabular-nums"
              value={taxInvoiceNo}
              onChange={(e) => setTaxInvoiceNo(e.target.value)}
              placeholder={isCash ? '예) 123456789' : '예) 20261122-41000000-00000042'}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tax-date">발행일</Label>
            <Input
              id="tax-date"
              type="date"
              max={todayInput()}
              className="tabular-nums"
              value={taxInvoiceDate}
              onChange={(e) => setTaxInvoiceDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !taxInvoiceNo.trim() ||
              !taxInvoiceDate ||
              taxInvoiceDate > todayInput()
            }
          >
            {mutation.isPending ? '기록 중…' : '기록'}
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
  const { user } = useAuth();
  // 대표가 올리는 조정은 스스로 승인할 일이라 한 번에 반영한다
  const isOwner = user?.role === 'owner';
  const [type, setType] = useState<'discount' | 'waive' | 'bad_debt'>('discount');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await api.finance.adjustments.request({
        paymentId: payment.id,
        type,
        // 면제·대손은 서버가 남은 금액 전부로 정한다
        amount: type === 'discount' ? -Math.abs(Number(amount)) : -paymentRemaining(payment),
        reason: reason.trim(),
      });
      if (isOwner) await api.finance.adjustments.approve(created.id);
      return created;
    },
    onSuccess: () => {
      toast.success(
        isOwner ? '수수료 조정을 반영했습니다.' : '조정을 요청했습니다. 대표가 승인하면 반영됩니다.',
      );
      invalidate();
      onClose();
    },
    onError: (error) => {
      invalidate();
      toast.error(apiErrorMessage(error, isOwner ? '조정을 반영하지 못했습니다.' : '조정을 요청하지 못했습니다.'));
    },
  });

  // 남은 금액보다 많이 깎으면 이미 받은 돈이 청구액을 넘는다.
  const remaining = paymentRemaining(payment);
  const discountProblem =
    type === 'discount' ? checkReceivedAmount(Number(amount), remaining) : null;
  const valid = reason.trim().length > 0 && discountProblem === null;

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isOwner ? '수수료 조정' : '수수료 조정 요청'}</DialogTitle>
          <DialogDescription>
            {label} · 청구 {formatMoney(payment.expectedAmount)} · 남은 수수료 {formatMoney(remaining)} (부가세 별도).{' '}
            {isOwner ? '대표 계정이라 바로 반영됩니다.' : '대표가 승인하면 반영됩니다.'}
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
                <SelectItem value="bad_debt">대손 처리 (못 받음)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'discount' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-amount">할인 금액 (만원, 부가세 별도)</Label>
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
          ) : (
            <p className="text-xs leading-normal text-muted-foreground">
              남은 수수료 {formatMoney(remaining)}를 {type === 'waive' ? '받지 않기로' : '받지 못한 것으로'} 처리합니다.
              이미 받은 돈은 그대로 남습니다.
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-reason">사유</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 고객 요청 협의"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valid}
          >
            {mutation.isPending ? '저장 중…' : isOwner ? '반영' : '요청'}
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
    : '이 청구는 다 받았거나 면제·대손 처리되어 조정할 금액이 남아 있지 않습니다. 반려해 주세요.';
}

const ADJUSTMENT_PAYMENT_MISSING = '이 조정의 청구를 찾지 못해 승인할 수 없습니다.';

class AdjustmentBlockedError extends NoticeError {}

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
          : apiErrorMessage(error, '조정을 승인하지 못했습니다.'),
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
    onError: (error) => {
      invalidate();
      toast.error(apiErrorMessage(error, '조정을 반려하지 못했습니다.'));
    },
  });
  return { approve, reject };
}

export function AdjustmentDecisionDialog({
  adjustment,
  label,
  transactionType,
  onClose,
}: {
  adjustment: LedgerAdjustment;
  label?: string;
  /** 청구의 쪽 이름(매도측 / 임대인측)을 고르는 데 쓴다 */
  transactionType?: string;
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
          {payment && (
            <>
              <dt className="text-muted-foreground">청구</dt>
              <dd className="tabular-nums">
                {clientSideLabel(payment.clientSide, transactionType)} {formatMoney(payment.expectedAmount)}
                <span className="text-muted-foreground">
                  {' '}
                  · 남은 금액{' '}
                  {paymentRemaining(payment) > 0
                    ? `${formatMoney(paymentRemaining(payment))} (부가세 별도)`
                    : '없음'}
                </span>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">조정 금액</dt>
          <dd className="font-semibold tabular-nums">
            {formatMoney(adjustment.amount)}
          </dd>
          {adjustment.requestedByName && (
            <>
              <dt className="text-muted-foreground">요청</dt>
              <dd>{adjustment.requestedByName}</dd>
            </>
          )}
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
    onError: (error) => toast.error(apiErrorMessage(error, '청구를 확정하지 못했습니다.')),
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
    onError: (error) => toast.error(apiErrorMessage(error, '분배를 저장하지 못했습니다.')),
  });
  const saveBulk = useMutation({
    mutationFn: () => applyDealDistribution(dealId, buildItems()),
    onSuccess: (result) => {
      reportBulkDistribution(result);
      invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      // 건별 적용이 중간에 실패하면 앞선 청구는 이미 바뀌었으므로 다시 읽는다.
      invalidate();
      toast.error(apiErrorMessage(error, '분배를 저장하지 못했습니다.'));
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
              {apiErrorMessage(error, '분배를 저장하지 못했습니다. 다시 시도해 주세요.')}
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
      throw new NoticeError(
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

export type PaymentDialogKind = 'collect' | 'tax' | 'adjust' | 'confirmDraft' | 'refund';

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
  if (state.kind === 'refund') return <RefundDialog key={key} {...props} />;
  return <ConfirmDraftDialog key={key} {...props} />;
}

// ── 독촉 업무 ────────────────────────────────────────────

export interface DunningTarget {
  payment: LedgerPayment;
  location: string;
  dealId: string;
  /** 매매면 매도측·매수측, 전세·월세면 임대인측·임차인측으로 적는다 */
  transactionType?: string;
}

const DUNNING_PREFIX = '[독촉]';
const OPEN_TASK_STATUSES = new Set(['pending', 'in_progress']);

/** 독촉 업무의 제목. 끝나지 않은 독촉 업무를 찾을 때도 이 모양(접두어 + 청구번호)으로 찾는다. */
function dunningTitle({ payment, location }: DunningTarget) {
  return `${DUNNING_PREFIX} ${location} · ${payment.code ?? ''} ${formatMoney(paymentRemaining(payment))} 수금`;
}

/**
 * 끝나지 않은 독촉 업무를 청구마다 찾는다. 업무가 청구를 가리키지 않아 거래와 제목의 청구번호로 맞춘다.
 * 같은 청구에 독촉 업무가 여러 번 쌓이지 않게, 이미 있으면 화면에서 '독촉함'으로 보여 준다.
 */
export function useOpenDunning() {
  const tasks = useQuery({
    queryKey: ['tasks', 'dunning'],
    queryFn: () => api.tasks.findAll({ category: 'call' }),
    staleTime: 30_000,
  });
  return (payment: Pick<LedgerPayment, 'code'>, dealId: string) =>
    (tasks.data ?? [])
      .filter(
        (task) =>
          task.dealId === dealId &&
          OPEN_TASK_STATUSES.has(task.status) &&
          task.title.startsWith(DUNNING_PREFIX) &&
          (!payment.code || task.title.includes(payment.code)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** 독촉 업무를 만든다. 누른 사람이 담당이 되어 '내 담당' 업무에 바로 보인다 (다른 직원에게는 업무 화면에서 넘긴다). */
export function useCreateDunningTasks() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (targets: DunningTarget[]) =>
      Promise.all(
        targets.map((target) =>
          api.tasks.create({
            title: dunningTitle(target),
            content: `${clientSideLabel(target.payment.clientSide, target.transactionType)} 수수료 ${formatMoney(paymentRemaining(target.payment))} 독촉 (부가세 별도)`,
            category: 'call',
            priority: 'urgent',
            // 사람이 눌러 만든 업무라 직접 만든 업무로 둔다 (system 이면 직원이 지울 수 없다)
            source: 'manual',
            dueDate: new Date().toISOString(),
            dealId: target.dealId,
            assignedToId: user?.id,
          }),
        ),
      ),
    onSuccess: (_data, targets) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`독촉 업무 ${targets.length}건을 만들었습니다.`, {
        description: '업무 › 내 담당에서 볼 수 있습니다.',
      });
    },
    onError: (error) => toast.error(apiErrorMessage(error, '독촉 업무를 만들지 못했습니다.')),
  });
}
