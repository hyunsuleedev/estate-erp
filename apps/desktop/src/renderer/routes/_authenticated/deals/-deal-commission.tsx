import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLink, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionPayment, Deal, LedgerPayment } from '@estate-erp/api-client';
import {
  calculateCommissionAmount,
  calculateCommissionBase,
  calculateLegacyRoundedCommissionAmount,
  getLegalMaxRate,
  siteTypeToCommissionKind,
  type CommissionPropertyKind,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/domain';
import { PaymentDialogHost, type PaymentDialogState } from '../cashflow/-payment-dialogs';
import { ManwonInput, SectionTitle } from './-deal-shared';
import { getDealTransactionType, getOurSideLabel } from './-deal-view-utils';

const PROPERTY_KIND_OPTIONS: Array<{ value: CommissionPropertyKind; label: string }> = [
  { value: 'housing', label: '주택' },
  { value: 'officetel', label: '오피스텔(주거)' },
  { value: 'non_housing', label: '주택 외 (상가·토지·업무용)' },
];

const COMMISSION_TX_TYPES = new Set(['sale', 'jeonse', 'monthly']);

const CLIENT_SIDE_LABELS: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
};

const LEASE_SIDE_LABELS: Record<string, string> = {
  seller: '임대인측',
  buyer: '임차인측',
};

/** 이미 끝났거나 접은 청구는 이 거래의 수수료로 보지 않는다 */
const INACTIVE_COMMISSION_STATUSES = new Set(['cancelled', 'waived']);

/** 만원 금액에 부가세 10%를 더한 금액을 "1,524만 6,000원"처럼 읽는다. */
function formatWithVat(manwon: number) {
  const won = Math.round(manwon * 10_000 * 1.1);
  const man = Math.floor(won / 10_000);
  const rest = won % 10_000;
  if (man === 0) return `${rest.toLocaleString('ko-KR')}원`;
  return rest === 0
    ? `${man.toLocaleString('ko-KR')}만원`
    : `${man.toLocaleString('ko-KR')}만 ${rest.toLocaleString('ko-KR')}원`;
}

/** 거래 응답의 청구에 실리는 승인 대기 조정 (서버 deals 의 commissionPayments.adjustments) */
interface PendingAdjustment {
  id: string;
  type: 'discount' | 'waive' | 'bad_debt' | string;
  amount: number;
  reason: string;
  requestedAt: string;
  requestedBy?: { id: string; name: string } | null;
}

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  discount: '할인',
  waive: '면제',
  bad_debt: '대손',
};

function pendingAdjustmentsOf(payment: CommissionPayment | null): PendingAdjustment[] {
  return ((payment?.adjustments ?? []) as unknown as PendingAdjustment[]).filter(Boolean);
}

/** 본계약으로 확정되어 수금을 기다리는 청구. 금액을 바꾸려면 조정 요청(할인·면제·대손)을 쓴다. */
const ADJUSTABLE_COMMISSION_STATUSES = new Set(['pending', 'partial', 'overdue']);

/**
 * 거래 응답의 수수료 청구를 수금 화면의 조정 창이 받는 모양으로 바꾼다.
 * 조정 창이 쓰는 값은 id·청구액·받은 금액(만원)·상태다. 원 단위 입금 합계는 받은 금액(만원)에서 계산한다.
 */
function toLedgerPayment(payment: CommissionPayment): LedgerPayment {
  const receivedSupplyWon = (payment.actualAmount ?? 0) * 10_000;
  return {
    id: payment.id,
    code: payment.code,
    clientSide: payment.clientSide,
    collectedByOffice: payment.collectedByOffice,
    baseAmount: payment.baseAmount,
    rate: payment.rate == null ? null : Number(payment.rate),
    expectedAmount: payment.expectedAmount,
    actualAmount: payment.actualAmount,
    dueDate: payment.dueDate,
    paidAt: payment.paidAt,
    agreedRemainingDate: payment.agreedRemainingDate,
    status: payment.status,
    method: payment.method,
    note: payment.note,
    taxInvoiceStatus: payment.taxInvoiceStatus,
    taxInvoiceNo: payment.taxInvoiceNo,
    taxInvoiceDate: payment.taxInvoiceDate,
    receivedAmountWon: Math.round(receivedSupplyWon * 1.1),
    receivedSupplyWon,
    // 조정 창은 입금 기록 줄을 쓰지 않는다 (받은 금액 합계만 본다)
    receipts: [],
    distributions: (payment.distributions ?? []).map((distribution) => ({
      id: distribution.id,
      recipientType: distribution.recipientType,
      partnerBrokerId: distribution.partnerBrokerId ?? null,
      partnerBrokerName: distribution.partnerBroker?.name ?? null,
      shareRatio: Number(distribution.shareRatio),
      shareAmount: distribution.shareAmount,
      status: distribution.status,
      settledAt: distribution.settledAt ?? null,
      settlementMemo: distribution.settlementMemo ?? null,
    })),
    pendingAdjustments: pendingAdjustmentsOf(payment).length,
  };
}

