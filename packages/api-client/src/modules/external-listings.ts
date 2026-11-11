import type { RequestFn } from '../client.js';
import type { Site } from './sites.js';

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
  previousPrice: number | null;
  previousDeposit: number | null;
  previousMonthlyRent: number | null;
  priceChangedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExternalListingGroupStatus = 'unmatched' | 'verified' | 'on_hold';
export type ExternalListingDiscoveryStatus = 'new' | 'added' | 'existing';

export interface ExternalListingGroup {
  id: string;
  officeId: string;
  siteId: string;
  buildingName: string | null;
  ho: string | null;
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
  /** 마지막 수집 세션과 비교한 동일주소 그룹의 발견 상태. */
  discoveryStatus?: ExternalListingDiscoveryStatus;
  /** 가격 변경 표시의 기준 시각. 스냅샷 닫기 결과의 비교 기준과 같다. */
  priceChangeSince?: string | null;
  /** 같은 그룹에서 확인된 우리 사무소 광고의 게시일 (YYYYMMDD). */
  ownAdvertisementYmd?: string | null;
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

/** 열린 스냅샷. 닫으면 남을 광고와 내려갈 광고 수를 함께 준다. */
export interface ActiveSnapshotSession extends SnapshotSession {
  receivedListingCount: number;
  pendingRemovalCount: number;
}

export interface ExternalListingPriceTerms {
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

/** 스냅샷을 닫을 때 직전 완료 스냅샷과 비교한 결과. */
export interface SnapshotComparison {
  /** 비교할 이전 스냅샷이 없어 모든 입력이 신규로 잡힌 경우 true. */
  isBaseline: boolean;
  newGroups: Array<{
    groupId: string;
    representativeArticleNo: string | null;
    articleNos: string[];
  }>;
  addedListings: Array<{ groupId: string; articleNo: string }>;
  removedGroups: Array<{ groupId: string; articleNos: string[] }>;
  removedListings: Array<{ groupId: string; articleNo: string }>;
  priceChanges: Array<{
    groupId: string;
    articleNo: string;
    before: ExternalListingPriceTerms;
    after: ExternalListingPriceTerms;
  }>;
}

export interface CompleteSessionResult {
  session: SnapshotSession;
  staleListingsMarked: number;
  receivedListingCount: number;
  comparison: SnapshotComparison;
}

export interface UpdateExternalListingGroupDto {
  ho?: string | null;
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
  /** 새 그룹 생성 힌트 (기존 그룹의 사용자 입력은 덮어쓰지 않음) */
  buildingName?: string | null;
  areaName?: string | null;
  /** 새 그룹 생성 시 저장할 호수 텍스트. */
  ho?: string | null;
}

/** 동일 매물의 광고 묶음. 대표는 항상 지정하며 listings 안에 있어야 한다. */
export interface ListingGroupInput {
  representativeArticleNo: string;
  listings: BatchListingItem[];
}

export interface BatchUpsertDto {
  /** 열린 스냅샷. 단지와 거래유형은 세션에서 결정된다. */
  sessionId: string;
  source: string;
  /** 재시도 로그용. 서버에 저장되지 않음. */
  batchId?: string;
  groups: ListingGroupInput[];
}

export interface AddSnapshotListingDto {
  source: string;
  listing: BatchListingItem;
}

export type SnapshotListingPatch = Partial<
  Pick<
    BatchListingItem,
    | 'price'
    | 'deposit'
    | 'monthlyRent'
    | 'articleName'
    | 'articleFeatureDesc'
    | 'detailDescription'
    | 'articleConfirmYmd'
    | 'floorInfo'
    | 'direction'
    | 'realtorName'
    | 'representativeTelNo'
    | 'ranking'
    | 'sourceUrl'
  >
>;

export interface BatchUpsertResult {
  batchId?: string;
  received: number;
  created: number;
  updated: number;
  groupsCreated: number;
  groupsReused: number;
}

export function createExternalListingsApi(request: RequestFn) {
  return {
    findAllGroups: (filters?: ExternalListingGroupsFilter) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (filters?.transactionType)
        params.transactionType = filters.transactionType;
      if (filters?.status) params.status = filters.status;
      if (filters?.search) params.search = filters.search;
      if (filters?.siteId) params.siteId = filters.siteId;
      if (filters?.siteIds && filters.siteIds.length > 0) {
        params.siteIds = filters.siteIds.join(',');
      }
      if (filters?.bucket) params.bucket = filters.bucket;
      if (filters?.includeInactive) params.includeInactive = 'true';
      return request<ExternalListingGroup[]>('/external-listings/groups', {
        params,
      });
    },

    findGroupById: (id: string) =>
      request<ExternalListingGroup>(`/external-listings/groups/${id}`),

    updateGroup: (id: string, dto: UpdateExternalListingGroupDto) =>
      request<ExternalListingGroup>(`/external-listings/groups/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    /**
     * 묶음 입력. 최대 100건/요청, 요청 하나는 전부 저장되거나 전부 거부된다.
     * 100건을 넘으면 묶음을 나누지 않는 단위로 순차 전송해야 한다.
     */
    batchUpsert: (dto: BatchUpsertDto) =>
      request<BatchUpsertResult>('/external-listings/batch', {
        method: 'POST',
        body: dto,
      }),

    // ─── 스냅샷 세션 ───────────────────────────────────────────

    getActiveSession: async (
      siteId: string,
      transactionType: ExternalListingTransactionType,
    ) =>
      (await request<ActiveSnapshotSession | null | undefined>(
        '/external-listings/sessions/active',
        {
          params: { siteId, transactionType },
        },
      )) ?? null,

    createSession: (dto: {
      siteId: string;
      transactionType: ExternalListingTransactionType;
    }) =>
      request<SnapshotSession>('/external-listings/sessions', {
        method: 'POST',
        body: dto,
      }),

    completeSession: (id: string, options?: { expectedListingCount?: number }) =>
      request<CompleteSessionResult>(
        `/external-listings/sessions/${id}/complete`,
        { method: 'POST', body: options ?? {} },
      ),

    cancelSession: (id: string) =>
      request<SnapshotSession>(`/external-listings/sessions/${id}/cancel`, {
        method: 'POST',
      }),

    // ─── 열린 스냅샷 안의 유지·추가·수정·삭제 ──────────────────

    keepSnapshotListings: (sessionId: string, groupIds: string[]) =>
      request<{ keptGroupCount: number; keptListingCount: number }>(
        `/external-listings/sessions/${sessionId}/keep`,
        { method: 'POST', body: { groupIds } },
      ),

    addSnapshotListing: (
      sessionId: string,
      groupId: string,
      dto: AddSnapshotListingDto,
    ) =>
      request<ExternalListing>(
        `/external-listings/sessions/${sessionId}/groups/${groupId}/listings`,
        { method: 'POST', body: dto },
      ),

    updateSnapshotListing: (
      sessionId: string,
      listingId: string,
      patch: SnapshotListingPatch,
    ) =>
      request<ExternalListing>(
        `/external-listings/sessions/${sessionId}/listings/${listingId}`,
        { method: 'PATCH', body: patch },
      ),

    removeSnapshotListing: (sessionId: string, listingId: string) =>
      request<{ id: string; result: 'deleted' | 'excluded' | 'unchanged' }>(
        `/external-listings/sessions/${sessionId}/listings/${listingId}`,
        { method: 'DELETE' },
      ),
  };
}
