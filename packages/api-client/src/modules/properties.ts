import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Consultation } from './consultations.js';
import type { PropertyContact } from './property-contacts.js';
import type { Tenant } from './tenants.js';

export interface PropertyListing {
  id: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
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
  propertyContacts?: PropertyContact[];
  tenants?: Tenant[];
  consultations?: Consultation[];
  listings?: PropertyListing[];
}

export interface PropertiesFilter {
  siteType?: string;
  siteId?: string;
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreatePropertyDto {
  siteId: string;
  unitId?: string;
  memo?: string;
}

export interface UpdatePropertyDto {
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
