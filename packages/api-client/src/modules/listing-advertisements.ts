import type { RequestFn } from "../client.js";
import type { PaginatedResponse } from "../types.js";
import type {
  Listing,
  ListingAdvertisement,
  ListingAdvertisementStatus,
} from "./listings.js";
import type { AdvertisementComparisonSet } from "./office-advertisements.js";

/** 광고가 우리 데이터의 어디까지 연결됐는지. listing > property > site > none */
export type AdvertisementLinkLevel = "listing" | "property" | "site" | "none";

export type AdvertisementChangeKind =
  | "price"
  | "floor_exposure"
  | "readvertise"
  | "takedown";

/** 광고를 바꿔 달라는 요청. 업무(Task) 하나와 짝이고, 처리 상태는 업무의 상태다 */
export interface AdvertisementChangeRequest {
  id: string;
  officeId: string;
  advertisementId: string;
  taskId: string;
  kind: AdvertisementChangeKind;
  fromValue: Record<string, unknown> | null;
  toValue: Record<string, unknown> | null;
  requestedById: string | null;
  createdAt: string;
  task?: {
    id: string;
    status: string;
    assignedToId: string | null;
    updatedAt: string;
  };
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
  kind: AdvertisementChangeKind;
  /** price: { price?, deposit?, monthlyRent? } (만원) · floor_exposure: { floorExposure: exact | band } */
  toValue?: Record<string, unknown> | null;
  /** 업무에 함께 적을 말 */
  memo?: string | null;
  dueDate?: string | null;
  /** 맡길 직원. 비우면 담당자 없이 등록되어 에이전트가 가져간다 */
  assignedToId?: string | null;
}

export interface ListingAdvertisementActionContext {
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
  /** 그 시점의 게재 상태: active | ended. 가격만이 아니라 게재 · 종료 · 재광고도 한 줄씩 쌓인다 */
  status: string;
  /** 그 시점의 네이버 매물번호. 직전 줄과 다르면 재광고다 */
  naverArticleNo: string | null;
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
  /** 직전 기록에서 달라진 것: cheaper_appeared, cheaper_gone, own_hidden, own_restored, floor_disadvantage, rank_changed */
  changes: string[];
}

/** 광고 한 건의 흐름: 내 광고의 변화와 그때그때의 시장 상태 */
export interface ListingAdvertisementTimeline {
  histories: Array<
    Pick<
      ListingAdvertisementPriceHistory,
      | "id"
      | "status"
      | "naverArticleNo"
      | "advertisedPrice"
      | "advertisedDeposit"
      | "advertisedMonthlyRent"
      | "observedAt"
      | "source"
    >
  >;
  comparisonRecords: AdvertisementComparisonRecord[];
}

export interface ListingAdvertisementsFilter {
  listingId?: string;
  propertyId?: string;
  /** listing: 매물과 이어진 것 · no_listing: 매물 없음 · no_property: 호실 못 찾음 · no_site: 건물 못 찾음 */
  link?: "listing" | "no_listing" | "no_property" | "no_site";
  /** pending: 처리되지 않은 변경 요청이 걸린 광고만 */
  requests?: "pending";
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
  /** 매물 · 관리 공간 · 건물 중 아는 만큼. 모두 비우면 연결 없는 광고로 저장된다 */
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
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
  /**
   * 고치기 전에 화면이 보고 있던 가격. 그 사이 수집이나 다른 사람이 바꿨으면 서버가 409로 거절한다.
   */
  expected?: {
    advertisedPrice?: number | null;
    advertisedDeposit?: number | null;
    advertisedMonthlyRent?: number | null;
  } | null;
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

    /** 광고 한 건의 흐름 (광고 이력 + 네이버 비교 기록, 오래된 것부터) */
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

    /** 광고를 매물 · 관리 공간 · 건물에 잇는다. 준 것보다 위 단계는 서버가 채운다 */
    link: (id: string, dto: LinkListingAdvertisementDto) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}/link`, {
        method: "PATCH",
        body: dto,
      }),

    /** 처리되지 않은 변경 요청 */
    findOpenChangeRequests: (advertisementId?: string) =>
      request<AdvertisementChangeRequest[]>(
        "/listing-advertisements/change-requests",
        { params: { advertisementId } },
      ),

    /** 광고를 바꿔 달라고 요청한다. 업무가 하나 생긴다 */
    createChangeRequest: (id: string, dto: CreateAdvertisementChangeRequestDto) =>
      request<AdvertisementChangeRequest>(
        `/listing-advertisements/${id}/change-requests`,
        { method: "POST", body: dto },
      ),

    /** 요청을 거둔다 (연결된 업무를 취소한다) */
    cancelChangeRequest: (requestId: string) =>
      request<AdvertisementChangeRequest>(
        `/listing-advertisements/change-requests/${requestId}`,
        { method: "DELETE" },
      ),

    /** 잘못 등록한 행만 완전 삭제한다. 정상 내림은 status=ended와 관측 종료 시각을 보존한다. */
    remove: (id: string) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "DELETE",
      }),
  };
}
