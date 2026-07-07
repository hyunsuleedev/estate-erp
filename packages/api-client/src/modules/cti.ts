import type { RequestFn } from '../client.js';

// 와이어 계약: packages/shared/src/cti.ts CtiCallEvent와 동일 (서버 POST /cti/call-events)
export interface CtiCallEventInput {
  type: 'ring' | 'terminate' | 'ctc_result';
  vendor: string;
  caller: string;
  callee: string;
  lineId?: string;
  seqno?: string;
  durationSec?: number;
  /** 생략 시 inbound. 모바일(vendor=mobile)은 발신 통화도 기록 */
  direction?: 'inbound' | 'outbound';
  occurredAt: string;
}

export type CallLogStatus = 'ringing' | 'answered' | 'missed' | 'ended';

export interface CallLog {
  id: string;
  officeId: string;
  userId: string | null;
  contactId: string | null;
  direction: 'inbound' | 'outbound';
  phoneNumber: string;
  lineNumber: string | null;
  vendor: string | null;
  vendorSeqno: string | null;
  status: CallLogStatus;
  durationSec: number;
  consultationId: string | null;
  recordingId: string | null;
  memo: string | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface IngestCallEventResult {
  handled: boolean;
  deduped?: boolean;
  callLog?: CallLog;
}

export interface CtiLookupVendorContact {
  id: string;
  name: string;
  phone: string;
  role: string | null;
  vendor: { id: string; name: string };
}

export interface CtiLookupProperty {
  role: string;
  property: {
    id: string;
    site: { id: string; name: string };
    unit: {
      id: string;
      name: string;
      dong: { name: string; isPlaceholder: boolean } | null;
    } | null;
  };
}

export interface CtiLookupResult {
  phone: string;
  isNew: boolean;
  contact: { id: string; name: string; tags: string[]; memo: string | null } | null;
  vendorContacts: CtiLookupVendorContact[];
  recentConsultations: Array<{
    id: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
  properties: CtiLookupProperty[];
  buyerRequirement: {
    id: string;
    transactionType: string | null;
    siteTypes: string[];
    priceMin: number | null;
    priceMax: number | null;
    depositMin: number | null;
    depositMax: number | null;
    monthlyRentMax: number | null;
    urgency: string;
  } | null;
  openTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
  }>;
  recentCalls: Array<{
    id: string;
    direction: string;
    status: CallLogStatus;
    durationSec: number;
    startedAt: string;
  }>;
}

export interface CallLogsFilter {
  direction?: 'inbound' | 'outbound';
  status?: CallLogStatus;
  phone?: string;
  contactId?: string;
  page?: number;
  limit?: number;
}

export interface CallLogsResponse {
  items: CallLog[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateCallLogDto {
  memo?: string;
  contactId?: string;
  consultationId?: string;
  /** 녹음(CallRecording) 업로드 후 연결 */
  recordingId?: string;
  status?: CallLogStatus;
}

export function createCtiApi(request: RequestFn) {
  return {
    /** 발신번호 → 통화 팝업용 고객 카드 */
    lookup: (phone: string) =>
      request<CtiLookupResult>('/cti/lookup', { params: { phone } }),

    /** Bridge 통화 이벤트를 CallLog로 기록 (ring/terminate) */
    ingestCallEvent: (event: CtiCallEventInput) =>
      request<IngestCallEventResult>('/cti/call-events', {
        method: 'POST',
        body: event,
      }),

    listCallLogs: (filter?: CallLogsFilter) =>
      request<CallLogsResponse>('/cti/call-logs', {
        params: filter as Record<string, string | number | undefined>,
      }),

    updateCallLog: (id: string, dto: UpdateCallLogDto) =>
      request<CallLog>(`/cti/call-logs/${id}`, { method: 'PATCH', body: dto }),
  };
}
