import { formatPlaceLabel } from '@estate-erp/shared';

/**
 * 전체 검색(⌘K)의 검색어 풀이. 화면 코드와 떼어 두어 테스트로 확인한다.
 *
 * 중개사가 실제로 치는 모양:
 *   "김민준", "0001"(전화번호 뒷자리), "010-2001-0001", "그라시움",
 *   "102동 3302호", "102-3302", "그라시움 102동 3302", "3302호"
 * 서버의 매물 검색은 검색어 전체를 한 칸(단지명·동 이름·호 이름…)에서 찾으므로
 * "102동 3302호"를 그대로 보내면 아무것도 나오지 않는다. 그래서 동·호를 따로 떼어
 * 서버에는 한 낱말만 보내고, 나머지 조건은 받은 결과에서 거른다.
 */

export interface ParsedSearchQuery {
  /** 앞뒤 공백을 뗀 원래 검색어 */
  raw: string;
  /** 동·호가 아닌 낱말 (단지명·이름 등) */
  words: string[];
  /** "102동", "A동", "102-3302"의 앞 */
  dong: string | null;
  /** "3302호", "102-3302"의 뒤 */
  unit: string | null;
  /** 동이나 호를 알아본 검색어인가 */
  isPlace: boolean;
  /** 숫자·하이픈·공백만으로 된 검색어(전화번호로 볼 수 있다) */
  isPhoneLike: boolean;
}

const DONG_TOKEN = /^(\d{1,4}|[A-Za-z]\d{0,3}|\d{1,4}[A-Za-z])동$/;
const UNIT_TOKEN = /^(\d{1,5})호$/;
const DONG_UNIT_TOKEN = /^(\d{1,4})-(\d{1,5})$/;

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const raw = input.trim().replace(/\s+/g, ' ');
  const isPhoneLike = /^[\d\s-]+$/.test(raw) && raw.replace(/\D/g, '').length >= 3;
  const result: ParsedSearchQuery = {
    raw,
    words: [],
    dong: null,
    unit: null,
    isPlace: false,
    isPhoneLike,
  };
  if (!raw) return result;
  // 전화번호(010-2001-0001, 0001)는 그대로 둔다. "102-3302"처럼 두 덩어리만 동-호로 본다.
  if (isPhoneLike && !DONG_UNIT_TOKEN.test(raw) && !/^\d{1,4}\s+\d{1,5}$/.test(raw)) {
    return result;
  }

  const numbers: string[] = [];
  for (const token of raw.split(' ')) {
    const dongUnit = token.match(DONG_UNIT_TOKEN);
    if (dongUnit) {
      result.dong ??= dongUnit[1];
      result.unit ??= dongUnit[2];
      continue;
    }
    const dong = token.match(DONG_TOKEN);
    if (dong) {
      result.dong ??= dong[1].toUpperCase();
      continue;
    }
    const unit = token.match(UNIT_TOKEN);
    if (unit) {
      result.unit ??= unit[1];
      continue;
    }
    if (/^\d{1,5}$/.test(token)) {
      numbers.push(token);
      continue;
    }
    result.words.push(token);
  }

  // 표시 없는 숫자: 둘이면 "동 호", 동만 있으면 호, 호만 있으면 동으로 본다.
  if (numbers.length >= 2 && !result.dong && !result.unit) {
    result.dong = numbers[0];
    result.unit = numbers[1];
  } else if (numbers.length === 1 && result.dong && !result.unit) {
    result.unit = numbers[0];
  } else if (numbers.length === 1 && result.unit && !result.dong) {
    result.dong = numbers[0];
  } else if (numbers.length === 1 && result.words.length > 0 && !result.dong && !result.unit) {
    // "그라시움 3302": 단지명 + 호
    result.unit = numbers[0];
  } else {
    result.words.push(...numbers);
  }

  result.isPlace = Boolean(result.dong || result.unit);
  return result;
}

/** 서버 매물 검색에 보낼 한 낱말 */
export function listingSearchTerm(parsed: ParsedSearchQuery): string {
  if (!parsed.isPlace) return parsed.raw;
  return parsed.unit ?? parsed.words[0] ?? parsed.dong ?? parsed.raw;
}

function normalizePlaceName(value: string | null | undefined, suffix: '동' | '호'): string {
  const text = (value ?? '').trim().toUpperCase();
  return text.endsWith(suffix) ? text.slice(0, -1) : text;
}

export interface SearchableListingPlace {
  siteName?: string | null;
  siteAddress?: string | null;
  dongName?: string | null;
  unitName?: string | null;
}

/** 동·호를 알아본 검색어일 때, 받은 매물이 동·호·단지명 조건에 모두 맞는가 */
export function listingMatchesPlace(
  parsed: ParsedSearchQuery,
  place: SearchableListingPlace,
): boolean {
  if (!parsed.isPlace) return true;
  if (parsed.dong && normalizePlaceName(place.dongName, '동') !== parsed.dong.toUpperCase()) { // i18n-ignore — 이름 끝의 '동'·'호'를 떼는 값이다
    return false;
  }
  if (parsed.unit && normalizePlaceName(place.unitName, '호') !== parsed.unit) { // i18n-ignore — 이름 끝의 '동'·'호'를 떼는 값이다
    return false;
  }
  const haystack = `${place.siteName ?? ''} ${place.siteAddress ?? ''}`.toLowerCase();
  return parsed.words.every((word) => haystack.includes(word.toLowerCase()));
}

export interface SearchableDeal extends SearchableListingPlace {
  /** 매도인·매수인(임대인·임차인) 이름 */
  partyNames: Array<string | null | undefined>;
}

/**
 * 거래가 검색어에 맞는가. 서버에 거래 검색이 없어 받은 거래 목록에서 거른다.
 * 동·호를 알아본 검색어면 매물과 같은 규칙(동·호·단지명), 아니면 낱말이 모두 단지명·주소·당사자 이름에 들어 있어야 한다.
 * 전화번호 모양은 거래를 찾지 않는다(전화번호는 연락처로 찾는다).
 */
export function dealMatchesQuery(parsed: ParsedSearchQuery, deal: SearchableDeal): boolean {
  if (!parsed.raw) return false;
  if (parsed.isPlace) return listingMatchesPlace(parsed, deal);
  if (parsed.isPhoneLike) return false;
  const haystack = [deal.siteName, deal.siteAddress, ...deal.partyNames]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return parsed.words.length > 0 && parsed.words.every((word) => haystack.includes(word.toLowerCase()));
}

/** 화면에 보일 "102동 3302호". 앱 공통 주소 함수(@estate-erp/shared)를 그대로 쓴다 */
export function formatDongUnitLabel(
  dongName: string | null | undefined,
  unitName: string | null | undefined,
): string {
  return formatPlaceLabel({ dongName, unit: unitName ? { name: unitName } : null });
}
