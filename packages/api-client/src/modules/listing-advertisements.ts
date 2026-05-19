import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Listing, ListingAdvertisement } from './listings.js';

export type ListingAdvertisementWithListing = ListingAdvertisement & {
  listing?: Listing;
};

export interface ListingAdvertisementsFilter {
  listingId?: string;
  channel?: string;
  status?: string;
  source?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'startedAt' | 'lastCheckedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateListingAdvertisementDto {
  listingId: string;
  channel: string;
  status?: string;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface UpdateListingAdvertisementDto {
  channel?: string;
  status?: string;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export function createListingAdvertisementsApi(request: RequestFn) {
  return {
    findAll: (filters?: ListingAdvertisementsFilter) =>
      request<PaginatedResponse<ListingAdvertisementWithListing>>('/listing-advertisements', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    create: (dto: CreateListingAdvertisementDto) =>
      request<ListingAdvertisement>('/listing-advertisements', {
        method: 'POST',
        body: dto,
      }),

    update: (id: string, dto: UpdateListingAdvertisementDto) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    /** 광고 기록 자체를 잘못 등록한 경우 완전 삭제. 정상 내림은 update({status:'ended'}) 사용. */
    remove: (id: string) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: 'DELETE',
      }),
  };
}
