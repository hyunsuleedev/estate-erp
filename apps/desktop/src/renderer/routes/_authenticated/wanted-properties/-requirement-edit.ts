import type {
  BuyerRequirement,
  BuyerRequirementStatus,
  UpdateBuyerRequirementDto,
} from '@estate-erp/api-client';
import { pyeongToSqm, sqmToPyeong } from '@estate-erp/shared';
import { parseCellNumber } from '@/components/data-table/cell-edit-state';
import { parseManwon } from '@/lib/manwon';
import { normalizeBuyerStatus } from '@/lib/status-config';
import { toDateInputValue } from '../buyer-requirements/-buyer-utils';
import { siteTypeLabel } from './-match-view-utils';

/*
 * 고객별 표의 칸에서 희망 조건을 고칠 때 쓰는 값 변환과 검증.
 * 화면(-requirement-cells.tsx)과 떼어 두어 node:test로 확인한다.
 *
 * 매물관리 광고 칸(properties/-components/property-ad-cell-state.ts)과 같은 규칙이다:
 * - 고친 값만 보낸다. 바뀐 것이 없으면 null을 돌려주고 서버를 부르지 않는다.
 * - 받을 수 없는 입력은 사용자에게 보일 문장으로 Error를 던진다.
 */

/** 칸 하나를 고친 결과. 상태만 전용 경로(PATCH /buyer-requirements/:id/status)로 간다. */
export type RequirementChange =
  | { kind: 'update'; patch: UpdateBuyerRequirementDto }
  | { kind: 'status'; status: BuyerRequirementStatus };

function toUpdate(patch: UpdateBuyerRequirementDto): RequirementChange | null {
  return Object.keys(patch).length > 0 ? { kind: 'update', patch } : null;
}

// ── 상태 · 긴급도 ────────────────────────────────────────────────

export const REQUIREMENT_STATUSES: BuyerRequirementStatus[] = [
  'active',
  'hold',
  'completed',
];
export const REQUIREMENT_URGENCIES = ['urgent', 'normal', 'flexible'];

/** 예전 값(matched · inactive)은 화면에 보이는 값(활성 · 보류)으로 읽는다 */
export function currentStatus(requirement: Pick<BuyerRequirement, 'status'>) {
  return normalizeBuyerStatus(requirement.status) ?? requirement.status;
}

export function buildStatusChange(
  requirement: Pick<BuyerRequirement, 'status'>,
  value: string,
): RequirementChange | null {
  const status = REQUIREMENT_STATUSES.find((item) => item === value);
  if (!status) throw new Error('상태를 확인해 주세요.');
  return status === currentStatus(requirement) ? null : { kind: 'status', status };
}

export function buildUrgencyChange(
  requirement: Pick<BuyerRequirement, 'urgency'>,
  value: string,
): RequirementChange | null {
  if (!REQUIREMENT_URGENCIES.includes(value)) {
    throw new Error('긴급도를 확인해 주세요.');
  }
  return value === requirement.urgency ? null : toUpdate({ urgency: value });
}

// ── 매물 유형 ────────────────────────────────────────────────────

const SITE_TYPE_ORDER = Object.keys(siteTypeLabel);

/** 선택지 순서로 놓는다. 선택지에 없는 예전 값은 지우지 않고 뒤에 둔다. */
function orderSiteTypes(values: readonly string[]): string[] {
  const unique = Array.from(new Set(values));
  return [
    ...SITE_TYPE_ORDER.filter((type) => unique.includes(type)),
    ...unique.filter((type) => !SITE_TYPE_ORDER.includes(type)),
  ];
}

/** 고를 수 있는 유형. 이 조건에만 남아 있는 예전 값도 풀 수 있게 함께 보여 준다. */
export function getSiteTypeOptions(
  requirement: Pick<BuyerRequirement, 'siteTypes'>,
): { value: string; label: string }[] {
  return orderSiteTypes([...SITE_TYPE_ORDER, ...(requirement.siteTypes ?? [])]).map(
    (value) => ({ value, label: siteTypeLabel[value] ?? value }),
  );
}

