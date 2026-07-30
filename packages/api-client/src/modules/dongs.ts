import type { RequestFn } from '../client.js';

export interface Dong {
  id: string;
  officeId: string | null;
  siteId: string;
  name: string;
  /** 단일 동 건물의 자동 생성 placeholder Dong. UI에서 동 선택/표시를 숨긴다. */
  isPlaceholder: boolean;
  /** projection에 따라 포함되는 동별 호수 수 */
  _count?: { units: number } | null;
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
