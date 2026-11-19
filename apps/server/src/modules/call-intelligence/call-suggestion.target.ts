import { CallSuggestionType } from '@estate-erp/shared';
import type { Prisma } from '@prisma/client';
import type { SuggestionPayload, SuggestionPayloadByType } from './call-suggestion.payload';

/**
 * 통화 분석 제안의 "대상"과 "제안할 때의 값".
 *
 * - 대상: 제안이 무엇을 바꾸려는지. payload 안의 id를 꺼내 칸으로 저장해, 매물·희망조건 쪽에서
 *   자기에게 걸린 제안을 찾을 수 있게 한다.
 * - 제안할 때의 값: 덮어쓰는 제안(가격 변경·희망조건 변경·매칭 단계)은 제안을 만든 순간의 값을
 *   함께 적어 둔다. 반영할 때 지금 값과 다르면 그 사이 누가 고친 것이므로 조용히 덮어쓰지 않는다.
 */

export type SuggestionTargetType =
  | 'listing_intake'
  | 'listing'
  | 'buyer_requirement'
  | 'buyer_intake'
  | 'match'
  | 'property';

export interface SuggestionTarget {
  targetType: SuggestionTargetType;
  targetId: string;
}

export function suggestionTarget(type: CallSuggestionType, payload: SuggestionPayload): SuggestionTarget | null {
  const of = (targetType: SuggestionTargetType, targetId: string | null | undefined) =>
    targetId ? { targetType, targetId } : null;
  switch (type) {
    case CallSuggestionType.LISTING_CONFIRM:
      return of('listing_intake', (payload as SuggestionPayloadByType['listing_confirm']).intakeId);
    case CallSuggestionType.BUYER_REQUIREMENT_UPDATE:
      return of('buyer_requirement', (payload as SuggestionPayloadByType['buyer_requirement_update']).buyerReqId);
    case CallSuggestionType.BUYER_REQUIREMENT_CREATE:
      return of('buyer_intake', (payload as SuggestionPayloadByType['buyer_requirement_create']).buyerIntakeId);
    case CallSuggestionType.MATCH_STAGE:
      return of('match', (payload as SuggestionPayloadByType['match_stage']).matchId);
    case CallSuggestionType.MATCH_CREATE:
      return of('listing', (payload as SuggestionPayloadByType['match_create']).listingId);
    case CallSuggestionType.TASK:
    case CallSuggestionType.CALENDAR_EVENT: {
      // 무엇에 관한 일인지: 가장 구체적인 것 하나
      const links = payload as {
        listingId?: string | null;
        propertyId?: string | null;
        matchId?: string | null;
        buyerReqId?: string | null;
      };
      return (
        of('listing', links.listingId) ??
        of('property', links.propertyId) ??
        of('match', links.matchId) ??
        of('buyer_requirement', links.buyerReqId)
      );
    }
    default:
      return null;
  }
}

// ----------------------------------------------------------------
// 제안할 때의 값
// ----------------------------------------------------------------

export type ListingPrices = { price: number | null; deposit: number | null; monthlyRent: number | null };

export type SuggestionBaseValues =
  | { kind: 'listing_prices'; listings: Record<string, Partial<ListingPrices>> }
  | { kind: 'requirement_fields'; fields: Record<string, string | number | string[] | null> }
  | { kind: 'match_stage'; stage: string };

export interface BaseValueChange {
  /** 화면에 보일 이름 ("가격", "매매가 상한" …) */
  label: string;
  was: string;
  now: string;
}

type BaseValueClient = Pick<Prisma.TransactionClient, 'listing' | 'buyerRequirement' | 'match'>;

const PRICE_KEYS = ['price', 'deposit', 'monthlyRent'] as const;

/**
 * 제안이 덮어쓰려는 값들이 지금 얼마인지 읽는다.
 * 제안을 만들 때와 반영할 때 같은 함수로 읽어 견준다. 덮어쓰는 제안이 아니면 null.
 * 대상이 사라졌으면 그 값은 빠진다 (반영 단계의 검증이 따로 막는다).
 */