export function buildSiteTypesChange(
  requirement: Pick<BuyerRequirement, 'siteTypes'>,
  selected: readonly string[],
): RequirementChange | null {
  const current = orderSiteTypes(requirement.siteTypes ?? []);
  const next = orderSiteTypes(selected);
  if (current.join('|') === next.join('|')) return null;
  return toUpdate({ siteTypes: next });
}

// ── 범위 입력 (금액 · 평형) ──────────────────────────────────────

export interface RangeDraft {
  min: string;
  max: string;
}

const EMPTY_RANGE = { min: null, max: null };
const MONEY_ERROR = "금액을 읽을 수 없습니다. '8억'·'8억 5천'·'85000'처럼 입력해 주세요.";

/**
 * 빈 칸과 0은 "제한 없음"(null)이다. 0을 그대로 저장하면 화면에는 값이 없는 것처럼 보이는데
 * 필터에서는 "0 이하"로 읽혀 목록에서 빠진다.
 */
function readAmount(raw: string, kind: 'money' | 'area'): number | null {
  if (kind === 'money') {
    // 금액은 앱 공용 규칙으로 읽는다: "8억" · "8억 5천" · "85,000" 모두 받는다 (lib/manwon.ts)
    const money = parseManwon(raw);
    if (!money.valid) throw new Error(MONEY_ERROR);
    return money.value === null || money.value === 0 ? null : money.value;
  }
  const parsed = parseCellNumber(raw, 0);
  if (!parsed.valid) throw new Error(parsed.error);
  if (parsed.value === null || parsed.value === 0) return null;
  return parsed.value;
}

function readRange(draft: RangeDraft, label: string, kind: 'money' | 'area') {
  const min = readAmount(draft.min, kind);
  const max = readAmount(draft.max, kind);
  if (min !== null && max !== null && min > max) {
    throw new Error(`${label}의 최소값이 최대값보다 큽니다.`);
  }
  return { min, max };
}

/** 저장된 0과 빈 값은 같은 것으로 본다. 그래야 열기만 한 칸이 "고친 칸"이 되지 않는다. */
function storedAmount(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}

function amountText(value: number | string | null | undefined): string {
  const amount = storedAmount(value);
  return amount === null ? '' : String(amount);
}

// ── 희망 평형 ────────────────────────────────────────────────────

function pyeongText(sqm: number | string | null | undefined): string {
  const area = storedAmount(sqm);
  return area === null || area < 0 ? '' : String(sqmToPyeong(area));
}

export function toAreaDraft(
  requirement: Pick<BuyerRequirement, 'areaMin' | 'areaMax'>,
): RangeDraft {
  return {
    min: pyeongText(requirement.areaMin),
    max: pyeongText(requirement.areaMax),
  };
}

/**
 * 화면에 보이는 평이 그대로면 저장된 m²를 건드리지 않는다.
 * 평 → m² 환산은 반올림이 끼므로, 고치지 않은 쪽까지 다시 계산하면 값이 조금씩 달라진다.
 */
function toStoredArea(
  pyeong: number | null,
  current: number | string | null | undefined,
): number | null {
  if (pyeong === null) return null;
  const stored = storedAmount(current);
  return stored !== null && sqmToPyeong(stored) === pyeong
    ? stored
    : pyeongToSqm(pyeong);
}

export function buildAreaChange(
  requirement: Pick<BuyerRequirement, 'areaMin' | 'areaMax'>,
  draft: RangeDraft,
): RequirementChange | null {
  const range = readRange(draft, '희망 평형', 'area');
  const patch: UpdateBuyerRequirementDto = {};
  const areaMin = toStoredArea(range.min, requirement.areaMin);
  const areaMax = toStoredArea(range.max, requirement.areaMax);
  if (areaMin !== storedAmount(requirement.areaMin)) patch.areaMin = areaMin;
  if (areaMax !== storedAmount(requirement.areaMax)) patch.areaMax = areaMax;
  return toUpdate(patch);
}

// ── 예산 (거래유형 + 금액) ───────────────────────────────────────

export type RequirementTransactionType = 'sale' | 'jeonse' | 'monthly';
export const REQUIREMENT_TRANSACTION_TYPES: RequirementTransactionType[] = [
  'sale',
  'jeonse',
  'monthly',
];

