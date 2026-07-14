import type { RequestFn } from '../client.js';

// ================================================================
// CTI — 전화 회선 / 통화 이벤트 / 착신 lookup / 발신
// 서버: apps/server/src/modules/cti
// ================================================================

/** 프로바이더 코드 (레거시 Phne_Clsf): 10 직렬 / 20·30 멀티CID / 41 KT / 50 삼성 Wyz / 70 LGU */
export type CtiProviderCode = '10' | '20' | '30' | '41' | '50' | '70';

export type CallEventDirection = 'inbound' | 'outbound';

export type CallEventStatus =
  | 'ringing'
  | 'answered'
  | 'missed'
  | 'ended'
  | 'dialing'
  | 'dialed'
  | 'dial_failed';

export interface CtiLine {
  id: string;
  officeId: string;
  providerCode: string;
  displayName: string;
  externalId: string | null;
  internalNo: string | null;
  /** 자격증명 저장 여부 (자격증명 자체는 절대 응답에 포함되지 않음) */
  hasCredential: boolean;
  isMasterOnly: boolean;
  isDelegate: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCtiLineDto {
  providerCode: string;
  displayName: string;
  externalId?: string;
  internalNo?: string;
  /** 쓰기 전용 — 서버에서 암호화 저장 */
  credential?: {
    loginId?: string;
    password?: string;
    authKey?: string;
  };
  isMasterOnly?: boolean;
  isDelegate?: boolean;
  isActive?: boolean;
}

export interface CallEvent {
  id: string;
  officeId: string;
  direction: CallEventDirection;
  phoneNumber: string;
  isPrivate: boolean;
  receivedNo: string | null;
  providerCode: string;
  channelKey: string | null;
  status: CallEventStatus;
  contactId: string | null;
  userId: string | null;
  occurredAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface CallEventsListResponse {
  items: CallEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CtiLookupResult {
  phoneNumber: string;
  contacts: Array<{
    id: string;
    name: string;
    tags: string[];
    memo: string | null;
    phoneLabel: string;
    isPrimary: boolean;
  }>;
  vendors: Array<{
    vendorId: string;
    vendorName: string;
    isSharedPool: boolean;
    contactName: string;
    role: string | null;
  }>;
  partnerBrokers: Array<{
    id: string;
    name: string;
    ceoName: string | null;
    phone: string | null;
  }>;
  recentCalls: Array<{
    id: string;
    direction: CallEventDirection;
    status: CallEventStatus;
    occurredAt: string;
    contactId: string | null;
  }>;
  recentConsultations: Array<{
    id: string;
    contactId: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
}

export interface CtiMasterStatus {
  connected: boolean;
  lastSeenAt: string | null;
  lines: Record<
    string,
    { connected: boolean; message: string | null; updatedAt: string }
  >;
}

export interface CtiBridgeTokenStatus {
  hasToken: boolean;
  name: string | null;
  prefix: string | null;
  lastSeenAt: string | null;
}

export interface CtiBridgeTokenIssueResponse {
  /** 원본 토큰 — 이 응답에서 1회만 노출 */
  token: string;
  prefix: string;
  bridgeId: string;
}

/** /realtime 네임스페이스에서 수신하는 착신 브로드캐스트 payload */
export interface CallIncomingEvent {
  officeId: string;
  callEventId: string;
  phoneNumber: string;
  isPrivate: boolean;
  providerCode: string;
  receivedNo: string | null;
  occurredAt: string;
  lookup: CtiLookupResult | null;
}

export interface CallUpdatedEvent {
  officeId: string;
  callEventId: string;
  status: CallEventStatus;
  endedAt?: string | null;
}

export interface CallLineStatusEvent {
  officeId: string;
  providerCode: string;
  connected: boolean;
  message?: string | null;
}

export function createCtiApi(request: RequestFn) {
  return {
    // 회선 관리
    listLines: () => request<CtiLine[]>('/cti/lines'),

    createLine: (dto: UpsertCtiLineDto) =>
      request<CtiLine>('/cti/lines', { method: 'POST', body: dto }),

    updateLine: (id: string, dto: Partial<UpsertCtiLineDto>) =>
      request<CtiLine>(`/cti/lines/${id}`, { method: 'PATCH', body: dto }),

    deleteLine: (id: string) =>
      request<void>(`/cti/lines/${id}`, { method: 'DELETE' }),

    // 브리지 토큰 (owner/manager)
    getBridgeTokenStatus: () =>
      request<CtiBridgeTokenStatus>('/cti/bridge/token'),

    issueBridgeToken: (name?: string) =>
      request<CtiBridgeTokenIssueResponse>('/cti/bridge/token', {
        method: 'POST',
        body: { name },
      }),

    revokeBridgeToken: () =>
      request<void>('/cti/bridge/token', { method: 'DELETE' }),

    // 마스터 브리지 상태
    getMasterStatus: () => request<CtiMasterStatus>('/cti/master/status'),

    // 착신 번호 통합 조회 (착신 팝업 데이터 소스)
    lookup: (phone: string) =>
      request<CtiLookupResult>('/cti/lookup', { params: { phone } }),

    // 통화 이력
    listCalls: (params?: {
      page?: number;
      limit?: number;
      direction?: CallEventDirection;
      status?: CallEventStatus;
      phone?: string;
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
    }) =>
      request<CallEventsListResponse>('/cti/calls', {
        params: params as Record<string, string | number | undefined>,
      }),

    updateCall: (
      id: string,
      dto: { status?: CallEventStatus; endedAt?: string; userId?: string },
    ) => request<CallEvent>(`/cti/calls/${id}`, { method: 'PATCH', body: dto }),

    /** 명시적 [이 고객으로 연결] — contactId: null 로 연결 해제 */
    linkContact: (id: string, contactId: string | null) =>
      request<CallEvent>(`/cti/calls/${id}/link`, {
        method: 'PATCH',
        body: { contactId },
      }),

    deleteCall: (id: string) =>
      request<void>(`/cti/calls/${id}`, { method: 'DELETE' }),

    // 발신 (서버 → 마스터 브리지 위임)
    dial: (dto: { phoneNumber: string; lineId?: string }) =>
      request<{ callEventId: string; status: string }>('/cti/dial', {
        method: 'POST',
        body: dto,
      }),
  };
}
