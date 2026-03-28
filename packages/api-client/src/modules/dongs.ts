import type { RequestFn } from '../client.js';

export interface Dong {
  id: string;
  officeId: string | null;
  siteId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function createDongsApi(request: RequestFn) {
  return {
    findAll: (siteId?: string) =>
      request<Dong[]>('/dongs', { params: { siteId } }),

    findOne: (id: string) =>
      request<Dong>(`/dongs/${id}`),

    create: (dto: { siteId: string; name: string }) =>
      request<Dong>('/dongs', { method: 'POST', body: dto }),

    update: (id: string, dto: { name?: string }) =>
      request<Dong>(`/dongs/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/dongs/${id}`, { method: 'DELETE' }),
  };
}
