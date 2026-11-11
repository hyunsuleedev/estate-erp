import { CallSuggestionType } from '@estate-erp/shared';
import {
  isCallSuggestionType,
  pyeongToSquareMeters,
  type SuggestionPayload,
  validateSuggestionPayload,
} from '../call-suggestion.payload';
import type { CallContext, RefEntry, RefKind } from './call-context';

/**
 * AI 분석 응답을 검증한다.
 * - 참조(L1 등)를 실제 id로 바꾸고, 목록에 없거나 종류가 다른 참조가 있으면 그 제안을 버린다.
 * - 연락처가 없으면 연락처가 필요한 제안을 버린다.
 * - 이미 진행 중인 매칭, 허용되지 않은 매칭 단계는 버린다.
 */

export interface ParsedSuggestion {
  type: CallSuggestionType;
  title: string;
  evidence: string | null;
  payload: SuggestionPayload;
}

export interface ConsultationLinks {
  propertyId: string | null;
  listingIntakeId: string | null;
  listingId: string | null;
  buyerIntakeId: string | null;
  buyerReqId: string | null;
  matchId: string | null;
}

// 분석 JSON 칸에 그대로 저장하므로 interface가 아닌 type으로 둔다 (Prisma JSON 타입과 호환)

/** 근거가 붙은 분석 항목. lines는 근거가 된 받아쓰기 줄 번호(CallRecordingMessage.seq)다. */
export type AnalysisPoint = {
  text: string;
  lines: number[];
};

/** 통화에서 말한 값. previous는 말하다 고친 경우 고치기 전 값이다. */
export type AnalysisFact = {
  label: string;
  value: string;
  previous: string | null;
  lines: number[];
};

export interface ParsedCallAnalysis {
  summary: string;
  /** 상담 기록·예전 화면용 글 목록 (points의 text와 같다) */
  keyPoints: string[];
  points: AnalysisPoint[];
  facts: AnalysisFact[];
  /** 중개사가 원문을 듣고 확인할 점 */
  checks: AnalysisPoint[];
  customerNeed: string | null;
  callType: string;
  sentiment: string;
  agentSpeaker: number | null;
  links: ConsultationLinks;
  suggestions: ParsedSuggestion[];
  dropped: Array<{ type: string; reason: string }>;
}

const MAX_SUGGESTIONS = 8;
const MAX_POINTS = 12;
const MAX_FACTS = 10;
const MAX_CHECKS = 6;
const MAX_LINES_PER_ITEM = 3;

const CONTACT_REQUIRED_TYPES: CallSuggestionType[] = [
  CallSuggestionType.BUYER_REQUIREMENT_CREATE,
  CallSuggestionType.BUYER_REQUIREMENT_UPDATE,
  CallSuggestionType.MATCH_CREATE,
  CallSuggestionType.MATCH_STAGE,
  CallSuggestionType.LISTING_CONFIRM,
];

class DropSuggestion extends Error {}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 근거 줄 번호: 받아쓰기에 있는 번호만, 중복 없이 순서대로 */
function lineRefs(value: unknown, validLines: Set<number>): number[] {
  if (!Array.isArray(value)) return [];
  const lines: number[] = [];
  for (const item of value) {
    const line = typeof item === 'string' ? Number(item) : item;
    if (typeof line !== 'number' || !Number.isInteger(line) || !validLines.has(line)) continue;
    if (!lines.includes(line)) lines.push(line);
    if (lines.length >= MAX_LINES_PER_ITEM) break;
  }
  return lines.sort((a, b) => a - b);
}

/** 글 항목 목록. 예전 형식(글만 있는 배열)도 받는다. */
function parsePoints(
  value: unknown,
  validLines: Set<number>,
  max: number,
  maxLength: number,
): AnalysisPoint[] {
  if (!Array.isArray(value)) return [];
  const points: AnalysisPoint[] = [];
  for (const raw of value) {
    const item = typeof raw === 'string' ? { text: raw } : record(raw);
    const pointText = text(item.text, maxLength);
    if (!pointText) continue;
    points.push({ text: pointText, lines: lineRefs(item.lines, validLines) });
    if (points.length >= max) break;
  }
  return points;
}

function parseFacts(value: unknown, validLines: Set<number>): AnalysisFact[] {
  if (!Array.isArray(value)) return [];
  const facts: AnalysisFact[] = [];
  for (const raw of value) {
    const item = record(raw);
    const label = text(item.label, 40);
    const factValue = text(item.value, 80);
    if (!label || !factValue) continue;
    const previous = text(item.previous, 80);
    facts.push({
      label,
      value: factValue,
      previous: previous && previous !== factValue && previous.toLowerCase() !== 'null' ? previous : null,
      lines: lineRefs(item.lines, validLines),
    });
    if (facts.length >= MAX_FACTS) break;
  }
  return facts;
}

function lookup(context: CallContext, value: unknown, kind: RefKind): RefEntry | null {
  if (value === undefined || value === null || value === '') return null;
  const entry = typeof value === 'string' ? context.refs.get(value.trim()) : undefined;
  if (!entry || entry.kind !== kind) {
    throw new DropSuggestion(`알 수 없는 참조 ${String(value)}`);
  }
  return entry;
}

