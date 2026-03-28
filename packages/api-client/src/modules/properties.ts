import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface Property {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
  };
  unit?: {
    id: string;
    name: string;
    floor: number | null;
    exclusiveAreaM2: number | null;
    supplyAreaM2: number | null;
  } | null;
}

export interface PropertiesFilter {
  transactionType?: string;
  siteType?: string;
  checkStatus?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  siteId?: string;
  search?: string;
  includeHidden?: boolean;
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreatePropertyDto {
  siteId: string;
  unitId?: string;
  transactionType: string;
  price?: number;
  deposit?: number;
  monthlyRent?: number;
  ownerName?: string;
  ownerPhone?: string;
  memo?: string;
}

export interface UpdatePropertyDto {
  transactionType?: string;
  price?: number;
  deposit?: number;
  monthlyRent?: number;
  checkStatus?: string;
  isHidden?: boolean;
  memo?: string;
}

export function createPropertiesApi(request: RequestFn) {
  return {
    findAll: (filters?: PropertiesFilter) =>
      request<PaginatedResponse<Property>>('/properties', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Property>(`/properties/${id}`),

    create: (dto: CreatePropertyDto) =>
      request<Property>('/properties', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdatePropertyDto) =>
      request<Property>(`/properties/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/properties/${id}`, { method: 'DELETE' }),
  };
}
