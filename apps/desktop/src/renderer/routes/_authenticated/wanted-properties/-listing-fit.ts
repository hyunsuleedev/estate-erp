import type { BuyerRequirement, Listing, ListingsFilter } from '@estate-erp/api-client';
import { sqmToPyeong } from '@estate-erp/shared';
import { getListingAvailability } from '@/lib/listing-status';

/*
 * 손님의 희망 조건과 매물 하나를 견준다. 매물 연결 창이 "조건에 맞는 매물"을 고르고,
 * 매물마다 무엇이 맞고 무엇이 다른지 한 줄로 보여 줄 때 쓴다.
 * 저장하지 않는 계산 값이다. 손님이 정하지 않은 조건은 견주지 않는다.
 */

type FitRequirement = Pick<
  BuyerRequirement,
  | 'transactionType'
  | 'priceMin'
  | 'priceMax'
  | 'depositMin'
  | 'depositMax'
  | 'monthlyRentMin'
  | 'monthlyRentMax'
  | 'areaMin'
  | 'areaMax'
  | 'siteTypes'
  | 'preferredSites'
  | 'preferredRegions'
>;

export interface FitCheck {
  key: 'transactionType' | 'price' | 'area' | 'place' | 'siteType';
  label: string;
  /** true 맞음, false 다름, null 매물에 값이 없어 알 수 없음 */
  ok: boolean | null;
}

