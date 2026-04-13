import type { RequestFn } from '../client.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { Listing } from './listings.js';
import type { Property } from './properties.js';

export interface Match {
  id: string;
  officeId: string;
  listingId: string;
  propertyId: string;
  buyerReqId: string;
  stage: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: Property;
  listing?: Listing;
  buyerRequirement?: BuyerRequirement;
}

export interface CreateMatchDto {
  listingId: string;
  buyerReqId: string;
  memo?: string;
}

export function createMatchesApi(request: RequestFn) {
  return {
    findAll: () =>
      request<Match[]>('/matches'),

    findOne: (id: string) =>
      request<Match>(`/matches/${id}`),

    create: (dto: CreateMatchDto) =>
      request<Match>('/matches', { method: 'POST', body: dto }),

    updateStage: (id: string, dto: { stage: string; memo?: string }) =>
      request<Match>(`/matches/${id}/stage`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/matches/${id}`, { method: 'DELETE' }),
  };
}
