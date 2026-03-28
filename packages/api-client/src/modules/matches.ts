import type { RequestFn } from '../client.js';

export interface Match {
  id: string;
  officeId: string;
  propertyId: string;
  buyerReqId: string;
  stage: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: unknown;
  buyerRequirement?: unknown;
}

export interface CreateMatchDto {
  propertyId: string;
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
