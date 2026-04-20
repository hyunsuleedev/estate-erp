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

export interface CallRecordingsListResponse {
  items: CallRecordingListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function createCallRecordingsApi(request: RequestFn) {
  return {
    list: (params?: { contactId?: string; page?: number; limit?: number }) =>
      request<CallRecordingsListResponse>('/consultations/recordings/list', {
        params: params as Record<string, string | number | undefined>,
      }),

    findOne: (id: string) =>
      request<CallRecordingDetail>(`/consultations/recordings/${id}`),

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
