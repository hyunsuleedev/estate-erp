import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface Consultation {
  id: string;
  officeId: string;
  contactId: string;
  createdById: string;
  type: string;
  purpose: string;
  content: string;
  /** 통화 녹음 연결 (nullable — 녹음 없는 상담도 있음). 상세는 callRecordings.findOne으로 조회. */
  callRecordingId: string | null;
  propertyId: string | null;
  listingIntakeId: string | null;
  listingId: string | null;
  matchId: string | null;
  buyerReqId: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
  createdBy?: { id: string; name: string } | null;
  property?: {
    id: string;
    site?: { name: string | null } | null;
    unit?: {
      id: string;
      name: string;
      floor: number | null;
      lineNo: number | null;
      dong?: {
        id: string;
        name: string;
        isPlaceholder: boolean;
      } | null;
    } | null;
  } | null;
  listingIntake?: {
    id: string;
    status: string;
    propertyId: string;
    receivedAt: string;
  } | null;
  listing?: {
    id: string;
    transactionType: string;
    price: number | null;
    checkStatus: string;
  } | null;
  match?: {
    id: string;
    stage: string;
  } | null;
  buyerRequirement?: {
    id: string;
    status: string;
    transactionType: string | null;
  } | null;
}

export interface ConsultationsFilter {
  q?: string;
  contactId?: string;
  propertyId?: string;
  siteId?: string;
  dongId?: string;
  unitId?: string;
  listingIntakeId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
  context?: 'property' | 'listingIntake' | 'listing' | 'match' | 'buyerRequirement' | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateConsultationDto {
  contactId: string;
  type: string;
  purpose?: string;
  content: string;
  propertyId?: string;
  listingIntakeId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
  /** 기존 통화 녹음(CallRecording)을 상담에 연결 */
  callRecordingId?: string;
}

// 서버 PATCH /consultations/:id는 type/content만 허용 (purpose·컨텍스트 FK 변경 불가)
export interface UpdateConsultationDto {
  type?: string;
  content?: string;
}

/**
 * POST /consultations/with-recording (multipart) 응답.
 * 녹음 파일 업로드 → CallRecording 생성 → 비동기 STT 시작.
 */
export interface ConsultationWithRecordingResponse {
  recording: {
    id: string;
    sttStatus: string;
    fileName: string | null;
    fileSize: number | null;
  };
  /** 하위 호환 필드 — recording.id와 동일한 id */
  consultation: { id: string; content: string };
  sttStatus: string;
  recordingFileName: string;
  recordingSize: number;
}

export interface CreateConsultationWithRecordingDto {
  contactId: string;
  type?: string;
  direction?: 'inbound' | 'outbound';
  phoneNumber?: string;
  durationSec?: number;
  /** 녹음 파일 (audio) */
  file: Blob | File;
  fileName?: string;
}

export function createConsultationsApi(request: RequestFn) {
  return {
    getRecent: (limit?: number) =>
      request<Consultation[]>('/consultations/recent', { params: { limit } }),

    findAll: (filters?: ConsultationsFilter) =>
      request<PaginatedResponse<Consultation>>('/consultations', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Consultation>(`/consultations/${id}`),

    create: (dto: CreateConsultationDto) =>
      request<Consultation>('/consultations', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateConsultationDto) =>
      request<Consultation>(`/consultations/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/consultations/${id}`, { method: 'DELETE' }),

    /** 녹음 파일과 함께 통화 기록 생성 (multipart). STT는 서버에서 비동기 처리. */
    createWithRecording: (dto: CreateConsultationWithRecordingDto) => {
      const form = new FormData();
      form.append('file', dto.file, dto.fileName ?? (dto.file instanceof File ? dto.file.name : 'recording'));
      form.append('contactId', dto.contactId);
      if (dto.type) form.append('type', dto.type);
      if (dto.direction) form.append('direction', dto.direction);
      if (dto.phoneNumber) form.append('phoneNumber', dto.phoneNumber);
      if (dto.durationSec != null) form.append('durationSec', String(dto.durationSec));
      return request<ConsultationWithRecordingResponse>('/consultations/with-recording', {
        method: 'POST',
        body: form,
      });
    },
  };
}
