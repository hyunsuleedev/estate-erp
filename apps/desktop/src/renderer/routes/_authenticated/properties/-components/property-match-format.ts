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
      // 보증금 / 월세 — 둘 다 단위를 붙인다("1억 / 300만", STANDARDS)
      buyer.monthlyRentMax ? formatMoney(buyer.monthlyRentMax) : null,
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

// ── 합의 조건 입력 ──────────────────────────────────────────────────────────

/** 만원 단위 금액의 상한. 서버 검증(UpdateMatchAgreedTermsDto)과 같다. */
const MAX_MANWON = 200_000_000;

/**
 * 숫자 글을 읽는다. 쉼표는 천 단위 자리에 있을 때만 받는다 —
 * "31,5"를 315로 읽으면 31.5억이 315억으로 저장된다.
 * 빈 글은 null(비우기), 읽을 수 없으면 NaN.
 */
function parsePlainNumber(text: string, maxDecimals: number): number | null {
  const raw = text.trim();
  if (!raw) return null;
  const decimals = maxDecimals > 0 ? `(\\.\\d{1,${maxDecimals}})?` : '';
  if (!new RegExp(`^(\\d+|\\d{1,3}(,\\d{3})+)${decimals}$`).test(raw)) return Number.NaN;
  return Number(raw.replace(/,/g, ''));
}

/** 억 단위로 적은 글을 만원 정수로. 31.5 → 315000. 빈 글은 null, 잘못된 글은 NaN. */
export function parseEokInput(text: string): number | null {
  const eok = parsePlainNumber(text, 4);
  if (eok === null || Number.isNaN(eok)) return eok;
  const manwon = Math.round(eok * 10000);
  return manwon > 0 && manwon <= MAX_MANWON ? manwon : Number.NaN;
}

/** 만원 단위로 적은 글을 만원 정수로. 빈 글은 null, 잘못된 글은 NaN. */
export function parseManwonInput(text: string): number | null {
  const manwon = parsePlainNumber(text, 0);
  if (manwon === null || Number.isNaN(manwon)) return manwon;
  return manwon <= MAX_MANWON ? manwon : Number.NaN;
}

/** 만원 정수를 억 단위 입력칸의 글로. 315000 → "31.5" */
export function formatEokInput(manwon: number | null | undefined): string {
  if (manwon == null) return '';
  return String(Math.round(manwon) / 10000);
}

/** ISO 날짜를 date 입력칸의 값(YYYY-MM-DD)으로. 시각은 버린다. */
export function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** "2027-02-20…" → "2027. 2. 20." 시간대에 따라 하루가 밀리지 않도록 글자에서 바로 읽는다. */
export function formatDateOnly(iso: string | null | undefined): string {
  const [year, month, day] = toDateInputValue(iso).split('-').map(Number);
  return year && month && day ? `${year}. ${month}. ${day}.` : '';
}
