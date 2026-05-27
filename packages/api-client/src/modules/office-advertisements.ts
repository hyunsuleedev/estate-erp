import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Listing, ListingAdvertisement } from './listings.js';

export type OfficeAdvertisementGroupStatus =
  | 'needs_unit_confirmation'
  | 'linked'
  | 'ignored';

export interface OfficeAdvertisement {
  id: string;
  officeId: string;
  groupId: string;
  source: string;
  articleNo: string;
  sourceUrl: string | null;
  cpPcArticleUrl: string | null;
  isMine: boolean;
  isMain: boolean;
  isActive: boolean;
  articleName: string | null;
  realtorName: string | null;
  realtorId: string | null;
  representativeTelNo: string | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  ranking: number | null;
  sameAddrCnt: number | null;
  articleConfirmYmd: string | null;
  seango: boolean;
  epju: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeAdvertisementGroup {
  id: string;
  officeId: string;
  source: string;
  listingAdvertisementId: string | null;
  siteName: string | null;
  buildingName: string | null;
  dongHint: string | null;
  hoHint: string | null;
  floorInfo: string | null;
  areaName: string | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  transactionType: string | null;
  mainAdvertisementId: string | null;
  status: OfficeAdvertisementGroupStatus;
  memo: string | null;
  ownPrice: number | null;
  ownDeposit: number | null;
  ownMonthlyRent: number | null;
  relatedPriceMin: number | null;
  relatedPriceMax: number | null;
  relatedCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mainAdvertisement?: OfficeAdvertisement | null;
  advertisements?: OfficeAdvertisement[];
  listingAdvertisement?: (ListingAdvertisement & { listing?: Listing }) | null;
}

export interface OfficeAdvertisementGroupsFilter {
  source?: string;
  status?: OfficeAdvertisementGroupStatus;
  search?: string;
  onlyUnlinked?: boolean;
  page?: number;
  limit?: number;
}

export interface OfficeAdvertisementBatchItemDto {
  articleNo: string;
  sourceUrl?: string | null;
  cpPcArticleUrl?: string | null;
  isMine?: boolean;
  isMain?: boolean;
  isActive?: boolean;
  articleName?: string | null;
  realtorName?: string | null;
  realtorId?: string | null;
  representativeTelNo?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  ranking?: number | null;
  sameAddrCnt?: number | null;
  articleConfirmYmd?: string | null;
  seango?: boolean | null;
  epju?: boolean | null;
  raw?: unknown;
}

export interface OfficeAdvertisementBatchGroupDto {
  source?: string;
  siteName?: string | null;
  buildingName?: string | null;
  dongHint?: string | null;
  hoHint?: string | null;
  floorInfo?: string | null;
  areaName?: string | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  transactionType?: string | null;
  memo?: string | null;
  advertisements: OfficeAdvertisementBatchItemDto[];
}

export interface OfficeAdvertisementBatchUpsertDto {
  source?: string;
  groups: OfficeAdvertisementBatchGroupDto[];
}

export interface OfficeAdvertisementBatchUpsertResult {
  groupsReceived: number;
  groupsCreated: number;
  groupsReused: number;
  advertisementsCreated: number;
  advertisementsUpdated: number;
  errors: Array<{ articleNo: string; message: string }>;
}

export interface UpdateOfficeAdvertisementGroupDto {
  status?: OfficeAdvertisementGroupStatus;
  memo?: string | null;
  hoHint?: string | null;
  dongHint?: string | null;
}

export interface LinkOfficeAdvertisementGroupDto {
  listingAdvertisementId: string;
  hoHint?: string | null;
  memo?: string | null;
}

export function createOfficeAdvertisementsApi(request: RequestFn) {
  return {
    findAllGroups: (filters?: OfficeAdvertisementGroupsFilter) =>
      request<PaginatedResponse<OfficeAdvertisementGroup>>('/office-advertisements/groups', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    updateGroup: (id: string, dto: UpdateOfficeAdvertisementGroupDto) =>
      request<OfficeAdvertisementGroup>(`/office-advertisements/groups/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    linkGroupToListingAdvertisement: (id: string, dto: LinkOfficeAdvertisementGroupDto) =>
      request<OfficeAdvertisementGroup>(`/office-advertisements/groups/${id}/link-listing-advertisement`, {
        method: 'POST',
        body: dto,
      }),

    batchUpsert: (dto: OfficeAdvertisementBatchUpsertDto) =>
      request<OfficeAdvertisementBatchUpsertResult>('/office-advertisements/batch', {
        method: 'POST',
        body: dto,
      }),
  };
}
