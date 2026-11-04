import { CallSuggestionType, MatchStage } from '@estate-erp/shared';

/**
 * 통화 분석 제안의 내용(payload).
 * AI 출력과 사람이 고친 값 모두 이 검증을 거친 뒤에만 저장·반영한다.
 * id는 모두 실제 DB id이며, 사무소 소유 여부는 반영할 때 다시 확인한다.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 만원 단위 상한 (1,000억) */
const MAX_MANWON = 10_000_000;

export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const CALENDAR_EVENT_TYPES = ['viewing', 'contract', 'meeting', 'general'] as const;
export type CalendarEventSuggestionType = (typeof CALENDAR_EVENT_TYPES)[number];

export const REQUIREMENT_TRANSACTION_TYPES = ['sale', 'jeonse', 'monthly'] as const;
export const REQUIREMENT_URGENCIES = ['urgent', 'normal', 'flexible'] as const;
export const SITE_TYPES = [
  'apartment',
  'officetel',
  'villa',
  'house',
  'commercial',
  'land',
  'living_accommodation',
] as const;

/** AI가 제안할 수 있는 매칭 단계 이동. 거래 전환은 거래 생성 화면에서만 한다. */
export const SUGGESTIBLE_MATCH_STAGES = [
  MatchStage.BUYER_INTERESTED,
  MatchStage.VIEWING_CONFIRMED,
  MatchStage.VIEWING,
  MatchStage.NEGOTIATING,
  MatchStage.CLOSED,
] as const;
export type SuggestibleMatchStage = (typeof SUGGESTIBLE_MATCH_STAGES)[number];

export const CONFIRM_RESULTS = ['alive', 'price_changed', 'unavailable'] as const;
export type ConfirmResult = (typeof CONFIRM_RESULTS)[number];

export interface TaskSuggestionPayload {
  title: string;
  content: string | null;
  /** "YYYY-MM-DD" 또는 KST 오프셋이 붙은 ISO 시각 */
  dueDate: string | null;
  priority: TaskPriority;
  listingId: string | null;
  propertyId: string | null;
  buyerReqId: string | null;
  matchId: string | null;
}

export interface CalendarEventSuggestionPayload {
  title: string;
  /** allDay면 "YYYY-MM-DD", 아니면 KST 오프셋이 붙은 ISO 시각 */
  start: string;
  end: string | null;
  allDay: boolean;
  eventType: CalendarEventSuggestionType;
  description: string | null;
  listingId: string | null;
  propertyId: string | null;
  matchId: string | null;
}

/** 고객 요청 조건. 가격은 만원, 면적은 m²(공급면적). 값이 있는 항목만 둔다. */
export interface BuyerRequirementFields {
  transactionType?: (typeof REQUIREMENT_TRANSACTION_TYPES)[number];
  siteTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  depositMin?: number | null;
  depositMax?: number | null;
  monthlyRentMin?: number | null;
  monthlyRentMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  /** "YYYY-MM-DD" */
  moveInDate?: string | null;
  urgency?: (typeof REQUIREMENT_URGENCIES)[number];
  /** 희망 단지 (기존 희망 단지에 더한다) */
  siteIds?: string[];
}

export interface BuyerRequirementCreateSuggestionPayload extends BuyerRequirementFields {
  /** 기존 구매 의뢰에 추가할 때. null이면 상대방의 열린 의뢰를 쓰거나 새로 만든다. */
  buyerIntakeId: string | null;
  memo: string | null;
}

export interface BuyerRequirementUpdateSuggestionPayload {
  buyerReqId: string;
  changes: BuyerRequirementFields;
  /** 기존 메모 뒤에 덧붙일 내용 */
  memoAppend: string | null;
}

export interface MatchCreateSuggestionPayload {
  listingId: string;
  buyerReqId: string;
  memo: string | null;
}

export interface MatchStageSuggestionPayload {
  matchId: string;
  stage: SuggestibleMatchStage;
}

export interface ListingPriceChange {
  listingId: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
}

export interface ListingConfirmSuggestionPayload {
  intakeId: string;
  result: ConfirmResult;
  priceChanges: ListingPriceChange[];
  memo: string | null;
}

