import type { RequestFn } from '../client.js';
import type { Site } from './sites.js';

export interface OfficeSite {
  id: string;
  officeId: string;
  siteId: string;
  memo: string | null;
  isFavorite: boolean;
  createdAt: string;
  site?: Site;
}

export function createOfficeSitesApi(request: RequestFn) {
  return {
    findAll: () =>
      request<OfficeSite[]>('/office-sites'),

    searchCentral: (q: string) =>
      request<Site[]>('/office-sites/search', { params: { q } }),

    add: (dto: { siteId: string; memo?: string; isFavorite?: boolean }) =>
      request<OfficeSite>('/office-sites', { method: 'POST', body: dto }),

    update: (id: string, dto: { memo?: string | null; isFavorite?: boolean }) =>
      request<OfficeSite>(`/office-sites/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/office-sites/${id}`, { method: 'DELETE' }),
  };
}
