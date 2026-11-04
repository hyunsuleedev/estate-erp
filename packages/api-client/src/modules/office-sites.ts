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

/** 직접 등록하는 단지의 입력값. 공개 여부는 서버가 항상 비공개로 정하므로 보내지 않는다. */
export interface RegisterPrivateSiteDto {
  name: string;
  type: string;
  wardCode: string;
  roadAddress?: string;
  jibunAddress?: string;
  zipCode?: string;
  builtYear?: number;
  totalUnits?: number;
  totalDongs?: number;
}

export function createOfficeSitesApi(request: RequestFn) {
  return {
    findAll: () =>
      request<OfficeSite[]>('/office-sites'),

    searchCentral: (q: string) =>
      request<Site[]>('/office-sites/search', { params: { q } }),

    add: (dto: { siteId: string; memo?: string; isFavorite?: boolean }) =>
      request<OfficeSite>('/office-sites', { method: 'POST', body: dto }),

    registerPrivateSite: (dto: RegisterPrivateSiteDto) =>
      request<OfficeSite>('/office-sites/private-sites', { method: 'POST', body: dto }),

    update: (id: string, dto: { memo?: string | null; isFavorite?: boolean }) =>
      request<OfficeSite>(`/office-sites/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/office-sites/${id}`, { method: 'DELETE' }),
  };
}
