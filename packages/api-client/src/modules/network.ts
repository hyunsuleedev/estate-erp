import type { RequestFn } from '../client.js';
import type { ListingAvailability } from '@estate-erp/shared';

// ── 중개방 ──────────────────────────────────────────────────────

export type NetworkRoomType = 'public' | 'private';
export type NetworkMemberRole = 'admin' | 'member';
export type NetworkMemberStatus = 'pending' | 'approved' | 'rejected' | 'left';
export type NetworkInquiryStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface NetworkRoomMember {
  id: string;
  roomId: string;
  officeId: string;
  role: NetworkMemberRole;
  status: NetworkMemberStatus;
  joinedAt: string | null;
  createdAt: string;
  office?: { id: string; name: string };
}

export interface NetworkRoom {
  id: string;
  name: string;
  description: string | null;
  type: NetworkRoomType;
  /** 방 생성 사무소 id (officeId 아님 — 방은 크로스 오피스 데이터) */
  createdBy: string;
  region: string | null;
  maxMembers: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByOffice?: { id: string; name: string };
  /** approved 멤버 수 */
  memberCount: number;
  /** 내 사무소의 멤버십 — 없으면 null */
  myMembership: NetworkRoomMember | null;
}

export interface NetworkRoomDetail extends NetworkRoom {
  /** approved 멤버에게만 전체 목록 제공 — 그 외에는 빈 배열 */
  members: NetworkRoomMember[];
}

export interface NetworkRoomsFilter {
  /** mine = 내가 멤버(pending 포함)인 방, discover = 공개방 디렉토리 */
  scope?: 'mine' | 'discover';
  region?: string;
  /** 방 이름 검색 — private 방은 검색으로만 발견 가능 */
  search?: string;
}

export interface CreateNetworkRoomDto {
  name: string;
  description?: string;
  type?: NetworkRoomType;
  region?: string;
  maxMembers?: number;
}

// ── 공유 매물 (마스킹 응답) ──────────────────────────────────────

/**
 * 마스킹이 적용된 매물 정보.
 * 타사무소 viewer는 꺼진 show* 플래그의 필드가 응답에 아예 없다 (optional).
 * regionLabel은 단지명 비공개 시 대체 텍스트("강동구 아파트")로 항상 제공된다.
 */
export interface SharedPropertyListingView {
  id: string;
  transactionType: string;
  /** Deal·의뢰 생명주기·옵션 중지를 합성한 가용 상태 */
  availability: ListingAvailability;
  siteType: string;
  regionLabel: string;
  siteName?: string;
  dongName?: string | null;
  unitName?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  unitTypeName?: string | null;
  floor?: number | null;
  memo?: string | null;
  photoUrls?: string[];
}

export interface NetworkSharedPropertyView {
  id: string;
  roomId: string;
  listingId: string;
  officeId: string;
  sharedBy: string;
  showSiteName: boolean;
  showDong: boolean;
  showUnit: boolean;
  showPrice: boolean;
  showArea: boolean;
  showFloor: boolean;
  showMemo: boolean;
  showPhotos: boolean;
  contactName: string | null;
  contactPhone: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** viewer 사무소가 공유자 본인인지 — true면 마스킹 미적용 응답 */
  isMine: boolean;
  sharedByUser: { id: string; name: string } | null;
  office: { id: string; name: string } | null;
  listing: SharedPropertyListingView;
}

export interface ShareListingDto {
  listingId: string;
  showSiteName?: boolean;
  showDong?: boolean;
  showUnit?: boolean;
  showPrice?: boolean;
  showArea?: boolean;
  showFloor?: boolean;
  showMemo?: boolean;
  showPhotos?: boolean;
  contactName?: string;
  contactPhone?: string;
  description?: string;
}

export interface UpdateSharedPropertyDto {
  showSiteName?: boolean;
  showDong?: boolean;
  showUnit?: boolean;
  showPrice?: boolean;
  showArea?: boolean;
  showFloor?: boolean;
  showMemo?: boolean;
  showPhotos?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  description?: string | null;
  isActive?: boolean;
}

// ── 문의 ────────────────────────────────────────────────────────

export interface NetworkInquiry {
  id: string;
  sharedPropertyId: string;
  fromOfficeId: string;
  fromUserId: string;
  status: NetworkInquiryStatus;
  message: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  fromOffice?: { id: string; name: string };
  fromUser?: { id: string; name: string };
  /** viewer 기준 마스킹 적용된 공유 매물 */
  sharedProperty: NetworkSharedPropertyView;
}

