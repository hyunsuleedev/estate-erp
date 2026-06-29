import type { RequestFn } from '../client.js';

/** 법정동 체인 (서버 include — office-sites/sites 상세 projection에서 내려옴) */
export interface SiteWard {
  code: string;
  name: string;
  district?: {
    code: string;
    name: string;
    province?: { code: string; name: string } | null;
  } | null;
}

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
  /** 법정동 체인 — projection에 따라 없을 수 있음 */
  ward?: SiteWard | null;
  _count?: { dongs: number; units: number; properties: number } | null;
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