export interface BudgetDraft {
  /** '' = 아직 정하지 않음 */
  transactionType: RequirementTransactionType | '';
  /** 매매가 · 전세가 (만원) */
  price: RangeDraft;
  /** 월세 보증금 (만원) */
  deposit: RangeDraft;
  /** 월세 (만원) */
  monthlyRent: RangeDraft;
  /**
   * 금액을 고치는 사이 거래유형이 다른 곳에서 바뀌었을 때, 바뀐 지금 유형 (rebaseBudgetDraft가 넣는다).
   * 금액은 유형에 묶인 값이다: 매매가로 넣은 금액을 전세가로 저장해도, 월세 칸으로 바꿔 입력을 감춰도 안 된다.
   * 그래서 입력은 보던 유형 그대로 두고, 사용자가 유형을 다시 고를 때까지 저장을 막는다.
   */
  typeConflict?: RequirementTransactionType | '';
}

type BudgetFields = Pick<
  BuyerRequirement,
  | 'transactionType'
  | 'priceMin'
  | 'priceMax'
  | 'depositMin'
  | 'depositMax'
  | 'monthlyRentMin'
  | 'monthlyRentMax'
>;

export function toBudgetDraft(requirement: BudgetFields): BudgetDraft {
  return {
    transactionType:
      REQUIREMENT_TRANSACTION_TYPES.find(
        (type) => type === requirement.transactionType,
      ) ?? '',
    price: {
      min: amountText(requirement.priceMin),
      max: amountText(requirement.priceMax),
    },
    deposit: {
      min: amountText(requirement.depositMin),
      max: amountText(requirement.depositMax),
    },
    monthlyRent: {
      min: amountText(requirement.monthlyRentMin),
      max: amountText(requirement.monthlyRentMax),
    },
  };
}

/**
 * 예산 칸은 "매매 9억 ~ 10억"처럼 거래유형과 금액을 함께 보여 주므로 둘을 함께 고친다.
 * - 매매 · 전세는 priceMin/Max, 월세는 depositMin/Max와 monthlyRentMin/Max에 저장한다.
 * - 거래유형을 바꾸면 쓰지 않게 된 쪽 금액은 비운다 (조건 수정 화면과 같다).
 *   유형이 그대로면 화면에 없는 칸은 건드리지 않는다.
 */
export function buildBudgetChange(
  requirement: BudgetFields,
  draft: BudgetDraft,
): RequirementChange | null {
  if (draft.typeConflict !== undefined) {
    // 왜 막았는지는 편집기가 따로 알린다 (어느 유형으로 바뀌었는지)
    throw new Error('거래유형을 골라 주세요.');
  }
  const type = draft.transactionType;
  const monthly = type === 'monthly';
  const price = monthly
    ? EMPTY_RANGE
    : readRange(draft.price, type === 'jeonse' ? '전세가' : '매매가', 'money');
  const deposit = monthly ? readRange(draft.deposit, '보증금', 'money') : EMPTY_RANGE;
  const rent = monthly ? readRange(draft.monthlyRent, '월세', 'money') : EMPTY_RANGE;
  if (!type) {
    // 거래유형이 없으면 표가 "예산 협의"로만 보여 준다. 금액만 저장하면 보이지 않는 값이 남는다.
    // 이미 그렇게 저장돼 있던 조건은 열기만 해서는 막지 않는다 (비우는 것도 받는다).
    const edited =
      price.min !== storedAmount(requirement.priceMin) ||
      price.max !== storedAmount(requirement.priceMax);
    if (edited && (price.min !== null || price.max !== null)) {
      throw new Error('거래유형을 먼저 골라 주세요.');
    }
  }

  const typeChanged = type !== '' && type !== requirement.transactionType;
  const patch: UpdateBuyerRequirementDto = {};
  if (typeChanged) patch.transactionType = type;

  const next: Array<
    [Exclude<keyof BudgetFields, 'transactionType'>, number | null, boolean]
  > = [
    ['priceMin', price.min, !monthly],
    ['priceMax', price.max, !monthly],
    ['depositMin', deposit.min, monthly],
    ['depositMax', deposit.max, monthly],
    ['monthlyRentMin', rent.min, monthly],
    ['monthlyRentMax', rent.max, monthly],
  ];
  for (const [field, value, shown] of next) {
    if (!shown && !typeChanged) continue;
    if (value !== storedAmount(requirement[field])) patch[field] = value;
  }
  return toUpdate(patch);
}

