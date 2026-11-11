import type { RequestFn } from '../client.js';

export type SttStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';
export type AnalysisStatus = 'none' | 'processing' | 'completed' | 'failed';
/** visit: 방문 상담 녹음 (통화가 아님) */
export type CallDirection = 'inbound' | 'outbound' | 'visit';

export interface CallRecordingMessage {
  speaker: number;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  seq: number;
}

/** 근거가 붙은 분석 항목. lines는 근거가 된 받아쓰기 줄 번호(CallRecordingMessage.seq) */
export interface CallAnalysisPoint {
  text: string;
  lines: number[];
}

/** 통화에서 말한 값. previous는 말하다 고친 경우 고치기 전 값 */
export interface CallAnalysisFact {
  label: string;
  value: string;
  previous: string | null;
  lines: number[];
}

export interface CallRecordingAnalysis {
  summary?: string;
  keyPoints?: string[];
  /** 근거 줄이 붙은 핵심 정보 (2026-11-08 이후 분석). 없으면 keyPoints를 쓴다. */
  points?: CallAnalysisPoint[];
  /** 통화에서 말한 숫자·날짜 값 */
  facts?: CallAnalysisFact[];
  /** 중개사가 원문을 듣고 확인할 점 */
  checks?: CallAnalysisPoint[];
  customerNeed?: string | null;
  callType?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  /** 중개사무소 직원 화자 번호 */
  agentSpeaker?: number | null;
  /** 하위 호환: 제안 제목 목록 */
  nextActions?: string[] | string;
  /** 마지막 분석이 실패했을 때의 이유 (이전 분석 결과는 남아 있다) */
  error?: string;
  [key: string]: unknown;
}

// ── 통화 분석 제안 ───────────────────────────────────────────

export type CallSuggestionTypeValue =
  | 'task'
  | 'calendar_event'
  | 'buyer_requirement_create'
  | 'buyer_requirement_update'
  | 'match_create'
  | 'match_stage'
  | 'listing_confirm';

export type CallSuggestionStatusValue = 'pending' | 'applying' | 'accepted' | 'dismissed';

export interface TaskSuggestionPayload {
  title: string;
  content: string | null;
  /** "YYYY-MM-DD" 또는 KST 오프셋이 붙은 ISO 시각 */
  dueDate: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
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
  eventType: 'viewing' | 'contract' | 'meeting' | 'general';
  description: string | null;
  listingId: string | null;
  propertyId: string | null;
  matchId: string | null;
}

/** 가격은 만원, 면적은 m²(공급면적) */
export interface BuyerRequirementSuggestionFields {
  transactionType?: 'sale' | 'jeonse' | 'monthly';
  siteTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  depositMin?: number | null;
  depositMax?: number | null;
  monthlyRentMin?: number | null;
  monthlyRentMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  moveInDate?: string | null;
  urgency?: 'urgent' | 'normal' | 'flexible';
  siteIds?: string[];
}

export interface BuyerRequirementCreateSuggestionPayload extends BuyerRequirementSuggestionFields {
  buyerIntakeId: string | null;
  memo: string | null;
}

export interface BuyerRequirementUpdateSuggestionPayload {
  buyerReqId: string;
  changes: BuyerRequirementSuggestionFields;
  memoAppend: string | null;
}

export interface MatchCreateSuggestionPayload {
  listingId: string;
  buyerReqId: string;
  memo: string | null;
}

export interface MatchStageSuggestionPayload {
  matchId: string;
  stage: 'buyerInterested' | 'viewingConfirmed' | 'viewing' | 'negotiating' | 'closed';
}

export interface ListingConfirmSuggestionPayload {
  intakeId: string;
  result: 'alive' | 'price_changed' | 'unavailable';
  priceChanges: Array<{
    listingId: string;
    price?: number | null;
    deposit?: number | null;
    monthlyRent?: number | null;
  }>;
  memo: string | null;
}

export interface CallSuggestionPayloadByType {
  task: TaskSuggestionPayload;
  calendar_event: CalendarEventSuggestionPayload;
  buyer_requirement_create: BuyerRequirementCreateSuggestionPayload;
  buyer_requirement_update: BuyerRequirementUpdateSuggestionPayload;
  match_create: MatchCreateSuggestionPayload;
  match_stage: MatchStageSuggestionPayload;
  listing_confirm: ListingConfirmSuggestionPayload;
}

