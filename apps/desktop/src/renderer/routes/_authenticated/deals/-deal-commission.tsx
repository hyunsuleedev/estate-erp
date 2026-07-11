import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import {
  calculateCommissionAmount,
  calculateCommissionBase,
  getLegalMaxRate,
  siteTypeToCommissionKind,
  type CommissionPropertyKind,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/domain';
import { SectionTitle } from './-deal-shared';
import { getDealTransactionType, ourSideLabels } from './-deal-view-utils';

const PROPERTY_KIND_OPTIONS: Array<{ value: CommissionPropertyKind; label: string }> = [
  { value: 'housing', label: '주택' },
  { value: 'officetel', label: '오피스텔(주거)' },
  { value: 'non_housing', label: '주택외 0.9%' },
];

const COMMISSION_TX_TYPES = new Set(['sale', 'jeonse', 'monthly', 'yearly_rent']);

const CLIENT_SIDE_LABELS: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
};

/**
 * 수수료 계산기 + CommissionPayment(수금) 연계 섹션.
 * 요율 계산은 packages/shared/commission.ts 법정 상한 로직을 그대로 사용한다.
 * 업무용 오피스텔은 자동 판별이 불가능하므로 물건유형 수동 토글을 제공한다.
 */
export function DealCommissionSection({ deal }: { deal: Deal }) {
  const rawType = getDealTransactionType(deal);
  const txType = rawType && COMMISSION_TX_TYPES.has(rawType) ? (rawType as CommissionTransactionType) : null;

  const [propertyKind, setPropertyKind] = useState<CommissionPropertyKind>(() =>
    deal.property?.site?.type ? siteTypeToCommissionKind(deal.property.site.type) : 'housing',
  );

  const commissionQuery = useQuery({
    queryKey: ['commission-payments', 'deal', deal.id],
    queryFn: () => api.finance.commissionPayments.listByDeal(deal.id),
  });

  const summary = deal.commissionSummary;

  if (!txType) {
    return (
      <div className="space-y-2">
        <SectionTitle>수수료 · 정산</SectionTitle>
        <div className="rounded-md border border-dashed bg-muted/50 px-3 py-6 text-sm text-muted-foreground">
          거래유형이 지정되지 않아 법정 수수료를 계산할 수 없습니다.
        </div>
      </div>
    );
  }

  const base = calculateCommissionBase(txType, {
    agreedPrice: deal.agreedPrice,
    agreedDeposit: deal.agreedDeposit,
    agreedMonthlyRent: deal.agreedMonthlyRent,
  });
  const { rate, cap } = getLegalMaxRate(txType, base, propertyKind);
  const { amount: perSideAmount } = calculateCommissionAmount(txType, base, propertyKind);

  const ourSides: Array<'seller' | 'buyer'> = !deal.isJointBrokerage
    ? ['seller', 'buyer']
    : deal.ourSide === 'seller' || deal.ourSide === 'buyer'
      ? [deal.ourSide]
      : ['seller', 'buyer'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>수수료 · 정산</SectionTitle>
        <Button type="button" variant="ghost" size="xs" asChild className="h-6 px-1.5 text-[11px] text-info">
          <Link to="/cashflow">
            수금/정산 관리
            <ExternalLink className="size-3" />
          </Link>
        </Button>
      </div>

      {/* 물건유형 토글 — 업무용 오피스텔은 '주택외 0.9%'를 수동 선택 */}
      <div className="flex w-fit items-center rounded-md bg-muted p-0.5">
        {PROPERTY_KIND_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setPropertyKind(option.value)}
            className={cn(
              'h-6 rounded px-2 text-[11px]',
              propertyKind === option.value &&
                'bg-background text-foreground shadow-xs hover:bg-background',
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>기준금액</span>
          <span className="font-medium tabular-nums text-foreground">{base > 0 ? formatMoney(base) : '—'}</span>
        </div>
        {txType === 'monthly' ? (
          <p className="mt-1 text-[11px]">월세 환산: 보증금 + 월세 × 100 (5천만 미만이면 × 70)</p>
        ) : null}
        {txType === 'yearly_rent' ? (
          <p className="mt-1 text-[11px]">연세 환산: 보증금 + (연세 ÷ 12) × 100</p>
        ) : null}
        <p className="mt-1 text-[11px]">
          {propertyKind === 'non_housing'
            ? '법정 상한 0.9% 이내 협의 (주택외)'
            : `법정 상한 ${rate}%${cap !== null ? ` (상한 ${formatMoney(cap)})` : ' (상한액 없음)'}`}
          {' · 한쪽 기준'}
        </p>
      </div>

      <div className="flex items-end justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.04em] opacity-70">법정 상한 수수료</div>
          <div className="text-[10px] opacity-60">
            {deal.isJointBrokerage ? `우리 담당 ${ourSideLabels[deal.ourSide ?? 'both'] ?? '양측'}` : '단독중개 (양측)'}
          </div>
        </div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {perSideAmount > 0 ? formatMoney(perSideAmount * ourSides.length) : '—'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['seller', 'buyer'] as const).map((side) => {
          const isOurs = ourSides.includes(side);
          return (
            <div
              key={side}
              className={cn(
                'rounded-md border bg-muted/40 px-3 py-3',
                isOurs ? 'border-info/40' : 'opacity-60',
              )}
            >
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {CLIENT_SIDE_LABELS[side]}
                {deal.isJointBrokerage ? (
                  <span className={cn('text-[9px]', isOurs ? 'text-info' : '')}>
                    {isOurs ? '우리' : '파트너'}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-base font-semibold tracking-tight tabular-nums text-foreground">
                {perSideAmount > 0 ? formatMoney(perSideAmount) : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground">상한 {rate}% 기준</div>
            </div>
          );
        })}
      </div>

      {summary && summary.billed > 0 ? (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border bg-muted/40 px-2 py-2">
            <div className="text-[10px] text-muted-foreground">청구 확정</div>
            <div className="font-semibold tabular-nums">{formatMoney(summary.billed)}</div>
          </div>
          <div className="rounded-md border bg-muted/40 px-2 py-2">
            <div className="text-[10px] text-muted-foreground">우리 몫</div>
            <div className="font-semibold tabular-nums">{formatMoney(summary.ourShare)}</div>
          </div>
          <div className="rounded-md border bg-muted/40 px-2 py-2">
            <div className="text-[10px] text-muted-foreground">수금 완료</div>
            <div className="font-semibold tabular-nums text-success">
              {summary.collected ? formatMoney(summary.collected) : '—'}
            </div>
          </div>
        </div>
      ) : null}

      <SectionTitle>수수료 청구 (자동 생성)</SectionTitle>
      {commissionQuery.isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : commissionQuery.isError ? (
        <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          <span>수수료 청구를 불러오지 못했습니다.</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void commissionQuery.refetch()}>
            재시도
          </Button>
        </div>
      ) : (commissionQuery.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/50 px-3 py-4 text-xs text-muted-foreground">
          생성된 수수료 청구가 없습니다. 합의 금액을 입력하면 거래 생성 시 자동 생성됩니다.
        </div>
      ) : (
        <div className="space-y-1.5">
          {(commissionQuery.data ?? []).map((payment) => {
            const ourRatio = (payment.distributions ?? [])
              .filter((d) => d.recipientType === 'our_office')
              .reduce((sum, d) => sum + Number(d.shareRatio), 0);
            return (
              <div key={payment.id} className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <Badge variant="outline" className="rounded px-1.5 text-[10px]">
                  {CLIENT_SIDE_LABELS[payment.clientSide] ?? payment.clientSide}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {payment.code ?? '청구'} · 예상 {formatMoney(payment.expectedAmount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {payment.rate != null ? `요율 ${Number(payment.rate)}%` : '요율 미지정'}
                    {(payment.distributions ?? []).length > 0 ? ` · 우리 배분 ${ourRatio}%` : ''}
                  </p>
                </div>
                <StatusBadge kind="commissionStatus" status={payment.status} size="sm" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
