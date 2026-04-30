import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface Listing {
  id: string;
  officeId: string;
  propertyId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: {
    id: string;
    siteId: string;
    unitId: string | null;
    memo: string | null;
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
      dong?: {
        id: string;
        name: string;
        isPlaceholder?: boolean;
      } | null;
      siteUnitType?: {
        id: string;
        name: string;
        exclusiveAreaM2: number | null;
        supplyAreaM2: number | null;
      } | null;
    } | null;
    propertyContacts?: Array<{
      id: string;
      role: string;
      status: string;
      contact?: {
        id: string;
        name: string;
        phone: string | null;
      } | null;
    }>;
  };
}

export interface ListingsFilter {
  propertyId?: string;
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

export interface CreateListingDto {
  propertyId: string;
  transactionType: string;
  price?: number;
  deposit?: number;
  monthlyRent?: number;
  memo?: string;
}

export interface UpdateListingDto {
  transactionType?: string;
  price?: number;
  deposit?: number;
  monthlyRent?: number;
  checkStatus?: string;
  isHidden?: boolean;
  memo?: string;
}

export function createListingsApi(request: RequestFn) {
  return {
    findAll: (filters?: ListingsFilter) =>
      request<PaginatedResponse<Listing>>('/listings', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Listing>(`/listings/${id}`),

    create: (dto: CreateListingDto) =>
      request<Listing>('/listings', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateListingDto) =>
      request<Listing>(`/listings/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/listings/${id}`, { method: 'DELETE' }),
  };
}
