import type { SortingState } from "@tanstack/react-table";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { analyzeOfficeAdvertisementComparison } from "@estate-erp/api-client";
import {
  cpChannelLabel,
  getCanonicalLocation,
  primaryAmount,
  verificationMethodPresentation,
} from "./my-ads-format";
import type { AdvertisementSortValue } from "./my-ads-types";

/** "20261115" → 그날 0시(이 컴퓨터 시간대)의 시각. 형식이 틀리거나 없는 날이면 null. */
export function ymdToTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

function isoToTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * "확인일" 칸의 값. 네이버 매물 확인일(YYYYMMDD)이 있으면 그 날, 없으면 ERP가 마지막으로
 * 네이버와 비교한 시각이다. 두 형식을 같은 기준(ms)으로 바꿔 화면 표시와 정렬에 함께 쓴다.
 */
export function advertisementCheckedAtTime(
  advertisement: Pick<ListingAdvertisementWithListing, "lastCheckedAt"> & {
    officeAdvertisementGroup?: {
      mainAdvertisement?: { articleConfirmYmd?: string | null } | null;
    } | null;
  },
): number | null {
  return (
    ymdToTime(
      advertisement.officeAdvertisementGroup?.mainAdvertisement
        ?.articleConfirmYmd,
    ) ?? isoToTime(advertisement.lastCheckedAt)
  );
}

export function sortAdvertisements(
  advertisements: ListingAdvertisementWithListing[],
  sorting: SortingState,
): ListingAdvertisementWithListing[] {
  const sort = sorting[0];
  if (!sort) return advertisements;

  return [...advertisements].sort((left, right) => {
    const leftValue = advertisementSortValue(left, sort.id);
    const rightValue = advertisementSortValue(right, sort.id);
    const direction = sort.desc ? -1 : 1;

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    // [등급, 크기] 튜플 — 등급을 먼저 비교하고 같을 때만 크기를 본다.
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      const tierDiff = leftValue[0] - rightValue[0];
      if (tierDiff !== 0) return tierDiff * direction;
      return (leftValue[1] - rightValue[1]) * direction;
    }
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * direction;
    }
    return (
      String(leftValue).localeCompare(String(rightValue), "ko", {
        numeric: true,
      }) * direction
    );
  });
}

function advertisementSortValue(
  advertisement: ListingAdvertisementWithListing,
  columnId: string,
): AdvertisementSortValue {
  const location = getCanonicalLocation(advertisement);
  switch (columnId) {
    case "site":
      return location.site;
    case "dong":
      return location.dong;
    case "floor":
      return Number.parseInt(location.floor ?? "", 10) || null;
    case "ho":
      return location.ho;
    case "type":
      return location.type;
    case "transaction":
      return advertisement.listing?.transactionType ?? null;
    case "price":
      return primaryAmount(advertisement, {
        price: advertisement.advertisedPrice,
        deposit: advertisement.advertisedDeposit,
      });
    case "monthlyRent":
      return advertisement.listing?.transactionType === "monthly"
        ? advertisement.advertisedMonthlyRent
        : null;
    case "channel":
      return cpChannelLabel(advertisement.channel);
    case "naver":
      return advertisement.naverArticleNo;
    case "verification": {
      const code =
        advertisement.officeAdvertisementGroup?.mainAdvertisement
          ?.verificationTypeCode;
      return code ? verificationMethodPresentation(code).label : null;
    }
    case "exposurePeriod":
      return (
        isoToTime(advertisement.startedAt) ?? isoToTime(advertisement.endedAt)
      );
    case "ranking":
      return (
        advertisement.officeAdvertisementGroup?.mainAdvertisement?.ranking ??
        null
      );
    case "floorExposure": {
      const main =
        advertisement.officeAdvertisementGroup?.mainAdvertisement ?? null;
      if (!main) return null;
      const comparison = analyzeOfficeAdvertisementComparison(advertisement);
      const disadvantage =
        comparison.ownFloorExposureMode === "band" &&
        comparison.exactFloorCompetitorCount > 0;
      const tier = disadvantage
        ? 3
        : comparison.ownFloorExposureMode === "exact"
          ? 2
          : comparison.ownFloorExposureMode === "band"
            ? 1
            : 0;
      return [tier, comparison.exactFloorCompetitorCount];
    }
    case "checkedAt":
      // "20261115"와 ISO 시각을 문자열로 섞어 비교하면 순서가 틀린다 — 같은 기준으로 바꾼다.
      return advertisementCheckedAtTime(advertisement);
    case "analysis": {
      // 서로 단위가 다른 경고를 합산하지 않고, 판단 우선순위와 각 경고
      // 내부의 크기를 튜플로 분리한다.
      //   4: CP 광고는 활성이나 네이버에서 내 광고 미노출
      //   3: 층 노출 불리
      //   2: 더 낮은 가격 조건의 광고가 존재
      //   1: 상대적 순위가 하위권
      //   0: 즉시 검토할 불리한 조건 없음
      const comparison = analyzeOfficeAdvertisementComparison(advertisement);
      if (comparison.primarySignal === "own_ad_inactive") {
        return [4, 0];
      }
      if (comparison.primarySignal === "floor_exposure_disadvantage") {
        return [3, comparison.exactFloorCompetitorCount];
      }
      if (comparison.primarySignal === "lower_price_competitor") {
        return [
          2,
          comparison.priceGapAgainstLowest ??
            comparison.lowerPricedCompetitorCount,
        ];
      }
      if (comparison.primarySignal === "rank_disadvantage") {
        return [
          1,
          Math.round((comparison.positionRatio ?? 0) * 10_000) +
            (comparison.ownRanking ?? 0),
        ];
      }
      if (comparison.primarySignal === "competitive") return [0, 0];
      return null;
    }
    default:
      return null;
  }
}
