import type { RequestFn } from '../client.js';
import type {
  AdvertisementSyncState,
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';
import type { PaginatedResponse } from '../types.js';
import type { AdvertisementChangeRequest } from './listing-advertisements.js';
import type { Tenant } from './tenants.js';

export type ListingAdvertisementStatus =
  | 'active'
  | 'ended';

export interface OfficeCpAccount {
  id: string;
  officeId: string;
  channel: string;
  accountKey: string;
  accountName: string | null;
  lastSyncedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    advertisements: number;
  };
}

export interface ListingAdvertisement {
  id: string;
  officeId: string;
  cpAccountId?: string | null;
  cpAccount?: Pick<OfficeCpAccount, 'id' | 'channel' | 'accountKey' | 'accountName'> | null;
  /** 어느 의뢰의 광고인지. 매물과 아직 잇지 못한 광고는 null */
  listingId: string | null;
  /** 우리 사무소의 관리 공간. 매물이 없어도 호실까지 찾았으면 있다 */
  propertyId?: string | null;
  /** 건물(대지). 호실을 못 찾아도 건물까지 찾았으면 있다 */
  siteId?: string | null;
  /** 광고의 거래유형. 매물이 없는 광고도 가격을 읽을 수 있게 광고에 따로 둔다 */
  transactionType?: string | null;
  /** CP가 적은 그대로의 위치 글. 우리 데이터와 잇지 못한 광고를 사람이 알아보는 근거 */
  rawJibunAddress?: string | null;
  rawRoadAddress?: string | null;
  rawSiteName?: string | null;
  rawDong?: string | null;
  rawHo?: string | null;
  rawFloorText?: string | null;
  rawAreaM2?: number | string | null;
  /** 층 노출: exact(정확한 층) | band(저 · 중 · 고) */
  floorExposure?: string | null;
  channel: string;
  status: ListingAdvertisementStatus;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  startedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  url: string | null;
  memo: string | null;
  externalAdId: string | null;
  naverArticleNo: string | null;
  naverUrl: string | null;
  providerStatus: string | null;
  providerStatusObservedAt: string | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  manualEditedAt?: string | null;
  syncState?: AdvertisementSyncState;
  changeRequests?: AdvertisementChangeRequest[];
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

export interface ListingOccupyingDeal {
  id: string;
  stage: string;
  stageChangedAt: string | null;
  /** 합의 금액(만원). 끝난 매물은 내놓은 가격 대신 이 값을 거래가로 보인다 */
  agreedPrice?: number | null;
  agreedDeposit?: number | null;
  agreedMonthlyRent?: number | null;
}

export interface ListingIntakeState {
  lifecycleStatus: IntakeLifecycleStatus;
  lifecycleChangedAt: string;
  lifecycleChangedBy: string;
  closedReason: IntakeClosedReason | null;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  lastCheckResult: IntakeCheckResult | null;
  nextConfirmAt: string | null;
}

export interface ListingIntakeSummary extends ListingIntakeState {
  id: string;
  receivedAt: string;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string | null;
  jointBrokeragePartner?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  memo: string | null;
  updatedAt: string;
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
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isPaused: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  /** 의뢰 컨텍스트 — 확인 상태/접수일/다음확인일의 단일 출처 */
  intake?: ListingIntakeSummary;
  /** 이 거래 옵션의 비취소 Deal — 있으면 "거래중/종료" */
  deals?: ListingOccupyingDeal[];
  /** 매물관리 목록에 필요한 현재 게재 중 광고. */
  activeAdvertisements?: ListingAdvertisement[];
  /** status=active 조건으로 서버가 계산한 현재 광고 수. */
  activeAdvertisementCount?: number;
  /** 상세 응답의 전체 광고 게재 이력. 목록 응답에는 포함하지 않는다. */
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
  /** findAll include — 매물 목록 매칭 칩 카운트 */
  _count?: { matches: number };
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
      /** 법정동 코드(10자리). 앞 2자리가 시도, 앞 5자리가 시군구 */
      wardCode?: string | null;
    };
    unit?: {
      id: string;
      /** 호 이름. 호 없이 층이 단위인 공간은 null */
      name: string | null;
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
      moveInAvailableType: string | null;
      moveInAvailableFrom: string | null;
      moveInAvailableTo: string | null;
      isPaused: boolean;
      memo: string | null;
      createdAt: string;
      updatedAt: string;
      deals?: ListingOccupyingDeal[];
      advertisements?: ListingAdvertisement[];
      priceHistories?: ListingPriceHistory[];
      /** findAll include — 매물 목록 매칭 칩 카운트 */
      _count?: { matches: number };
    }>;
  };
}

export interface ListingsFilter {
  propertyId?: string;
  transactionType?: string;
  siteType?: string;
  /** 의뢰 생명주기 필터 */
  intakeLifecycleStatus?: IntakeLifecycleStatus;
  /** 확인 이력에서 파생한 확인 상태 필터 */
  confirmationState?: IntakeConfirmationState;
  /** Deal·의뢰·옵션 중지를 합성한 가용 상태 필터 */
  availability?: ListingAvailability;
  /** true면 종결 의뢰의 매물도 포함. 기본은 열린/보류 의뢰만. */
  includeClosed?: boolean;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  /** 공급면적 하한 (m²) */
  areaMin?: number;
  /** 공급면적 상한 (m²) */
  areaMax?: number;
  /** 법정동 코드(10자리)와 같은 동의 매물만 */
  wardCode?: string;
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
  /** 법정동 코드(10자리). 앞 2자리가 시도, 앞 5자리가 시군구다. 옛 서버 응답에는 없다 */
  wardCode?: string | null;
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
  moveInAvailableType?: string;
  moveInAvailableFrom?: string;
  moveInAvailableTo?: string;
  isPaused?: boolean;
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
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
  isPaused?: boolean;
  memo?: string | null;
  expectedUpdatedAt?: string | null;
}

export function createListingsApi(request: RequestFn) {
  return {
    findAll: (filters?: ListingsFilter) =>
      request<PaginatedResponse<Listing>>('/listings', {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),

    filterSites: () => request<ListingFilterSite[]>('/listings/filter-sites'),

    findOne: (id: string) => request<Listing>(`/listings/${id}`),

    create: (dto: CreateListingDto) =>
      request<Listing>('/listings', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateListingDto) =>
      request<Listing>(`/listings/${id}`, { method: 'PATCH', body: dto }),

    /** intakeRemoved: 의뢰의 마지막 조건이라 의뢰도 함께 지워졌는지 */
    remove: (id: string) =>
      request<{ id: string; intakeRemoved?: boolean }>(`/listings/${id}`, { method: 'DELETE' }),
  };
}