export interface SuggestionPayloadByType {
  task: TaskSuggestionPayload;
  calendar_event: CalendarEventSuggestionPayload;
  buyer_requirement_create: BuyerRequirementCreateSuggestionPayload;
  buyer_requirement_update: BuyerRequirementUpdateSuggestionPayload;
  match_create: MatchCreateSuggestionPayload;
  match_stage: MatchStageSuggestionPayload;
  listing_confirm: ListingConfirmSuggestionPayload;
}

export type SuggestionPayload = SuggestionPayloadByType[CallSuggestionType];

export type PayloadValidation<T> = { ok: true; payload: T } | { ok: false; error: string };

export const CALL_SUGGESTION_TYPES = Object.values(CallSuggestionType) as CallSuggestionType[];

export function isCallSuggestionType(value: unknown): value is CallSuggestionType {
  return typeof value === 'string' && (CALL_SUGGESTION_TYPES as string[]).includes(value);
}

class PayloadError extends Error {}

function fail(message: string): never {
  throw new PayloadError(message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} 형식이 올바르지 않습니다`);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(`${label}은(는) 문자열이어야 합니다`);
  const text = value.trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = optionalText(value, label, maxLength);
  if (!text) fail(`${label}이(가) 필요합니다`);
  return text;
}

function optionalId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`${label} id가 올바르지 않습니다`);
  }
  return value;
}

function requiredId(value: unknown, label: string): string {
  const id = optionalId(value, label);
  if (!id) fail(`${label}이(가) 필요합니다`);
  return id;
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    fail(`${label} 값이 올바르지 않습니다`);
  }
  return value as T;
}

/**
 * 만원 단위 금액. 숫자 또는 한국어 금액("15억 8천", "3억5000", "150만")을 받는다.
 * 읽을 수 없으면 null.
 */
export function parseManwon(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.replace(/[,\s원]/g, '');
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const match = text.match(
    /^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)천)?(?:(\d+)백)?(\d+)?만?$/,
  );
  if (!match || match.slice(1).every((part) => part === undefined)) return null;
  const [, eok, cheon, baek, rest] = match;
  const total =
    (eok ? Number(eok) * 10_000 : 0) +
    (cheon ? Number(cheon) * 1_000 : 0) +
    (baek ? Number(baek) * 100 : 0) +
    (rest ? Number(rest) : 0);
  return Math.round(total);
}

function optionalManwon(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = parseManwon(value);
  if (parsed === null || parsed > MAX_MANWON) fail(`${label} 금액이 올바르지 않습니다`);
  return parsed;
}

function optionalArea(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000) {
    fail(`${label} 면적이 올바르지 않습니다`);
  }
  return Math.round(parsed * 100) / 100;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "YYYY-MM-DD"만 허용 */
export function normalizeDateOnly(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${label} 날짜가 올바르지 않습니다`);
  const text = value.trim().slice(0, 10);
  const match = text.match(DATE_ONLY_PATTERN);
  if (!match || !isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    fail(`${label} 날짜가 올바르지 않습니다`);
  }
  return text;
}

/**
 * 날짜 또는 시각. 오프셋 없는 시각은 한국 시간으로 보고 +09:00을 붙인다.
 * 반환: { value, dateOnly }
 */
export function normalizeDateOrDateTime(
  value: unknown,
  label: string,
): { value: string; dateOnly: boolean } | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${label} 날짜가 올바르지 않습니다`);
  const text = value.trim();
  const dateOnly = text.match(DATE_ONLY_PATTERN);
  if (dateOnly) {
    if (!isRealDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))) {
      fail(`${label} 날짜가 올바르지 않습니다`);
    }
    return { value: text, dateOnly: true };
  }
  const local = text.match(LOCAL_DATE_TIME_PATTERN);
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    if (!isRealDate(Number(y), Number(mo), Number(d)) || Number(h) > 23 || Number(mi) > 59) {
      fail(`${label} 시각이 올바르지 않습니다`);
    }
    return { value: `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}+09:00`, dateOnly: false };
  }
  const parsed = new Date(text);
  if (!/[T ]\d{2}:\d{2}/.test(text) || Number.isNaN(parsed.getTime())) {
    fail(`${label} 시각이 올바르지 않습니다`);
  }
  // 다른 오프셋으로 와도 한국 시간 표기로 맞춘다 (몇 번 검증해도 같은 값이 되게)
  return { value: toKstIso(parsed), dateOnly: false };
}

/** Date → "YYYY-MM-DDTHH:mm:ss+09:00" */
function toKstIso(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}+09:00`;
}