// ── 입주 희망일 ──────────────────────────────────────────────────

function isDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * value는 날짜 입력칸의 값(yyyy-MM-dd). 조건 등록 화면과 같은 모양으로 보낸다.
 * 빈 칸은 "입주 희망일 없음"이다: 저장된 날짜가 있으면 비운다(null). 손님이 "아직 몰라요"로 바꾸는 일이 흔하다.
 */
export function buildMoveInDateChange(
  requirement: Pick<BuyerRequirement, 'moveInDate'>,
  value: string,
): RequirementChange | null {
  const date = value.trim();
  if (!date) return requirement.moveInDate ? toUpdate({ moveInDate: null }) : null;
  if (!isDateInput(date)) throw new Error('올바른 날짜를 입력해 주세요.');
  if (date === toDateInputValue(requirement.moveInDate)) return null;
  return toUpdate({ moveInDate: date });
}

// ── 고객 메모 ────────────────────────────────────────────────────

/** 앞뒤 공백만 다른 것은 같은 메모로 본다. 비우면 빈 글로 저장한다 (서버는 null을 받지 않는다). */
export function buildMemoChange(
  requirement: Pick<BuyerRequirement, 'memo'>,
  value: string,
): RequirementChange | null {
  const memo = value.trim();
  if (memo === (requirement.memo ?? '').trim()) return null;
  return toUpdate({ memo });
}

// ── 희망 지역 · 단지 ─────────────────────────────────────────────

export type PlaceRegionLevel = 'province' | 'district' | 'ward';

export interface PlaceRegion {
  level: PlaceRegionLevel;
  code: string;
  label: string;
}

export interface PlaceSite {
  siteId: string;
  name: string;
  /** 고객 상세에서 단지마다 적어 둔 메모. 이 칸에서는 보이지 않지만 저장할 때 잃지 않게 들고 다닌다. */
  memo?: string | null;
}

export interface PlacesDraft {
  regions: PlaceRegion[];
  sites: PlaceSite[];
}

type PlaceFields = Pick<BuyerRequirement, 'preferredRegions' | 'preferredSites'>;

export function toPlacesDraft(requirement: PlaceFields): PlacesDraft {
  const regions = (requirement.preferredRegions ?? []).flatMap(
    (region): PlaceRegion[] => {
      // 가장 좁은 단위가 그 줄의 뜻이다 (-wanted-filters.ts의 getRegionCode와 같은 순서)
      if (region.wardCode) {
        return [
          {
            level: 'ward',
            code: region.wardCode,
            label: region.ward?.name ?? region.wardCode,
          },
        ];
      }
      if (region.districtCode) {
        return [
          {
            level: 'district',
            code: region.districtCode,
            label: region.district?.name ?? region.districtCode,
          },
        ];
      }
      if (region.provinceCode) {
        return [
          {
            level: 'province',
            code: region.provinceCode,
            label: region.province?.name ?? region.provinceCode,
          },
        ];
      }
      return [];
    },
  );
  const sites = (requirement.preferredSites ?? []).map((preferred) => ({
    siteId: preferred.siteId,
    name: preferred.site?.name ?? '이름 없는 단지',
    memo: preferred.memo,
  }));
  return { regions, sites };
}

const regionKey = (region: PlaceRegion) => `${region.level}:${region.code}`;

export function addPlaceRegion(draft: PlacesDraft, region: PlaceRegion): PlacesDraft {
  if (draft.regions.some((item) => regionKey(item) === regionKey(region))) {
    return draft;
  }
  return { ...draft, regions: [...draft.regions, region] };
}

export function addPlaceSite(draft: PlacesDraft, site: PlaceSite): PlacesDraft {
  if (draft.sites.some((item) => item.siteId === site.siteId)) return draft;
  return { ...draft, sites: [...draft.sites, site] };
}

export function removePlaceRegion(draft: PlacesDraft, region: PlaceRegion): PlacesDraft {
  return {
    ...draft,
    regions: draft.regions.filter((item) => regionKey(item) !== regionKey(region)),
  };
}

export function removePlaceSite(draft: PlacesDraft, siteId: string): PlacesDraft {
  return { ...draft, sites: draft.sites.filter((item) => item.siteId !== siteId) };
}