/** 매물의 공급면적(m²). 호실 값이 먼저이고, 없으면 평형 카탈로그 값 */
export function getListingSupplyArea(listing: Listing): number | null {
  const unit = listing.property?.unit;
  const raw = unit?.supplyAreaM2 ?? unit?.siteUnitType?.supplyAreaM2;
  // 서버는 Decimal을 글("155.27")로 보낸다
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 매물 단지의 법정동 코드. 서버는 보내지만 api-client의 Listing 타입에는 아직 없다. */
export function getListingWardCode(listing: Listing): string | null {
  const site = listing.property?.site as { wardCode?: string | null } | undefined;
  return site?.wardCode ?? null;
}

function inRange(
  value: number | null | undefined,
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): boolean | null {
  if (value == null) return null;
  if (min != null && value < Number(min)) return false;
  if (max != null && value > Number(max)) return false;
  return true;
}

function hasRange(min: unknown, max: unknown) {
  return min != null || max != null;
}

/** 손님이 고른 지역 · 단지 안의 매물인지. 지역은 법정동 코드 앞자리가 상위 지역이다. */
function matchesPlace(listing: Listing, requirement: FitRequirement): boolean | null {
  const sites = requirement.preferredSites ?? [];
  const regions = requirement.preferredRegions ?? [];
  if (sites.length === 0 && regions.length === 0) return null;
  const siteId = listing.property?.siteId;
  if (siteId && sites.some((site) => site.siteId === siteId)) return true;
  const wardCode = getListingWardCode(listing);
  if (!wardCode) return sites.length > 0 ? false : null;
  return regions.some((region) => {
    const code = region.wardCode ?? region.districtCode ?? region.provinceCode;
    return Boolean(code) && wardCode.startsWith(code as string);
  });
}

export function computeListingFit(listing: Listing, requirement: FitRequirement): FitCheck[] {
  const checks: FitCheck[] = [];
  if (requirement.transactionType) {
    checks.push({
      key: 'transactionType',
      label: '거래유형',
      ok: listing.transactionType === requirement.transactionType,
    });
  }
  if (requirement.transactionType === 'monthly') {
    if (
      hasRange(requirement.depositMin, requirement.depositMax) ||
      hasRange(requirement.monthlyRentMin, requirement.monthlyRentMax)
    ) {
      const deposit = hasRange(requirement.depositMin, requirement.depositMax)
        ? inRange(listing.deposit, requirement.depositMin, requirement.depositMax)
        : true;
      const rent = hasRange(requirement.monthlyRentMin, requirement.monthlyRentMax)
        ? inRange(listing.monthlyRent, requirement.monthlyRentMin, requirement.monthlyRentMax)
        : true;
      checks.push({
        key: 'price',
        label: '예산',
        ok: deposit === null || rent === null ? null : deposit && rent,
      });
    }
  } else if (hasRange(requirement.priceMin, requirement.priceMax)) {
    checks.push({
      key: 'price',
      label: '예산',
      ok: inRange(listing.price, requirement.priceMin, requirement.priceMax),
    });
  }
  if (hasRange(requirement.areaMin, requirement.areaMax)) {
    const area = getListingSupplyArea(listing);
    // 화면에 보이는 평으로 견준다. "30평대"를 고른 손님에게 39.9평이 빠지지 않게.
    checks.push({
      key: 'area',
      label: '평형',
      ok:
        area === null
          ? null
          : inRange(
              sqmToPyeong(area),
              requirement.areaMin == null ? null : sqmToPyeong(Number(requirement.areaMin)),
              requirement.areaMax == null ? null : sqmToPyeong(Number(requirement.areaMax)),
            ),
    });
  }
  const place = matchesPlace(listing, requirement);
  if (place !== null || (requirement.preferredSites ?? []).length > 0 || (requirement.preferredRegions ?? []).length > 0) {
    checks.push({ key: 'place', label: '지역·단지', ok: place });
  }
  if ((requirement.siteTypes ?? []).length > 0) {
    const type = listing.property?.site?.type;
    checks.push({
      key: 'siteType',
      label: '매물 유형',
      ok: type ? requirement.siteTypes.includes(type) : null,
    });
  }
  return checks;
}

/**
 * 같은 집(같은 매물 의뢰)의 다른 거래 조건에 진행 중인 거래가 있는지. 한 의뢰에는 거래가 하나뿐이라
 * 있으면 이 매물로는 거래를 만들 수 없다 (예: 전세가 가계약 중인 집의 매매 조건).
 */
export function hasSiblingOccupyingDeal(listing: Listing): boolean {
  return (listing.property?.listings ?? []).some(
    (sibling) =>
      sibling.id !== listing.id &&
      sibling.intakeId === listing.intakeId &&
      (sibling.deals ?? []).length > 0,
  );
}

/**
 * 지금 권해도 거래로 넘길 수 없는 매물이면 그 까닭("거래 중" · "보류" · "종료"), 아니면 null.
 * 추천 목록에서 조건이 다 맞아도 맨 아래로 내리고 흐리게 보인다 (2026-11-22 관통 검수:
 * 거래 중인 매물이 "조건 100% 맞음"으로 맨 위에 나왔다).
 */
export function getListingUnavailableLabel(listing: Listing): string | null {
  const availability = getListingAvailability(listing);
  if (availability === 'in_contract' || hasSiblingOccupyingDeal(listing)) return '거래 중';
  if (availability === 'paused') return '보류';
  if (availability === 'closed') return '종료';
  return null;
}

/** 맞는 조건이 많을수록 앞에 둔다 (다름 -2, 모름 -1) */
export function scoreListingFit(checks: FitCheck[]): number {
  return checks.reduce((score, check) => score + (check.ok === false ? -2 : check.ok === null ? -1 : 0), 0);
}

/**
 * "조건에 맞는 매물"을 서버에 물을 때의 조건: 거래유형 · 금액 · 평형.
 * 지역 · 단지는 여러 개를 고를 수 있어 서버에 한 번에 묻지 못하므로, 받아 온 뒤 화면에서 견준다.
 */
export function buildRecommendationFilter(requirement: FitRequirement): ListingsFilter {
  const filter: ListingsFilter = { limit: 50, sortBy: 'createdAt', sortOrder: 'desc' };
  if (requirement.transactionType) filter.transactionType = requirement.transactionType;
  if (requirement.transactionType === 'monthly') {
    if (requirement.depositMin != null) filter.depositMin = requirement.depositMin;
    if (requirement.depositMax != null) filter.depositMax = requirement.depositMax;
    if (requirement.monthlyRentMin != null) filter.monthlyRentMin = requirement.monthlyRentMin;
    if (requirement.monthlyRentMax != null) filter.monthlyRentMax = requirement.monthlyRentMax;
  } else {
    if (requirement.priceMin != null) filter.priceMin = requirement.priceMin;
    if (requirement.priceMax != null) filter.priceMax = requirement.priceMax;
  }
  if (requirement.areaMin != null) filter.areaMin = Number(requirement.areaMin);
  if (requirement.areaMax != null) filter.areaMax = Number(requirement.areaMax);
  return filter;
}

/** 조건 한 줄: "예산 맞음 · 평형 다름". 다른 것만 따로 알 수 있게 나눠 돌려준다. */
export function describeFit(checks: FitCheck[]) {
  return checks
    .filter((check) => check.key !== 'transactionType' || check.ok === false)
    .map((check) => ({
      key: check.key,
      text: `${check.label} ${check.ok === true ? '맞음' : check.ok === false ? '다름' : '정보 없음'}`,
      ok: check.ok,
    }));
}
