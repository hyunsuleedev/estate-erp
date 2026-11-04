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
  viewingConfirmed: '임장 가능 확인',
  viewing: '임장',
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
