import { formatPlaceLabel } from "@estate-erp/shared";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { advertisementLocation, advertisementPlace } from "./my-ads-link";

/**
 * 광고가 가리키는 집 이름 — "래미안고덕 101동 1203호" (STANDARDS: formatPlaceLabel).
 * 동·호를 모르면 빼고, 동 구분 없는 건물의 자리표시 동("-")도 붙이지 않는다.
 * 우리 호실까지 이어졌으면 우리 데이터로, 아니면 CP 글("102", "1001")을 같은 모양("102동 1001호")으로 만든다.
 * 행 이름(스크린리더), 옆 패널 제목, 펼침 패널 제목이 모두 이것을 쓴다.
 */
export function advertisementLocationLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const location = advertisementLocation(advertisement);
  const unit = advertisementPlace(advertisement)?.unit ?? null;
  if (!location.isUnitFromAd) {
    const dong = unit?.dong as { name?: string | null; isPlaceholder?: boolean | null } | null | undefined;
    return formatPlaceLabel({
      siteName: location.site,
      dongName: dong?.name,
      dongIsPlaceholder: dong?.isPlaceholder,
      unit,
    });
  }
  return formatPlaceLabel({
    siteName: location.site,
    dongName: location.dong,
    unit:
      location.ho || location.floor
        ? { name: location.ho, floorLabel: location.ho ? null : location.floor }
        : null,
  });
}

/** 옆 상세 패널의 id. 단지 칸의 "열기" 버튼의 aria-controls가 가리킨다. */
export const MY_ADS_INSPECTOR_ID = "my-ads-inspector";

/** 펼친 네이버 비교 패널의 id. 랭킹 버튼의 aria-controls가 가리킨다. */
export function myAdsAnalysisPanelId(advertisementId: string): string {
  return `my-ads-analysis-${advertisementId}`;
}
