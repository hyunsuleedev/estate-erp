import type { RequestFn } from '../client.js';

export type SttStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';
export type AnalysisStatus = 'none' | 'processing' | 'completed' | 'failed';
export type CallDirection = 'inbound' | 'outbound';

export interface CallRecordingMessage {
  speaker: number;
  speakerLabel: string | null;
  text: string;
  startMs: number;
  endMs: number;
  seq: number;
}

export interface CallRecordingAnalysis {
  summary?: string;
  customerNeed?: string;
  nextActions?: string[] | string;
  [key: string]: unknown;
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
  analysisStatus: AnalysisStatus;
  analysis: CallRecordingAnalysis | null;
  calledAt: string;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; phone: string | null } | null;
  user: { id: string; name: string };
  messages: CallRecordingMessage[];
  _count?: { messages: number };
}

export interface CallRecordingDetail extends CallRecordingListItem {
  consultations: Array<{
    id: string;
    content: string;
    type: string;
    createdAt: string;
  }>;
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
