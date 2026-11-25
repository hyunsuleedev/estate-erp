import {
  advertisementSite,
  advertisementTransactionType,
  isAdvertisementUnlinked,
  pendingChangeRequests,
} from "./my-ads-link";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { analyzeOfficeAdvertisementComparison } from "@estate-erp/api-client";
import { formatMoney } from "@/lib/format";
import {
  formatNumericRangeLabel,
  MONTHLY_RENT_RANGE_MAX,
  MONTHLY_RENT_RANGE_MIN,
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
} from "../-components/numeric-range-filter";
import {
  getAnalysisSignal,
  getCachedComparison,
  getCanonicalLocation,
  primaryAmount,
  resolvedNaverUrl,
} from "./my-ads-format";
import type {
  MyAdsComparisonFilter,
  MyAdsExposurePeriodFilter,
  MyAdsFilterState,
  MyAdsVerificationFilter,
  MyAdsView,
} from "./my-ads-types";

function parseAmountFilterValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** 저장값은 만원 문자열, 범위 패널은 억 단위다. 비어 있으면 그쪽은 제한이 없다. */
export function amountFilterToEokRange(
  minValue: string,
  maxValue: string,
): [number, number] {
  const min = parseAmountFilterValue(minValue);
  const max = parseAmountFilterValue(maxValue);
  return [
    min == null ? PRICE_RANGE_MIN : min / 10000,
    max == null ? PRICE_RANGE_MAX : max / 10000,
  ];
}

export function monthlyRentFilterToRange(
  minValue: string,
  maxValue: string,
): [number, number] {
  return [
    parseAmountFilterValue(minValue) ?? MONTHLY_RENT_RANGE_MIN,
    parseAmountFilterValue(maxValue) ?? MONTHLY_RENT_RANGE_MAX,
  ];
}

export function myAdsAmountRangeSummary(minValue: string, maxValue: string): string {
  const min = parseAmountFilterValue(minValue);
  const max = parseAmountFilterValue(maxValue);
  if (min != null && max != null) {
    return `${formatMyAdsFilterAmount(min)}~${formatMyAdsFilterAmount(max)}`;
  }
  if (min != null) return `${formatMyAdsFilterAmount(min)} 이상`;
  if (max != null) return `${formatMyAdsFilterAmount(max)} 이하`;
  return "전체";
}

function formatMyAdsFilterAmount(value: number): string {
  return value === 0 ? "0" : formatMoney(value);
}

export function formatMonthlyRentFilterLabel(min: number, max: number) {
  return formatNumericRangeLabel(
    min,
    max,
    MONTHLY_RENT_RANGE_MIN,
    MONTHLY_RENT_RANGE_MAX,
    "만원",
    "전체 월세",
  );
}

/**
 * 월세 칩을 필터 줄에 보일까. 매물관리와 같은 규칙이다:
 * 거래 전체·월세일 때는 늘 보이고, 매매·전세일 때는 값이 남아 있어 지워야 할 때만 보인다.
 */
export function shouldShowMonthlyRentFilter(
  filters: Pick<
    MyAdsFilterState,
    "transactionType" | "monthlyRentMin" | "monthlyRentMax"
  >,
): boolean {
  return (
    filters.transactionType === "all" ||
    filters.transactionType === "monthly" ||
    filters.monthlyRentMin !== "" ||
    filters.monthlyRentMax !== ""
  );
}

export function myAdsTableFilterScopeKey(
  view: MyAdsView,
  search: string,
  filters: MyAdsFilterState,
): string {
  return JSON.stringify([view, search, filters]);
}

/**
 * 보이는 광고를 줄이는 조건(보기 탭·검색·필터)이 하나라도 걸려 있는가.
 * 정렬은 줄이지 않으므로 넣지 않는다 — 빈 목록 문구를 고를 때 쓴다.
 */
export function hasMyAdsNarrowingConditions(
  view: MyAdsView,
  search: string,
  filters: MyAdsFilterState,
): boolean {
  return (
    view !== "all" ||
    search.trim().length > 0 ||
    filters.siteIds.length > 0 ||
    filters.dongSearch.trim().length > 0 ||
    filters.unitSearch.trim().length > 0 ||
    filters.status !== "active" ||
    filters.transactionType !== "all" ||
    filters.channel !== "all" ||
    filters.cpAccountId !== "all" ||
    filters.primaryAmountMin !== "" ||
    filters.primaryAmountMax !== "" ||
    filters.monthlyRentMin !== "" ||
    filters.monthlyRentMax !== "" ||
    filters.verification !== "all" ||
    filters.floorExposure !== "all" ||
    filters.exposurePeriod !== "all" ||
    filters.comparison !== "all"
  );
}

