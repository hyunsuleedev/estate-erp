import { formatFloorRange, formatUnitName } from "@estate-erp/shared";
import type {
  AdvertisementChangeRequest,
  AdvertisementLinkLevel,
  ListingAdvertisementWithListing,
} from "@estate-erp/api-client";
import { formatMoney } from "@/lib/format";

/**
 * 광고가 우리 데이터의 어디까지 이어졌는지와, 걸려 있는 변경 요청을 읽는 함수들.
 *
 * 광고는 매물 없이도 저장된다(에이전트가 CP에서 읽어 온 그대로). 이어진 만큼만 우리 데이터를 쓰고
 * 나머지는 CP가 적은 글(raw*)을 보여 준다 — 이어지지 않은 광고도 어느 집인지 사람이 알아볼 수 있게.
 */

/** 매물이 있으면 매물의 것, 없으면 광고에 직접 걸린 관리 공간 */
export function advertisementPlace(advertisement: ListingAdvertisementWithListing) {
  return advertisement.listing?.property ?? advertisement.property ?? null;
}

export function advertisementSite(advertisement: ListingAdvertisementWithListing) {
  return advertisementPlace(advertisement)?.site ?? advertisement.site ?? null;
}

/** 거래유형. 매물이 없는 광고는 광고에 적힌 값을 쓴다 */
export function advertisementTransactionType(
  advertisement: ListingAdvertisementWithListing,
): string | null {
  return (
    advertisement.listing?.transactionType ??
    advertisement.transactionType ??
    null
  );
}

export function advertisementLinkLevel(
  advertisement: ListingAdvertisementWithListing,
): AdvertisementLinkLevel {
  if (advertisement.linkLevel) return advertisement.linkLevel;
  if (advertisement.listingId) return "listing";
  if (advertisement.propertyId) return "property";
  if (advertisement.siteId) return "site";
  return "none";
}

/** 표의 "매물" 칸 글. 어디서 끊겼는지를 말한다 */
export const ADVERTISEMENT_LINK_LABELS: Record<AdvertisementLinkLevel, string> = {
  listing: "연결됨",
  property: "매물 없음",
  site: "호실 못 찾음",
  none: "건물 못 찾음",
};

export const ADVERTISEMENT_LINK_DETAILS: Record<AdvertisementLinkLevel, string> = {
  listing: "이 광고의 매물이 등록되어 있습니다.",
  property: "호실까지 찾았지만 이 조건의 매물이 등록되어 있지 않습니다.",
  site: "건물까지 찾았지만 호실을 찾지 못했습니다.",
  none: "우리 데이터에서 건물을 찾지 못했습니다.",
};

export function isAdvertisementUnlinked(
  advertisement: ListingAdvertisementWithListing,
): boolean {
  return advertisementLinkLevel(advertisement) !== "listing";
}

/** CP가 적은 위치 글을 한 줄로. 빈 칸은 뺀다 */
export function advertisementRawLocationLabel(
  advertisement: ListingAdvertisementWithListing,
): string {
  return [
    advertisement.rawSiteName,
    advertisement.rawDong,
    advertisement.rawFloorText,
    advertisement.rawHo,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export type AdvertisementLocation = {
  site: string;
  dong: string | null;
  floor: string | null;
  ho: string | null;
  type: string | null;
  /** 단지 이름이 우리 데이터가 아니라 CP 글에서 왔다 */
  isSiteFromAd: boolean;
  /** 동 · 층 · 호가 우리 데이터가 아니라 CP 글에서 왔다 */
  isUnitFromAd: boolean;
};

export function advertisementLocation(
  advertisement: ListingAdvertisementWithListing,
): AdvertisementLocation {
  const place = advertisementPlace(advertisement);
  const site = advertisementSite(advertisement);
  const unit = place?.unit ?? null;
  const rawSite =
    advertisement.rawSiteName?.trim() ||
    advertisement.rawRoadAddress?.trim() ||
    advertisement.rawJibunAddress?.trim() ||
    null;
  // 관리 공간까지 이어졌으면 동 · 층 · 호는 우리 데이터만 쓴다. CP 글과 섞어 한 줄을 만들지 않는다.
  if (place) {
    return {
      site: site?.name ?? rawSite ?? "단지 미상",
      dong: unit?.dong?.name ?? null,
      floor: unit ? formatFloorRange(unit) || null : null,
      ho: formatUnitName(unit) || null,
      type: unit?.siteUnitType?.name ?? null,
      isSiteFromAd: !site,
      isUnitFromAd: false,
    };
  }
  return {
    site: site?.name ?? rawSite ?? "단지 미상",
    dong: advertisement.rawDong?.trim() || null,
    floor: advertisement.rawFloorText?.trim() || null,
    ho: advertisement.rawHo?.trim() || null,
    type: null,
    isSiteFromAd: !site,
    isUnitFromAd: true,
  };
}

const OPEN_TASK_STATUSES = new Set(["pending", "in_progress"]);

/** 아직 처리되지 않은 변경 요청 (업무가 대기 · 진행 중) */
export function pendingChangeRequests(
  advertisement: ListingAdvertisementWithListing,
): AdvertisementChangeRequest[] {
  return (advertisement.changeRequests ?? []).filter((request) =>
    OPEN_TASK_STATUSES.has(request.task?.status ?? ""),
  );
}

function amountOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function floorExposureLabel(value: unknown): string {
  if (value === "exact") return "층 노출";
  if (value === "band") return "층 미노출";
  return "미확인";
}

/** 요청 한 건을 짧게: "32억 → 31.5억", "층 미노출 → 층 노출", "재광고", "광고 내리기" */
export function changeRequestSummary(request: AdvertisementChangeRequest): string {
  const from = request.fromValue ?? {};
  const to = request.toValue ?? {};
  if (request.kind === "price") {
    const parts: string[] = [];
    for (const [key, label] of [
      ["price", ""],
      ["deposit", ""],
      ["monthlyRent", "월 "],
    ] as const) {
      const wanted = amountOf(to[key]);
      if (wanted == null) continue;
      const current = amountOf(from[key]);
      parts.push(
        `${label}${current == null ? "—" : formatMoney(current)} → ${formatMoney(wanted)}`,
      );
    }
    return parts.join(", ") || "가격 변경";
  }
  if (request.kind === "floor_exposure") {
    return `${floorExposureLabel(from.floorExposure)} → ${floorExposureLabel(to.floorExposure)}`;
  }
  if (request.kind === "readvertise") return "재광고";
  return "광고 내리기";
}