/**
 * 서버는 지역 · 단지를 받은 목록으로 통째로 바꾼다. 그래서 바뀐 쪽만 보낸다:
 * 단지만 고쳤는데 지역까지 다시 쓰지 않는다.
 * 단지는 순서가 우선순위이고, 지역은 순서가 없어 같은 묶음이면 같은 것으로 본다.
 */
export function buildPlacesChange(
  requirement: PlaceFields,
  draft: PlacesDraft,
): RequirementChange | null {
  const current = toPlacesDraft(requirement);
  const patch: UpdateBuyerRequirementDto = {};

  const currentRegions = current.regions.map(regionKey).sort().join('|');
  const nextRegions = draft.regions.map(regionKey).sort().join('|');
  if (currentRegions !== nextRegions) {
    patch.preferredRegions = draft.regions.map((region) =>
      region.level === 'ward'
        ? { wardCode: region.code }
        : region.level === 'district'
          ? { districtCode: region.code }
          : { provinceCode: region.code },
    );
  }

  const currentSites = current.sites.map((site) => site.siteId).join('|');
  const nextSites = draft.sites.map((site) => site.siteId).join('|');
  if (currentSites !== nextSites) {
    patch.preferredSites = draft.sites.map((site, index) => ({
      siteId: site.siteId,
      priority: index + 1,
      ...(site.memo ? { memo: site.memo } : {}),
    }));
  }

  return toUpdate(patch);
}

// ── 편집기를 열어 둔 사이 조건이 새로 왔을 때 ────────────────────

/*
 * 편집기는 열 때의 값으로 초안을 만든다. 열어 둔 사이 목록이 새로 오면(다른 사람의 수정, 다시 받아 오기)
 * 초안의 손대지 않은 값은 예전 값이 된다. 그것을 지금 값과 견주면 "고친 값"으로 읽혀서,
 * 저장할 때 — 고친 채 바깥을 누르기만 해도 — 예전 값이 새 값을 덮는다.
 *
 * 그래서 초안을 지금 값 위에 다시 얹는다: 사용자가 손댄 값만 남기고 나머지는 지금 값을 따른다.
 * base는 초안을 만들 때(또는 마지막으로 고칠 때)의 조건, live는 지금 조건이다.
 * 다시 얹은 초안은 build…Change(live, draft)에 그대로 넣을 수 있다.
 */

/** 값 하나: 손대지 않았으면(초안이 예전 값 그대로면) 지금 값을 따른다 */
function keepEdited<T>(base: T, live: T, draft: T): T {
  return draft === base ? live : draft;
}

/**
 * 금액 · 평형 입력칸: 글자가 달라도 같은 수면 손대지 않은 것이다 ("120,000"과 "120000").
 * 글자로만 견주면 쉼표를 넣었을 뿐인 칸이 "고친 값"이 되어 새 값을 덮는다.
 */
function sameAmountText(left: string, right: string): boolean {
  if (left === right) return true;
  const a = parseCellNumber(left, 0);
  const b = parseCellNumber(right, 0);
  return a.valid && b.valid && (a.value || null) === (b.value || null);
}

function rebaseRange(base: RangeDraft, live: RangeDraft, draft: RangeDraft): RangeDraft {
  return {
    min: sameAmountText(draft.min, base.min) ? live.min : draft.min,
    max: sameAmountText(draft.max, base.max) ? live.max : draft.max,
  };
}

/** 목록: 사용자가 뺀 것은 지금 목록에서도 빼고, 더한 것은 지금 목록 뒤에 붙인다 */
function replayListEdits<T>(
  base: readonly T[],
  live: readonly T[],
  draft: readonly T[],
  key: (item: T) => string,
): T[] {
  const baseKeys = new Set(base.map(key));
  const draftKeys = new Set(draft.map(key));
  const liveKeys = new Set(live.map(key));
  return [
    ...live.filter((item) => !baseKeys.has(key(item)) || draftKeys.has(key(item))),
    ...draft.filter((item) => !baseKeys.has(key(item)) && !liveKeys.has(key(item))),
  ];
}

export function rebaseStatus(
  base: Pick<BuyerRequirement, 'status'>,
  live: Pick<BuyerRequirement, 'status'>,
  draft: string,
): string {
  return keepEdited<string>(currentStatus(base), currentStatus(live), draft);
}

