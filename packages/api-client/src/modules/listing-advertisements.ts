import type {
  AdvertisementChangeAction,
  AdvertisementChangeRequestStatus,
} from "@estate-erp/shared";
import type { RequestFn } from "../client.js";
import type { PaginatedResponse } from "../types.js";
import type {
  Listing,
  ListingAdvertisement,
  ListingAdvertisementStatus,
  OfficeCpAccount,
} from "./listings.js";
import type { AdvertisementComparisonSet } from "./office-advertisements.js";

/** 광고가 우리 데이터의 어디까지 연결됐는지. listing > property > site > none */
export type AdvertisementLinkLevel = "listing" | "property" | "site" | "none";

export type { AdvertisementChangeAction, AdvertisementChangeRequestStatus };

/** 광고 변경 요청 (게재 · 수정 · 재광고 · 내리기). 묶음 업무(Task, N:1)에 연결될 수 있다. */
export interface AdvertisementChangeRequest {
  id: string;
  officeId: string;
  advertisementId: string | null;
  listingId: string | null;
  channel: string;
  cpAccountId: string | null;
  taskId: string | null;
  action: AdvertisementChangeAction;
  baseSnapshot: Record<string, unknown> | null;
  targetValue: Record<string, unknown> | null;
  status: AdvertisementChangeRequestStatus;
  failureReason: string | null;
  memo: string | null;
  dueDate: string | null;
  requestedById: string | null;
  assignedToId: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cpAccount?: Pick<OfficeCpAccount, "id" | "accountKey" | "accountName"> | null;
  assignedTo?: { id: string; name: string } | null;
  requestedBy?: { id: string; name: string } | null;
  task?: {
    id: string;
    title?: string;
    status: string;
    assignedToId: string | null;
    dueDate?: string | null;
    updatedAt: string;
  } | null;
  /** 광고의 지금 값이 요청한 값과 같아졌는지. 재광고처럼 이 광고만 보고 알 수 없으면 null */
  fulfilled?: boolean | null;
}

export type AdvertisementPlace = NonNullable<Listing["property"]>;

export type ListingAdvertisementWithListing = ListingAdvertisement & {
  listing?: Listing | null;
  /** 매물이 없을 때 광고에 직접 걸린 관리 공간 */
  property?: AdvertisementPlace | null;
  /** 호실을 못 찾았을 때 광고에 직접 걸린 건물 */
  site?: NonNullable<AdvertisementPlace["site"]> | null;
  linkLevel?: AdvertisementLinkLevel;
  changeRequests?: AdvertisementChangeRequest[];
  /** 네이버 비교 한 벌. 비교한 적이 없으면 null */
  comparison?: AdvertisementComparisonSet | null;
  actionContext?: ListingAdvertisementActionContext;
};

export interface LinkListingAdvertisementDto {
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
}

export interface CreateAdvertisementChangeRequestDto {
  action: AdvertisementChangeAction;
  advertisementId?: string | null;
  listingId?: string | null;
  channel?: string | null;
  cpAccountId?: string | null;
  accountKey?: string | null;
  /** { price?, deposit?, monthlyRent?, floorExposure? } */
  targetValue?: Record<string, unknown> | null;
  memo?: string | null;
  dueDate?: string | null;
  assignedToId?: string | null;
  taskTitle?: string | null;
}

export interface CreateAdvertisementChangeRequestsBatchDto {
  items: CreateAdvertisementChangeRequestDto[];
  title?: string | null;
  memo?: string | null;
  dueDate?: string | null;
  assignedToId?: string | null;
}

export interface UpdateAdvertisementChangeRequestStatusDto {
  status: "requested" | "in_progress" | "executed" | "failed" | "cancelled";
  failureReason?: string | null;
}

export interface ListingAdvertisementActionContext {
  ownAdvertisementId: string | null;
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
  status: string;
  naverArticleNo: string | null;
  externalAdId?: string | null;
  floorExposure?: string | null;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  observedAt: string;
  source: string;
  createdAt: string;
  advertisement: Pick<
    ListingAdvertisement,
    | "channel"
    | "cpAccountId"
    | "externalAdId"
    | "startedAt"
    | "firstSeenAt"
    | "lastSeenAt"
    | "endedAt"
  >;
}

/** 네이버 비교를 읽을 때마다 쌓인 요약 한 줄 */
export interface AdvertisementComparisonRecord {
  id: string;
  observedAt: string;
  ownVisible: boolean;
  ownRanking: number | null;
  totalCount: number;
  lowestCompetitorAmount: number | null;
  lowerPricedCount: number;
  signal: string;
  changes: string[];
}

export interface ListingAdvertisementTimelineChangeRequest {
  id: string;
  action: AdvertisementChangeAction;
  status: AdvertisementChangeRequestStatus;
  targetValue: Record<string, unknown> | null;
  baseSnapshot: Record<string, unknown> | null;
  failureReason: string | null;
  memo: string | null;
  assignedToId: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cpAccount?: Pick<OfficeCpAccount, "id" | "accountKey" | "accountName"> | null;
  assignedTo?: { id: string; name: string } | null;
}