function idList(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) fail(`${label} 목록 형식이 올바르지 않습니다`);
  return Array.from(new Set(value.map((item) => requiredId(item, label))));
}

function assertRange(min: number | null | undefined, max: number | null | undefined, label: string) {
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    fail(`${label} 최소값이 최대값보다 큽니다`);
  }
}

function readRequirementFields(input: Record<string, unknown>): BuyerRequirementFields {
  const fields: BuyerRequirementFields = {};
  if (input.transactionType !== undefined && input.transactionType !== null) {
    fields.transactionType = oneOf(input.transactionType, REQUIREMENT_TRANSACTION_TYPES, '거래 유형');
  }
  if (input.siteTypes !== undefined && input.siteTypes !== null) {
    if (!Array.isArray(input.siteTypes)) fail('매물 유형 목록 형식이 올바르지 않습니다');
    fields.siteTypes = Array.from(
      new Set(input.siteTypes.map((siteType) => oneOf(siteType, SITE_TYPES, '매물 유형'))),
    );
  }
  const moneyKeys = [
    ['priceMin', '최소 매매가'],
    ['priceMax', '최대 매매가'],
    ['depositMin', '최소 보증금'],
    ['depositMax', '최대 보증금'],
    ['monthlyRentMin', '최소 월세'],
    ['monthlyRentMax', '최대 월세'],
  ] as const;
  for (const [key, label] of moneyKeys) {
    const value = optionalManwon(input[key], label);
    if (value !== undefined) fields[key] = value;
  }
  const areaMin = optionalArea(input.areaMin, '최소 면적');
  if (areaMin !== undefined) fields.areaMin = areaMin;
  const areaMax = optionalArea(input.areaMax, '최대 면적');
  if (areaMax !== undefined) fields.areaMax = areaMax;
  if (input.moveInDate !== undefined) {
    fields.moveInDate = normalizeDateOnly(input.moveInDate, '입주 희망일');
  }
  if (input.urgency !== undefined && input.urgency !== null) {
    fields.urgency = oneOf(input.urgency, REQUIREMENT_URGENCIES, '급한 정도');
  }
  const siteIds = idList(input.siteIds, '희망 단지');
  if (siteIds) fields.siteIds = siteIds;

  assertRange(fields.priceMin, fields.priceMax, '매매가');
  assertRange(fields.depositMin, fields.depositMax, '보증금');
  assertRange(fields.monthlyRentMin, fields.monthlyRentMax, '월세');
  assertRange(fields.areaMin, fields.areaMax, '면적');
  return fields;
}

