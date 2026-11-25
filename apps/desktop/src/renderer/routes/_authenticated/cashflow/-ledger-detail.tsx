/**
 * 거래 상세 시트. 원장 행, 칸반 카드, 캘린더 일정, 캐시플로우 어디서 열어도 같다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CommissionReceipt,
  LedgerDealGroup,
  LedgerPayment,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { ConfirmDialog, EntityChip, StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DistributionEditDialog,
  PaymentDialogHost,
  TAX_DOC_LABEL,
  apiErrorMessage,
  applyDealDistribution,
  useCreateDunningTasks,
  useOpenDunning,
  reportBulkDistribution,
  useInvalidateFinance,
  type PaymentDialogKind,
  type PaymentDialogState,
} from './-payment-dialogs';
import { CollectMeter } from './-cashflow-ui';
import {
  billableAmount,
  clientSideLabel,
  collectPercent,
  commissionBasisLabel,
  dealLocation,
  displayStatus,
  formatWon,
  isDistributionEditable,
  isOpenPayment,
  isPaymentDone,
  isPaymentOverdue,
  ourRatioFrom,
  partnerIdOf,
  partnerRatioOf,
  payerName,
  paymentRemaining,
  receivedAmount,
  relativeDueLabel,
  rollupPayments,
  shareRowAmounts,
  shareTotals,
  dayLabel,
  shortDateWithDay,
  splitAmount,
  worstStatus,
} from './-cashflow-utils';

const METHOD_LABEL: Record<string, string> = {
  transfer: '계좌이체',
  cash: '현금',
  card: '카드',
  other: '기타',
};

const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  listing_agent: '매도 담당',
  buying_agent: '매수 담당',
  dual_agent: '양측 담당',
  manager: '매니저',
  assistant: '보조',
  closer: '마감',
};

export function LedgerDetailSheet({
  group,
  highlightPaymentId,
  onClose,
}: {
  group: LedgerDealGroup | null;
  highlightPaymentId: string | null;
  onClose: () => void;
}) {
  const open = group !== null;

  useEffect(() => {
    if (!open || !highlightPaymentId) return;
    const id = requestAnimationFrame(() => {
      document
        .querySelector(`[data-sheet-payment-id="${highlightPaymentId}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open, highlightPaymentId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[480px]"
      >
        {group && (
          <DetailBody group={group} highlightPaymentId={highlightPaymentId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  group,
  highlightPaymentId,
}: {
  group: LedgerDealGroup;
  highlightPaymentId: string | null;
}) {
  const { deal, payments } = group;
  const location = dealLocation(deal);
  // 수금은 우리 통장에 들어온 돈, 막대는 청구가 얼마나 받아졌는지(상대가 받은 돈 포함)
  const { billed, collected, claimCollected, remaining } = rollupPayments(payments);
  const percent = collectPercent(claimCollected, billed);
  const isOverdue = worstStatus(group) === 'overdue';
  const isSale = deal.transactionType === 'sale';

  const editable = payments.filter(isDistributionEditable);
  const firstEditable = editable[0];
  const currentPartnerRatio = firstEditable
    ? partnerRatioOf(firstEditable.distributions)
    : 0;
  // 청구별로 고른 파트너가 거래의 파트너와 다를 수 있다.
  const storedPartnerRow = editable
    .flatMap((p) => p.distributions)
    .find((d) => d.recipientType === 'partner_broker' && d.partnerBrokerId);
  const [previewRatio, setPreviewRatio] = useState<number | null>(null);
  const [dialog, setDialog] = useState<PaymentDialogState | null>(null);

  const openDialog = (kind: PaymentDialogKind, payment: LedgerPayment) =>
    setDialog({
      kind,
      payment,
      label: `${location} · ${clientSideLabel(payment.clientSide, deal.transactionType)} ${payment.code ?? ''}`.trim(),
    });

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="gap-0 border-b border-border py-3.5 pr-12 pl-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="transactionType" status={deal.transactionType} size="sm" />
          <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          {deal.partnerBroker && (
            <span className="rounded-md bg-neutral-soft px-1.5 py-px text-[11px] font-medium text-neutral-strong">
              공동 · {deal.partnerBroker.name}
            </span>
          )}
        </div>
        <SheetTitle className="mt-1.5 text-base leading-snug font-semibold">
          {location}
        </SheetTitle>
        <SheetDescription className="mt-0.5 text-[12.5px] tabular-nums">
          단계 변경 {formatDate(deal.stageChangedAt)}
          {deal.balanceDueDate && ` · 잔금일 ${formatDate(deal.balanceDueDate)}`}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-[#eeeeec] px-5 pt-3.5 pb-4">
          <div className="mb-2.5 grid grid-cols-3 gap-2">
            <Figure label="청구 합계" value={formatMoney(billed)} />
            <Figure label="수금" value={formatMoney(collected)} />
            <Figure
              label="미수"
              value={formatMoney(remaining)}
              valueClassName={isOverdue ? 'text-destructive-strong' : undefined}
            />
          </div>
          <CollectMeter percent={percent} />
          <p className="mt-2 text-xs text-muted-foreground">
            금액은 부가세 별도입니다. 입금 기록은 통장에 들어온 금액(원) 그대로 보여 줍니다.
          </p>
        </section>

        <section className="border-b border-[#eeeeec] px-5 pt-3.5 pb-4">
          <SectionTitle>청구 {payments.length}건</SectionTitle>
          <ol>
            {payments.map((payment) => (
              <PaymentItem
                key={payment.id}
                group={group}
                payment={payment}
                highlight={payment.id === highlightPaymentId}
                previewRatio={
                  previewRatio !== null && isDistributionEditable(payment)
                    ? previewRatio
                    : null
                }
                onAction={(kind) => openDialog(kind, payment)}
              />
            ))}
          </ol>
        </section>

        {editable.length > 0 && deal.partnerBroker && (
          <DistributionSlider
            dealId={deal.id}
            partnerBroker={
              storedPartnerRow?.partnerBrokerId
                ? {
                    id: storedPartnerRow.partnerBrokerId,
                    name:
                      storedPartnerRow.partnerBrokerName ??
                      deal.partnerBroker.name,
                  }
                : deal.partnerBroker
            }
            editablePayments={editable}
            lockedCount={payments.length - editable.length}
            currentRatio={currentPartnerRatio}
            previewRatio={previewRatio}
            onPreviewChange={setPreviewRatio}
          />
        )}

        <section className="border-b border-[#eeeeec] px-5 pt-3.5 pb-4">
          <SectionTitle>거래 정보</SectionTitle>
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px] [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
            <dt>{isSale ? '매도인' : '임대인'}</dt>
            <dd>{deal.sellerContactName ?? '—'}</dd>
            <dt>{isSale ? '매수인' : '임차인'}</dt>
            <dd>{deal.buyerContactName ?? '—'}</dd>
            {deal.agreedPrice != null && deal.agreedPrice > 0 && (
              <>
                <dt>거래가</dt>
                <dd>{formatMoney(deal.agreedPrice)}</dd>
              </>
            )}
            {deal.agreedDeposit != null && deal.agreedDeposit > 0 && (
              <>
                <dt>보증금</dt>
                <dd>{formatMoney(deal.agreedDeposit)}</dd>
              </>
            )}
            {deal.agreedMonthlyRent != null && deal.agreedMonthlyRent > 0 && (
              <>
                <dt>월세</dt>
                <dd>{formatMoney(deal.agreedMonthlyRent)}</dd>
              </>
            )}
            {deal.participants.length > 0 && (
              <>
                <dt>담당자</dt>
                <dd>
                  {deal.participants
                    .map(
                      (p) =>
                        `${p.userName} (${PARTICIPANT_ROLE_LABEL[p.role] ?? p.role})`,
                    )
                    .join(', ')}
                </dd>
              </>
            )}
          </dl>
          <div className="mt-3">
            <EntityChip
              kind="deal"
              id={deal.id}
              label="거래관리에서 보기"
              variant="chip"
            />
          </div>
        </section>
      </div>

      <PaymentDialogHost state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[12.5px] font-medium text-muted-foreground-strong">
      {children}
    </h3>
  );
}

function Figure({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-px text-base font-semibold tracking-[-0.01em]',
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PaymentItem({
  group,
  payment,
  highlight,
  previewRatio,
  onAction,
}: {
  group: LedgerDealGroup;
  payment: LedgerPayment;
  highlight: boolean;
  previewRatio: number | null;
  onAction: (kind: PaymentDialogKind) => void;
}) {
  const { deal } = group;
  const overdue = isPaymentOverdue(payment, deal.balanceDueDate);
  const [editOpen, setEditOpen] = useState(false);
  const [clearingTax, setClearingTax] = useState(false);
  const dunning = useCreateDunningTasks();
  const openDunning = useOpenDunning();
  const dunningTask = overdue ? openDunning(payment, deal.id) : null;
  const invalidate = useInvalidateFinance();
  const clearTax = useMutation({
    mutationFn: () => api.finance.commissionPayments.clearTaxInvoice(payment.id),
    onSuccess: () => {
      toast.success('발행 기록을 지웠습니다.');
      invalidate();
      setClearingTax(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error, '발행 기록을 지우지 못했습니다.')),
  });
  const open = isOpenPayment(payment);
  const taxIssuable =
    (payment.status === 'collected' || payment.status === 'partial') &&
    payment.taxInvoiceStatus === 'none';

  const partnerName =
    payment.distributions.find((d) => d.recipientType === 'partner_broker')
      ?.partnerBrokerName ??
    deal.partnerBroker?.name ??
    '파트너';

  const distributionText = (() => {
    if (previewRatio !== null) {
      const { our, partner } = splitAmount(payment.expectedAmount, previewRatio);
      return `미리보기: 우리 ${ourRatioFrom(previewRatio)}% (${formatMoney(our)}) · ${partnerName} ${previewRatio}% (${formatMoney(partner)})`;
    }
    const hasPartner = payment.distributions.some(
      (d) => d.recipientType === 'partner_broker',
    );
    if (!hasPartner) return null;
    const amounts = shareRowAmounts(
      billableAmount(payment),
      payment.distributions,
    );
    return payment.distributions
      .map(
        (d, i) =>
          `${d.recipientType === 'our_office' ? '우리' : (d.partnerBrokerName ?? '파트너')} ${Number(d.shareRatio)}% (${formatMoney(amounts[i])})${d.status === 'settled' ? ` ${d.settledAt ? dayLabel(d.settledAt, false) + ' ' : ''}주고받음` : ''}`,
      )
      .join(' · ');
  })();

  return (
    <li
      data-sheet-payment-id={payment.id}
      className={cn(
        'border-t border-[#eeeeec] py-2.5 first:border-t-0 first:pt-0 last:pb-0',
        highlight && '-mx-2.5 rounded-md border-t-transparent bg-[#fdf8ec] px-2.5 first:pt-2.5 last:pb-2.5',
      )}
    >
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="font-semibold">{clientSideLabel(payment.clientSide, deal.transactionType)}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {[payerName(deal, payment), payment.code].filter(Boolean).join(' · ')}
        </span>
        <StatusBadge
          kind="commissionStatus"
          status={displayStatus(payment, deal.balanceDueDate)}
          size="sm"
        />
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(payment.expectedAmount)}
        </span>
      </div>

      <div className="mt-1 grid gap-0.5 text-[12.5px] leading-normal text-muted-foreground">
        {isPaymentDone(payment) && (
          <p>
            {dayLabel(payment.paidAt)} 수금{' '}
            {formatMoney(receivedAmount(payment))}
            {payment.method && ` · ${METHOD_LABEL[payment.method] ?? payment.method}`}
          </p>
        )}
        {payment.status === 'waived' && receivedAmount(payment) > 0 && (
          <p>
            {dayLabel(payment.paidAt)} 수금{' '}
            {formatMoney(receivedAmount(payment))} · 나머지{' '}
            {formatMoney(payment.expectedAmount - receivedAmount(payment))} 면제
          </p>
        )}
        {open && payment.status === 'partial' && (
          <p>
            {dayLabel(payment.paidAt)} 수금{' '}
            {formatMoney(payment.actualAmount)} ·{' '}
            <span className="text-warning-strong">
              남은 금액 {formatMoney(paymentRemaining(payment))}
              {payment.agreedRemainingDate &&
                ` · ${shortDateWithDay(payment.agreedRemainingDate)} 약속`}
            </span>
          </p>
        )}
        {open && payment.status !== 'partial' && payment.dueDate && (
            <p className={cn(overdue && 'text-destructive-strong')}>
              예정일 {shortDateWithDay(payment.dueDate)} ·{' '}
              {relativeDueLabel(payment.dueDate)}
            </p>
          )}
        {payment.status === 'draft' && <p>아직 확정하지 않은 청구입니다.</p>}
        {commissionBasisLabel(payment, formatMoney) && (
          <p>{commissionBasisLabel(payment, formatMoney)}</p>
        )}
        {distributionText && (
          <p>
            {distributionText}
            {payment.collectedByOffice === 'partner' && ' · 상대 수금'}
          </p>
        )}
        {payment.taxInvoiceStatus !== 'none' && (
          <p className="flex items-center gap-1.5">
            <span>
              {TAX_DOC_LABEL[payment.taxInvoiceStatus] ?? '세금계산서'}{' '}
              {payment.taxInvoiceNo ?? '발행'}
              {payment.taxInvoiceDate && ` · ${dayLabel(payment.taxInvoiceDate, false)} 발행`}
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline decoration-[#d8d6d0] underline-offset-2 hover:text-foreground"
              onClick={() => setClearingTax(true)}
            >
              지우기
            </button>
          </p>
        )}
        {payment.note && <p>{payment.note}</p>}
        {payment.pendingAdjustments > 0 && (
          <p className="text-warning-strong">
            조정 승인 대기 {payment.pendingAdjustments}건
          </p>
        )}
      </div>

      {(payment.receivedAmountWon ?? 0) !== 0 && <ReceiptList payment={payment} />}

      <div className="mt-2 flex flex-wrap items-center gap-1 empty:hidden">
        {payment.status === 'draft' && (
          <ActionButton primary onClick={() => onAction('confirmDraft')}>
            청구 확정
          </ActionButton>
        )}
        {open && (
          <ActionButton primary onClick={() => onAction('collect')}>
            수금 처리
          </ActionButton>
        )}
        {overdue && dunningTask && (
          <span className="px-1 text-xs text-muted-foreground" title={dunningTask.title}>
            {dayLabel(dunningTask.createdAt, false)} 독촉함
          </span>
        )}
        {overdue && !dunningTask && (
          <ActionButton
            disabled={dunning.isPending}
            onClick={() =>
              dunning.mutate([
                { payment, location: dealLocation(deal), dealId: deal.id, transactionType: deal.transactionType },
              ])
            }
          >
            독촉
          </ActionButton>
        )}
        {taxIssuable && (
          <ActionButton onClick={() => onAction('tax')}>영수증·계산서 기록</ActionButton>
        )}
        {open && (
          <ActionButton onClick={() => onAction('adjust')}>조정 요청</ActionButton>
        )}
        {open && isDistributionEditable(payment) && previewRatio === null && (
          <ActionButton onClick={() => setEditOpen(true)}>분배 수정</ActionButton>
        )}
        {(payment.receivedAmountWon ?? 0) > 0 && (
          <ActionButton onClick={() => onAction('refund')}>돌려준 돈</ActionButton>
        )}
      </div>

      <ConfirmDialog
        open={clearingTax}
        onOpenChange={setClearingTax}
        title="발행 기록 지우기"
        description={`${TAX_DOC_LABEL[payment.taxInvoiceStatus] ?? '세금계산서'} ${payment.taxInvoiceNo ?? ''} 기록을 지웁니다. 홈택스에서 발행한 것은 그대로이니, 실제 발행을 취소했다면 홈택스에서도 취소해 주세요.`}
        confirmLabel="지우기"
        destructive
        loading={clearTax.isPending}
        onConfirm={() => clearTax.mutate()}
      />

      <DistributionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        payment={payment}
        dealId={deal.id}
        defaultPartnerBrokerId={deal.partnerBroker?.id ?? null}
      />
    </li>
  );
}

/** 이 청구의 입금 기록. 잘못 적은 입금은 여기서 취소한다. */
function ReceiptList({ payment }: { payment: LedgerPayment }) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  const [voiding, setVoiding] = useState<CommissionReceipt | null>(null);
  const receipts = useQuery({
    queryKey: ['finance', 'receipts', payment.id],
    queryFn: () => api.finance.commissionPayments.listReceipts(payment.id),
  });
  const voidReceipt = useMutation({
    mutationFn: (receipt: CommissionReceipt) =>
      api.finance.commissionPayments.voidReceipt(receipt.id, '잘못 적은 기록'),
    onSuccess: () => {
      toast.success('입금 기록을 취소했습니다.');
      invalidate();
      qc.invalidateQueries({ queryKey: ['finance', 'receipts', payment.id] });
      qc.invalidateQueries({ queryKey: ['settlement'] });
      setVoiding(null);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '입금 기록을 취소하지 못했습니다.'));
      setVoiding(null);
    },
  });

  if (receipts.isPending) {
    return <p className="mt-1.5 text-xs text-muted-foreground">입금 기록을 불러오는 중입니다.</p>;
  }
  if (receipts.isError) {
    return <p className="mt-1.5 text-xs text-destructive-strong">입금 기록을 불러오지 못했습니다.</p>;
  }
  const rows = receipts.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-[#eeeeec]">
      <div className="border-b border-[#eeeeec] px-2.5 py-1.5 text-xs font-medium text-muted-foreground-strong">
        입금 기록
      </div>
      <ul className="text-[12.5px]">
        {rows.map((receipt) => {
          const voided = receipt.voidedAt !== null;
          const refund = receipt.kind === 'refund';
          return (
            <li
              key={receipt.id}
              className="flex min-h-8 items-center gap-2 border-b border-[#f3f3f1] px-2.5 py-1 last:border-b-0"
            >
              <span className={cn('min-w-0 flex-1', voided && 'text-[#a5a39f] line-through')}>
                <span className="tabular-nums">{dayLabel(receipt.receivedAt)}</span>{' '}
                {refund ? '돌려줌' : '입금'}{' '}
                <b className={cn('font-semibold tabular-nums', refund && !voided && 'text-destructive-strong')}>
                  {formatWon(receipt.amountWon)}
                </b>
                <span className="text-muted-foreground">
                  {receipt.method ? ` · ${METHOD_LABEL[receipt.method] ?? receipt.method}` : ''}
                  {receipt.amountWon === receipt.supplyWon ? ' · 부가세 없음' : ''}
                  {receipt.memo ? ` · ${receipt.memo}` : ''}
                </span>
              </span>
              {voided ? (
                <span className="shrink-0 text-xs text-[#a5a39f]">취소함</span>
              ) : receipt.settlementId ? (
                <span className="shrink-0 text-xs text-muted-foreground" title="직원 정산에 들어간 입금은 취소할 수 없습니다. 돌려준 돈으로 기록해 주세요.">
                  정산함
                </span>
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-xs text-muted-foreground underline decoration-[#d8d6d0] underline-offset-2 hover:text-foreground"
                  onClick={() => setVoiding(receipt)}
                >
                  취소
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="입금 기록 취소"
        description={
          voiding
            ? `${dayLabel(voiding.receivedAt)} ${voiding.kind === 'refund' ? '돌려줌' : '입금'} ${formatWon(voiding.amountWon)} 기록을 취소합니다. 잘못 적은 기록일 때 씁니다. 손님에게 돈을 돌려줬다면 '돌려준 돈'으로 기록해 주세요.`
            : undefined
        }
        confirmLabel="기록 취소"
        destructive
        loading={voidReceipt.isPending}
        onConfirm={() => {
          if (voiding) voidReceipt.mutate(voiding);
        }}
      />
    </div>
  );
}

function ActionButton({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={primary ? 'default' : 'outline'}
      className="h-[26px] px-2"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function DistributionSlider({
  dealId,
  partnerBroker,
  editablePayments,
  lockedCount,
  currentRatio,
  previewRatio,
  onPreviewChange,
}: {
  dealId: string;
  partnerBroker: { id: string; name: string };
  editablePayments: LedgerPayment[];
  lockedCount: number;
  currentRatio: number;
  previewRatio: number | null;
  onPreviewChange: (v: number | null) => void;
}) {
  const invalidate = useInvalidateFinance();
  const partnerRatio = previewRatio ?? currentRatio;
  const ourRatio = ourRatioFrom(partnerRatio);
  // 청구마다 분배가 다르면 첫 청구와 같은 값으로 맞추는 것도 변경이다.
  const uniform = editablePayments.every(
    (p) =>
      partnerRatioOf(p.distributions) === currentRatio &&
      partnerIdOf(p.distributions) === partnerIdOf(editablePayments[0]?.distributions),
  );
  const dirty = previewRatio !== null;
  const [pickedPartnerId, setPickedPartnerId] = useState<string | null>(null);
  const partnerBrokerId = pickedPartnerId ?? partnerBroker.id;
  const [confirming, setConfirming] = useState(false);

  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: dirty && partnerRatio > 0,
  });

  const partnerName =
    partnersQuery.data?.find((b) => b.id === partnerBrokerId)?.name ??
    partnerBroker.name;

  // 서버는 청구별로 내림하므로 합계도 청구별로 나눠 더한다.
  const totals =
    previewRatio === null
      ? shareTotals(editablePayments)
      : editablePayments.reduce(
          (acc, p) => {
            const { our, partner } = splitAmount(p.expectedAmount, previewRatio);
            acc.our += our;
            acc.partner += partner;
            return acc;
          },
          { our: 0, partner: 0 },
        );
  const showRatio = previewRatio !== null || uniform;
  const needsPartnerPicker = partnerRatio > 0 && !partnerBrokerId;

  const save = useMutation({
    mutationFn: () =>
      applyDealDistribution(dealId, [
        ...(ourRatio > 0
          ? [{ recipientType: 'our_office' as const, shareRatio: ourRatio }]
          : []),
        ...(partnerRatio > 0
          ? [
              {
                recipientType: 'partner_broker' as const,
                partnerBrokerId,
                shareRatio: partnerRatio,
              },
            ]
          : []),
      ]),
    onSuccess: (result) => {
      reportBulkDistribution(result);
      invalidate();
      onPreviewChange(null);
      setPickedPartnerId(null);
      setConfirming(false);
    },
    onError: () => {
      // 건별 적용이 중간에 실패하면 앞선 청구는 이미 바뀌었으므로 다시 읽는다.
      invalidate();
      toast.error('분배 적용에 실패했습니다.');
    },
  });

  return (
    <section className="border-b border-[#eeeeec] px-5 pt-3.5 pb-4">
      <SectionTitle>공동중개 분배</SectionTitle>
      <div className="flex justify-between text-[13px] tabular-nums">
        <span>
          우리 {showRatio && <b className="font-semibold">{ourRatio}% · </b>}
          {formatMoney(totals.our)}
        </span>
        <span>
          {partnerName}{' '}
          {showRatio && <b className="font-semibold">{partnerRatio}% · </b>}
          {formatMoney(totals.partner)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label="파트너 분배 비율"
        value={partnerRatio}
        onChange={(e) => {
          const next = Number(e.target.value);
          setConfirming(false);
          onPreviewChange(uniform && next === currentRatio ? null : next);
        }}
        className="mt-2 mb-1 w-full accent-foreground"
      />

      {dirty && partnerRatio > 0 && (
        <div className="mt-2 grid gap-1.5">
          <Label className="text-xs">파트너 중개사</Label>
          <Select value={partnerBrokerId || undefined} onValueChange={setPickedPartnerId}>
            <SelectTrigger className="h-8 w-full text-[13px]">
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
        </div>
      )}

      {save.error && (
        <p className="mt-2 text-xs text-destructive-strong">
          {apiErrorMessage(save.error, '분배를 바꾸지 못했습니다. 다시 시도해 주세요.')}
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {!showRatio && '청구마다 분배가 다릅니다. '}
          수금이 끝나지 않은 청구에 모두 적용합니다.
          {lockedCount > 0 && ` 잠긴 청구 ${lockedCount}건은 제외합니다.`}
        </span>
        {dirty && !confirming && (
          <div className="flex shrink-0 gap-1">
            <Button size="xs" variant="ghost" className="h-[26px] px-2" onClick={() => { onPreviewChange(null); setPickedPartnerId(null); }}>
              되돌리기
            </Button>
            <Button
              size="xs"
              className="h-[26px] px-2"
              disabled={needsPartnerPicker}
              onClick={() => setConfirming(true)}
            >
              적용
            </Button>
          </div>
        )}
      </div>

      {dirty && confirming && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-2 text-[12.5px]">
          <span>
            수금이 끝나지 않은 청구를 우리 {ourRatio}% · 파트너 {partnerRatio}%로 바꿀까요?
          </span>
          <div className="flex shrink-0 gap-1">
            <Button
              size="xs"
              variant="ghost"
              className="h-[26px] px-2"
              disabled={save.isPending}
              onClick={() => setConfirming(false)}
            >
              취소
            </Button>
            <Button
              size="xs"
              className="h-[26px] px-2"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? '저장 중…' : '바꾸기'}
            </Button>
          </div>
        </div>
      )}

      {needsPartnerPicker && (
        <p className="mt-1.5 text-xs text-destructive-strong">
          파트너 비율이 0%보다 크면 파트너를 골라야 합니다.
        </p>
      )}
    </section>
  );
}
