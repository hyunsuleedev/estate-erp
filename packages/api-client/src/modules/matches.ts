import type { RequestFn } from '../client.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { CalendarEvent } from './calendar-events.js';
import type { Listing } from './listings.js';
import type { Property } from './properties.js';

/** Match 응답에 동봉되는 Deal 연결 요약 (dealLinkage) */
export interface MatchDealLink {
  id: string;
  stage: string;
  isCancelled: boolean;
}

export interface Match {
  id: string;
  officeId: string;
  listingId: string;
  propertyId: string;
  buyerReqId: string;
  stage: string;
  closedFromStage: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: Property;
  listing?: Listing;
  buyerRequirement?: BuyerRequirement;
  calendarEvents?: CalendarEvent[];
  deals?: MatchDealLink[];
}

export interface CreateMatchDto {
  listingId: string;
  buyerReqId: string;
  memo?: string;
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

    remove: (id: string) =>
      request<void>(`/matches/${id}`, { method: 'DELETE' }),
  };
}