export function rebaseUrgency(
  base: Pick<BuyerRequirement, 'urgency'>,
  live: Pick<BuyerRequirement, 'urgency'>,
  draft: string,
): string {
  return keepEdited(base.urgency, live.urgency, draft);
}

export function rebaseSiteTypes(
  base: Pick<BuyerRequirement, 'siteTypes'>,
  live: Pick<BuyerRequirement, 'siteTypes'>,
  draft: readonly string[],
): string[] {
  return replayListEdits(base.siteTypes ?? [], live.siteTypes ?? [], draft, (type) => type);
}

export function rebaseAreaDraft(
  base: Pick<BuyerRequirement, 'areaMin' | 'areaMax'>,
  live: Pick<BuyerRequirement, 'areaMin' | 'areaMax'>,
  draft: RangeDraft,
): RangeDraft {
  return rebaseRange(toAreaDraft(base), toAreaDraft(live), draft);
}

/**
 * 금액은 칸마다 다시 얹는다(손댄 금액만 남긴다). 거래유형은 따로 다룬다:
 * - 사용자가 유형을 직접 골랐으면 그 선택을 남긴다.
 * - 고르지 않았고 손댄 금액도 없으면 지금 유형을 따른다.
 * - 고르지 않았는데 금액을 고치는 사이 유형이 바뀌었으면, 보던 유형과 입력을 그대로 두고
 *   typeConflict로 표시한다. 사용자가 유형을 다시 고르면(그 유형이 지금 유형이든 아니든) 풀린다.
 */
export function rebaseBudgetDraft(
  base: BudgetFields,
  live: BudgetFields,
  draft: BudgetDraft,
): BudgetDraft {
  const from = toBudgetDraft(base);
  const to = toBudgetDraft(live);
  const amounts = {
    price: rebaseRange(from.price, to.price, draft.price),
    deposit: rebaseRange(from.deposit, to.deposit, draft.deposit),
    monthlyRent: rebaseRange(from.monthlyRent, to.monthlyRent, draft.monthlyRent),
  };

  // 유형을 다시 고르기 전(typeConflict)의 유형은 "보던 유형"일 뿐 사용자가 고른 것이 아니다
  const pickedType =
    draft.typeConflict === undefined && draft.transactionType !== from.transactionType;
  if (pickedType || draft.transactionType === to.transactionType) {
    return { transactionType: draft.transactionType, ...amounts };
  }

  const editedAmounts = (['price', 'deposit', 'monthlyRent'] as const).some(
    (key) =>
      !sameAmountText(draft[key].min, from[key].min) ||
      !sameAmountText(draft[key].max, from[key].max),
  );
  if (!editedAmounts) return { transactionType: to.transactionType, ...amounts };
  return {
    transactionType: draft.transactionType,
    ...amounts,
    typeConflict: to.transactionType,
  };
}

export function rebaseMoveInDate(
  base: Pick<BuyerRequirement, 'moveInDate'>,
  live: Pick<BuyerRequirement, 'moveInDate'>,
  draft: string,
): string {
  return keepEdited(
    toDateInputValue(base.moveInDate),
    toDateInputValue(live.moveInDate),
    draft,
  );
}

export function rebasePlacesDraft(
  base: PlaceFields,
  live: PlaceFields,
  draft: PlacesDraft,
): PlacesDraft {
  const from = toPlacesDraft(base);
  const to = toPlacesDraft(live);
  return {
    regions: replayListEdits(from.regions, to.regions, draft.regions, regionKey),
    sites: replayListEdits(from.sites, to.sites, draft.sites, (site) => site.siteId),
  };
}

export function rebaseMemo(
  base: Pick<BuyerRequirement, 'memo'>,
  live: Pick<BuyerRequirement, 'memo'>,
  draft: string,
): string {
  // "손댔는가"는 저장 여부(buildMemoChange)와 같은 기준으로 본다: 앞뒤 공백만 다르면 손대지 않은 것이다.
  // 원문끼리 견주면 끝에 줄바꿈만 넣은 초안이 "고친 값"으로 남아, 그 사이 새로 온 메모를 예전 글로 덮는다.
  const untouched = draft.trim() === (base.memo ?? '').trim();
  return untouched ? (live.memo ?? '') : draft;
}