export async function readSuggestionBaseValues(
  client: BaseValueClient,
  officeId: string,
  type: CallSuggestionType,
  payload: SuggestionPayload,
): Promise<SuggestionBaseValues | null> {
  if (type === CallSuggestionType.LISTING_CONFIRM) {
    const { priceChanges } = payload as SuggestionPayloadByType['listing_confirm'];
    if (priceChanges.length === 0) return null;
    const listings = await client.listing.findMany({
      where: { officeId, id: { in: priceChanges.map((change) => change.listingId) } },
      select: { id: true, price: true, deposit: true, monthlyRent: true },
    });
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    const values: Record<string, Partial<ListingPrices>> = {};
    for (const change of priceChanges) {
      const listing = byId.get(change.listingId);
      if (!listing) continue;
      // 가격 세 칸을 모두 기억한다. 사람이 "고쳐서 반영"으로 제안에 없던 칸(보증금 등)을 채워도
      // 그 칸의 제안할 때 값을 알고 있어야 견줄 수 있다.
      values[change.listingId] = Object.fromEntries(PRICE_KEYS.map((key) => [key, listing[key] ?? null]));
    }
    return Object.keys(values).length > 0 ? { kind: 'listing_prices', listings: values } : null;
  }

  if (type === CallSuggestionType.BUYER_REQUIREMENT_UPDATE) {
    const { buyerReqId, changes } = payload as SuggestionPayloadByType['buyer_requirement_update'];
    // 희망 단지는 기존 목록에 더하는 것이라 덮어쓰지 않는다
    const keys = Object.keys(changes).filter((key) => key !== 'siteIds');
    if (keys.length === 0) return null;
    const row = await client.buyerRequirement.findFirst({
      where: { id: buyerReqId, officeId },
      select: {
        transactionType: true,
        siteTypes: true,
        priceMin: true,
        priceMax: true,
        depositMin: true,
        depositMax: true,
        monthlyRentMin: true,
        monthlyRentMax: true,
        areaMin: true,
        areaMax: true,
        moveInDate: true,
        urgency: true,
      },
    });
    if (!row) return null;
    const record = row as Record<string, unknown>;
    return {
      kind: 'requirement_fields',
      fields: Object.fromEntries(keys.map((key) => [key, plainValue(record[key])])),
    };
  }

  if (type === CallSuggestionType.MATCH_STAGE) {
    const { matchId } = payload as SuggestionPayloadByType['match_stage'];
    const match = await client.match.findFirst({ where: { id: matchId, officeId }, select: { stage: true } });
    return match ? { kind: 'match_stage', stage: match.stage } : null;
  }

  return null;
}

/** DB 값 → 견주고 저장할 수 있는 값 (날짜는 날짜만, Decimal은 숫자) */
function plainValue(value: unknown): string | number | string[] | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(String).sort();
  if (typeof value === 'number' || typeof value === 'string') return value;
  // Prisma.Decimal
  const numeric = Number(String(value));
  return Number.isFinite(numeric) ? numeric : String(value);
}

const PRICE_LABEL: Record<string, string> = { price: '가격', deposit: '보증금', monthlyRent: '월세' };
const FIELD_LABEL: Record<string, string> = {
  transactionType: '거래 유형',
  siteTypes: '매물 유형',
  priceMin: '매매가 하한',
  priceMax: '매매가 상한',
  depositMin: '보증금 하한',
  depositMax: '보증금 상한',
  monthlyRentMin: '월세 하한',
  monthlyRentMax: '월세 상한',
  areaMin: '면적 하한(m²)',
  areaMax: '면적 상한(m²)',
  moveInDate: '입주일',
  urgency: '급한 정도',
};
const MONEY_FIELDS = new Set([
  'price',
  'deposit',
  'monthlyRent',
  'priceMin',
  'priceMax',
  'depositMin',
  'depositMax',
  'monthlyRentMin',
  'monthlyRentMax',
]);

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return '없음';
  if (Array.isArray(value)) return value.join(', ');
  if (MONEY_FIELDS.has(key) && typeof value === 'number') return `${value.toLocaleString('ko-KR')}만원`;
  return String(value);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 제안할 때의 값과 지금 값이 어디가 다른지. 같으면 빈 목록.
 * 지금 값을 읽지 못한 항목(대상이 사라짐)은 견주지 않는다.
 */
