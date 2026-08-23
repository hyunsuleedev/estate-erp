import type { RequestFn } from "../client.js";
import type { PaginatedResponse } from "../types.js";
import type {
  Listing,
  ListingAdvertisement,
  ListingAdvertisementStatus,
} from "./listings.js";
import type { OfficeAdvertisementGroup } from "./office-advertisements.js";

export type ListingAdvertisementWithListing = ListingAdvertisement & {
  listing?: Listing;
  officeAdvertisementGroup?: OfficeAdvertisementGroup | null;
  actionContext?: ListingAdvertisementActionContext;
};

export interface ListingAdvertisementActionContext {
  comparisonGroupId: string | null;
  mainAdvertisementId: string | null;
  observedAt: string | null;
  isActive: boolean | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

export interface ListingAdvertisementPriceHistory {
  id: string;
  officeId: string;
  listingAdvertisementId: string;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  observedAt: string;
  source: string;
  createdAt: string;
  advertisement: Pick<
    ListingAdvertisement,
    | "channel"
    | "externalAdId"
    | "startedAt"
    | "firstSeenAt"
    | "lastSeenAt"
    | "endedAt"
  >;
}

export interface ListingAdvertisementsFilter {
  listingId?: string;
  channel?: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CreateListingAdvertisementDto {
  listingId: string;
  channel: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface UpdateListingAdvertisementDto {
  channel?: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export function createListingAdvertisementsApi(request: RequestFn) {
  return {
    findPriceHistory: (listingId: string) =>
      request<ListingAdvertisementPriceHistory[]>(
        "/listing-advertisements/price-history",
        { params: { listingId } },
      ),

    findAll: (filters?: ListingAdvertisementsFilter) =>
      request<PaginatedResponse<ListingAdvertisementWithListing>>(
        "/listing-advertisements",
        {
          params: filters as Record<
            string,
            string | number | boolean | undefined
          >,
        },
      ),

    create: (dto: CreateListingAdvertisementDto) =>
      request<ListingAdvertisement>("/listing-advertisements", {
        method: "POST",
        body: dto,
      }),

    update: (id: string, dto: UpdateListingAdvertisementDto) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "PATCH",
        body: dto,
      }),

    /** 잘못 등록한 행만 완전 삭제한다. 정상 내림은 status=ended와 관측 종료 시각을 보존한다. */
    remove: (id: string) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "DELETE",
      }),
  };
}
