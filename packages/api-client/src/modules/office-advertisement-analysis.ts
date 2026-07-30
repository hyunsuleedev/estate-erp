import {
  OfficeAdvertisementFloorExposureMode,
  inferOfficeAdvertisementFloorExposureMode,
  type OfficeAdvertisementFloorExposureMode as FloorExposureMode,
} from '@estate-erp/shared';
import type { ListingAdvertisementWithListing } from './listing-advertisements.js';
import type { OfficeAdvertisement } from './office-advertisements.js';

export type OfficeAdvertisementPriceRelation =
  | 'mine'
  | 'lower'
  | 'same'
  | 'higher'
  | 'incomparable'
  | 'unknown';

export type OfficeAdvertisementPrimarySignal =
  | 'comparison_pending'
  | 'own_ad_inactive'
  | 'floor_exposure_disadvantage'
  | 'lower_price_competitor'
  | 'rank_disadvantage'
  | 'competitive';

export interface OfficeAdvertisementCompetitorAnalysis {
  advertisement: OfficeAdvertisement;
  isAhead: boolean;
  priceRelation: OfficeAdvertisementPriceRelation;
  hasExactFloorExposure: boolean;
}

export interface OfficeAdvertisementComparisonAnalysis {
  primarySignal: OfficeAdvertisementPrimarySignal;
  hasReviewSignal: boolean;
  ownRanking: number | null;
  totalCount: number | null;
  positionRatio: number | null;
  aheadCount: number;
  ownFloorInfo: string | null;
  ownFloorExposureMode: FloorExposureMode;
  exactFloorCompetitorCount: number;
  exactFloorAheadCount: number;
  lowerPricedCompetitorCount: number;
  lowerPricedAheadCount: number;
  higherPricedAheadCount: number;
  lowestPricedCompetitorAmount: number | null;
  priceGapAgainstLowest: number | null;
  rankDisadvantaged: boolean;
  competitors: OfficeAdvertisementCompetitorAnalysis[];
}

