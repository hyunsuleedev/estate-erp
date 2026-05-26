import type { RequestFn } from '../client.js';

export interface Site {
  id: string;
  officeId: string | null;
  isPublic: boolean;
  isLocked: boolean;
  type: string;
  name: string;
  wardCode: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  lat: number | null;
  lng: number | null;
  kaptComplexCode: string | null;
  naverComplexCode: string | null;
  kbComplexCode: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  totalDongs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteDto {
  type: string;
  name: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
  ri?: string;
  roadAddress?: string;
  jibunAddress?: string;
  lat?: number;
  lng?: number;
  builtYear?: number;
  totalUnits?: number;
  totalDongs?: number;
}

export interface SiteDetail extends Site {
  dongs: import('./dongs.js').Dong[];
  units: import('./units.js').Unit[];
  siteUnitTypes: import('./units.js').SiteUnitType[];
}

export interface SiteOverview extends SiteDetail {
  defaultDongId: string | null;
  _count?: {
    dongs: number;
    units: number;
    properties: number;
  };
}

export function createSitesApi(request: RequestFn) {
  return {
    findAll: () =>
      request<Site[]>('/sites'),

    findOne: (id: string, options?: { includeUnits?: boolean }) =>
      request<SiteDetail>(`/sites/${id}`, { params: { includeUnits: options?.includeUnits } }),

    overview: (id: string) =>
      request<SiteOverview>(`/sites/${id}/overview`),

    create: (dto: CreateSiteDto) =>
      request<Site>('/sites', { method: 'POST', body: dto }),

    update: (id: string, dto: Record<string, unknown>) =>
      request<Site>(`/sites/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/sites/${id}`, { method: 'DELETE' }),
  };
}