function refId(context: CallContext, value: unknown, kind: RefKind): string | null {
  return lookup(context, value, kind)?.id ?? null;
}

function requiredRef(context: CallContext, value: unknown, kind: RefKind): RefEntry {
  const entry = lookup(context, value, kind);
  if (!entry) throw new DropSuggestion(`${kind} 참조가 없습니다`);
  return entry;
}

function pyeong(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) return null;
  return pyeongToSquareMeters(number);
}

/** "2027-03" 처럼 달까지만 말하면 그 달 1일로 둔다 */
function moveInDate(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) return `${value.trim()}-01`;
  return value;
}

function requirementFields(context: CallContext, data: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const key of [
    'transactionType',
    'siteTypes',
    'priceMin',
    'priceMax',
    'depositMin',
    'depositMax',
    'monthlyRentMin',
    'monthlyRentMax',
    'urgency',
  ]) {
    if (data[key] !== undefined && data[key] !== null) fields[key] = data[key];
  }
  const areaMin = pyeong(data.areaMinPyeong);
  if (areaMin !== undefined && areaMin !== null) fields.areaMin = areaMin;
  const areaMax = pyeong(data.areaMaxPyeong);
  if (areaMax !== undefined && areaMax !== null) fields.areaMax = areaMax;
  if (data.moveInDate !== undefined && data.moveInDate !== null) {
    fields.moveInDate = moveInDate(data.moveInDate);
  }
  if (Array.isArray(data.siteRefs) && data.siteRefs.length > 0) {
    fields.siteIds = data.siteRefs.map((ref) => requiredRef(context, ref, 'site').id);
  }
  return fields;
}

function toCandidatePayload(
  type: CallSuggestionType,
  data: Record<string, unknown>,
  title: string | null,
  context: CallContext,
): Record<string, unknown> {
  switch (type) {
    case CallSuggestionType.TASK:
      return {
        title: text(data.title, 120) ?? title,
        content: data.content,
        dueDate: data.dueDate,
        priority: data.priority,
        listingId: refId(context, data.listingRef, 'listing'),
        propertyId: refId(context, data.propertyRef, 'property'),
        buyerReqId: refId(context, data.requirementRef, 'requirement'),
        matchId: refId(context, data.matchRef, 'match'),
      };
    case CallSuggestionType.CALENDAR_EVENT:
      return {
        title: text(data.title, 120) ?? title,
        start: data.start,
        end: data.end,
        eventType: data.eventType,
        description: data.description,
        listingId: refId(context, data.listingRef, 'listing'),
        propertyId: refId(context, data.propertyRef, 'property'),
        matchId: refId(context, data.matchRef, 'match'),
      };
    case CallSuggestionType.BUYER_REQUIREMENT_CREATE:
      return {
        ...requirementFields(context, data),
        buyerIntakeId: refId(context, data.buyerIntakeRef, 'buyerIntake'),
        memo: data.memo,
      };
    case CallSuggestionType.BUYER_REQUIREMENT_UPDATE:
      return {
        buyerReqId: requiredRef(context, data.requirementRef, 'requirement').id,
        changes: requirementFields(context, data),
        memoAppend: data.memoAppend,
      };
    case CallSuggestionType.MATCH_CREATE: {
      const requirement = requiredRef(context, data.requirementRef, 'requirement');
      const listing = requiredRef(context, data.listingRef, 'listing');
      if (context.openMatchKeys.has(`${listing.id}:${requirement.id}`)) {
        throw new DropSuggestion('이미 진행 중인 매칭입니다');
      }
      return { listingId: listing.id, buyerReqId: requirement.id, memo: data.memo };
    }
    case CallSuggestionType.MATCH_STAGE: {
      const match = requiredRef(context, data.matchRef, 'match');
      if (typeof data.stage !== 'string' || !match.allowedStages?.includes(data.stage)) {
        throw new DropSuggestion('지금 단계에서 갈 수 없는 매칭 단계입니다');
      }
      return { matchId: match.id, stage: data.stage };
    }
    case CallSuggestionType.LISTING_CONFIRM: {
      const intake = requiredRef(context, data.intakeRef, 'intake');
      const priceChanges = Array.isArray(data.priceChanges)
        ? data.priceChanges.map((raw) => {
            const change = record(raw);
            const listing = requiredRef(context, change.listingRef, 'listing');
            if (listing.intakeId !== intake.id) {
              throw new DropSuggestion('다른 의뢰의 매물 가격입니다');
            }
            return {
              listingId: listing.id,
              price: change.price ?? undefined,
              deposit: change.deposit ?? undefined,
              monthlyRent: change.monthlyRent ?? undefined,
            };
          })
        : [];
      return { intakeId: intake.id, result: data.result, priceChanges, memo: data.memo };
    }
  }
}

