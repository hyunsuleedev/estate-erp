import type {
  ListingAdvertisementWithListing,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  ApiError,
  analyzeOfficeAdvertisementComparison,
  analyzeOfficeAdvertisementRow,
} from "@estate-erp/api-client";
import { formatDate, formatMoney, formatRent } from "@/lib/format";
import { getAdChannelLabel } from "@/lib/advertisement-channels";
import { PROPERTY_TABLE_PILL_TONES } from "./my-ads-pill";
import type { AnalysisSignal } from "./my-ads-types";

export function getCanonicalLocation(advertisement: ListingAdvertisementWithListing) {
  const property = advertisement.listing?.property;
  const unit = property?.unit;
  return {
    site: property?.site?.name ?? "단지 미상",
    dong: unit?.dong?.name ?? null,
    floor: unit?.floor != null ? `${unit.floor}층` : null,
    ho: unit?.name ?? null,
    type: unit?.siteUnitType?.name ?? null,
  };
}

export function advertisementPriceLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const transactionType = advertisement.listing?.transactionType;
  if (transactionType === "monthly") {
    return formatRent(
      advertisement.advertisedDeposit,
      advertisement.advertisedMonthlyRent,
    );
  }
  if (transactionType === "jeonse") {
    return formatMoney(advertisement.advertisedDeposit);
  }
  return formatMoney(advertisement.advertisedPrice);
}

export function advertisementPrimaryAmountLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const transactionType = advertisement.listing?.transactionType;
  return formatMoney(
    transactionType === "monthly" || transactionType === "jeonse"
      ? advertisement.advertisedDeposit
      : advertisement.advertisedPrice,
  );
}

export function advertisementMonthlyRentLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  if (advertisement.listing?.transactionType !== "monthly") return "—";
  return formatMoney(advertisement.advertisedMonthlyRent);
}

export function observedAdvertisementPriceLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  const context = advertisement.actionContext;
  if (!context) return "—";
  if (advertisement.listing?.transactionType === "monthly") {
    return formatRent(context.deposit, context.monthlyRent);
  }
  if (advertisement.listing?.transactionType === "jeonse") {
    return formatMoney(context.deposit);
  }
  return formatMoney(context.price);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "요청을 처리하지 못했습니다.";
}

/**
 * 광고 채널(CP사) 이름. 내광고관리의 표·필터·펼침 패널·다이얼로그가 모두 이 함수를 쓴다.
 * 이름은 매물관리와 같은 네이버 제휴사 목록(lib/advertisement-channels)을 따른다(esiljang = 이실장플러스).
 */
export function cpChannelLabel(channel: string): string {
  return getAdChannelLabel(channel);
}

