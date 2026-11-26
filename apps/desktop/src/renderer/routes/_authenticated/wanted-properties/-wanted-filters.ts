import type {
  BuyerRequirementFilterOptions,
  BuyerRequirementsFilter,
} from '@estate-erp/api-client';

/*
 * 희망 조건 필터. 거르는 것은 서버가 한다(GET /buyer-requirements) — 이 파일은 화면의 선택을
 * 서버 조건으로 옮기고 선택지를 만든다. 범위는 겹치면 걸린다: 고객이 값을 정하지 않은 쪽은 걸리지 않는다.
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
  /**
   * `region:<법정동 코드>` 또는 `site:<단지 id>`. 지역은 고른 곳과 그 아래를 원하는 손님만 걸린다
   * (강동구를 고르면 고덕동 손님은 걸리고, 서울 전체 손님은 걸리지 않는다 — 서버가 판정한다).
   */
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

/**
 * 값이 걸린 필터의 수. 필터 줄에 파란 알약으로 보이는 개수와 같다
 * (입주 희망일은 시작일 · 종료일이 한 알약이다). 필터 줄을 접었을 때 도구 줄이 이 수를 보여 준다.
 */
export function countRequirementFilters(filters: RequirementFilters): number {
  return [
    filters.statuses.length > 0,
    filters.locations.length > 0,
    filters.siteTypes.length > 0,
    filters.budget !== null,
    filters.monthlyRent !== null,
    filters.area !== null,
    filters.assignees.length > 0,
    filters.urgencies.length > 0,
    filters.moveInFrom !== '' || filters.moveInTo !== '',
  ].filter(Boolean).length;
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

/** 평 → m² (화면 표시와 같은 환산: 평 = m² × 0.3025, 소수 첫째 자리까지) */
const PYEONG_PER_SQM_X10 = 3.025;

/**
 * 화면의 선택을 서버 조건으로 옮긴다. 걸릴 수 있는 조건이 하나도 없으면 null
 * ("내 손님"을 켠 채 담당자 필터에서 다른 사람만 고른 경우) — 그때는 요청하지 않는다.
 */
export function toWantedListFilter({
  search,
  stageFilters,
  transactionType,
  filters,
  mineUserId,
}: {
  search: string;
  stageFilters: string[];
  transactionType: string;
  filters: RequirementFilters;
  /** "내 손님"을 켰을 때의 내 id */
  mineUserId: string | null;
}): Omit<BuyerRequirementsFilter, 'page' | 'limit'> | null {
  let assignees = filters.assignees;
  if (mineUserId) {
    if (assignees.length > 0 && !assignees.includes(mineUserId)) return null;
    assignees = [mineUserId];
  }

  const query: Omit<BuyerRequirementsFilter, 'page' | 'limit'> = {
    // 완료한 조건은 평소에는 받지 않는다. 상태 필터에서 고른 것만 받는다
    status: filters.statuses.length > 0 ? filters.statuses.join(',') : OPEN_STATUSES,
  };
  const text = search.trim();
  if (text) {
    query.search = text;
    query.searchMatches = true;
  }
  if (stageFilters.length > 0) query.matchStages = stageFilters.join(',');
  if (transactionType) query.transactionType = transactionType;
  if (filters.locations.length > 0) query.locations = filters.locations.join(',');
  if (filters.siteTypes.length > 0) query.siteTypes = filters.siteTypes.join(',');
  if (assignees.length > 0) query.assignedToId = assignees.join(',');
  if (filters.urgencies.length > 0) query.urgency = filters.urgencies.join(',');

  if (filters.budget) {
    // 억 → 만원
    if (filters.budget.min !== null) query.budgetMin = filters.budget.min * 10000;
    if (filters.budget.max !== null) query.budgetMax = filters.budget.max * 10000;
  }
  if (filters.monthlyRent) {
    // 월세 금액은 월세 조건에만 뜻이 있다 (매매 조건의 빈 월세 칸이 걸리지 않게)
    query.transactionType = 'monthly';
    if (filters.monthlyRent.min !== null) query.monthlyRentMin = filters.monthlyRent.min;
    if (filters.monthlyRent.max !== null) query.monthlyRentMax = filters.monthlyRent.max;
  }
  if (filters.area) {
    // 서버는 m²로 견준다. 화면에 `40평`으로 보이는 조건이 `40평`에서 빠지지 않게,
    // 화면의 반올림(소수 첫째 자리)으로 그 평수가 되는 m²의 끝까지 넓혀 보낸다. 면적은 소수 둘째 자리까지 저장된다.
    if (filters.area.min !== null) {
      query.areaMin = Math.ceil(((filters.area.min * 10 - 0.5) / PYEONG_PER_SQM_X10) * 100) / 100;
    }
    if (filters.area.max !== null) {
      query.areaMax =
        (Math.ceil(((filters.area.max * 10 + 0.5) / PYEONG_PER_SQM_X10) * 100) - 1) / 100;
    }
  }
  // 날의 경계는 한국 시각이다. 입주일을 정하지 않은 조건은 기간 안에 있다고 볼 수 없어 서버가 뺀다
  if (filters.moveInFrom) query.moveInAfter = `${filters.moveInFrom}T00:00:00+09:00`;
  if (filters.moveInTo) query.moveInBefore = `${filters.moveInTo}T23:59:59.999+09:00`;
  return query;
}

const OPEN_STATUSES = 'active,hold';

/** 필터 선택지를 받을 범위: 지금 목록이 보여 주는 상태들 */
export function getFilterOptionsStatus(filters: RequirementFilters): string {
  return filters.statuses.includes('completed') ? `${OPEN_STATUSES},completed` : OPEN_STATUSES;
}

/** 선택지는 실제 조건에 등록된 지역·단지만 보여준다. 골라도 결과가 없는 항목을 만들지 않기 위해서다. */
export function getLocationFilterOptions(options: BuyerRequirementFilterOptions | undefined) {
  const byLabel = (left: { label: string }, right: { label: string }) =>
    left.label.localeCompare(right.label, 'ko');
  return [
    ...(options?.regions ?? [])
      .map((region) => ({ value: `region:${region.code}`, label: region.name, meta: '지역' }))
      .sort(byLabel),
    ...(options?.sites ?? [])
      .map((site) => ({ value: `site:${site.id}`, label: site.name, meta: '단지' }))
      .sort(byLabel),
  ];
}

/**
 * 지금 고를 수 없는 값을 필터에서 뺀다. 조건이 완료·삭제되어 목록에서 빠지면
 * 그 조건에만 있던 단지·담당자가 선택에 남아, 선택지에도 없는 값 때문에 목록이 비어 버린다.
 * 원래 선택은 그대로 두므로 그 값이 다시 생기면 다시 적용된다.
 * 선택지를 아직 받지 못했으면(undefined) 아무것도 빼지 않는다.
 */
export function scopeRequirementFilters(
  filters: RequirementFilters,
  options: BuyerRequirementFilterOptions | undefined,
): RequirementFilters {
  if (!options) return filters;
  const locations = new Set(getLocationFilterOptions(options).map((option) => option.value));
  const assignees = new Set(getAssigneeFilterOptions(options).map((option) => option.value));
  const scoped = {
    locations: filters.locations.filter((value) => locations.has(value)),
    assignees: filters.assignees.filter((value) => assignees.has(value)),
  };
  // 빠진 것이 없으면 같은 객체를 돌려준다 (조회 조건이 괜히 바뀌어 다시 받지 않게)
  return scoped.locations.length === filters.locations.length &&
    scoped.assignees.length === filters.assignees.length
    ? filters
    : { ...filters, ...scoped };
}

export function getAssigneeFilterOptions(options: BuyerRequirementFilterOptions | undefined) {
  return [
    ...(options?.assignees ?? [])
      .map((assignee) => ({ value: assignee.id, label: assignee.name }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ko')),
    ...(options?.hasUnassigned ? [{ value: NO_ASSIGNEE, label: '담당자 없음' }] : []),
  ];
}
