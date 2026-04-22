import type { RequestFn } from '../client.js';

export type RegionLevel = 'province' | 'district' | 'ward';

export interface RegionSearchResult {
  level: RegionLevel;
  code: string;
  name: string;
  fullName: string;
}

export function createRegionsApi(request: RequestFn) {
  return {
    search: (q: string, limit?: number) =>
      request<RegionSearchResult[]>('/regions/search', {
        params: { q, limit } as Record<string, string | number | boolean | undefined>,
      }),
  };
}