export interface NetworkInquiriesFilter {
  /** sent = 내가 보낸 문의, received = 내가 공유한 매물에 온 문의 */
  scope?: 'sent' | 'received';
  status?: NetworkInquiryStatus;
}

export interface RespondNetworkInquiryDto {
  status: 'accepted' | 'rejected';
  response?: string;
}

// ── 채팅 ────────────────────────────────────────────────────────

export interface NetworkMessage {
  id: string;
  roomId: string;
  officeId: string;
  userId: string;
  content: string;
  sharedPropertyId: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  office: { id: string; name: string } | null;
  /** 매물 카드 첨부 — viewer 기준 마스킹 적용 */
  sharedProperty: NetworkSharedPropertyView | null;
}

export interface NetworkMessagesFilter {
  /** 이전 페이지 마지막 메시지 id (createdAt desc 커서) */
  cursor?: string;
  /** 기본 30, 최대 100 */
  limit?: number;
}

export interface NetworkMessagesResponse {
  items: NetworkMessage[];
  /** 다음 페이지 커서. null 이면 마지막 페이지. */
  nextCursor: string | null;
}

export interface SendNetworkMessageDto {
  content: string;
  sharedPropertyId?: string;
}

/** 'network.message.created' realtime 이벤트 payload — broadcast라 항상 최대 마스킹 */
export interface NetworkMessageCreatedEvent {
  roomId: string;
  message: NetworkMessage;
}

export function createNetworkApi(request: RequestFn) {
  return {
    // 중개방
    listRooms: (filter: NetworkRoomsFilter = {}) =>
      request<NetworkRoom[]>('/network/rooms', {
        params: filter as Record<string, string | undefined>,
      }),

    createRoom: (dto: CreateNetworkRoomDto) =>
      request<NetworkRoom>('/network/rooms', { method: 'POST', body: dto }),

    getRoom: (id: string) =>
      request<NetworkRoomDetail>(`/network/rooms/${id}`),

    joinRoom: (id: string) =>
      request<NetworkRoomMember>(`/network/rooms/${id}/join`, {
        method: 'POST',
      }),

    updateMember: (
      roomId: string,
      memberId: string,
      dto: { status: 'approved' | 'rejected' },
    ) =>
      request<NetworkRoomMember>(
        `/network/rooms/${roomId}/members/${memberId}`,
        { method: 'PATCH', body: dto },
      ),

    leaveRoom: (roomId: string) =>
      request<NetworkRoomMember>(`/network/rooms/${roomId}/members/me`, {
        method: 'DELETE',
      }),

    // 공유 매물
    shareListing: (roomId: string, dto: ShareListingDto) =>
      request<NetworkSharedPropertyView>(
        `/network/rooms/${roomId}/shared-properties`,
        { method: 'POST', body: dto },
      ),

    listSharedProperties: (roomId: string) =>
      request<NetworkSharedPropertyView[]>(
        `/network/rooms/${roomId}/shared-properties`,
      ),

    updateSharedProperty: (id: string, dto: UpdateSharedPropertyDto) =>
      request<NetworkSharedPropertyView>(`/network/shared-properties/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    /** 공유 회수 — 서버는 hard delete 대신 isActive=false 처리 */
    removeSharedProperty: (id: string) =>
      request<NetworkSharedPropertyView>(`/network/shared-properties/${id}`, {
        method: 'DELETE',
      }),

    // 문의
    createInquiry: (sharedPropertyId: string, dto: { message?: string } = {}) =>
      request<NetworkInquiry>(
        `/network/shared-properties/${sharedPropertyId}/inquiries`,
        { method: 'POST', body: dto },
      ),

    listInquiries: (filter: NetworkInquiriesFilter = {}) =>
      request<NetworkInquiry[]>('/network/inquiries', {
        params: filter as Record<string, string | undefined>,
      }),

    respondInquiry: (id: string, dto: RespondNetworkInquiryDto) =>
      request<NetworkInquiry>(`/network/inquiries/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    // 채팅
    listMessages: (roomId: string, filter: NetworkMessagesFilter = {}) =>
      request<NetworkMessagesResponse>(`/network/rooms/${roomId}/messages`, {
        params: filter as Record<string, string | number | undefined>,
      }),

    sendMessage: (roomId: string, dto: SendNetworkMessageDto) =>
      request<NetworkMessage>(`/network/rooms/${roomId}/messages`, {
        method: 'POST',
        body: dto,
      }),
  };
}
