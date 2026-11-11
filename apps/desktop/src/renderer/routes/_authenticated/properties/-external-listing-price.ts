import type {
  ExternalListing,
  ExternalListingTransactionType,
} from '@estate-erp/api-client';

export type PriceChangeTerms = Pick<
  ExternalListing,
  | 'price'
  | 'deposit'
  | 'monthlyRent'
  | 'previousPrice'
  | 'previousDeposit'
  | 'previousMonthlyRent'
  | 'priceChangedAt'
  | 'firstSeenAt'
>;

function getDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  return current != null && previous != null && current !== previous
    ? current - previous
    : null;
}

/**
 * 스냅샷을 닫을 때의 가격 변경 판정과 같다. 비교 기준 뒤에 바뀐 가격만 변동으로 보고,
 * 그 뒤에 처음 등장한 광고는 신규·추가로만 본다.
 */
export function getPriceChange(
  listing: PriceChangeTerms | null | undefined,
  transactionType: ExternalListingTransactionType,
  priceChangeSince: string | null | undefined,
): { mainAmount: number | null; rentAmount: number | null } | null {
  if (!listing?.priceChangedAt || !priceChangeSince) return null;
  const since = new Date(priceChangeSince);
  if (new Date(listing.firstSeenAt) >= since) return null;
  if (new Date(listing.priceChangedAt) < since) return null;
  const mainAmount =
    transactionType === 'sale'
      ? getDelta(listing.price, listing.previousPrice)
      : getDelta(listing.deposit, listing.previousDeposit);
  const rentAmount =
    transactionType === 'monthly'
      ? getDelta(listing.monthlyRent, listing.previousMonthlyRent)
      : null;
  if (mainAmount == null && rentAmount == null) return null;
  return { mainAmount, rentAmount };
}
