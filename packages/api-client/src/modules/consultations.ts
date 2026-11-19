import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type {
  ListingIntakeState,
  ListingOccupyingDeal,
} from './listings.js';

export interface ConsultationListingIntake extends ListingIntakeState {
  id: string;
  propertyId: string;
  receivedAt: string;
}

/** 상담 목록에 함께 오는 녹음 요약. 받아쓰기 전문과 분석 전체는 callRecordings.findOne으로 읽는다. */
export interface ConsultationRecordingSummary {
  id: string;
  /** inbound / outbound / visit */
  direction: string;
  durationSec: number;
  hasFile: boolean;
  /** none / pending / processing / completed / failed */
  sttStatus: string;
  /** none / processing / completed / failed */
  analysisStatus: string;
  /** AI가 쓴 한 줄 요약 (분석 전이면 null) */
  summary: string | null;
  /** 아직 반영·무시하지 않은 업무 제안 수 */
  pendingSuggestionCount: number;
  /** 상담 내용이 분석이 써 넣은 글 그대로인지 (사람이 고쳤거나 직접 적었으면 false) */
  contentIsAuto: boolean;
}

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
  /** 녹음 요약. 예전 서버는 보내지 않는다(undefined). */
  callRecording?: ConsultationRecordingSummary | null;
  propertyId: string | null;
  listingIntakeId: string | null;
  listingId: string | null;
  matchId: string | null;
  buyerIntakeId: string | null;
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
      /** 호 이름. 호 없이 층이 단위인 공간은 null */
      name: string | null;
      floor: number | null;
      lineNo: number | null;
      dong?: {
        id: string;
        name: string;
        isPlaceholder: boolean;
      } | null;
    } | null;
  } | null;
  listingIntake?: ConsultationListingIntake | null;
  listing?: {
    id: string;
    transactionType: string;
    price: number | null;
    isPaused: boolean;
    intake?: ListingIntakeState | null;
    deals?: ListingOccupyingDeal[];
  } | null;
  match?: {
    id: string;
    stage: string;
  } | null;
  buyerIntake?: {
    id: string;
    lifecycleStatus: string;
    receivedAt: string;
  } | null;
  buyerRequirement?: {
    id: string;
    buyerIntakeId: string;
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
  buyerIntakeId?: string;
  buyerReqId?: string;
  context?:
    | 'property'
    | 'listingIntake'
    | 'listing'
    | 'match'
    | 'buyerIntake'
    | 'buyerRequirement'
    | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  /** with = 녹음이 붙은 상담만, without = 녹음 없는 상담만 */
  recording?: 'with' | 'without';
  /** pending = 아직 처리하지 않은 통화 분석 제안이 있는 상담만 */
  suggestions?: 'pending';
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
  buyerIntakeId?: string;
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
  /** 없으면 전화번호(또는 녹음 파일 이름의 번호)로 서버가 찾는다 */
  contactId?: string;
  type?: string;
  direction?: 'inbound' | 'outbound';
  phoneNumber?: string;
  durationSec?: number;
  /** 통화 시각 (ISO). 없으면 녹음 파일 이름에서 읽는다 */
  calledAt?: string;
  /** 녹음 파일 (audio) */
  file: Blob | File;
  fileName?: string;
}

export interface AttachConsultationRecordingDto {
  file: Blob | File;
  fileName?: string;
  durationSec?: number;
  /** 상담한 시각 (ISO). 없으면 상담 기록의 시각을 쓴다 */
  calledAt?: string;
  /** 전화 상담일 때만: inbound / outbound */
  direction?: 'inbound' | 'outbound';
}

export interface AttachConsultationRecordingResponse {
  recording: {
    id: string;
    sttStatus: string;
    fileName: string | null;
    fileSize: number | null;
  };
  consultation: { id: string };
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

    /** 이미 적어 둔 상담에 녹음을 붙인다 (multipart). 상담 내용은 그대로 두고 받아쓰기·분석만 더한다. */
    attachRecording: (id: string, dto: AttachConsultationRecordingDto) => {
      const form = new FormData();
      form.append('file', dto.file, dto.fileName ?? (dto.file instanceof File ? dto.file.name : 'recording'));
      if (dto.durationSec != null) form.append('durationSec', String(dto.durationSec));
      if (dto.calledAt) form.append('calledAt', dto.calledAt);
      if (dto.direction) form.append('direction', dto.direction);
      return request<AttachConsultationRecordingResponse>(`/consultations/${id}/recording`, {
        method: 'POST',
        body: form,
      });
    },

    /** 녹음 파일과 함께 통화 기록 생성 (multipart). STT는 서버에서 비동기 처리. */
    createWithRecording: (dto: CreateConsultationWithRecordingDto) => {
      const form = new FormData();
      form.append('file', dto.file, dto.fileName ?? (dto.file instanceof File ? dto.file.name : 'recording'));
      if (dto.contactId) form.append('contactId', dto.contactId);
      if (dto.type) form.append('type', dto.type);
      if (dto.direction) form.append('direction', dto.direction);
      if (dto.phoneNumber) form.append('phoneNumber', dto.phoneNumber);
      if (dto.durationSec != null) form.append('durationSec', String(dto.durationSec));
      if (dto.calledAt) form.append('calledAt', dto.calledAt);
      return request<ConsultationWithRecordingResponse>('/consultations/with-recording', {
        method: 'POST',
        body: form,
      });
    },
  };
}