function parseLinks(context: CallContext, raw: unknown): ConsultationLinks {
  const links: ConsultationLinks = {
    propertyId: null,
    listingIntakeId: null,
    listingId: null,
    buyerIntakeId: null,
    buyerReqId: null,
    matchId: null,
  };
  const data = record(raw);
  const safe = (value: unknown, kind: RefKind) => {
    try {
      return lookup(context, value, kind);
    } catch {
      return null;
    }
  };

  const property = safe(data.propertyRef, 'property');
  const intake = safe(data.intakeRef, 'intake');
  const listing = safe(data.listingRef, 'listing');
  const requirement = safe(data.requirementRef, 'requirement');
  const match = safe(data.matchRef, 'match');

  if (listing) {
    links.listingId = listing.id;
    links.listingIntakeId = listing.intakeId ?? null;
    links.propertyId = listing.propertyId ?? null;
  }
  if (intake) {
    links.listingIntakeId = intake.id;
    links.propertyId = intake.propertyId ?? links.propertyId;
  }
  if (property && !links.propertyId) links.propertyId = property.id;
  if (match) {
    links.matchId = match.id;
    links.listingId = links.listingId ?? match.listingId ?? null;
  }
  // 상담의 고객 요청 연결은 (구매 의뢰, 요청) 쌍이 맞아야 한다
  if (requirement?.buyerIntakeId) {
    links.buyerReqId = requirement.id;
    links.buyerIntakeId = requirement.buyerIntakeId;
  }
  return links;
}

/**
 * @param transcriptLines 받아쓰기 줄 번호(seq) 목록. 근거 줄은 이 안의 번호만 남긴다.
 */
export function parseCallAnalysis(
  raw: unknown,
  context: CallContext,
  speakers: number[],
  transcriptLines: number[],
): ParsedCallAnalysis {
  const data = record(raw);
  const summary = text(data.summary, 1000);
  if (!summary) throw new Error('분석 결과에 요약이 없습니다');

  const validLines = new Set(transcriptLines);
  const points = parsePoints(data.keyPoints, validLines, MAX_POINTS, 300);
  const facts = parseFacts(data.facts, validLines);
  const checks = parsePoints(data.checks, validLines, MAX_CHECKS, 200);
  const agentSpeaker =
    typeof data.agentSpeaker === 'number' && speakers.includes(data.agentSpeaker)
      ? data.agentSpeaker
      : null;

  const suggestions: ParsedSuggestion[] = [];
  const dropped: Array<{ type: string; reason: string }> = [];
  const seen = new Set<string>();
  const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  for (const rawSuggestion of rawSuggestions) {
    const item = record(rawSuggestion);
    const type = item.type;
    if (!isCallSuggestionType(type)) {
      dropped.push({ type: String(type), reason: '알 수 없는 제안 종류' });
      continue;
    }
    if (!context.contactId && CONTACT_REQUIRED_TYPES.includes(type)) {
      dropped.push({ type, reason: '연락처가 필요한 제안' });
      continue;
    }
    const title = text(item.title, 120);
    try {
      const candidate = toCandidatePayload(type, record(item.data), title, context);
      const validation = validateSuggestionPayload(type, candidate);
      if (!validation.ok) {
        dropped.push({ type, reason: validation.error });
        continue;
      }
      const key = `${type}:${JSON.stringify(validation.payload)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        type,
        title: title ?? (validation.payload as { title?: string }).title ?? type,
        evidence: text(item.evidence, 300),
        payload: validation.payload,
      });
    } catch (error) {
      if (error instanceof DropSuggestion) {
        dropped.push({ type, reason: error.message });
        continue;
      }
      throw error;
    }
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return {
    summary,
    keyPoints: points.map((point) => point.text),
    points,
    facts,
    checks,
    customerNeed: text(data.customerNeed, 300),
    callType: text(data.callType, 30) ?? '기타',
    sentiment: ['positive', 'neutral', 'negative'].includes(String(data.sentiment))
      ? String(data.sentiment)
      : 'neutral',
    agentSpeaker,
    links: parseLinks(context, data.links),
    suggestions,
    dropped,
  };
}

/**
 * 저장된 분석에서 근거 줄 번호만 지운다.
 * 받아쓰기를 새로 만들면 예전 분석의 줄 번호는 새 받아쓰기의 다른 줄을 가리키게 된다.
 */
export function stripEvidenceLines(analysis: unknown): unknown {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis;
  const stripped: Record<string, unknown> = { ...(analysis as Record<string, unknown>) };
  for (const key of ['points', 'facts', 'checks']) {
    const items = stripped[key];
    if (!Array.isArray(items)) continue;
    stripped[key] = items.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item) ? { ...item, lines: [] } : item,
    );
  }
  return stripped;
}

/** 상담 기록 본문: 요약 + 핵심 정보 + 확인할 점 */
export function buildConsultationContent(
  analysis: Pick<ParsedCallAnalysis, 'summary' | 'keyPoints'> & { checks?: Array<{ text: string }> },
) {
  return [
    analysis.summary,
    ...analysis.keyPoints.map((point) => `· ${point}`),
    ...(analysis.checks ?? []).map((check) => `· 확인 필요: ${check.text}`),
  ].join('\n');
}
