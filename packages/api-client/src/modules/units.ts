import type { RequestFn } from '../client.js';

export interface Unit {
  id: string;
  officeId: string | null;
  siteId: string;
  dongId: string | null;
  siteUnitTypeId: string | null;
  name: string;
  floor: number | null;
  lineNo: number | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  isPiloti: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitDto {
  siteId: string;
  dongId?: string;
  name: string;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
}

export interface UpdateUnitDto {
  name?: string;
  dongId?: string;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
}

export function createUnitsApi(request: RequestFn) {
  return {
    findAll: (filters?: { siteId?: string; dongId?: string }) =>
      request<Unit[]>('/units', { params: filters }),

    findOne: (id: string) =>
      request<Unit>(`/units/${id}`),

    create: (dto: CreateUnitDto) =>
      request<Unit>('/units', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateUnitDto) =>
      request<Unit>(`/units/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/units/${id}`, { method: 'DELETE' }),
  };
}
