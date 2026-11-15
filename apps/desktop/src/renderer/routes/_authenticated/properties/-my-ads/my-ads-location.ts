import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { getCanonicalLocation } from "./my-ads-format";

/**
 * 스크린리더가 행을 구분해 읽을 위치 이름 — "래미안고덕 101동 1203호".
 * 동·호를 모르면 빼고, 단일 동 건물의 자리표시 동("-")도 읽지 않는다.
 */
export function advertisementLocationLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const location = getCanonicalLocation(advertisement);
  return [location.site, location.dong, location.ho]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part) && part !== "-")
    .join(" ");
}

/** 펼친 네이버 비교 패널의 id. 랭킹 버튼의 aria-controls가 가리킨다. */
export function myAdsAnalysisPanelId(advertisementId: string): string {
  return `my-ads-analysis-${advertisementId}`;
}
