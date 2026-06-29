import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Tenant } from './tenants.js';

export type ListingAdvertisementStatus = 'planned' | 'draft' | 'active' | 'paused' | 'ended' | 'error';
export type ListingAdvertisementSource = 'manual' | 'external_observed' | 'cp_sync';

export interface ListingAdvertisement {
  id: string;
  officeId: string;
  listingId: string;
  channel: string;
  status: ListingAdvertisementStatus | string;
  source: ListingAdvertisementSource | string;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  startedAt: string | null;
  endedAt: string | null;
  url: string | null;
  memo: string | null;
  externalAdId: string | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingPriceHistory {
  id: string;
  officeId: string;
  listingId: string;
  changedBy: string | null;
  priceBefore: number | null;
  depositBefore: number | null;
  monthlyRentBefore: number | null;
  priceAfter: number | null;
  depositAfter: number | null;
  monthlyRentAfter: number | null;
  reason: string | null;
  createdAt: string;
}

export interface Listing {
  id: string;
  officeId: string;
  propertyId: string;
  intakeId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  maintenanceFee: number | null;
  maintenanceFeeIncludes: string[];
  loanAmount: number | null;
  premium: number | null;
  privateMemo: string | null;
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
    tenants?: Tenant[];
    listings?: Array<{
      id: string;
      intakeId: string;
      transactionType: string;
      price: number | null;
      deposit: number | null;
      monthlyRent: number | null;
      maintenanceFee: number | null;
      maintenanceFeeIncludes: string[];
      loanAmount: number | null;
      premium: number | null;
      privateMemo: string | null;
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
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ListingFilterSite {
  id: string;
  name: string;
  type: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  listingCount: number;
  propertyCount: number;
}

export interface CreateListingDto {
  propertyId: string;
  intakeId?: string | null;
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
  privateMemo?: string | null;
  moveInAvailableType?: string;
  moveInAvailableFrom?: string;
  moveInAvailableTo?: string;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string;
  memo?: string;
}

export interface UpdateListingDto {
  transactionType?: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
  privateMemo?: string | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  checkStatus?: string;
  memo?: string;
  expectedUpdatedAt?: string | null;
}

export function createListingsApi(request: RequestFn) {
  return {
    findAll: (filters?: ListingsFilter) =>
      request<PaginatedResponse<Listing>>('/listings', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    filterSites: () => request<ListingFilterSite[]>('/listings/filter-sites'),

    findOne: (id: string) =>
      request<Listing>(`/listings/${id}`),

    create: (dto: CreateListingDto) =>
      request<Listing>('/listings', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateListingDto) =>
      request<Listing>(`/listings/${id}`, { method: 'PATCH', body: dto }),

    /** 목록 숨김 토글 (Listing.isHidden) */
    setHidden: (id: string, isHidden: boolean) =>
      request<Listing>(`/listings/${id}`, {
        method: 'PATCH',
        body: { isHidden },
      }),

    remove: (id: string) =>
      request<void>(`/listings/${id}`, { method: 'DELETE' }),
  };
}
