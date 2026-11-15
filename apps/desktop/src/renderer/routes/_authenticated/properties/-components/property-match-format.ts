import type { BuyerRequirement } from '@estate-erp/api-client';
import { formatMoney } from '@/lib/format';

// 연결 구매고객 패널과 고객 연결 창이 함께 쓰는 표시 계산.

export type BudgetFit = { label: string; over: boolean };

/** 비교에 필요한 매물 가격 필드 (Listing, ListingSummary 모두 맞는다) */
export type ListingPriceLike = {
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
};

export function formatBuyerBudget(buyer?: BuyerRequirement) {
  if (!buyer) return '-';
  if (buyer.transactionType === 'monthly') {
    const deposit = buyer.depositMax ?? buyer.depositMin;
    const parts = [
      deposit ? formatMoney(deposit) : null,
      buyer.monthlyRentMax ? `월 ${formatMoney(buyer.monthlyRentMax)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : '-';
  }

  const min = buyer.priceMin ?? buyer.depositMin;
  const max = buyer.priceMax ?? buyer.depositMax;
  if (min && max && min !== max) {
    return `${formatMoney(min)} ~ ${formatMoney(max)}`;
  }
  return formatMoney(max ?? min).replace('—', '-');
}

function formatPyeong(value?: number | string | null) {
  const squareMeters = Number(value);
  if (!value || Number.isNaN(squareMeters)) return null;
  return `${Math.round(squareMeters * 0.3025)}평`;
}

export function formatBuyerArea(buyer?: BuyerRequirement) {
  if (!buyer) return null;
  const min = formatPyeong(buyer.areaMin);
  const max = formatPyeong(buyer.areaMax);
  if (min && max && min !== max) return `${min} ~ ${max}`;
  if (min && !max) return `${min} 이상`;
  return max ?? min;
}

/** 이 매물의 가격이 고객 예산 상한 안인지. 비교할 값이 없으면 null */
export function computeBudgetFit(
  listing: ListingPriceLike | null | undefined,
  buyer: BuyerRequirement | null | undefined,
): BudgetFit | null {
  if (!listing || !buyer) return null;

  if (listing.transactionType === 'monthly') {
    const depositOver =
      listing.deposit != null && buyer.depositMax != null
        ? listing.deposit - buyer.depositMax
        : null;
    const rentOver =
      listing.monthlyRent != null && buyer.monthlyRentMax != null
        ? listing.monthlyRent - buyer.monthlyRentMax
        : null;
    if (depositOver == null && rentOver == null) return null;
    if (depositOver != null && depositOver > 0) {
      return { label: `보증금 ${formatMoney(depositOver)} 초과`, over: true };
    }
    if (rentOver != null && rentOver > 0) {
      return { label: `월세 ${formatMoney(rentOver)} 초과`, over: true };
    }
    return { label: '예산 안', over: false };
  }

  const amount = listing.price ?? listing.deposit;
  const max = buyer.priceMax ?? buyer.depositMax;
  if (amount == null || max == null) return null;
  return amount > max
    ? { label: `${formatMoney(amount - max)} 초과`, over: true }
    : { label: '예산 안', over: false };
}
