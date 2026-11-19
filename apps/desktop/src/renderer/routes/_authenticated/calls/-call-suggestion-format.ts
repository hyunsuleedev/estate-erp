import type {
  BuyerRequirementSuggestionFields,
  CallActionSuggestion,
  CallSuggestionPayloadByType,
  CallSuggestionTypeValue,
} from '@estate-erp/api-client';

/**
 * 통화 분석 제안 카드의 표시 문구.
 * 시각은 모두 한국 시간으로 보여준다 (서버가 +09:00으로 저장).
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const SUGGESTION_TYPE_LABEL: Record<CallSuggestionTypeValue, string> = {
  task: '할 일',
  calendar_event: '일정',
  buyer_requirement_create: '고객 요청 추가',
  buyer_requirement_update: '고객 요청 변경',
  match_create: '매칭 추가',
  match_stage: '매칭 진행',
  listing_confirm: '매물 확인',
};

/** 연락처가 연결돼야 반영할 수 있는 제안 */
export const CONTACT_REQUIRED_TYPES: CallSuggestionTypeValue[] = [
  'buyer_requirement_create',
  'buyer_requirement_update',
  'match_create',
  'match_stage',
  'listing_confirm',
];

const EVENT_TYPE_LABEL: Record<string, string> = {
  viewing: '임장',
  contract: '계약',
  meeting: '미팅',
  general: '일정',
};

const MATCH_STAGE_LABEL: Record<string, string> = {
  buyerInterested: '고객 관심',
  viewingConfirmed: '임장 조율',
  viewing: '임장',
  buyerReviewing: '고객 검토',
  negotiating: '협상',
  closed: '매칭 종료',
};

const CONFIRM_RESULT_LABEL: Record<string, string> = {
  alive: '그대로 진행',
  price_changed: '가격 변경',
  unavailable: '거래 불가 — 의뢰 종료',
};

const TRANSACTION_LABEL: Record<string, string> = { sale: '매매', jeonse: '전세', monthly: '월세' };

function withCommas(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 만원 → "15억 8,000만" */
export function formatManwonText(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const eok = Math.floor(value / 10_000);
  const man = value % 10_000;
  if (eok && man) return `${eok}억 ${withCommas(man)}만`;
  if (eok) return `${eok}억`;
  return `${withCommas(man)}만`;
}

/** 서버 날짜 값 → 한국 시간 { date: "YYYY-MM-DD", time: "HH:mm" | null } */
export function splitKstDateTime(value: string): { date: string; time: string | null } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: null };
  // 오프셋 없는 시각은 이미 한국 시간이다 (이 PC 시간대로 해석하면 시각이 밀린다)
  const local = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (local) return { date: local[1], time: local[2] };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: value.slice(0, 10), time: null };
  const kst = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`,
    time: `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`,
  };
}

/** "2026-11-03T15:00:00+09:00" → "11월 3일 (화) 오후 3:00" */
export function formatSuggestionWhen(value: string): string {
  const { date, time } = splitKstDateTime(value);
  const [year, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const dateText = `${month}월 ${day}일 (${weekday})`;
  if (!time) return dateText;
  return `${dateText} ${formatTime(time)}`;
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`;
}

function rangeText(min: number | null | undefined, max: number | null | undefined, format: (v: number) => string) {
  const low = typeof min === 'number' ? min : null;
  const high = typeof max === 'number' ? max : null;
  if (low !== null && high !== null) return low === high ? format(low) : `${format(low)}~${format(high)}`;
  if (low !== null) return `${format(low)} 이상`;
  if (high !== null) return `${format(high)} 이하`;
  return null;
}

const pyeong = (squareMeters: number) => `${Math.round(squareMeters * 0.3025)}평`;