export function diffSuggestionBaseValues(
  base: SuggestionBaseValues,
  now: SuggestionBaseValues | null,
  /**
   * 앞선 반영 시도가 쓰려던 가격. 여러 매물의 가격을 차례로 쓰다 중간에 멈췄으면 일부는 이미
   * 그 값으로 바뀌어 있다 — 우리가 쓴 값과 정확히 같을 때만 "바뀐 것"으로 치지 않는다.
   * (앞선 시도가 있었다는 이유만으로 견주기를 건너뛰지 않는다.)
   */
  writtenByPriorAttempt: Record<string, Partial<ListingPrices>> = {},
): BaseValueChange[] {
  if (!now || now.kind !== base.kind) return [];
  const changes: BaseValueChange[] = [];
  if (base.kind === 'listing_prices' && now.kind === 'listing_prices') {
    for (const [listingId, before] of Object.entries(base.listings)) {
      const after = now.listings[listingId];
      if (!after) continue;
      const ours = writtenByPriorAttempt[listingId] ?? {};
      for (const key of PRICE_KEYS) {
        if (!(key in before) || !(key in after) || same(before[key], after[key])) continue;
        if (key in ours && same(ours[key], after[key])) continue;
        changes.push({ label: PRICE_LABEL[key], was: show(key, before[key]), now: show(key, after[key]) });
      }
    }
  } else if (base.kind === 'requirement_fields' && now.kind === 'requirement_fields') {
    for (const [key, before] of Object.entries(base.fields)) {
      if (!(key in now.fields) || same(before, now.fields[key])) continue;
      changes.push({ label: FIELD_LABEL[key] ?? key, was: show(key, before), now: show(key, now.fields[key]) });
    }
  } else if (base.kind === 'match_stage' && now.kind === 'match_stage' && base.stage !== now.stage) {
    changes.push({ label: '매칭 단계', was: base.stage, now: now.stage });
  }
  return changes;
}

/**
 * 매물 확인 제안이 쓰려는 가격 (매물 id → 바꿀 값).
 * 확인(견주기)과 쓰기가 이 한 함수의 결과를 함께 쓴다 — 확인한 것과 쓰는 것이 달라지지 않게.
 */
export function proposedListingPrices(
  payload: SuggestionPayloadByType['listing_confirm'],
): Record<string, Partial<ListingPrices>> {
  const proposed: Record<string, Partial<ListingPrices>> = {};
  for (const change of payload.priceChanges) {
    const keys = PRICE_KEYS.filter((key) => change[key] !== undefined && change[key] !== null);
    // 같은 매물이 여러 줄에 나뉘어 와도 한 매물로 합친다. 줄마다 따로 보면 뒤 줄이 앞 줄을 가려
    // 앞 줄의 칸(예: 보증금)이 견주지 않은 채 쓰인다.
    if (keys.length > 0) {
      proposed[change.listingId] = {
        ...proposed[change.listingId],
        ...Object.fromEntries(keys.map((key) => [key, change[key]])),
      };
    }
  }
  return proposed;
}

/** 제안할 때의 값을 모르는 칸에 붙이는 말 */
export const UNKNOWN_BASE = '기록 없음';

/**
 * 매물 가격을 쓰기 전의 확인. 실제로 쓰려는 값(고쳐서 반영했으면 고친 값) 하나하나에 대해 본다:
 * - 지금 값과 같으면 바꿀 것이 없다.
 * - 앞선 시도가 써 둔 값 그대로면 우리가 쓴 것이다.
 * - 제안할 때의 값을 알고 지금 값이 그것과 같으면 그대로 쓴다. 다르면 그 사이 누가 고친 것이다.
 * - 제안할 때의 값을 모르면(옛 제안, 제안에 없던 칸·매물) 견줄 수 없으므로 지금 값을 보여 주고 확인받는다.
 *   모른다고 그냥 덮어쓰지 않는다.
 */
export function diffListingPriceWrites(
  base: SuggestionBaseValues | null,
  current: Record<string, ListingPrices>,
  writes: Record<string, Partial<ListingPrices>>,
  writtenByPriorAttempt: Record<string, Partial<ListingPrices>> = {},
): BaseValueChange[] {
  const known = base?.kind === 'listing_prices' ? base.listings : {};
  const changes: BaseValueChange[] = [];
  for (const [listingId, write] of Object.entries(writes)) {
    const now = current[listingId];
    // 매물이 사라졌으면 반영 단계가 따로 막는다
    if (!now) continue;
    const ours = writtenByPriorAttempt[listingId] ?? {};
    for (const key of PRICE_KEYS) {
      if (!(key in write) || same(write[key], now[key])) continue;
      if (key in ours && same(ours[key], now[key])) continue;
      const before = known[listingId];
      if (before && key in before) {
        if (same(before[key], now[key])) continue;
        changes.push({ label: PRICE_LABEL[key], was: show(key, before[key]), now: show(key, now[key]) });
      } else {
        changes.push({ label: PRICE_LABEL[key], was: UNKNOWN_BASE, now: show(key, now[key]) });
      }
    }
  }
  return changes;
}

/** 저장된 JSON이 우리가 쓴 모양인지 (모르는 모양이면 견주지 않는다) */
export function parseSuggestionBaseValues(value: unknown): SuggestionBaseValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'listing_prices' || kind === 'requirement_fields' || kind === 'match_stage') {
    return value as SuggestionBaseValues;
  }
  return null;
}
