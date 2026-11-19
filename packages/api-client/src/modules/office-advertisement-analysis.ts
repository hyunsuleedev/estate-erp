import {
  analyzeAdvertisementComparison,
  analyzeAdvertisementComparisonRow,
  type AdvertisementComparisonAnalysis,
  type AdvertisementCompetitorAnalysis,
  type AdvertisementComparisonSignal,
  type AdvertisementPriceRelation,
  type ComparisonSubject,
} from '@estate-erp/shared';
import type { ListingAdvertisementWithListing } from './listing-advertisements.js';
import type { OfficeAdvertisement } from './office-advertisements.js';

// 판단 규칙은 shared에 있다(서버가 비교를 저장할 때 같은 규칙으로 기록 · 알림을 만든다).
// 여기서는 화면이 받은 광고 한 건을 그 규칙의 입력 모양으로 바꾸기만 한다.

export type OfficeAdvertisementPriceRelation = AdvertisementPriceRelation;
export type OfficeAdvertisementPrimarySignal = AdvertisementComparisonSignal;
export type OfficeAdvertisementCompetitorAnalysis =
  AdvertisementCompetitorAnalysis<OfficeAdvertisement>;
export type OfficeAdvertisementComparisonAnalysis =
  AdvertisementComparisonAnalysis<OfficeAdvertisement>;

function toSubject(
  listingAdvertisement: ListingAdvertisementWithListing,
): ComparisonSubject<OfficeAdvertisement> {
  const comparison = listingAdvertisement.comparison ?? null;
  return {
    // 매물이 없는 광고는 광고에 적힌 거래유형을 쓴다
    transactionType:
      listingAdvertisement.listing?.transactionType ??
      listingAdvertisement.transactionType,
    advertisedPrice: listingAdvertisement.advertisedPrice,
    advertisedDeposit: listingAdvertisement.advertisedDeposit,
    advertisedMonthlyRent: listingAdvertisement.advertisedMonthlyRent,
    hasComparison: comparison != null,
    main: comparison?.mainAdvertisement ?? null,
    rows: comparison?.advertisements ?? [],
  };
}

export function analyzeOfficeAdvertisementComparison(
  listingAdvertisement: ListingAdvertisementWithListing,
): OfficeAdvertisementComparisonAnalysis {
  return analyzeAdvertisementComparison(toSubject(listingAdvertisement));
}

export function analyzeOfficeAdvertisementRow(
  listingAdvertisement: ListingAdvertisementWithListing,
  advertisement: OfficeAdvertisement,
): OfficeAdvertisementCompetitorAnalysis {
  return analyzeAdvertisementComparisonRow(
    toSubject(listingAdvertisement),
    advertisement,
  );
}
