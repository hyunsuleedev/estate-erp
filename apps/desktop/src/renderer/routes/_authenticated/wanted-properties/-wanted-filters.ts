import type { BuyerRequirement } from '@estate-erp/api-client';
import { sqmToPyeong } from '@estate-erp/shared';

/*
 * 희망 조건 필터. 진행·보류 조건을 모두 받아 둔 뒤 화면에서 거른다.
 * 범위 판정은 서버 GET /buyer-requirements와 같다: 고객이 값을 정하지 않은 쪽은 걸리지 않는다.
 */

/** 단계 필터의 '매칭 없음' 항목. 단계는 매칭에 붙은 값이라 고객별 보기에서만 쓴다. */
export const NO_MATCH_STAGE = 'none';
const NO_ASSIGNEE = 'none';

/** 빈 쪽은 제한 없음. 양쪽 다 비면 필터가 아니므로 null로 둔다. */
export interface OpenRange {
  min: number | null;
  max: number | null;
}

export interface RequirementFilters {
  statuses: string[];
  /** `region:<법정동 코드>` 또는 `site:<단지 id>` */
  locations: string[];
  siteTypes: string[];
  /** 억 단위. 월세 조건은 보증금, 그 밖에는 매매가·전세가와 비교한다. */
  budget: OpenRange | null;
  /** 만원 단위 */
  monthlyRent: OpenRange | null;
  /** 평 단위 */
  area: OpenRange | null;
  assignees: string[];
  urgencies: string[];
  moveInFrom: string;
  moveInTo: string;
}

export const EMPTY_REQUIREMENT_FILTERS: RequirementFilters = {
  statuses: [],
  locations: [],
  siteTypes: [],
  budget: null,
  monthlyRent: null,
  area: null,
  assignees: [],
  urgencies: [],
  moveInFrom: '',
  moveInTo: '',
};

export function hasRequirementFilters(filters: RequirementFilters): boolean {
  return (
    filters.statuses.length > 0 ||
    filters.locations.length > 0 ||
    filters.siteTypes.length > 0 ||
    filters.budget !== null ||
    filters.monthlyRent !== null ||
    filters.area !== null ||
    filters.assignees.length > 0 ||
    filters.urgencies.length > 0 ||
    filters.moveInFrom !== '' ||
    filters.moveInTo !== ''
  );
}

/** 슬라이더 값을 필터로 바꾼다. 양 끝까지 잡으면 그쪽은 제한이 없다. */
export function toOpenRange(
  [min, max]: [number, number],
  rangeMin: number,
  rangeMax: number,
): OpenRange | null {
  const range = {
    min: min <= rangeMin ? null : min,
    max: max >= rangeMax ? null : max,
  };
  return range.min === null && range.max === null ? null : range;
}

export function toSliderRange(
  range: OpenRange | null,
  rangeMin: number,
  rangeMax: number,
): [number, number] {
  return [range?.min ?? rangeMin, range?.max ?? rangeMax];
}

function overlaps(
  valueMin: number | null,
  valueMax: number | null,
  filter: OpenRange,
): boolean {
  if (filter.min !== null && valueMax !== null && valueMax < filter.min) {
    return false;
  }
  if (filter.max !== null && valueMin !== null && valueMin > filter.max) {
    return false;
  }
  return true;
}

function scaleRange(range: OpenRange, factor: number): OpenRange {
  return {
    min: range.min === null ? null : range.min * factor,
    max: range.max === null ? null : range.max * factor,
  };
}

/** 화면 표시와 같은 환산을 쓴다. `40평`으로 보이는 조건이 `40평대`에서 빠지면 안 된다. */
function toDisplayedPyeong(value: number | string | null): number | null {
  return value === null ? null : sqmToPyeong(Number(value));
}

function getRegionCode(
  region: NonNullable<BuyerRequirement['preferredRegions']>[number],
): string | null {
  return region.wardCode ?? region.districtCode ?? region.provinceCode;
}

function matchesLocation(
  requirement: BuyerRequirement,
  selected: string[],
): boolean {
  const regionCodes = (requirement.preferredRegions ?? [])
    .map(getRegionCode)
    .filter((code): code is string => Boolean(code));
  const siteIds = (requirement.preferredSites ?? []).map((site) => site.siteId);

  return selected.some((value) => {
    if (value.startsWith('site:')) {
      return siteIds.includes(value.slice('site:'.length));
    }
    // 법정동 코드는 앞자리가 상위 지역이다. 강동구를 고르면 고덕동을 원하는 고객이,
    // 고덕동을 고르면 강동구 전체를 원하는 고객이 함께 걸린다.
    const code = value.slice('region:'.length);
    return regionCodes.some(
      (regionCode) => regionCode.startsWith(code) || code.startsWith(regionCode),
    );
  });
}

