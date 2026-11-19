import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { cpChannelLabel } from "./my-ads-format";

export type MyAdsView =
  | "all"
  | "unlinked"
  | "requested"
  | "comparison_pending"
  | "attention";

export const viewTabs: Array<{ value: MyAdsView; label: string }> = [
  { value: "all", label: "전체" },
  // 매물과 이어지지 않은 광고, 바꿔 달라고 요청해 두고 아직 처리되지 않은 광고
  { value: "unlinked", label: "연결 안 됨" },
  { value: "requested", label: "요청 중" },
  { value: "comparison_pending", label: "비교 대기" },
  { value: "attention", label: "검토 필요" },
];

export type MyAdsTransactionFilter = "all" | "sale" | "jeonse" | "monthly";
export type MyAdsChannelFilter = "all" | "esiljang" | "budongsanbank";
export type MyAdsVerificationFilter =
  | "all"
  | "owner"
  | "document"
  | "phone"
  | "agent"
  | "unknown";
export type MyAdsFloorExposureFilter =
  | "all"
  | "exact"
  | "band"
  | "disadvantage"
  | "unknown";
export type MyAdsExposurePeriodFilter =
  | "all"
  | "within_7_days"
  | "within_30_days"
  | "over_30_days"
  | "unknown";
export type MyAdsComparisonFilter =
  | "all"
  | "lower_price"
  | "floor_disadvantage"
  | "rank_disadvantage"
  | "own_inactive"
  | "pending"
  | "clear";

export type MyAdsFilterState = {
  siteIds: string[];
  dongSearch: string;
  unitSearch: string;
  transactionType: MyAdsTransactionFilter;
  channel: MyAdsChannelFilter;
  primaryAmountMin: string;
  primaryAmountMax: string;
  monthlyRentMin: string;
  monthlyRentMax: string;
  verification: MyAdsVerificationFilter;
  floorExposure: MyAdsFloorExposureFilter;
  exposurePeriod: MyAdsExposurePeriodFilter;
  comparison: MyAdsComparisonFilter;
};

export type MyAdsFilterOption = { value: string; label: string };

export const initialMyAdsFilters: MyAdsFilterState = {
  siteIds: [],
  dongSearch: "",
  unitSearch: "",
  transactionType: "all",
  channel: "all",
  primaryAmountMin: "",
  primaryAmountMax: "",
  monthlyRentMin: "",
  monthlyRentMax: "",
  verification: "all",
  floorExposure: "all",
  exposurePeriod: "all",
  comparison: "all",
};

export const transactionFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "거래 전체" },
  { value: "sale", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "monthly", label: "월세" },
];

export const channelFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "CP사 전체" },
  { value: "esiljang", label: cpChannelLabel("esiljang") },
  { value: "budongsanbank", label: cpChannelLabel("budongsanbank") },
];

export const verificationFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "검증방식 전체" },
  { value: "owner", label: "소유자 확인" },
  { value: "document", label: "홍보확인서" },
  { value: "phone", label: "전화 확인" },
  { value: "agent", label: "중개사 확인" },
  { value: "unknown", label: "미확인" },
];

export const floorExposureFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "층수노출 전체" },
  { value: "exact", label: "노출" },
  { value: "band", label: "미노출" },
  { value: "disadvantage", label: "노출 불리" },
  { value: "unknown", label: "미확인" },
];

export const exposurePeriodFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "노출기간 전체" },
  { value: "within_7_days", label: "7일 이내" },
  { value: "within_30_days", label: "8~30일" },
  { value: "over_30_days", label: "31일 이상" },
  { value: "unknown", label: "시작일 미확인" },
];

export const comparisonFilterOptions: MyAdsFilterOption[] = [
  { value: "all", label: "경쟁 대비 전체" },
  { value: "lower_price", label: "더 싼 광고 있음" },
  { value: "floor_disadvantage", label: "층 노출 불리" },
  { value: "rank_disadvantage", label: "순위 불리" },
  { value: "own_inactive", label: "내 광고 미노출" },
  { value: "pending", label: "비교 대기" },
  { value: "clear", label: "즉시 경고 없음" },
];

export type AnalysisSignal = {
  kind:
    | "naver_link_pending"
    | "comparison_pending"
    | "own_ad_inactive"
    | "floor_exposure"
    | "price"
    | "rank"
    | "complete";
  tone: "normal" | "warning";
  label: string;
  detail: string;
  className: string;
};

/** 정렬 키. [등급, 크기] 튜플은 등급 우선 비교를 뜻한다. */
export type AdvertisementSortValue = string | number | [number, number] | null;
