import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MoreVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
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
import { SectionTitle } from './-deal-shared';
import {
  formatDaysLabel,
  formatPaymentKind,
  getDaysUntil,
  paymentKindLabels,
  type DealPayment,
} from './-deal-view-utils';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

function todayInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 지급 스케줄 섹션 — 행 추가/수정/삭제 + 입금 확인 */
export function DealPaymentsSection({
  deal,
  referenceDate,
}: {
  deal: Deal;
  referenceDate: Date;
}) {
  const queryClient = useQueryClient();
  const payments = deal.payments ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DealPayment | null>(null);
  const [paidTarget, setPaidTarget] = useState<DealPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DealPayment | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['deals'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (payment: DealPayment) => api.deals.removePayment(deal.id, payment.id),
    onSuccess: () => {
      invalidate();
      toast.success('지급 항목이 삭제되었습니다.');
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionTitle>지급 스케줄</SectionTitle>
          {deal.preContractCarriedOver ? (
            <Badge className="rounded bg-info-soft px-1.5 text-[10px] text-info">가계약금 → 계약금 승계</Badge>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="xs" onClick={() => setAddOpen(true)}>
          <Plus className="size-3" />
          행 추가
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
              onEdit={() => setEditTarget(payment)}
              onDelete={() => setDeleteTarget(payment)}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
            등록된 지급 스케줄이 없습니다. 행 추가로 가계약금/계약금/중도금/잔금을 등록하세요.
          </div>
        )}
      </div>

      <AddPaymentDialog deal={deal} open={addOpen} onOpenChange={setAddOpen} onSaved={invalidate} />
      <EditPaymentDialog
        deal={deal}
        payment={editTarget}
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
        title="지급 항목 삭제"
        description={
          deleteTarget
            ? `${formatPaymentKind(deleteTarget.kind, deleteTarget.sequence)} ${formatMoney(deleteTarget.scheduledAmount)} 항목을 삭제할까요?`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
      />
    </div>
  );
}

function PaymentRow({
  payment,
  referenceDate,
  onConfirmPaid,
  onEdit,
  onDelete,
}: {
  payment: DealPayment;
  referenceDate: Date;
  onConfirmPaid: () => void;
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
          {payment.scheduledDate ? formatDate(payment.scheduledDate) : '일정 미정'}
          {payment.paidAmount != null
            ? ` · 입금 ${formatMoney(payment.paidAmount)}${payment.paidAt ? ` (${formatDate(payment.paidAt)})` : ''}`
            : ''}
        </p>
      </div>
      <div className="text-right text-sm font-semibold tabular-nums text-foreground">
        {formatMoney(payment.scheduledAmount)}
      </div>
      {!paid && !cancelled ? (
        <Badge
          className={cn(
            'rounded px-1.5 text-[10px]',
            urgent ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground',
          )}
        >
          {formatDaysLabel(daysUntil)}
        </Badge>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="지급 항목 액션">
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

function AddPaymentDialog({
  deal,
  open,
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState('contract');
  const [amount, setAmount] = useState('');
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
      toast.success('지급 항목이 추가되었습니다.');
      onOpenChange(false);
      setAmount('');
      setDate('');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const valid = Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>지급 항목 추가</DialogTitle>
          <DialogDescription>가계약금·계약금·중도금·잔금 예정액을 등록합니다. 금액은 만원 단위입니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>종류 *</Label>
            <Select value={kind} onValueChange={setKind}>
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
            <Label>예정 금액 (만원) *</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="예: 5000"
            />
            {Number(amount) > 0 ? (
              <p className="text-xs text-muted-foreground">= {formatMoney(Number(amount))}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>예정일</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
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
  onOpenChange,
  onSaved,
}: {
  deal: Deal;
  payment: DealPayment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return payment ? (
    <EditPaymentDialogInner
      key={payment.id}
      deal={deal}
      payment={payment}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  ) : null;
}

function EditPaymentDialogInner({
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
  const [amount, setAmount] = useState(String(payment.scheduledAmount));
  const [date, setDate] = useState(payment.scheduledDate ? payment.scheduledDate.slice(0, 10) : '');

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.updatePayment(deal.id, payment.id, {
        scheduledAmount: Number(amount),
        scheduledDate: date || null,
      }),
    onSuccess: () => {
      onSaved();
      toast.success('지급 항목이 수정되었습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{formatPaymentKind(payment.kind, payment.sequence)} 수정</DialogTitle>
          <DialogDescription>예정 금액(만원)과 예정일을 변경합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>예정 금액 (만원) *</Label>
            <Input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
            {Number(amount) > 0 ? (
              <p className="text-xs text-muted-foreground">= {formatMoney(Number(amount))}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>예정일</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={Number(amount) <= 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
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
      toast.success('입금이 확인 처리되었습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const partial = Number(paidAmount) > 0 && Number(paidAmount) < payment.scheduledAmount;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>입금 확인 · {formatPaymentKind(payment.kind, payment.sequence)}</DialogTitle>
          <DialogDescription>
            예정액 {formatMoney(payment.scheduledAmount)} — 실입금액이 예정액보다 적으면 부분입금으로 기록됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>실입금액 (만원) *</Label>
            <Input
              type="number"
              min={1}
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
            />
            {partial ? <p className="text-xs text-warning">예정액보다 적어 부분입금으로 처리됩니다.</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label>입금일 *</Label>
            <Input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
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
            <Label>입금자명</Label>
            <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="예: 김매수" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={Number(paidAmount) <= 0 || !paidAt || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            입금 확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