export function advertisementMatchesFilters(
  advertisement: ListingAdvertisementWithListing,
  filters: MyAdsFilterState,
): boolean {
  const location = getCanonicalLocation(advertisement);
  const siteId = advertisementSite(advertisement)?.id ?? null;

  if (filters.status !== "all" && advertisement.status !== filters.status) {
    return false;
  }
  if (filters.siteIds.length > 0 && !filters.siteIds.includes(siteId ?? "")) {
    return false;
  }
  if (
    filters.dongSearch.trim() &&
    !normalizeFilterToken(location.dong).includes(
      normalizeFilterToken(filters.dongSearch),
    )
  ) {
    return false;
  }
  if (
    filters.unitSearch.trim() &&
    !normalizeFilterToken(location.ho).includes(
      normalizeFilterToken(filters.unitSearch),
    )
  ) {
    return false;
  }
  if (
    filters.transactionType !== "all" &&
    advertisementTransactionType(advertisement) !== filters.transactionType
  ) {
    return false;
  }
  if (filters.channel !== "all" && advertisement.channel !== filters.channel) {
    return false;
  }
  if (
    filters.cpAccountId !== "all" &&
    advertisement.cpAccountId !== filters.cpAccountId
  ) {
    return false;
  }

  const primaryAdvertisementAmount = primaryAmount(advertisement, {
    price: advertisement.advertisedPrice,
    deposit: advertisement.advertisedDeposit,
  });
  if (
    !advertisementAmountMatchesRange(
      primaryAdvertisementAmount,
      filters.primaryAmountMin,
      filters.primaryAmountMax,
    )
  ) {
    return false;
  }
  if (
    !advertisementAmountMatchesRange(
      advertisementTransactionType(advertisement) === "monthly"
        ? advertisement.advertisedMonthlyRent
        : null,
      filters.monthlyRentMin,
      filters.monthlyRentMax,
    )
  ) {
    return false;
  }

  const own =
    advertisement.comparison?.ownAdvertisement ?? null;
  if (
    filters.verification !== "all" &&
    verificationMethodFilterKey(own?.verificationTypeCode ?? null) !==
      filters.verification
  ) {
    return false;
  }

  const comparison = getCachedComparison(advertisement);
  if (filters.floorExposure !== "all") {
    const mode = comparison.ownFloorExposureMode;
    const matchesFloorExposure =
      (filters.floorExposure === "exact" && mode === "exact") ||
      (filters.floorExposure === "band" && mode === "band") ||
      (filters.floorExposure === "unknown" && mode === "unknown") ||
      (filters.floorExposure === "disadvantage" &&
        mode === "band" &&
        comparison.exactFloorCompetitorCount > 0);
    if (!matchesFloorExposure) return false;
  }

  if (
    filters.exposurePeriod !== "all" &&
    advertisementExposurePeriodBucket(advertisement) !== filters.exposurePeriod
  ) {
    return false;
  }

  if (filters.comparison !== "all") {
    const comparisonFilter = advertisementComparisonFilterKey(
      advertisement,
      comparison.primarySignal,
    );
    if (comparisonFilter !== filters.comparison) return false;
  }

  return true;
}

function advertisementAmountMatchesRange(
  amount: number | null,
  minValue: string,
  maxValue: string,
): boolean {
  const min = parseAmountFilterValue(minValue);
  const max = parseAmountFilterValue(maxValue);
  if (min == null && max == null) return true;
  if (amount == null) return false;
  if (min != null && amount < min) return false;
  if (max != null && amount > max) return false;
  return true;
}

function normalizeFilterToken(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase("ko");
}

function verificationMethodFilterKey(
  code: string | null,
): Exclude<MyAdsVerificationFilter, "all"> {
  if (!code?.trim()) return "unknown";
  const normalized = code.trim().toUpperCase();
  if (normalized.startsWith("OWNER")) return "owner";
  if (normalized.startsWith("NDOC") || normalized.includes("DOCUMENT")) {
    return "document";
  }
  if (normalized.includes("PHONE")) return "phone";
  if (normalized.includes("AGENT")) return "agent";
  return "unknown";
}

/** 광고 시작일부터 종료일(진행 중이면 지금)까지 지난 날 수. 시작일을 모르면 null. */
export function advertisementExposureElapsedDays(
  advertisement: Pick<ListingAdvertisementWithListing, "startedAt" | "endedAt">,
  now: number = Date.now(),
): number | null {
  if (!advertisement.startedAt) return null;
  const startedAt = new Date(advertisement.startedAt).getTime();
  const endedAt = advertisement.endedAt
    ? new Date(advertisement.endedAt).getTime()
    : now;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return Math.max(0, Math.floor((endedAt - startedAt) / 86_400_000));
}

function advertisementExposurePeriodBucket(
  advertisement: ListingAdvertisementWithListing,
): Exclude<MyAdsExposurePeriodFilter, "all"> {
  const elapsedDays = advertisementExposureElapsedDays(advertisement);
  if (elapsedDays == null) return "unknown";
  if (elapsedDays <= 7) return "within_7_days";
  if (elapsedDays <= 30) return "within_30_days";
  return "over_30_days";
}

function advertisementComparisonFilterKey(
  advertisement: ListingAdvertisementWithListing,
  primarySignal: ReturnType<
    typeof getCachedComparison
  >["primarySignal"],
): Exclude<MyAdsComparisonFilter, "all"> {
  if (!advertisement.naverArticleNo || !resolvedNaverUrl(advertisement)) {
    return "pending";
  }
  const signalMap: Record<
    ReturnType<typeof getCachedComparison>["primarySignal"],
    Exclude<MyAdsComparisonFilter, "all">
  > = {
    comparison_pending: "pending",
    own_ad_inactive: "own_inactive",
    floor_exposure_disadvantage: "floor_disadvantage",
    lower_price_competitor: "lower_price",
    rank_disadvantage: "rank_disadvantage",
    competitive: "clear",
  };
  return signalMap[primarySignal];
}

export function advertisementMatchesView(
  advertisement: ListingAdvertisementWithListing,
  view: MyAdsView,
): boolean {
  if (view === "all") return true;
  if (view === "unlinked") return isAdvertisementUnlinked(advertisement);
  if (view === "requested") {
    return pendingChangeRequests(advertisement).length > 0;
  }

  const signal = getAnalysisSignal(advertisement);
  if (view === "comparison_pending") {
    return ["naver_link_pending", "comparison_pending"].includes(signal.kind);
  }
  return getCachedComparison(advertisement).hasReviewSignal;
}
