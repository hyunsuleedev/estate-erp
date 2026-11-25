import type { RequestFn } from '../client.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { CalendarEvent } from './calendar-events.js';
import type { Listing, ListingIntakeSummary, ListingOccupyingDeal } from './listings.js';
import type { Property } from './properties.js';

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

export type MatchListing = Omit<Listing, 'intake'> & {
  intake?: ListingIntakeSummary & { listings?: MatchIntakeListing[] };
};

export interface Match {
  id: string;
  officeId: string;
  listingId: string;
  propertyId: string;
  buyerReqId: string;
  stage: string;
  closedFromStage: string | null;
  /** 종료 이유 (MatchClosedReason): manual / other_buyer_contracted / intake_closed / deal_cancelled */
  closedReason: string | null;
  /** 자동 종료를 일으킨 거래 */
  closedByDealId: string | null;
  memo: string | null;
  /** 협상하며 적어 둔 합의 조건 (만원). 거래로 전환한 뒤에는 Deal 쪽이 기준이다. */
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  /** ISO 날짜 */
  agreedMoveInDate: string | null;
  createdAt: string;
  updatedAt: string;
  property?: Property;
  listing?: MatchListing;
  buyerRequirement?: BuyerRequirement;
  calendarEvents?: CalendarEvent[];
  deals?: MatchDealLink[];
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
  listingId?: string;
  buyerReqId?: string;
  /** 콤마 구분 다중 stage 허용 (예: "suggested,viewing") */
  stage?: string;
}

export function createMatchesApi(request: RequestFn) {
  return {
    findAll: (filters?: MatchesFilter) =>
      request<Match[]>('/matches', {
        params: filters as Record<string, string | undefined>,
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