function requirementLines(fields: BuyerRequirementSuggestionFields, labels: Record<string, string>) {
  const type = fields.transactionType ? TRANSACTION_LABEL[fields.transactionType] : null;
  const price =
    fields.transactionType === 'monthly'
      ? [
          rangeText(fields.depositMin, fields.depositMax, formatManwonText) &&
            `보증금 ${rangeText(fields.depositMin, fields.depositMax, formatManwonText)}`,
          rangeText(fields.monthlyRentMin, fields.monthlyRentMax, formatManwonText) &&
            `월세 ${rangeText(fields.monthlyRentMin, fields.monthlyRentMax, formatManwonText)}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : fields.transactionType === 'jeonse'
        ? rangeText(fields.depositMin ?? fields.priceMin, fields.depositMax ?? fields.priceMax, formatManwonText)
        : rangeText(fields.priceMin, fields.priceMax, formatManwonText);
  return [
    [type, price].filter(Boolean).join(' '),
    rangeText(fields.areaMin, fields.areaMax, pyeong),
    fields.moveInDate ? `입주 ${formatSuggestionWhen(fields.moveInDate)}` : null,
    fields.siteIds?.length ? `희망 단지 ${fields.siteIds.map((id) => labels[id] ?? '단지').join(', ')}` : null,
    fields.urgency === 'urgent' ? '급함' : null,
  ].filter((line): line is string => !!line);
}

// ----------------------------------------------------------------
// 제안의 세 부류: 무엇을 쓰느냐에 따라 확인하는 방식이 다르다
// ----------------------------------------------------------------

/**
 * - followUp: 할 일 · 일정. 가볍게 만들고 지울 수 있다 → 목록에서 한 번에 만든다.
 * - requirement: 희망조건의 값. 틀린 숫자가 섞일 수 있다 → 항목별로 골라서 저장한다.
 * - decision: 매칭 · 매물 확인. 다른 기록에 연쇄 효과가 있다 → 무슨 일이 일어나는지 읽고 직접 실행한다.
 */
export type SuggestionGroup = 'followUp' | 'requirement' | 'decision';

export const SUGGESTION_GROUP_ORDER: SuggestionGroup[] = ['followUp', 'requirement', 'decision'];

export const SUGGESTION_GROUP_LABEL: Record<SuggestionGroup, string> = {
  followUp: '할 일 · 일정',
  requirement: '희망조건',
  decision: '직접 확인할 변경',
};

export function suggestionGroupOf(type: CallSuggestionTypeValue): SuggestionGroup {
  if (type === 'task' || type === 'calendar_event') return 'followUp';
  if (type === 'buyer_requirement_create' || type === 'buyer_requirement_update') return 'requirement';
  return 'decision';
}

/** 버튼에는 "반영"이 아니라 누르면 일어나는 일을 적는다 */
export const SUGGESTION_ACTION_LABEL: Record<CallSuggestionTypeValue, string> = {
  task: '할 일 만들기',
  calendar_event: '일정 만들기',
  buyer_requirement_create: '희망조건 등록',
  buyer_requirement_update: '희망조건 고치기',
  match_create: '매칭 만들기',
  match_stage: '단계 바꾸기',
  listing_confirm: '확인 처리',
};

/** 직접 확인할 변경: 실행하면 무엇이 바뀌는지 (연쇄 효과까지) */
export function describeSuggestionEffect(
  suggestion: Pick<CallActionSuggestion, 'type' | 'payload'>,
): string | null {
  switch (suggestion.type) {
    case 'match_create':
      return '이 고객의 희망조건과 매물을 매칭으로 묶습니다. 희망매물 화면에 새 줄이 생깁니다.';
    case 'match_stage': {
      const { stage } = suggestion.payload as CallSuggestionPayloadByType['match_stage'];
      return stage === 'closed'
        ? '매칭을 종료합니다. 종료한 매칭은 진행 목록에서 빠집니다.'
        : `매칭 단계를 "${MATCH_STAGE_LABEL[stage] ?? stage}"(으)로 바꿉니다.`;
    }
    case 'listing_confirm': {
      const { result } = suggestion.payload as CallSuggestionPayloadByType['listing_confirm'];
      if (result === 'unavailable') return '의뢰를 종료합니다. 매물이 진행 목록에서 빠지고 걸려 있던 매칭도 영향을 받습니다.';
      if (result === 'price_changed') return '매물 가격을 바꾸고 오늘 확인한 것으로 기록합니다. 가격 이력에 남습니다.';
      return '오늘 소유자에게 확인한 것으로 기록합니다. 가격은 그대로 둡니다.';
    }
    default:
      return null;
  }
}

/** 의뢰 종료 · 매칭 종료처럼 되돌리기 번거로운 변경인지 */
export function isHeavySuggestion(suggestion: Pick<CallActionSuggestion, 'type' | 'payload'>): boolean {
  if (suggestion.type === 'match_stage') {
    return (suggestion.payload as CallSuggestionPayloadByType['match_stage']).stage === 'closed';
  }
  if (suggestion.type === 'listing_confirm') {
    return (suggestion.payload as CallSuggestionPayloadByType['listing_confirm']).result === 'unavailable';
  }
  return false;
}

// ----------------------------------------------------------------
// 희망조건: 항목별 "지금 값 → 통화에서 들은 값"
// ----------------------------------------------------------------

type RequirementFieldKey = keyof BuyerRequirementSuggestionFields;

export interface RequirementFieldRow {
  /** 줄 이름 (체크 상태의 키) */
  key: string;
  /** 이 줄이 묶는 값들 (최소·최대는 한 줄로 본다) */
  fieldKeys: RequirementFieldKey[];
  label: string;
  /** 통화에서 들은 값 */
  proposed: string;
  /** 지금 저장된 값. 없거나 모르면 null */
  current: string | null;
  /** 이미 있는 값을 다른 값으로 바꾸는 줄인지 (빈 칸을 채우는 것과 구분) */
  changesExisting: boolean;
  /** 빼고 저장할 수 없는 줄 (새 희망조건의 거래 유형) */
  locked: boolean;
}

const URGENCY_LABEL: Record<string, string> = { urgent: '급함', normal: '보통', flexible: '여유 있음' };
const SITE_TYPE_LABEL: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박시설',
};

/** 저장된 희망조건에서 비교에 쓰는 값 (없으면 지금 값을 모르는 것으로 본다) */
export type RequirementCurrentValues = {
  [K in Exclude<RequirementFieldKey, 'siteIds'>]?: BuyerRequirementSuggestionFields[K] | null;
};

function requirementValueText(
  key: string,
  fields: RequirementCurrentValues & { siteIds?: string[] },
  labels: Record<string, string>,
): string {
  switch (key) {
    case 'transactionType':
      return fields.transactionType ? (TRANSACTION_LABEL[fields.transactionType] ?? fields.transactionType) : '';
    case 'siteTypes':
      return (fields.siteTypes ?? []).map((type) => SITE_TYPE_LABEL[type] ?? type).join(', ');
    case 'price':
      return rangeText(fields.priceMin, fields.priceMax, formatManwonText) ?? '';
    case 'deposit':
      return rangeText(fields.depositMin, fields.depositMax, formatManwonText) ?? '';
    case 'monthlyRent':
      return rangeText(fields.monthlyRentMin, fields.monthlyRentMax, formatManwonText) ?? '';
    case 'area':
      return rangeText(fields.areaMin, fields.areaMax, pyeong) ?? '';
    case 'moveInDate':
      return fields.moveInDate ? formatSuggestionWhen(fields.moveInDate.slice(0, 10)) : '';
    case 'urgency':
      return fields.urgency ? (URGENCY_LABEL[fields.urgency] ?? fields.urgency) : '';
    case 'siteIds':
      return (fields.siteIds ?? []).map((id) => labels[id] ?? '단지').join(', ');
    default:
      return '';
  }
}

const REQUIREMENT_ROWS: Array<{ key: string; label: string; fieldKeys: RequirementFieldKey[] }> = [
  { key: 'transactionType', label: '거래 유형', fieldKeys: ['transactionType'] },
  { key: 'siteTypes', label: '매물 유형', fieldKeys: ['siteTypes'] },
  { key: 'price', label: '매매가', fieldKeys: ['priceMin', 'priceMax'] },
  { key: 'deposit', label: '보증금', fieldKeys: ['depositMin', 'depositMax'] },
  { key: 'monthlyRent', label: '월세', fieldKeys: ['monthlyRentMin', 'monthlyRentMax'] },
  { key: 'area', label: '면적', fieldKeys: ['areaMin', 'areaMax'] },
  { key: 'moveInDate', label: '입주', fieldKeys: ['moveInDate'] },
  { key: 'siteIds', label: '희망 단지', fieldKeys: ['siteIds'] },
  { key: 'urgency', label: '급한 정도', fieldKeys: ['urgency'] },
];

/**
 * 제안이 담은 희망조건 값을 줄로 나눈다.
 * @param current 고치는 제안이면 지금 저장된 값 (아직 못 읽었으면 null — 그때는 비교하지 않는다)
 * @param isCreate 새로 등록하는 제안이면 거래 유형은 뺄 수 없다
 */
export function requirementFieldRows(
  fields: BuyerRequirementSuggestionFields,
  labels: Record<string, string>,
  current: RequirementCurrentValues | null,
  isCreate: boolean,
): RequirementFieldRow[] {
  return REQUIREMENT_ROWS.filter((row) => row.fieldKeys.some((key) => fields[key] !== undefined))
    .map((row) => {
      const proposed = requirementValueText(row.key, fields, labels);
      // 희망 단지는 기존 목록에 더하는 것이라 지금 값과 견주지 않는다
      const currentText = current && row.key !== 'siteIds' ? requirementValueText(row.key, current, labels) : '';
      return {
        key: row.key,
        fieldKeys: row.fieldKeys,
        label: row.label,
        proposed: row.key === 'siteIds' ? `${proposed} 추가` : proposed || '비움',
        current: currentText || null,
        changesExisting: Boolean(currentText) && currentText !== proposed,
        locked: isCreate && row.key === 'transactionType',
      };
    })
    // 지금 값과 같은 줄은 바꿀 것이 없다
    .filter((row) => !(row.current !== null && !row.changesExisting));
}

/** 처음에 체크해 둘 줄: 빈 칸을 채우는 줄은 넣고, 이미 있는 값을 바꾸는 줄은 사람이 고르게 둔다 */
export function defaultIncludedRequirementRows(rows: readonly RequirementFieldRow[]): string[] {
  return rows.filter((row) => row.locked || !row.changesExisting).map((row) => row.key);
}

/**
 * 체크한 줄의 값만 남긴다. 그 밖의 값은 하나도 보내지 않는다:
 * 체크를 뺀 줄은 물론, 화면에 보이지 않은 줄(지금 값과 같아 보여 숨긴 줄 — 평으로 반올림하면 같아도
 * 실제 값은 다를 수 있다)도 보내지 않는다. 사람이 보고 고른 것만 저장한다.
 */
export function pickRequirementFields(
  fields: BuyerRequirementSuggestionFields,
  rows: readonly RequirementFieldRow[],
  includedKeys: readonly string[],
): BuyerRequirementSuggestionFields {
  const kept = new Set<string>(
    rows.filter((row) => row.locked || includedKeys.includes(row.key)).flatMap((row) => row.fieldKeys),
  );
  return Object.fromEntries(Object.entries(fields).filter(([key]) => kept.has(key))) as BuyerRequirementSuggestionFields;
}

/** 카드 본문 줄 */
export function describeSuggestion(
  suggestion: Pick<CallActionSuggestion, 'type' | 'payload'>,
  labels: Record<string, string>,
): string[] {
  const label = (id: string | null | undefined) => (id ? labels[id] : undefined);
  switch (suggestion.type) {
    case 'task': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['task'];
      return [
        payload.dueDate ? `마감 ${formatSuggestionWhen(payload.dueDate)}` : null,
        payload.priority === 'urgent' || payload.priority === 'high' ? '우선순위 높음' : null,
        label(payload.listingId) ?? label(payload.propertyId),
        label(payload.matchId) ?? label(payload.buyerReqId),
      ].filter((line): line is string => !!line);
    }
    case 'calendar_event': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['calendar_event'];
      const end = payload.end ? splitKstDateTime(payload.end).time : null;
      return [
        `${EVENT_TYPE_LABEL[payload.eventType] ?? '일정'} · ${formatSuggestionWhen(payload.start)}${end ? ` ~ ${formatTime(end)}` : ''}`,
        label(payload.listingId) ?? label(payload.propertyId),
        label(payload.matchId),
      ].filter((line): line is string => !!line);
    }
    case 'buyer_requirement_create': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['buyer_requirement_create'];
      return [...requirementLines(payload, labels), payload.memo ? `메모: ${payload.memo}` : null].filter(
        (line): line is string => !!line,
      );
    }
    case 'buyer_requirement_update': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['buyer_requirement_update'];
      return [
        label(payload.buyerReqId),
        ...requirementLines(payload.changes, labels).map((line) => `→ ${line}`),
        payload.memoAppend ? `메모 추가: ${payload.memoAppend}` : null,
      ].filter((line): line is string => !!line);
    }
    case 'match_create': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['match_create'];
      return [label(payload.listingId), label(payload.buyerReqId) && `고객: ${label(payload.buyerReqId)}`].filter(
        (line): line is string => !!line,
      );
    }
    case 'match_stage': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['match_stage'];
      return [label(payload.matchId), `→ ${MATCH_STAGE_LABEL[payload.stage] ?? payload.stage}`].filter(
        (line): line is string => !!line,
      );
    }
    case 'listing_confirm': {
      const payload = suggestion.payload as CallSuggestionPayloadByType['listing_confirm'];
      return [
        label(payload.intakeId),
        CONFIRM_RESULT_LABEL[payload.result] ?? payload.result,
        ...payload.priceChanges.map((change) => {
          const prices = [
            change.price !== undefined && change.price !== null ? formatManwonText(change.price) : null,
            change.deposit !== undefined && change.deposit !== null ? `보증금 ${formatManwonText(change.deposit)}` : null,
            change.monthlyRent !== undefined && change.monthlyRent !== null
              ? `월세 ${formatManwonText(change.monthlyRent)}`
              : null,
          ].filter(Boolean);
          return `${label(change.listingId) ?? '매물'} → ${prices.join(' / ')}`;
        }),
        payload.memo ? `메모: ${payload.memo}` : null,
      ].filter((line): line is string => !!line);
    }
    default:
      return [];
  }
}

/** 편집한 날짜·시각 → 서버 값 (한국 시간 오프셋을 붙인다) */
export function toKstValue(date: string, time: string | null): string {
  return time ? `${date}T${time}:00+09:00` : date;
}