function getErrorMessage(error: unknown, fallback = '요청을 처리하지 못했습니다. 다시 시도해 주세요.') {
  return apiErrorMessage(error, fallback);
}

/**
 * 거래의 수수료. 법정 상한을 계산해 보여 주고, 우리가 받을 쪽(매도측·매수측)마다
 * 청구할 금액을 정한다. 실제로 받는 일(입금 기록·정산)은 수수료/정산 화면에서 한다.
 * 요율 계산은 packages/shared/commission.ts 법정 상한 로직을 그대로 쓴다.
 * 업무용 오피스텔은 자동 판별이 안 되므로 물건 종류를 손으로 바꿀 수 있게 둔다.
 */
/**
 * 수수료 구역. 청구 · 배분은 거래 상세에만 있다 — 옆 패널이 목록 줄로 먼저 그릴 때는 상세를 직접 받아
 * (옆 패널과 같은 조회라 요청이 겹치지 않는다) 올 때까지 기다리고, 못 받으면 알리고 다시 받게 한다.
 * 빈 목록으로 그리면 청구가 없는 거래처럼 보인다.
 */
export function DealCommissionSection({ deal }: { deal: Deal }) {
  const needsDetail = deal.commissionPayments === undefined && !deal.commissionHidden;
  const detailQuery = useQuery({
    queryKey: ['deals', 'detail', deal.id],
    queryFn: () => api.deals.findOne(deal.id),
    enabled: needsDetail,
  });
  if (!needsDetail) return <DealCommissionBody deal={deal} />;
  if (detailQuery.data) return <DealCommissionBody deal={detailQuery.data} />;
  if (detailQuery.isError) {
    return (
      <div className="flex items-center justify-between gap-3 py-6 text-sm text-muted-foreground" role="alert">
        <span>수수료를 불러오지 못했습니다.</span>
        <Button type="button" variant="outline" size="xs" onClick={() => void detailQuery.refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }
  return (
    <p className="py-6 text-sm text-muted-foreground" aria-live="polite">
      수수료를 불러오는 중입니다…
    </p>
  );
}

function DealCommissionBody({ deal }: { deal: Deal }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'manager';
  const rawType = getDealTransactionType(deal);
  const txType = rawType && COMMISSION_TX_TYPES.has(rawType) ? (rawType as CommissionTransactionType) : null;
  const isLease = txType === 'jeonse' || txType === 'monthly';
  const sideLabels = isLease ? LEASE_SIDE_LABELS : CLIENT_SIDE_LABELS;

  const [propertyKind, setPropertyKind] = useState<CommissionPropertyKind>(() =>
    deal.property?.site?.type ? siteTypeToCommissionKind(deal.property.site.type) : 'housing',
  );
  // 수금 화면과 같은 조정 창 (직원은 수금 화면을 못 열어서 거래에서 요청한다)
  const [adjustDialog, setAdjustDialog] = useState<PaymentDialogState | null>(null);

  if (deal.commissionHidden) {
    return (
      <div className="space-y-2">
        <SectionTitle>수수료</SectionTitle>
        <p className="text-[13px] text-muted-foreground">
          담당 거래가 아니라 수수료를 볼 수 없습니다. 담당은 대표·매니저가 매물·당사자 탭에서 정합니다.
        </p>
      </div>
    );
  }

  if (!txType) {
    return (
      <div className="space-y-2">
        <SectionTitle>수수료</SectionTitle>
        <p className="text-[13px] text-muted-foreground">
          거래유형이 정해지지 않아 법정 수수료를 계산할 수 없습니다.
        </p>
      </div>
    );
  }

  const base = calculateCommissionBase(txType, {
    agreedPrice: deal.agreedPrice ?? (txType === 'jeonse' ? deal.agreedDeposit : null),
    agreedDeposit: deal.agreedDeposit,
    agreedMonthlyRent: deal.agreedMonthlyRent,
  });
  const { rate, cap } = getLegalMaxRate(txType, base, propertyKind);
  const { amount: legalMax } = calculateCommissionAmount(txType, base, propertyKind);
  // 법정 상한은 만원 아래를 내림한다. 예전에는 반올림해서 만든 자동 청구가 1만 더 클 수 있다(30,125만 × 0.4% → 121만).
  const legacyMax = calculateLegacyRoundedCommissionAmount(txType, base, propertyKind);

  const ourSides: Array<'seller' | 'buyer'> = !deal.isJointBrokerage
    ? ['seller', 'buyer']
    : deal.ourSide === 'seller' || deal.ourSide === 'buyer'
      ? [deal.ourSide]
      : ['seller', 'buyer'];
  const payments = (deal.commissionPayments ?? []).filter(
    (payment) => !INACTIVE_COMMISSION_STATUSES.has(payment.status),
  );
  const paymentBySide = new Map(payments.map((payment) => [payment.clientSide, payment]));
  const ourTotal = payments.reduce((sum, payment) => sum + payment.expectedAmount, 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>법정 상한</SectionTitle>
          {/* 수수료/정산 화면은 대표·매니저 메뉴에만 있다 */}
          {canEdit ? (
            <Button type="button" variant="ghost" size="xs" asChild className="h-6 px-1.5 text-[12px] text-muted-foreground">
              <Link to="/cashflow/ledger" search={{ deal: deal.id }}>
                수수료/정산에서 보기
                <ExternalLink className="size-3" />
              </Link>
            </Button>
          ) : null}
        </div>

        {/* 물건 종류 — 업무용 오피스텔은 '주택 외'를 손으로 고른다 */}
        <div className="flex w-fit flex-wrap items-center rounded-md bg-muted p-0.5" role="group" aria-label="물건 종류">
          {PROPERTY_KIND_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={propertyKind === option.value}
              onClick={() => setPropertyKind(option.value)}
              className={cn(
                'h-6 rounded px-2 text-[11.5px]',
                propertyKind === option.value &&
                  'bg-background text-foreground shadow-xs hover:bg-background',
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <dl className="grid gap-2 text-[13px]">
          <div className="flex items-baseline gap-3">
            <dt className="w-20 shrink-0 text-[12.5px] text-muted-foreground">기준 금액</dt>
            <dd className="font-medium tabular-nums text-[#2f2e2a]">
              {base > 0 ? formatMoney(base) : '합의 금액을 넣으면 계산됩니다'}
            </dd>
          </div>
          {txType === 'monthly' ? (
            <p className="text-[12px] text-muted-foreground">
              월세 환산: 보증금 + 월세 × 100 (이 값이 5천만 미만이면 × 70)
            </p>
          ) : null}
          <div className="flex items-baseline gap-3">
            <dt className="w-20 shrink-0 text-[12.5px] text-muted-foreground">상한 요율</dt>
            <dd className="tabular-nums text-[#2f2e2a]">
              {rate}%{cap !== null ? ` · 한도 ${formatMoney(cap)}` : ''}
              <span className="text-muted-foreground"> · 한쪽 기준</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-3">
            <dt className="w-20 shrink-0 text-[12.5px] text-muted-foreground">한쪽 상한</dt>
            <dd className="font-medium tabular-nums text-[#2f2e2a]">
              {legalMax > 0 ? formatMoney(legalMax) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <SectionTitle>받을 수수료</SectionTitle>
          <span className="text-[12px] text-muted-foreground">
            {deal.isJointBrokerage
              ? `공동중개 · 우리 담당 ${getOurSideLabel(deal.ourSide, txType)}`
              : '단독중개 · 양쪽 모두 우리'}
          </span>
        </div>
        <div className="divide-y divide-[#f1f0ec] border-y border-[#f1f0ec]">
          {(['seller', 'buyer'] as const).map((side) => (
            <CommissionSideRow
              key={side}
              deal={deal}
              side={side}
              label={sideLabels[side]}
              isOurs={ourSides.includes(side)}
              payment={paymentBySide.get(side) ?? null}
              legalMax={legalMax}
              legacyMax={legacyMax}
              base={base}
              propertyKind={propertyKind}
              canEdit={canEdit && !deal.isCancelled}
              adjustLabel={user?.role === 'owner' ? '조정' : '조정 요청'}
              onRequestAdjust={
                deal.isCancelled
                  ? undefined
                  : (payment) =>
                      setAdjustDialog({
                        kind: 'adjust',
                        payment: toLedgerPayment(payment),
                        label: sideLabels[payment.clientSide] ?? payment.clientSide,
                      })
              }
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between pt-1 text-[13px]">
          <span className="text-muted-foreground">우리 사무소 합계</span>
          <span className="text-right">
            <span className="font-semibold tabular-nums text-[#2f2e2a]">
              {ourTotal > 0 ? formatMoney(ourTotal) : '—'}
            </span>
            {ourTotal > 0 ? (
              <span className="block text-[11.5px] text-muted-foreground">
                부가세 10% 별도 · 포함하면 {formatWithVat(ourTotal)}
              </span>
            ) : null}
          </span>
        </div>
        {!canEdit ? (
          <p className="text-[12px] text-muted-foreground">
            수수료 금액은 대표·매니저가 정합니다. 본계약 뒤 할인·면제가 필요하면 조정 요청을 올리세요.
          </p>
        ) : null}
      </section>
      <PaymentDialogHost state={adjustDialog} onClose={() => setAdjustDialog(null)} />
    </div>
  );
}

function CommissionSideRow({
  deal,
  side,
  label,
  isOurs,
  payment,
  legalMax,
  legacyMax,
  base,
  propertyKind,
  canEdit,
  onRequestAdjust,
  adjustLabel = '조정 요청',
}: {
  deal: Deal;
  side: 'seller' | 'buyer';
  label: string;
  isOurs: boolean;
  payment: NonNullable<Deal['commissionPayments']>[number] | null;
  legalMax: number;
  /** 예전 반올림 계산의 상한 (그 금액으로 남은 자동 청구를 알아보는 데만 쓴다) */
  legacyMax: number;
  base: number;
  propertyKind: CommissionPropertyKind;
  canEdit: boolean;
  /** 본계약으로 확정된 청구의 조정 요청 (할인·면제·대손) */
  onRequestAdjust?: (payment: CommissionPayment) => void;
  /** 대표는 바로 반영되므로 '조정', 그 밖에는 '조정 요청' */
  adjustLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const hasReceipts = payment?.actualAmount != null;
  // 계약 전(작성 중) 청구나 아직 없는 쪽만 금액을 바로 정한다. 본계약 뒤에는 조정 요청으로 바꾼다.
  const canSetDirectly = !payment || payment.status === 'draft';
  const canAdjust = Boolean(payment && onRequestAdjust && ADJUSTABLE_COMMISSION_STATUSES.has(payment.status));
  // 승인을 기다리는 조정이 있으면 같은 청구에 또 올리지 않게 막는다
  const pendingAdjustments = pendingAdjustmentsOf(payment);
  const hasPendingAdjustment = pendingAdjustments.length > 0;
  const mutation = useMutation({
    mutationFn: (amount: number) =>
      api.deals.setCommission(deal.id, { side, amount, propertyKind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      toast.success(`${label} 수수료를 저장했습니다.`);
      setEditing(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '수수료를 저장하지 못했습니다. 다시 시도해 주세요.')),
  });

  if (!isOurs) {
    return (
      <div className="flex min-h-11 items-center gap-3 py-2 text-[13px]">
        <span className="w-20 shrink-0 text-[12.5px] text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">상대 중개사가 받습니다</span>
      </div>
    );
  }

  const draftAmount = draft ? Number(draft) : null;
  // 예전 반올림으로 만든 자동 청구 (지금 법정 상한보다 1만 큼) — 한 번에 지금 상한으로 맞출 수 있게 한다
  const isLegacyAuto = Boolean(payment && legacyMax !== legalMax && payment.expectedAmount === legacyMax);
  const overCap = draftAmount != null && legalMax > 0 && draftAmount > legalMax;

  return (
    <div className="py-2">
      <div className="flex min-h-9 items-center gap-3 text-[13px]">
        <span className="w-20 shrink-0 text-[12.5px] text-muted-foreground">{label}</span>
        <div className="min-w-0 flex-1">
          {payment ? (
            <span className="font-medium tabular-nums text-[#2f2e2a]">{formatMoney(payment.expectedAmount)}</span>
          ) : (
            <span className="text-muted-foreground">정하지 않음</span>
          )}
          {payment && base > 0 ? (
            <span className="ml-1.5 text-[12px] tabular-nums text-muted-foreground">
              {/* 할인·협의한 금액에 "× 0.444%" 같은 식을 붙이면 요율을 정한 것처럼 읽힌다 */}
              {payment.expectedAmount === legalMax
                ? '법정 상한'
                : isLegacyAuto
                  ? `법정 상한(이전 계산) · 지금 상한 ${formatMoney(legalMax)}`
                  : '협의 금액'}
            </span>
          ) : null}
        </div>
        {payment ? <StatusBadge kind="commissionStatus" status={payment.status} size="sm" /> : null}
        {canAdjust && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="shrink-0"
            disabled={hasPendingAdjustment}
            title={hasPendingAdjustment ? '승인을 기다리는 조정이 있습니다. 대표가 처리한 뒤 다시 올릴 수 있습니다.' : undefined}
            onClick={() => payment && !hasPendingAdjustment && onRequestAdjust?.(payment)}
          >
            {adjustLabel}
          </Button>
        ) : null}
        {canEdit && canSetDirectly && !hasReceipts && !editing && base > 0 ? (
          <button
            type="button"
            aria-label={`${label} 수수료 정하기`}
            className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
            onClick={() => {
              setDraft(String(payment?.expectedAmount ?? legalMax));
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
      {isLegacyAuto && canEdit && !hasReceipts && !editing ? (
        <p className="pl-[92px] text-[12px] text-warning">
          예전 계산으로 만든 금액이라 지금 법정 상한보다 큽니다.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            disabled={mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate(legalMax);
            }}
          >
            상한 {formatMoney(legalMax)}에 맞추기
          </button>
        </p>
      ) : null}
      {pendingAdjustments.map((adjustment) => (
        <p key={adjustment.id} className="pl-[92px] text-[12px] text-warning">
          {ADJUSTMENT_TYPE_LABELS[adjustment.type] ?? '조정'} 요청 {formatMoney(adjustment.amount)} · 승인 대기
          {adjustment.requestedBy?.name ? ` · ${adjustment.requestedBy.name}` : ''}
          {adjustment.reason ? <span className="text-muted-foreground"> · {adjustment.reason}</span> : null}
        </p>
      ))}
      {payment && hasReceipts && (payment.actualAmount ?? 0) > 0 ? (
        // 거래 화면에서도 얼마를 받았는지 보이게 한다(수금 원장과 같은 값, 만원·부가세 별도)
        <p className="pl-[92px] text-[12px] tabular-nums text-muted-foreground">
          받음 {formatMoney(payment.actualAmount ?? 0)}
          {payment.expectedAmount - (payment.actualAmount ?? 0) > 0
            ? ` · 남은 ${formatMoney(payment.expectedAmount - (payment.actualAmount ?? 0))}`
            : ''}
          {' '}(부가세 별도)
        </p>
      ) : null}

      {editing ? (
        <div className="mt-1.5 grid gap-1.5 pl-[92px]">
          <ManwonInput
            value={draft}
            onChange={setDraft}
            invalid={overCap}
            ariaLabel={`${label} 수수료`}
          />
          {overCap ? (
            <p className="text-[12px] text-destructive">법정 상한 {formatMoney(legalMax)}보다 많이 받을 수 없습니다.</p>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="h-6 rounded-full border px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(String(legalMax))}
            >
              법정 상한 {formatMoney(legalMax)}
            </button>
            <div className="ml-auto flex gap-1.5">
              <Button type="button" variant="ghost" size="xs" disabled={mutation.isPending} onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={draftAmount == null || overCap || mutation.isPending}
                onClick={() => {
                  if (draftAmount != null && !mutation.isPending) mutation.mutate(draftAmount);
                }}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