/** 광고 한 건의 흐름: 내 광고의 변화, 시장 상태, 변경 요청 이력 */
export interface ListingAdvertisementTimeline {
  histories: Array<
    Pick<
      ListingAdvertisementPriceHistory,
      | "id"
      | "status"
      | "naverArticleNo"
      | "externalAdId"
      | "floorExposure"
      | "advertisedPrice"
      | "advertisedDeposit"
      | "advertisedMonthlyRent"
      | "observedAt"
      | "source"
      | "createdAt"
    >
  >;
  comparisonRecords: AdvertisementComparisonRecord[];
  changeRequests?: ListingAdvertisementTimelineChangeRequest[];
}

export interface ListingAdvertisementsFilter {
  listingId?: string;
  propertyId?: string;
  cpAccountId?: string;
  /** listing: 매물과 이어진 것 · no_listing: 매물 없음 · no_property: 호실 못 찾음 · no_site: 건물 못 찾음 */
  link?: "listing" | "no_listing" | "no_property" | "no_site";
  /** pending: 처리되지 않은 변경 요청이 걸린 광고만 */
  requests?: "pending";
  channel?: string;
  status?: ListingAdvertisementStatus;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CreateListingAdvertisementDto {
  /** 매물 · 관리 공간 · 건물 중 아는 만큼. 모두 비우면 연결 없는 광고로 저장된다 */
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
  cpAccountId?: string | null;
  accountKey?: string | null;
  transactionType?: string | null;
  rawJibunAddress?: string | null;
  rawRoadAddress?: string | null;
  rawSiteName?: string | null;
  rawDong?: string | null;
  rawHo?: string | null;
  rawFloorText?: string | null;
  rawAreaM2?: number | null;
  floorExposure?: string | null;
  channel: string;
  status?: ListingAdvertisementStatus;
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
  expected?: {
    advertisedPrice?: number | null;
    advertisedDeposit?: number | null;
    advertisedMonthlyRent?: number | null;
  } | null;
  cpAccountId?: string | null;
  accountKey?: string | null;
  transactionType?: string | null;
  rawJibunAddress?: string | null;
  rawRoadAddress?: string | null;
  rawSiteName?: string | null;
  rawDong?: string | null;
  rawHo?: string | null;
  rawFloorText?: string | null;
  rawAreaM2?: number | null;
  floorExposure?: string | null;
  channel?: string;
  status?: ListingAdvertisementStatus;
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

export interface UpsertOfficeCpAccountDto {
  channel: string;
  accountKey: string;
  accountName?: string | null;
}

export interface UpdateOfficeCpAccountDto {
  accountName?: string | null;
  isActive?: boolean;
}

export function createListingAdvertisementsApi(request: RequestFn) {
  return {
    findCpAccounts: (params?: { channel?: string; includeInactive?: boolean }) =>
      request<OfficeCpAccount[]>("/listing-advertisements/cp-accounts", {
        params: params as Record<string, string | boolean | undefined>,
      }),

    upsertCpAccount: (dto: UpsertOfficeCpAccountDto) =>
      request<OfficeCpAccount>("/listing-advertisements/cp-accounts", {
        method: "POST",
        body: dto,
      }),

    updateCpAccount: (accountId: string, dto: UpdateOfficeCpAccountDto) =>
      request<OfficeCpAccount>(
        `/listing-advertisements/cp-accounts/${accountId}`,
        { method: "PATCH", body: dto },
      ),

    findPriceHistory: (listingId: string) =>
      request<ListingAdvertisementPriceHistory[]>(
        "/listing-advertisements/price-history",
        { params: { listingId } },
      ),

    timeline: (id: string) =>
      request<ListingAdvertisementTimeline>(
        `/listing-advertisements/${id}/timeline`,
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

    link: (id: string, dto: LinkListingAdvertisementDto) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}/link`, {
        method: "PATCH",
        body: dto,
      }),

    findOpenChangeRequests: (params?: {
      advertisementId?: string;
      listingId?: string;
      channel?: string;
      cpAccountId?: string;
      status?: string;
      includeClosed?: boolean;
    }) =>
      request<AdvertisementChangeRequest[]>(
        "/listing-advertisements/change-requests",
        {
          params: params as Record<string, string | boolean | undefined>,
        },
      ),

    createChangeRequest: (
      id: string,
      dto: CreateAdvertisementChangeRequestDto,
    ) =>
      request<AdvertisementChangeRequest>(
        `/listing-advertisements/${id}/change-requests`,
        { method: "POST", body: dto },
      ),

    createUnifiedChangeRequest: (dto: CreateAdvertisementChangeRequestDto) =>
      request<AdvertisementChangeRequest>(
        "/listing-advertisements/change-requests",
        { method: "POST", body: dto },
      ),

    createChangeRequestsBatch: (
      dto: CreateAdvertisementChangeRequestsBatchDto,
    ) =>
      request<{
        requests: AdvertisementChangeRequest[];
        task: AdvertisementChangeRequest["task"];
      }>("/listing-advertisements/change-requests/batch", {
        method: "POST",
        body: dto,
      }),

    updateChangeRequestStatus: (
      requestId: string,
      dto: UpdateAdvertisementChangeRequestStatusDto,
    ) =>
      request<AdvertisementChangeRequest>(
        `/listing-advertisements/change-requests/${requestId}`,
        { method: "PATCH", body: dto },
      ),

    cancelChangeRequest: (requestId: string) =>
      request<{ id: string; taskId: string | null; status: "cancelled" }>(
        `/listing-advertisements/change-requests/${requestId}`,
        { method: "DELETE" },
      ),

    remove: (id: string) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "DELETE",
      }),
  };
}