export function formatYmd(value: string | null | undefined): string | null {
  if (!value || value.length !== 8) return null;
  return `${value.slice(2, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

export function compactAdvertisementDate(value: string | null | undefined): string {
  const formatted = formatDate(value);
  return formatted === "—" ? formatted : formatted.slice(2);
}

export function verificationMethodPresentation(code: string): {
  label: string;
  className: string;
} {
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("OWNER")) {
    return {
      label: "소유자 확인",
      className: PROPERTY_TABLE_PILL_TONES.success,
    };
  }
  if (normalized.startsWith("NDOC") || normalized.includes("DOCUMENT")) {
    return {
      label: "홍보확인서",
      className: PROPERTY_TABLE_PILL_TONES.violet,
    };
  }
  if (normalized.includes("PHONE")) {
    return {
      label: "전화 확인",
      className: PROPERTY_TABLE_PILL_TONES.info,
    };
  }
  if (normalized.includes("AGENT")) {
    return {
      label: "중개사 확인",
      className: PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  return {
    label: code,
    className: PROPERTY_TABLE_PILL_TONES.neutral,
  };
}

export function primaryAmount(
  advertisement: ListingAdvertisementWithListing,
  amounts: { price: number | null; deposit: number | null },
): number | null {
  if (
    advertisement.listing?.transactionType === "monthly" ||
    advertisement.listing?.transactionType === "jeonse"
  ) {
    return amounts.deposit;
  }
  return amounts.price;
}

export function getAnalysisSignal(
  advertisement: ListingAdvertisementWithListing,
): AnalysisSignal {
  if (!advertisement.naverArticleNo || !advertisement.naverUrl) {
    return {
      kind: "naver_link_pending",
      tone: "warning",
      label: "네이버 링크 대기",
      detail: "최근 CP 읽기 결과에서 네이버 광고 링크를 확인하지 못했습니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  if (comparison.primarySignal === "comparison_pending") {
    return {
      kind: "comparison_pending",
      tone: "warning",
      label: "네이버 비교 대기",
      detail: "네이버 광고 링크를 읽어 현재 중복과 순위를 확인해야 합니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "own_ad_inactive") {
    return {
      kind: "own_ad_inactive",
      tone: "warning",
      label: "내 광고 미노출",
      detail:
        "CP 광고는 활성 상태지만 네이버 비교에서 내 광고가 현재 게재 중인 것으로 확인되지 않았습니다.",
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "floor_exposure_disadvantage") {
    const aheadDetail =
      comparison.exactFloorAheadCount > 0
        ? ` 그중 ${comparison.exactFloorAheadCount}건이 내 광고보다 앞서 있습니다.`
        : "";
    return {
      kind: "floor_exposure",
      tone: "warning",
      label: "층 노출 불리",
      detail: `내 광고는 ${floorExposureLabel(
        comparison.ownFloorInfo,
        comparison.ownFloorExposureMode,
      )}이고, 정확한 층을 공개한 경쟁 광고가 ${comparison.exactFloorCompetitorCount}건 있습니다.${aheadDetail}`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "lower_price_competitor") {
    const gapDetail =
      comparison.priceGapAgainstLowest != null
        ? ` 최저 광고는 ${formatMoney(comparison.priceGapAgainstLowest)} 낮습니다.`
        : " 월세는 보증금과 월세를 함께 비교했습니다.";
    const rankDetail =
      comparison.lowerPricedAheadCount > 0
        ? ` 그중 ${comparison.lowerPricedAheadCount}건이 내 광고보다 앞서 있습니다.`
        : " 더 싼 광고는 현재 내 광고보다 뒤에 있습니다.";
    return {
      kind: "price",
      tone: "warning",
      label: "더 싼 광고 있음",
      detail: `내 광고보다 가격 조건이 낮은 광고가 ${comparison.lowerPricedCompetitorCount}건 있습니다.${gapDetail}${rankDetail}`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.primarySignal === "rank_disadvantage") {
    return {
      kind: "rank",
      tone: "warning",
      label: `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위`,
      detail: `앞선 광고가 ${comparison.aheadCount}건 있습니다. 더 낮은 가격이 직접 원인으로 확인되지 않아 층 노출과 광고 확인 조건을 함께 살펴보세요.`,
      className: PROPERTY_TABLE_PILL_TONES.warning,
    };
  }

  if (comparison.higherPricedAheadCount > 0) {
    return {
      kind: "complete",
      tone: "normal",
      label: "가격 외 요인",
      detail: `내 광고보다 비싼 광고 ${comparison.higherPricedAheadCount}건이 앞서 있습니다. 가격 인하보다 층 노출과 광고 확인 조건을 먼저 확인하세요.`,
      className: PROPERTY_TABLE_PILL_TONES.info,
    };
  }
  return {
    kind: "complete",
    tone: "normal",
    label: "특이사항 없음",
    detail: "현재 순위·가격·층 노출에서 바로 검토할 불리한 조건이 없습니다.",
    className: PROPERTY_TABLE_PILL_TONES.success,
  };
}

export function competitorRowPresentation(
  analysis: ReturnType<typeof analyzeOfficeAdvertisementRow>,
): { label: string; className: string } {
  if (analysis.priceRelation === "mine") {
    return { label: "내 광고", className: PROPERTY_TABLE_PILL_TONES.info };
  }
  const prefix = analysis.isAhead ? "앞섬 · " : "";
  if (analysis.priceRelation === "lower") {
    return {
      label: `${prefix}더 낮음`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.danger
        : PROPERTY_TABLE_PILL_TONES.warning,
    };
  }
  if (analysis.priceRelation === "higher") {
    return {
      label: `${prefix}더 높음`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.info
        : PROPERTY_TABLE_PILL_TONES.success,
    };
  }
  if (analysis.priceRelation === "same") {
    return {
      label: `${prefix}동일`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.warning
        : PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  if (analysis.priceRelation === "incomparable") {
    return {
      label: `${prefix}조건 다름`,
      className: analysis.isAhead
        ? PROPERTY_TABLE_PILL_TONES.warning
        : PROPERTY_TABLE_PILL_TONES.neutral,
    };
  }
  // 가격을 비교할 수 없어도 앞선 광고라는 사실은 남긴다. 중개사 칸의 "앞섬" 표시를 이 칸으로 모았다.
  return {
    label: `${prefix}비교 불가`,
    className: analysis.isAhead
      ? PROPERTY_TABLE_PILL_TONES.warning
      : PROPERTY_TABLE_PILL_TONES.neutral,
  };
}

export function floorExposureLabel(
  floorInfo: string | null,
  mode: OfficeAdvertisement["floorExposureMode"],
): string {
  if (mode === "exact") return `${floorInfo ?? "층 정보"} · 정확한 층 공개`;
  if (mode === "band") return `${floorInfo ?? "층 정보"} · 구간만 공개`;
  return floorInfo ? `${floorInfo} · 방식 미확인` : "확인되지 않음";
}

export function floorExposureDescription(advertisement: OfficeAdvertisement): string {
  return floorExposureLabel(
    advertisement.floorInfo,
    advertisement.floorExposureMode,
  );
}