/** 통화 분석이 제안한 업무. 사람이 확인한 뒤 반영한다. */
export interface CallActionSuggestion {
  id: string;
  recordingId?: string;
  consultationId: string | null;
  type: CallSuggestionTypeValue;
  status: CallSuggestionStatusValue;
  title: string;
  /** 근거가 된 통화 원문 */
  evidence: string | null;
  payload: CallSuggestionPayloadByType[CallSuggestionTypeValue];
  seq: number;
  appliedEntityType: string | null;
  appliedEntityId: string | null;
  /** 실제로 반영한 내용 (고쳐서 반영했으면 고친 내용) */
  appliedPayload: CallSuggestionPayloadByType[CallSuggestionTypeValue] | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface CallRecordingListItem {
  id: string;
  officeId: string;
  contactId: string | null;
  userId: string;
  direction: string;
  phoneNumber: string;
  durationSec: number;
  fileName: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  sttStatus: SttStatus;
  /** gemini / vito / dummy */
  sttProvider?: string | null;
  /** 받아쓰기 실패 이유 */
  sttError?: string | null;
  analysisStatus: AnalysisStatus;
  analysis: CallRecordingAnalysis | null;
  analyzedAt?: string | null;
  /** 분석이 자동으로 남긴 상담 기록 */
  autoConsultationId?: string | null;
  calledAt: string;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; phone: string | null } | null;
  user: { id: string; name: string };
  messages: CallRecordingMessage[];
  /** suggestions: 아직 처리하지 않은 분석 제안 수 */
  _count?: { messages: number; suggestions?: number };
}

export interface CallRecordingDetail extends CallRecordingListItem {
  consultations: Array<{
    id: string;
    content: string;
    type: string;
    purpose?: string;
    createdAt: string;
  }>;
  suggestions?: CallActionSuggestion[];
  /** 제안이 가리키는 대상 이름 (id → "래미안 101동 3501호 · 매매 15억") */
  suggestionLabels?: Record<string, string>;
}

/** 기간 필터만 반영된 요약 통계 (방향/상태/검색 필터와 무관) */
export interface CallRecordingsListStats {
  total: number;
  inbound: number;
  outbound: number;
  /** 수신 && durationSec < 5 휴리스틱 */
  missed: number;
  sttCompleted: number;
}

export interface CallRecordingsListResponse {
  items: CallRecordingListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: CallRecordingsListStats;
}

export interface CallRecordingsListParams {
  contactId?: string;
  direction?: CallDirection | string;
  sttStatus?: SttStatus | string;
  /** ISO 날짜 문자열 — calledAt >= dateFrom */
  dateFrom?: string;
  /** ISO 날짜 문자열 — calledAt <= dateTo */
  dateTo?: string;
  /** 이름·번호·대화내용 통합 검색 */
  q?: string;
  /** 녹음은 있는데 아직 상담 기록이 없는 것만 (연결 대기) */
  unlinked?: boolean;
  page?: number;
  limit?: number;
}

export interface UpdateCallRecordingDto {
  /** 미등록 번호 → 연락처 연결 (null = 연결 해제) */
  contactId?: string | null;
  /** 화자 라벨 일괄 수정 (예: speaker 0 = "나", speaker 1 = "고객") */
  speakerLabels?: Array<{ speaker: number; label: string }>;
}

export function createCallRecordingsApi(request: RequestFn) {
  return {
    list: (params?: CallRecordingsListParams) =>
      request<CallRecordingsListResponse>('/consultations/recordings/list', {
        params: params as Record<string, string | number | undefined>,
      }),

    findOne: (id: string) =>
      request<CallRecordingDetail>(`/consultations/recordings/${id}`),

    update: (id: string, dto: UpdateCallRecordingDto) =>
      request<CallRecordingDetail>(`/consultations/recordings/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    /** 받아쓰기는 그대로 두고 분석(요약·업무 제안)만 다시 한다 */
    reanalyze: (id: string) =>
      request<{ id: string; analysisStatus: AnalysisStatus }>(
        `/consultations/recordings/${id}/reanalyze`,
        { method: 'POST' },
      ),

    listSuggestions: (params?: { recordingId?: string; status?: string }) =>
      request<CallActionSuggestion[]>('/call-suggestions', {
        params: params as Record<string, string | undefined>,
      }),

    /** 제안 반영. payload를 주면 고친 내용으로 반영한다. */
    acceptSuggestion: <T extends CallSuggestionTypeValue>(
      id: string,
      payload?: CallSuggestionPayloadByType[T],
    ) =>
      request<CallActionSuggestion>(`/call-suggestions/${id}/accept`, {
        method: 'POST',
        body: payload ? { payload } : {},
      }),

    dismissSuggestion: (id: string) =>
      request<CallActionSuggestion>(`/call-suggestions/${id}/dismiss`, { method: 'POST' }),

    restoreSuggestion: (id: string) =>
      request<CallActionSuggestion>(`/call-suggestions/${id}/restore`, { method: 'POST' }),

    getSttStatus: (id: string) =>
      request<{
        id: string;
        sttStatus: SttStatus;
        analysisStatus?: AnalysisStatus;
        analysis?: CallRecordingAnalysis | null;
        content: string;
        messages: CallRecordingMessage[];
      }>(`/consultations/${id}/stt-status`),
  };
}
