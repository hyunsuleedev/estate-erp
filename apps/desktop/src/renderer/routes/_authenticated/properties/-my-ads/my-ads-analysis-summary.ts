import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { getCachedComparison } from "./my-ads-format";

/**
 * 펼침 패널(my-ads-analysis-panel.tsx)의 높이(px). 1280·1600 폭에서 잰 값이다:
 * 비교 표 위쪽(제목·판단·지표·표 머리) 299 + 비교 표 한 줄 37(줄이 없으면 빈 줄 하나) + 메모 한 줄 24.
 * 가상 스크롤의 첫 추정값으로만 쓰고, 실제 높이는 그린 뒤 잰다.
 */
export const MY_ADS_ANALYSIS_PANEL_LAYOUT = {
  chromeHeight: 299,
  rowHeight: 37,
  memoHeight: 24,
} as const;

/** 펼침 패널 비교 표의 줄(내 광고 포함, 노출 중인 광고만). */
function activeComparedAdvertisements(
  advertisement: ListingAdvertisementWithListing,
) {
  return (advertisement.comparison?.advertisements ?? []).filter(
    (comparedAdvertisement) => comparedAdvertisement.isActive,
  );
}

export function estimateMyAdsAnalysisPanelHeight(
  advertisement: ListingAdvertisementWithListing,
): number {
  const { chromeHeight, rowHeight, memoHeight } = MY_ADS_ANALYSIS_PANEL_LAYOUT;
  const rows = activeComparedAdvertisements(advertisement).length;
  const hasMemo = Boolean(advertisement.memo);
  return chromeHeight + rowHeight * Math.max(1, rows) + (hasMemo ? memoHeight : 0);
}

export type MyAdsAnalysisPanelSummary = {
  /** 네이버 비교 결과(묶음·대표 광고)가 저장돼 있는가. 없으면 가격·순위를 판단하지 않는다. */
  hasComparison: boolean;
  /** "노출 순위" 아래 줄 */
  rankingDetail: string;
  /** "내 광고가" 아래 줄 */
  priceDetail: string;
  /** 판단 아래 "가격 경쟁" */
  priceCompetition: string;
  /** 비교 표의 경쟁 광고 수(내 광고 줄은 세지 않는다) */
  competitorCount: number;
};

const NO_COMPARISON_TEXT = "네이버 비교 전이라 판단할 수 없음";

/**
 * 펼침 패널의 가격·순위 문구. 비교 결과가 없거나 내 순위를 모르면 "없음"이라고
 * 단정하지 않는다 — "앞선 광고"는 내 순위를 알아야 셀 수 있다.
 */
export function myAdsAnalysisPanelSummary(
  advertisement: ListingAdvertisementWithListing,
): MyAdsAnalysisPanelSummary {
  const group = advertisement.comparison;
  const hasComparison = Boolean(group && group.ownAdvertisement);
  const competitorCount = activeComparedAdvertisements(advertisement).filter(
    (comparedAdvertisement) => !comparedAdvertisement.isMine,
  ).length;
  if (!hasComparison) {
    return {
      hasComparison,
      rankingDetail: "네이버 비교 전",
      priceDetail: NO_COMPARISON_TEXT,
      priceCompetition: NO_COMPARISON_TEXT,
      competitorCount,
    };
  }

  const comparison = getCachedComparison(advertisement);
  const lower = comparison.lowerPricedCompetitorCount;
  if (comparison.ownRanking == null) {
    // 경쟁 광고 가격은 비교할 수 있지만, 그 광고가 내 광고보다 앞서는지는 모른다.
    return {
      hasComparison,
      rankingDetail: "순위 미확인",
      priceDetail:
        lower > 0 ? `더 낮은 비교 광고 ${lower}건 · 순위 미확인` : "더 낮은 비교 광고 없음",
      priceCompetition:
        lower > 0
          ? `더 낮은 광고 ${lower}건 · 앞섬 여부는 순위 확인 후`
          : "더 낮은 광고 없음 · 앞섬 여부는 순위 확인 후",
      competitorCount,
    };
  }

  return {
    hasComparison,
    rankingDetail:
      comparison.aheadCount > 0
        ? `앞선 광고 ${comparison.aheadCount}건`
        : "앞선 광고 없음",
    priceDetail:
      comparison.lowerPricedAheadCount > 0
        ? `더 낮고 앞선 광고 ${comparison.lowerPricedAheadCount}건`
        : lower > 0
          ? "더 낮은 광고는 현재 뒤에 있음"
          : "더 낮은 비교 광고 없음",
    priceCompetition:
      comparison.lowerPricedAheadCount > 0
        ? `더 낮고 앞선 광고 ${comparison.lowerPricedAheadCount}건`
        : comparison.higherPricedAheadCount > 0
          ? `더 비싸지만 앞선 광고 ${comparison.higherPricedAheadCount}건`
          : "가격 조건으로 앞선 광고 없음",
    competitorCount,
  };
}
