import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Consultation } from './consultations.js';
import type { ListingAdvertisement, ListingPriceHistory } from './listings.js';
import type { PropertyContact } from './property-contacts.js';
import type { Tenant } from './tenants.js';

export interface PropertyListing {
  id: string;
  intakeId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
  jointBrokeragePartner?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
}

export interface Property {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
  createdAt: string;
  updatedAt: string;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
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
  unitId?: string;
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
}

export interface UpdatePropertyDto {
  siteId?: string;
  unitId?: string | null;
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