function toLocalDateKey(value: string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function matchesRequirementFilters(
  requirement: BuyerRequirement,
  filters: RequirementFilters,
): boolean {
  if (
    filters.statuses.length > 0 &&
    !filters.statuses.includes(requirement.status)
  ) {
    return false;
  }
  if (
    filters.locations.length > 0 &&
    !matchesLocation(requirement, filters.locations)
  ) {
    return false;
  }
  if (
    filters.siteTypes.length > 0 &&
    !filters.siteTypes.some((type) => requirement.siteTypes?.includes(type))
  ) {
    return false;
  }
  if (filters.budget) {
    const budget = scaleRange(filters.budget, 10000);
    const isMonthly = requirement.transactionType === 'monthly';
    const valueMin = isMonthly ? requirement.depositMin : requirement.priceMin;
    const valueMax = isMonthly ? requirement.depositMax : requirement.priceMax;
    if (!overlaps(valueMin, valueMax, budget)) return false;
  }
  if (filters.monthlyRent) {
    if (
      requirement.transactionType !== 'monthly' ||
      !overlaps(
        requirement.monthlyRentMin,
        requirement.monthlyRentMax,
        filters.monthlyRent,
      )
    ) {
      return false;
    }
  }
  if (
    filters.area &&
    !overlaps(
      toDisplayedPyeong(requirement.areaMin),
      toDisplayedPyeong(requirement.areaMax),
      filters.area,
    )
  ) {
    return false;
  }
  if (
    filters.assignees.length > 0 &&
    !filters.assignees.includes(requirement.assignedToId ?? NO_ASSIGNEE)
  ) {
    return false;
  }
  if (
    filters.urgencies.length > 0 &&
    !filters.urgencies.includes(requirement.urgency)
  ) {
    return false;
  }
  if (filters.moveInFrom || filters.moveInTo) {
    // 입주일을 정하지 않은 조건은 기간 안에 있다고 볼 수 없으므로 뺀다
    if (!requirement.moveInDate) return false;
    const moveIn = toLocalDateKey(requirement.moveInDate);
    if (filters.moveInFrom && moveIn < filters.moveInFrom) return false;
    if (filters.moveInTo && moveIn > filters.moveInTo) return false;
  }
  return true;
}

/** 선택지는 실제 조건에 등록된 지역·단지만 보여준다. 골라도 결과가 없는 항목을 만들지 않기 위해서다. */
export function getLocationFilterOptions(requirements: BuyerRequirement[]) {
  const regions = new Map<string, string>();
  const sites = new Map<string, string>();

  for (const requirement of requirements) {
    for (const region of requirement.preferredRegions ?? []) {
      const code = getRegionCode(region);
      const name =
        region.ward?.name ?? region.district?.name ?? region.province?.name;
      if (code && name) regions.set(code, name);
    }
    for (const site of requirement.preferredSites ?? []) {
      if (site.site?.name) sites.set(site.siteId, site.site.name);
    }
  }

  const byLabel = (left: { label: string }, right: { label: string }) =>
    left.label.localeCompare(right.label, 'ko');
  return [
    ...Array.from(regions, ([code, label]) => ({
      value: `region:${code}`,
      label,
      meta: '지역',
    })).sort(byLabel),
    ...Array.from(sites, ([id, label]) => ({
      value: `site:${id}`,
      label,
      meta: '단지',
    })).sort(byLabel),
  ];
}

/**
 * 지금 보기에서 고를 수 없는 값을 필터에서 뺀다. 단계별 보기에서 고른 완료 상태나
 * 완료된 조건에만 있는 단지·담당자가 고객별 보기에 남으면, 선택지에도 없는 값 때문에 목록이 비어 버린다.
 * 원래 선택은 그대로 두므로 단계별 보기로 돌아가면 다시 적용된다.
 */
export function scopeRequirementFilters(
  filters: RequirementFilters,
  requirements: BuyerRequirement[],
): RequirementFilters {
  const hasCompleted = requirements.some((item) => item.status === 'completed');
  const locations = new Set(
    getLocationFilterOptions(requirements).map((option) => option.value),
  );
  const assignees = new Set(
    getAssigneeFilterOptions(requirements).map((option) => option.value),
  );

  return {
    ...filters,
    statuses: hasCompleted
      ? filters.statuses
      : filters.statuses.filter((status) => status !== 'completed'),
    locations: filters.locations.filter((value) => locations.has(value)),
    assignees: filters.assignees.filter((value) => assignees.has(value)),
  };
}

export function getAssigneeFilterOptions(requirements: BuyerRequirement[]) {
  const assignees = new Map<string, string>();
  let hasUnassigned = false;

  for (const requirement of requirements) {
    if (!requirement.assignedToId) hasUnassigned = true;
    else if (requirement.assignedTo) {
      assignees.set(requirement.assignedToId, requirement.assignedTo.name);
    }
  }

  return [
    ...Array.from(assignees, ([value, label]) => ({ value, label })).sort(
      (left, right) => left.label.localeCompare(right.label, 'ko'),
    ),
    ...(hasUnassigned ? [{ value: NO_ASSIGNEE, label: '담당자 없음' }] : []),
  ];
}
