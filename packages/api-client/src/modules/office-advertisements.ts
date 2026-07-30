import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { OfficeAdvertisementFloorExposureMode } from '@estate-erp/shared';

export interface OfficeAdvertisement {
  id: string;
  officeId: string;
  groupId: string;
  articleNo: string;
  sourceUrl: string | null;
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
  floorInfo: string | null;
  floorExposureMode: OfficeAdvertisementFloorExposureMode;
  verificationTypeCode: string | null;
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
  listingAdvertisementId: string;
  mainAdvertisementId: string | null;
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
}

export interface OfficeAdvertisementGroupsFilter {
  search?: string;
  page?: number;
  limit?: number;
}

export interface OfficeAdvertisementBatchItemDto {
  articleNo: string;
  sourceUrl?: string | null;
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
  floorInfo?: string | null;
  verificationTypeCode?: string | null;
  seango?: boolean | null;
  epju?: boolean | null;
  raw?: unknown;
}

export interface OfficeAdvertisementBatchGroupDto {
  listingAdvertisementId: string;
  memo?: string | null;
  advertisements: OfficeAdvertisementBatchItemDto[];
}

export interface OfficeAdvertisementBatchUpsertDto {
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

export function createOfficeAdvertisementsApi(request: RequestFn) {
  return {
    findAllGroups: (filters?: OfficeAdvertisementGroupsFilter) =>
      request<PaginatedResponse<OfficeAdvertisementGroup>>(
        '/office-advertisements/groups',
        {
          params: filters as Record<
            string,
            string | number | boolean | undefined
          >,
        },
      ),

    batchUpsert: (dto: OfficeAdvertisementBatchUpsertDto) =>
      request<OfficeAdvertisementBatchUpsertResult>(
        '/office-advertisements/batch',
        {
          method: 'POST',
          body: dto,
        },
      ),
  };
}
