import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { CalendarEvent } from './calendar-events.js';
import type { Listing, ListingIntakeState, ListingOccupyingDeal } from './listings.js';

/** Match 응답에 동봉되는 Deal 연결 요약 (dealLinkage) */
export interface MatchDealLink {
  id: string;
  stage: string;
  isCancelled: boolean;
  /** 거래를 만든 시각. 끝난 거래의, 거래 전환 전에 잡아 둔 임장을 가릴 때 쓴다. */
  createdAt?: string | null;
}

/** 매칭에 실린 매물 의뢰의 거래 조건들. 같은 집의 다른 조건(매매 ↔ 전세)에 진행 중인 거래가 있는지 본다. */
export interface MatchIntakeListing {
  id: string;
  transactionType: string;
  deals?: ListingOccupyingDeal[];
}

/** 매칭 줄에 실리는 집: 어느 집인지(단지 · 동 · 호)와 관련인 */
export interface MatchRowProperty {
  id: string;
  siteId: string;
  unitId: string | null;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
  };
  unit?: {
    id: string;
    name: string | null;
    floor: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
    exclusiveAreaM2: number | null;
    supplyAreaM2: number | null;
    dong?: { id: string; name: string; isPlaceholder?: boolean } | null;
    siteUnitType?: {
      id: string;
      name: string;
      exclusiveAreaM2: number | null;
      supplyAreaM2: number | null;
    } | null;
  } | null;
  propertyContacts?: Array<{
    id: string;
    role: string;
    isPrimary?: boolean;
    contactId?: string;
    contact?: { id: string; name: string; phone: string | null } | null;
  }>;
}

export type MatchRowListing = Pick<
  Listing,
  | 'id'
  | 'propertyId'
  | 'intakeId'
  | 'transactionType'
  | 'price'
  | 'deposit'
  | 'monthlyRent'
  | 'isPaused'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'deals'
> & {
  intake?: ListingIntakeState & { listings?: MatchIntakeListing[] };
  property?: MatchRowProperty;
};

/**
 * 매칭의 가벼운 줄. 손님 목록의 줄 안에 실려 온다(GET /buyer-requirements?expand=matches).
 * 손님 쪽 정보와 단지의 나머지 칸은 없다 — 그것은 매칭 상세(GET /matches/:id)에 있다.
 */
export interface MatchRow {
  id: string;
  officeId: string;
  listingId: string;
  propertyId: string;
  buyerReqId: string;
  stage: string;
  closedFromStage: string | null;
  closedReason: string | null;
  closedByDealId: string | null;
  memo: string | null;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  agreedMoveInDate: string | null;
  createdAt: string;
  updatedAt: string;
  listing?: MatchRowListing;
  calendarEvents?: CalendarEvent[];
  deals?: MatchDealLink[];
}

/**
 * 매칭에 실리는 손님 쪽 요약: 누구의 매칭인지와 그 조건의 요점.
 * 목록(GET /matches)과 상세가 함께 싣는다. 손님 조건의 전부는 GET /buyer-requirements/:id에 있다.
 */
export type MatchBuyerRequirement = Omit<BuyerRequirement, 'matches' | 'consultations' | '_count'>;

/**
 * 매칭. 목록의 줄과 상세가 같은 꼴이다: 가벼운 줄 + 손님 쪽 요약.
 * 손님 줄 안에 실려 오는 매칭(GET /buyer-requirements?expand=matches)에는 손님이 없어, 화면이 그 줄의 손님을 붙여 쓴다.
 */
export interface Match extends MatchRow {
  buyerRequirement?: MatchBuyerRequirement;
}

export interface CreateMatchDto {
  listingId: string;
  buyerReqId: string;
  memo?: string;
}

export interface UpdateMatchMemoDto {
  memo: string | null;
  expectedUpdatedAt?: string | null;
}

/** 보낸 칸만 바꾼다 — 칸을 빼면 변경 없음, null 이면 비우기. 금액은 만원 단위 정수. */
export interface UpdateMatchAgreedTermsDto {
  agreedPrice?: number | null;
  agreedDeposit?: number | null;
  agreedMonthlyRent?: number | null;
  /** YYYY-MM-DD 또는 ISO */
  agreedMoveInDate?: string | null;
}

export interface MatchesFilter {
  propertyId?: string;
  listingIntakeId?: string;
  listingId?: string;
  buyerReqId?: string;
  /** 콤마 구분 다중 stage 허용 (예: "suggested,viewing") */
  stage?: string;
  /** open: 진행 중인 매칭만 (종료 · 거래 전환 제외) */
  scope?: 'open';
  /** 앞으로 잡힌 임장이 있는 매칭만 */
  upcomingViewing?: boolean;
  /** 단지 이름 · 손님 이름으로 찾기 */
  search?: string;
  page?: number;
  /** 쪽 크기 (기본 50, 최대 100) */
  limit?: number;
}

export function createMatchesApi(request: RequestFn) {
  return {
    findAll: (filters?: MatchesFilter) =>
      request<PaginatedResponse<Match>>('/matches', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Match>(`/matches/${id}`),

    create: (dto: CreateMatchDto) =>
      request<Match>('/matches', { method: 'POST', body: dto }),

    /** memo: null = 메모 비우기, undefined = 변경 없음 */
    updateStage: (id: string, dto: { stage: string; memo?: string | null }) =>
      request<Match>(`/matches/${id}/stage`, { method: 'PATCH', body: dto }),

    /** stage를 건드리지 않는 메모 전용 수정. expectedUpdatedAt 지정 시 충돌을 감지한다. */
    updateMemo: (id: string, dto: UpdateMatchMemoDto) =>
      request<Match>(`/matches/${id}/memo`, { method: 'PATCH', body: dto }),

    /** 협상 중 합의 조건. 거래로 전환한 매칭이면 409. */
    updateAgreedTerms: (id: string, dto: UpdateMatchAgreedTermsDto) =>
      request<Match>(`/matches/${id}/agreed-terms`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/matches/${id}`, { method: 'DELETE' }),
  };
}