type Terms = {
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

export function analyzeOfficeAdvertisementComparison(
  listingAdvertisement: ListingAdvertisementWithListing,
): OfficeAdvertisementComparisonAnalysis {
  const group = listingAdvertisement.officeAdvertisementGroup;
  const main = group?.mainAdvertisement ?? null;
  const activeRows = (group?.advertisements ?? []).filter(
    (advertisement) => advertisement.isActive,
  );
  const competitors = activeRows.filter(
    (advertisement) => !advertisement.isMine,
  );
  const ownTerms = main
    ? termsFromAdvertisement(main)
    : {
        price: listingAdvertisement.advertisedPrice,
        deposit: listingAdvertisement.advertisedDeposit,
        monthlyRent: listingAdvertisement.advertisedMonthlyRent,
      };
  const transactionType =
    listingAdvertisement.listing?.transactionType ?? 'sale';
  const ownRanking = main?.ranking ?? null;
  const analyzedCompetitors = competitors
    .map((advertisement) => ({
      advertisement,
      isAhead:
        ownRanking != null &&
        advertisement.ranking != null &&
        advertisement.ranking < ownRanking,
      priceRelation: compareTerms(
        transactionType,
        ownTerms,
        termsFromAdvertisement(advertisement),
      ),
      hasExactFloorExposure:
        exposureMode(advertisement) ===
        OfficeAdvertisementFloorExposureMode.EXACT,
    }))
    .sort(
      (left, right) =>
        (left.advertisement.ranking ?? Number.MAX_SAFE_INTEGER) -
        (right.advertisement.ranking ?? Number.MAX_SAFE_INTEGER),
    );

  const totalCount = comparisonTotalCount(main, activeRows);
  const positionRatio =
    ownRanking != null && totalCount != null && totalCount > 0
      ? ownRanking / totalCount
      : null;
  const ahead = analyzedCompetitors.filter((competitor) => competitor.isAhead);
  const exactFloorCompetitors = analyzedCompetitors.filter(
    (competitor) => competitor.hasExactFloorExposure,
  );
  const lowerPricedCompetitors = analyzedCompetitors.filter(
    (competitor) => competitor.priceRelation === 'lower',
  );
  const lowerPricedAhead = lowerPricedCompetitors.filter(
    (competitor) => competitor.isAhead,
  );
  const higherPricedAheadCount = ahead.filter(
    (competitor) => competitor.priceRelation === 'higher',
  ).length;
  const ownFloorExposureMode = main
    ? exposureMode(main)
    : OfficeAdvertisementFloorExposureMode.UNKNOWN;
  const floorExposureDisadvantage =
    ownFloorExposureMode === OfficeAdvertisementFloorExposureMode.BAND &&
    exactFloorCompetitors.length > 0;
  const rankDisadvantaged =
    ownRanking != null &&
    ahead.length > 0 &&
    ownRanking > 3 &&
    (positionRatio == null ? ownRanking > 10 : positionRatio > 0.5);
  const lowestPricedCompetitorAmount =
    transactionType === 'monthly'
      ? null
      : minComparableAmount(transactionType, lowerPricedCompetitors);
  const ownComparableAmount =
    transactionType === 'monthly'
      ? null
      : primaryTermsAmount(transactionType, ownTerms);
  const priceGapAgainstLowest =
    ownComparableAmount != null && lowestPricedCompetitorAmount != null
      ? ownComparableAmount - lowestPricedCompetitorAmount
      : null;

  let primarySignal: OfficeAdvertisementPrimarySignal = 'competitive';
  if (!group || !main) {
    primarySignal = 'comparison_pending';
  } else if (!main.isActive) {
    primarySignal = 'own_ad_inactive';
  } else if (lowerPricedCompetitors.length > 0) {
    primarySignal = 'lower_price_competitor';
  } else if (floorExposureDisadvantage) {
    primarySignal = 'floor_exposure_disadvantage';
  } else if (ownRanking == null) {
    primarySignal = 'comparison_pending';
  } else if (rankDisadvantaged) {
    primarySignal = 'rank_disadvantage';
  }

  return {
    primarySignal,
    hasReviewSignal: [
      'own_ad_inactive',
      'floor_exposure_disadvantage',
      'lower_price_competitor',
      'rank_disadvantage',
    ].includes(primarySignal),
    ownRanking,
    totalCount,
    positionRatio,
    aheadCount: ahead.length,
    ownFloorInfo: main?.floorInfo ?? null,
    ownFloorExposureMode,
    exactFloorCompetitorCount: exactFloorCompetitors.length,
    exactFloorAheadCount: exactFloorCompetitors.filter(
      (competitor) => competitor.isAhead,
    ).length,
    lowerPricedCompetitorCount: lowerPricedCompetitors.length,
    lowerPricedAheadCount: lowerPricedAhead.length,
    higherPricedAheadCount,
    lowestPricedCompetitorAmount,
    priceGapAgainstLowest,
    rankDisadvantaged,
    competitors: analyzedCompetitors,
  };
}

export function analyzeOfficeAdvertisementRow(
  listingAdvertisement: ListingAdvertisementWithListing,
  advertisement: OfficeAdvertisement,
): OfficeAdvertisementCompetitorAnalysis {
  if (advertisement.isMine) {
    return {
      advertisement,
      isAhead: false,
      priceRelation: 'mine',
      hasExactFloorExposure:
        exposureMode(advertisement) ===
        OfficeAdvertisementFloorExposureMode.EXACT,
    };
  }
  const main = listingAdvertisement.officeAdvertisementGroup?.mainAdvertisement;
  const ownTerms = main
    ? termsFromAdvertisement(main)
    : {
        price: listingAdvertisement.advertisedPrice,
        deposit: listingAdvertisement.advertisedDeposit,
        monthlyRent: listingAdvertisement.advertisedMonthlyRent,
      };
  const ownRanking = main?.ranking ?? null;
  return {
    advertisement,
    isAhead:
      ownRanking != null &&
      advertisement.ranking != null &&
      advertisement.ranking < ownRanking,
    priceRelation: compareTerms(
      listingAdvertisement.listing?.transactionType ?? 'sale',
      ownTerms,
      termsFromAdvertisement(advertisement),
    ),
    hasExactFloorExposure:
      exposureMode(advertisement) ===
      OfficeAdvertisementFloorExposureMode.EXACT,
  };
}

function exposureMode(
  advertisement: Pick<
    OfficeAdvertisement,
    'floorInfo' | 'floorExposureMode'
  >,
): FloorExposureMode {
  if (
    advertisement.floorExposureMode ===
      OfficeAdvertisementFloorExposureMode.EXACT ||
    advertisement.floorExposureMode ===
      OfficeAdvertisementFloorExposureMode.BAND
  ) {
    return advertisement.floorExposureMode;
  }
  return inferOfficeAdvertisementFloorExposureMode(advertisement.floorInfo);
}

function termsFromAdvertisement(
  advertisement: Pick<
    OfficeAdvertisement,
    'price' | 'deposit' | 'monthlyRent'
  >,
): Terms {
  return {
    price: advertisement.price,
    deposit: advertisement.deposit,
    monthlyRent: advertisement.monthlyRent,
  };
}

function compareTerms(
  transactionType: string,
  own: Terms,
  compared: Terms,
): OfficeAdvertisementPriceRelation {
  if (transactionType === 'monthly') {
    if (
      own.deposit == null ||
      own.monthlyRent == null ||
      compared.deposit == null ||
      compared.monthlyRent == null
    ) {
      return 'unknown';
    }
    const depositDelta = compared.deposit - own.deposit;
    const rentDelta = compared.monthlyRent - own.monthlyRent;
    if (depositDelta === 0 && rentDelta === 0) return 'same';
    if (depositDelta <= 0 && rentDelta <= 0) return 'lower';
    if (depositDelta >= 0 && rentDelta >= 0) return 'higher';
    return 'incomparable';
  }

  const ownAmount = primaryTermsAmount(transactionType, own);
  const comparedAmount = primaryTermsAmount(transactionType, compared);
  if (ownAmount == null || comparedAmount == null) return 'unknown';
  if (comparedAmount === ownAmount) return 'same';
  return comparedAmount < ownAmount ? 'lower' : 'higher';
}

function primaryTermsAmount(
  transactionType: string,
  terms: Terms,
): number | null {
  return transactionType === 'jeonse'
    ? (terms.deposit ?? terms.price)
    : terms.price;
}

function comparisonTotalCount(
  main: OfficeAdvertisement | null,
  rows: OfficeAdvertisement[],
): number | null {
  const candidates = [
    main?.sameAddrCnt ?? 0,
    rows.length,
    ...rows.map((advertisement) => advertisement.ranking ?? 0),
  ].filter((value) => value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function minComparableAmount(
  transactionType: string,
  competitors: OfficeAdvertisementCompetitorAnalysis[],
): number | null {
  const amounts = competitors
    .map((competitor) =>
      primaryTermsAmount(
        transactionType,
        termsFromAdvertisement(competitor.advertisement),
      ),
    )
    .filter((amount): amount is number => amount != null);
  return amounts.length > 0 ? Math.min(...amounts) : null;
}
