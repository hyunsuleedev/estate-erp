import type { RequestFn } from '../client.js';

export type RegionLevel = 'province' | 'district' | 'ward';

export interface RegionSearchResult {
  level: RegionLevel;
  code: string;
  name: string;
  fullName: string;
}

export interface ProvinceOption {
  code: string;
  name: string;
}

export interface DistrictOption {
  code: string;
  provinceCode: string;
  name: string;
}

export interface WardOption {
  code: string;
  districtCode: string;
  name: string;
}

export function createRegionsApi(request: RequestFn) {
  return {
    findProvinces: () => request<ProvinceOption[]>('/regions/provinces'),

    findDistricts: (provinceCode?: string) =>
      request<DistrictOption[]>('/regions/districts', {
        params: { provinceCode } as Record<string, string | number | boolean | undefined>,
      }),

    findWards: (districtCode?: string) =>
      request<WardOption[]>('/regions/wards', {
        params: { districtCode } as Record<string, string | number | boolean | undefined>,
      }),

    search: (q: string, limit?: number) =>
      request<RegionSearchResult[]>('/regions/search', {
        params: { q, limit } as Record<string, string | number | boolean | undefined>,
      }),
  };
}
