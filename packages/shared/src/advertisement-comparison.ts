import {
  OfficeAdvertisementFloorExposureMode,
  inferOfficeAdvertisementFloorExposureMode,
} from './enums.js';

/**
 * 내 광고 한 건을 네이버의 같은 집 광고들과 견준 판단.
 *
 * 서버와 화면이 같은 규칙을 쓰도록 여기 둔다 — 서버는 비교를 저장할 때 이 판단을 기록하고
 * 직전 기록과 달라진 것을 알림으로 만들며, 화면은 받은 줄로 그때그때 같은 판단을 계산한다.
 * 두 곳이 따로 구현하면 화면의 "검토 필요"와 알림이 다른 기준이 된다.
 */

type FloorExposureMode = OfficeAdvertisementFloorExposureMode;

/** 네이버에 보이는 광고 한 줄에서 판단에 쓰는 칸 */
export interface ComparisonRowLike {
  isMine: boolean;
  isActive: boolean;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  ranking: number | null;
  sameAddrCnt: number | null;
  floorInfo: string | null;
  floorExposureMode: string;
}

/** 판단의 대상: 내 광고의 조건과 그 비교 목록 */
export interface ComparisonSubject<Row extends ComparisonRowLike = ComparisonRowLike> {
  /** sale | jeonse | monthly. 모르면 매매로 본다 */
  transactionType: string | null | undefined;
  /** 우리 기록의 광고 가격. 네이버에 내 광고 줄이 없을 때만 쓴다 */
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  /** 비교를 한 번이라도 읽었는가 */
  hasComparison: boolean;
  /** 비교 목록에서 "바로 이 내 광고"인 줄 (네이버 매물번호가 같은 줄) */
  main: Row | null;
  rows: Row[];
}

export type AdvertisementPriceRelation =
  | 'mine'
  | 'lower'
  | 'same'
  | 'higher'
  | 'incomparable'
  | 'unknown';

export type AdvertisementComparisonSignal =
  | 'comparison_pending'
  | 'own_ad_inactive'
  | 'floor_exposure_disadvantage'
  | 'lower_price_competitor'
  | 'rank_disadvantage'
  | 'competitive';

export interface AdvertisementCompetitorAnalysis<Row extends ComparisonRowLike = ComparisonRowLike> {
  advertisement: Row;
  isAhead: boolean;
  priceRelation: AdvertisementPriceRelation;
  hasExactFloorExposure: boolean;
}

export interface AdvertisementComparisonAnalysis<Row extends ComparisonRowLike = ComparisonRowLike> {
  primarySignal: AdvertisementComparisonSignal;
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
  competitors: AdvertisementCompetitorAnalysis<Row>[];
}

type Terms = {
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

export function analyzeAdvertisementComparison<Row extends ComparisonRowLike>(
  subject: ComparisonSubject<Row>,
): AdvertisementComparisonAnalysis<Row> {
  const main = subject.main;
  const activeRows = subject.rows.filter((advertisement) => advertisement.isActive);
  const competitors = activeRows.filter(
    (advertisement) => !advertisement.isMine,
  );
  const ownTerms = main
    ? termsFromAdvertisement(main)
    : {
        price: subject.advertisedPrice,
        deposit: subject.advertisedDeposit,
        monthlyRent: subject.advertisedMonthlyRent,
      };
  const transactionType = subject.transactionType ?? 'sale';
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

  let primarySignal: AdvertisementComparisonSignal = 'competitive';
  if (!subject.hasComparison || !main) {
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

export function analyzeAdvertisementComparisonRow<Row extends ComparisonRowLike>(
  subject: ComparisonSubject<Row>,
  advertisement: Row,
): AdvertisementCompetitorAnalysis<Row> {
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
  const main = subject.main;
  const ownTerms = main
    ? termsFromAdvertisement(main)
    : {
        price: subject.advertisedPrice,
        deposit: subject.advertisedDeposit,
        monthlyRent: subject.advertisedMonthlyRent,
      };
  const ownRanking = main?.ranking ?? null;
  return {
    advertisement,
    isAhead:
      ownRanking != null &&
      advertisement.ranking != null &&
      advertisement.ranking < ownRanking,
    priceRelation: compareTerms(
      subject.transactionType ?? 'sale',
      ownTerms,
      termsFromAdvertisement(advertisement),
    ),
    hasExactFloorExposure:
      exposureMode(advertisement) ===
      OfficeAdvertisementFloorExposureMode.EXACT,
  };
}

function exposureMode(
  advertisement: Pick<ComparisonRowLike, 'floorInfo' | 'floorExposureMode'>,
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
  advertisement: Pick<ComparisonRowLike, 'price' | 'deposit' | 'monthlyRent'>,
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
): AdvertisementPriceRelation {
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
  main: ComparisonRowLike | null,
  rows: ComparisonRowLike[],
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
  competitors: AdvertisementCompetitorAnalysis[],
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
