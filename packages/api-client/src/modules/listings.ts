import type { RequestFn } from '../client.js';
import type {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';
import type { PaginatedResponse } from '../types.js';
import type { Tenant } from './tenants.js';

export type ListingAdvertisementStatus =
  | 'active'
  | 'ended';
export type ListingAdvertisementSource = 'manual' | 'cp_sync';

export interface ListingAdvertisement {
  id: string;
  officeId: string;
  listingId: string;
  channel: string;
  status: ListingAdvertisementStatus;
  source: ListingAdvertisementSource | string;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  startedAt: string | null;
  endedAt: string | null;
  url: string | null;
  memo: string | null;
  externalAdId: string | null;
  naverArticleNo: string | null;
  naverUrl: string | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
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
  privateMemo: string | null;
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
    };
    unit?: {
      id: string;
      name: string;
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
      privateMemo: string | null;
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
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
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
  privateMemo?: string | null;
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
  privateMemo?: string | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
  isPaused?: boolean;
  memo?: string;
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

    remove: (id: string) =>
      request<void>(`/listings/${id}`, { method: 'DELETE' }),
  };
}
