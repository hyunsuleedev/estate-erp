import type { RequestFn } from '../client.js';
import type { Site } from './sites.js';
import type { Unit } from './units.js';

export type ExternalListingTransactionType = 'sale' | 'jeonse' | 'monthly';

export interface ExternalListing {
  id: string;
  officeId: string;
  groupId: string;
  source: string;
  articleNo: string;
  sourceUrl: string | null;
  cpName: string | null;
  cpid: string | null;
  cpPcArticleUrl: string | null;
  representativeArticleNo: string | null;
  sameAddrCnt: number | null;
  sameAddrDirectCnt: number | null;
  sameAddrMaxPrc: string | null;
  sameAddrMinPrc: string | null;
  transactionType: ExternalListingTransactionType;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  articleName: string | null;
  articleFeatureDesc: string | null;
  detailDescription: string | null;
  articleConfirmYmd: string | null;
  floorInfo: string | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  direction: string | null;
  tagList: string[] | null;
  verificationTypeCode: string | null;
  realtorId: string | null;
  realtorName: string | null;
  originalRealtorName: string | null;
  representativeTelNo: string | null;
  cellPhoneNo: string | null;
  ranking: number | null;
  isSharedRank: boolean;
  sharedRank: number | null;
  sameRankNum: number | null;
  seango: boolean;
  epju: boolean;
  exposeStartYmd: number | null;
  exposeEndYmd: number | null;
  priceChangeState: string | null;
  isPriceModification: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExternalListingGroupStatus =
  | 'unmatched'
  | 'matched'
  | 'verified'
  | 'on_hold';

export interface ExternalListingGroup {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
  buildingName: string | null;
  inferredHo: string | null;
  areaName: string | null;
  exclusiveAreaM2: number | null;
  transactionType: ExternalListingTransactionType;
  memo: string | null;
  favorite: boolean;
  status: ExternalListingGroupStatus;
  mainExternalListingId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  site?: Site;
  unit?: Unit | null;
  mainExternalListing?: ExternalListing | null;
  listings?: ExternalListing[];
  listingCount?: number;
  // ── Aggregates computed by the server for table display ─────────
  priceMin?: number | null;
  priceMax?: number | null;
  minYmd?: string | null;
  maxYmd?: string | null;
  confirmDateDiff?: number | null;
  ownerVerified?: boolean;
  offerRanking?: number | null;
}

export interface ExternalListingGroupsFilter {
  transactionType?: ExternalListingTransactionType;
  siteIds?: string[];
  siteId?: string;
  status?: ExternalListingGroupStatus;
  search?: string;
  /** 스냅샷 세션 버킷 (siteId + transactionType 필수) */
  bucket?: 'new' | 'old' | 'all';
  /** 기본은 활성 listing 있는 그룹만. true면 inactive 포함 */
  includeInactive?: boolean;
}

export interface SnapshotSessionUserRef {
  id: string;
  name: string;
}

export interface SnapshotSession {
  id: string;
  officeId: string;
  siteId: string;
  transactionType: ExternalListingTransactionType;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  startedById: string;
  startedBy?: SnapshotSessionUserRef;
  completedAt: string | null;
  completedById: string | null;
  completedBy?: SnapshotSessionUserRef | null;
  staleListingsMarked: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompleteSessionResult {
  session: SnapshotSession;
  staleListingsMarked: number;
}

export interface UpdateExternalListingGroupDto {
  unitId?: string | null;
  inferredHo?: string | null;
  memo?: string | null;
  status?: ExternalListingGroupStatus;
  favorite?: boolean;
}

export interface BatchListingItem {
  articleNo: string;
  sourceUrl?: string | null;
  cpName?: string | null;
  cpid?: string | null;
  cpPcArticleUrl?: string | null;
  representativeArticleNo?: string | null;
  sameAddrCnt?: number | null;
  sameAddrDirectCnt?: number | null;
  sameAddrMaxPrc?: string | null;
  sameAddrMinPrc?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  articleName?: string | null;
  articleFeatureDesc?: string | null;
  detailDescription?: string | null;
  articleConfirmYmd?: string | null;
  floorInfo?: string | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  direction?: string | null;
  tagList?: unknown;
  verificationTypeCode?: string | null;
  realtorId?: string | null;
  realtorName?: string | null;
  originalRealtorName?: string | null;
  representativeTelNo?: string | null;
  cellPhoneNo?: string | null;
  ranking?: number | null;
  isSharedRank?: boolean | null;
  sharedRank?: number | null;
  sameRankNum?: number | null;
  seango?: boolean | null;
  epju?: boolean | null;
  exposeStartYmd?: number | null;
  exposeEndYmd?: number | null;
  priceChangeState?: string | null;
  isPriceModification?: boolean | null;
  raw?: unknown;
  /** 새 그룹 생성 힌트 (기존 그룹의 사용자 입력은 덮어쓰지 않음) */
  buildingName?: string | null;
  areaName?: string | null;
  /** 새 그룹 생성 시 Unit에 즉시 링크. 수동 입력 경로에서만 사용. */
  unitId?: string | null;
  inferredHo?: string | null;
}

export interface BatchUpsertDto {
  source: string;
  siteId: string;
  transactionType: ExternalListingTransactionType;
  /** 재시도 로그용. 서버에 저장되지 않음. */
  batchId?: string;
  listings: BatchListingItem[];
}

export interface BatchUpsertResult {
  batchId?: string;
  received: number;
  created: number;
  updated: number;
  groupsCreated: number;
  groupsReused: number;
  errors: Array<{ articleNo: string; message: string }>;
}

export function createExternalListingsApi(request: RequestFn) {
  return {
    findAllGroups: (filters?: ExternalListingGroupsFilter) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (filters?.transactionType) params.transactionType = filters.transactionType;
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      if (filters?.siteId) params.siteId = filters.siteId;
      if (filters?.siteIds && filters.siteIds.length > 0) {
        params.siteIds = filters.siteIds.join(',');
      }
      if (filters?.bucket) params.bucket = filters.bucket;
      if (filters?.includeInactive) params.includeInactive = 'true';
      return request<ExternalListingGroup[]>('/external-listings/groups', { params });
    },

    findGroupById: (id: string) =>
      request<ExternalListingGroup>(`/external-listings/groups/${id}`),

    updateGroup: (id: string, dto: UpdateExternalListingGroupDto) =>
      request<ExternalListingGroup>(`/external-listings/groups/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    /**
     * 배치 업서트. 최대 100건/요청.
     * 클라이언트는 100건 초과 시 chunk를 나눠 순차 전송해야 한다.
     */
    batchUpsert: (dto: BatchUpsertDto) =>
      request<BatchUpsertResult>('/external-listings/batch', {
        method: 'POST',
        body: dto,
      }),

    // ─── 스냅샷 세션 ───────────────────────────────────────────

    getActiveSession: (
      siteId: string,
      transactionType: ExternalListingTransactionType,
    ) =>
      request<SnapshotSession | null>('/external-listings/sessions/active', {
        params: { siteId, transactionType },
      }),

    createSession: (dto: {
      siteId: string;
      transactionType: ExternalListingTransactionType;
    }) =>
      request<SnapshotSession>('/external-listings/sessions', {
        method: 'POST',
        body: dto,
      }),

    completeSession: (id: string) =>
      request<CompleteSessionResult>(
        `/external-listings/sessions/${id}/complete`,
        { method: 'POST' },
      ),

    cancelSession: (id: string) =>
      request<SnapshotSession>(`/external-listings/sessions/${id}/cancel`, {
        method: 'POST',
      }),
  };
}
