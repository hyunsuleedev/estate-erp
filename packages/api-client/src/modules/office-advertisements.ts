import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { OfficeAdvertisementFloorExposureMode } from '@estate-erp/shared';

export interface OfficeAdvertisement {
  id: string;
  officeId: string;
  /** 이 줄이 속한 내 광고 */
  advertisementId: string;
  articleNo: string;
  sourceUrl: string | null;
  /** 우리 사무소의 광고인가. "바로 이 내 광고"는 비교 한 벌의 mainAdvertisement다 */
  isMine: boolean;
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

/** 내 광고 한 건의 네이버 비교 한 벌. 묶음 표는 없다 — 광고에 바로 붙은 줄들이다 */
export interface AdvertisementComparisonSet {
  /** 비교 목록을 마지막으로 통째로 읽은 시각 */
  observedAt: string | null;
  /** 목록에서 "바로 이 내 광고"인 줄 (네이버 매물번호가 같은 줄) */
  mainAdvertisement: OfficeAdvertisement | null;
  /** 지금 네이버에 보이는 광고들. 내 것이 먼저, 그다음 순위순 */
  advertisements: OfficeAdvertisement[];
}

/** 비교가 있는 내 광고 한 건 (검색 결과) */
export interface OfficeAdvertisementGroup extends AdvertisementComparisonSet {
  listingAdvertisementId: string;
  channel: string;
  status: string;
  naverArticleNo: string | null;
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
  /** 네이버가 알려 준 같은 집 광고 수. 주면 목록이 이보다 적을 때 서버가 거절한다 */
  totalCount?: number | null;
  advertisements: OfficeAdvertisementBatchItemDto[];
}

export interface OfficeAdvertisementBatchUpsertDto {
  /** 내 광고 한 건마다 하나: 그 광고의 비교 목록 전체 */
  comparisons: OfficeAdvertisementBatchGroupDto[];
}

export interface OfficeAdvertisementBatchUpsertResult {
  /** 받은 내 광고 수, 그중 처음 비교한 것 / 다시 비교한 것 */
  comparisonsReceived: number;
  comparisonsCreated: number;
  comparisonsUpdated: number;
  /** 비교 줄을 새로 넣은 수 / 고친 수 */
  rowsCreated: number;
  rowsUpdated: number;
  /** 이번 올리기로 알린 달라진 광고 수 */
  changesNotified: number;
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