// ── 저장 직전에 받아 온 값과 견주기 ──────────────────────────────

/** 목록인 칸은 사용자가 더하고 뺀 것만 지금 목록에 다시 적용하므로(replayListEdits) 서로 덮지 않는다 */
const REPLAYED_FIELDS = new Set(['siteTypes', 'preferredSites', 'preferredRegions']);

function comparable(field: string, requirement: BuyerRequirement): unknown {
  const value = (requirement as unknown as Record<string, unknown>)[field];
  if (field === 'status') return currentStatus(requirement);
  if (field === 'moveInDate') return toDateInputValue(requirement.moveInDate);
  if (field === 'memo') return (requirement.memo ?? '').trim();
  if (field === 'urgency' || field === 'transactionType') return value ?? null;
  return storedAmount(value as number | string | null | undefined);
}

/**
 * 보내려는 칸 가운데, 화면이 보여 주던 값(seen)과 저장 직전에 받아 온 값(latest)이 다른 칸.
 * 있으면 사용자는 그 값을 본 적 없이 덮게 된다 — 한 번 멈추고 지금 값을 보여 준 뒤 다시 저장하게 한다
 * (매물관리 표에서 서버가 "다른 사용자가 먼저 수정했습니다"로 막는 것과 같은 자리).
 * 이미 화면에 와 있던 변경은 해당하지 않는다: 사용자가 보고도 자기 값으로 고친 것이다.
 */
export function findFieldsChangedBehind(
  seen: BuyerRequirement,
  latest: BuyerRequirement,
  change: RequirementChange,
): string[] {
  const fields = change.kind === 'status' ? ['status'] : Object.keys(change.patch);
  return fields.filter(
    (field) =>
      !REPLAYED_FIELDS.has(field) && comparable(field, seen) !== comparable(field, latest),
  );
}

// ── 저장 뒤 목록 반영 ────────────────────────────────────────────

/**
 * 저장 응답에서 이번에 고친 칸만 받아 둔 목록의 그 조건에 덮는다. 다시 받아 오기를 기다리지 않고 칸이 바로 바뀐다.
 *
 * 응답 전체를 덮지 않는다. 응답은 저장한 순간의 조건이라, 저장하는 사이 목록이 새로 왔다면
 * (다른 사람의 수정, 먼저 끝난 다른 칸의 저장) 응답에 실린 "손대지 않은 값"이 목록보다 예전 값일 수 있다.
 * 고친 칸만 덮으면 손대지 않은 값은 목록에 있던 그대로 남고, 정확한 값은 이어지는 다시 받아 오기가 채운다.
 * 응답에 없는 것(담당자 요약, 매칭 수 등)도 같은 이유로 그대로 남는다.
 */
export function mergeSavedRequirement<T extends { id: string }>(
  list: T[] | undefined,
  saved: BuyerRequirement,
  change: RequirementChange,
): T[] | undefined {
  const fields = change.kind === 'status' ? ['status'] : Object.keys(change.patch);
  const response = saved as unknown as Record<string, unknown>;
  return list?.map((item) => {
    if (item.id !== saved.id) return item;
    const next = { ...item } as unknown as Record<string, unknown>;
    for (const field of fields) {
      if (field in response) next[field] = response[field];
    }
    return next as unknown as T;
  });
}

/**
 * 방금 받아 온 조건 한 건(GET /buyer-requirements/:id)을 받아 둔 목록의 그 조건에 덮는다.
 * 저장 응답과 달리 이것은 읽어 온 지금 값이라 통째로 덮는다. 목록에만 있는 것(매칭 수)은 그대로 두고,
 * 한 건 조회에만 실려 오는 것(매칭 · 상담 목록)은 목록에 싣지 않는다.
 */
export function mergeLatestRequirement<
  T extends { id: string; matches?: unknown; consultations?: unknown },
>(list: T[] | undefined, latest: BuyerRequirement): T[] | undefined {
  return list?.map((item) =>
    item.id === latest.id
      ? ({
          ...item,
          ...latest,
          matches: item.matches,
          consultations: item.consultations,
        } as unknown as T)
      : item,
  );
}