function hasRequirementChange(fields: BuyerRequirementFields) {
  return Object.values(fields).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

const validators: {
  [K in CallSuggestionType]: (input: Record<string, unknown>) => SuggestionPayloadByType[K];
} = {
  task: (input) => ({
    title: requiredText(input.title, '할 일 제목', 120),
    content: optionalText(input.content, '할 일 내용', 2000),
    dueDate: normalizeDateOrDateTime(input.dueDate, '마감일')?.value ?? null,
    priority:
      input.priority === undefined || input.priority === null
        ? 'medium'
        : oneOf(input.priority, TASK_PRIORITIES, '우선순위'),
    listingId: optionalId(input.listingId, '매물'),
    propertyId: optionalId(input.propertyId, '호실'),
    buyerReqId: optionalId(input.buyerReqId, '고객 요청'),
    matchId: optionalId(input.matchId, '매칭'),
  }),

  calendar_event: (input) => {
    const start = normalizeDateOrDateTime(input.start, '시작');
    if (!start) fail('일정 시작 시각이 필요합니다');
    const end = start.dateOnly ? null : normalizeDateOrDateTime(input.end, '종료');
    if (end && (end.dateOnly || new Date(end.value) < new Date(start.value))) {
      fail('일정 종료 시각이 올바르지 않습니다');
    }
    return {
      title: requiredText(input.title, '일정 제목', 120),
      start: start.value,
      end: end?.value ?? null,
      allDay: start.dateOnly,
      eventType:
        input.eventType === undefined || input.eventType === null
          ? 'general'
          : oneOf(input.eventType, CALENDAR_EVENT_TYPES, '일정 종류'),
      description: optionalText(input.description, '일정 설명', 2000),
      listingId: optionalId(input.listingId, '매물'),
      propertyId: optionalId(input.propertyId, '호실'),
      matchId: optionalId(input.matchId, '매칭'),
    };
  },

  buyer_requirement_create: (input) => {
    const fields = readRequirementFields(input);
    const memo = optionalText(input.memo, '요청 메모', 1000);
    if (!hasRequirementChange(fields) && !memo) fail('고객 요청 조건이 비어 있습니다');
    return {
      ...fields,
      buyerIntakeId: optionalId(input.buyerIntakeId, '구매 의뢰'),
      memo,
    };
  },

  buyer_requirement_update: (input) => {
    const changes = readRequirementFields(asRecord(input.changes ?? {}, '변경 내용'));
    const memoAppend = optionalText(input.memoAppend, '추가 메모', 1000);
    if (!hasRequirementChange(changes) && !memoAppend) fail('바뀐 조건이 없습니다');
    return {
      buyerReqId: requiredId(input.buyerReqId, '고객 요청'),
      changes,
      memoAppend,
    };
  },

  match_create: (input) => ({
    listingId: requiredId(input.listingId, '매물'),
    buyerReqId: requiredId(input.buyerReqId, '고객 요청'),
    memo: optionalText(input.memo, '매칭 메모', 1000),
  }),

  match_stage: (input) => ({
    matchId: requiredId(input.matchId, '매칭'),
    stage: oneOf(input.stage, SUGGESTIBLE_MATCH_STAGES, '매칭 단계'),
  }),

  listing_confirm: (input) => {
    const result = oneOf(input.result, CONFIRM_RESULTS, '확인 결과');
    const rawChanges = input.priceChanges ?? [];
    if (!Array.isArray(rawChanges)) fail('가격 변경 목록 형식이 올바르지 않습니다');
    const priceChanges: ListingPriceChange[] =
      result === 'price_changed'
        ? rawChanges.map((raw) => {
            const change = asRecord(raw, '가격 변경');
            const item: ListingPriceChange = { listingId: requiredId(change.listingId, '매물') };
            for (const key of ['price', 'deposit', 'monthlyRent'] as const) {
              const value = optionalManwon(change[key], '변경 가격');
              if (value !== undefined && value !== null) item[key] = value;
            }
            if (item.price === undefined && item.deposit === undefined && item.monthlyRent === undefined) {
              fail('바뀐 가격이 없습니다');
            }
            return item;
          })
        : [];
    if (result === 'price_changed' && priceChanges.length === 0) {
      fail('가격 변경 확인에는 바뀐 가격이 필요합니다');
    }
    return {
      intakeId: requiredId(input.intakeId, '의뢰'),
      result,
      priceChanges,
      memo: optionalText(input.memo, '확인 메모', 1000),
    };
  },
};

export function validateSuggestionPayload<K extends CallSuggestionType>(
  type: K,
  raw: unknown,
): PayloadValidation<SuggestionPayloadByType[K]> {
  try {
    const input = asRecord(raw, '제안 내용');
    return { ok: true, payload: validators[type](input) as SuggestionPayloadByType[K] };
  } catch (error) {
    if (error instanceof PayloadError) return { ok: false, error: error.message };
    throw error;
  }
}

/** 평 → m² (평 = m² × 0.3025) */
export function pyeongToSquareMeters(pyeong: number): number {
  return Math.round((pyeong / 0.3025) * 100) / 100;
}
