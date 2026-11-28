import type { RequestFn } from '../client.js';
import type {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';
import type { ListingAdvertisement, ListingPriceHistory } from './listings.js';
import type { Property } from './properties.js';

export interface ListingIntakeListing {
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
  /** 이 거래 옵션의 비취소 Deal — 있으면 "거래중/종료" */
  /** 이 조건을 점유한 거래(진행·완료). 끝난 매물은 목록에 거래가를 보인다 */
  deals?: Array<{
    id: string;
    stage: string;
    stageChangedAt: string | null;
    agreedPrice?: number | null;
    agreedDeposit?: number | null;
    agreedMonthlyRent?: number | null;
  }>;
  /** 매물관리 목록에 필요한 현재 게재 중 광고. */
  activeAdvertisements?: ListingAdvertisement[];
  /** status=active 조건으로 서버가 계산한 현재 광고 수. */
  activeAdvertisementCount?: number;
  /** 상세 응답의 전체 광고 게재 이력. 목록 응답에는 포함하지 않는다. */
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
  /** 목록의 매칭 칩에 표시할 연결 매칭 수 (stage=closed 제외). */
  _count?: { matches: number };
}

export interface ListingIntake {
  id: string;
  officeId: string;
  /** 사용자가 프로젝트로 묶었을 때만 있다. */
  projectId: string | null;
  propertyId: string;
  /** 이 의뢰의 거래 조건에 걸린 거래 요약(상세 조회에만). 완료 · 취소 포함 */
  deals?: import('./deals.js').DealSummary[];
  lifecycleStatus: IntakeLifecycleStatus;
  lifecycleChangedAt: string;
  /** 마지막 생명주기 전이 주체: "user" | "system:deal" */
  lifecycleChangedBy: string;
  closedReason: IntakeClosedReason | null;
  receivedAt: string;
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  lastCheckResult: IntakeCheckResult | null;
  nextConfirmAt: string | null;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string | null;
  /** 거주 상태: owner_occupied | tenant | vacant. 적지 않았으면 null(미확인) */
  occupancyStatus?: import('@estate-erp/shared').OccupancyStatus | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  jointBrokeragePartner?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  property?: Property;
  listings?: ListingIntakeListing[];
}

export type ListingIntakeConfirmResult = IntakeCheckResult;

export type ListingIntakeConfirmChannel =
  | 'phone'
  | 'sms'
  | 'visit'
  | 'owner_message'
  | 'note'
  | 'mcp';

export type ListingIntakeSortField =
  | 'receivedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'info'
  | 'site'
  | 'dong'
  | 'unit'
  | 'supplyArea'
  | 'unitType'
  | 'exclusiveArea'
  | 'matching'
  | 'advertisement'
  | 'confirmationAt'
  | 'listingAvailability'
  | 'price'
  | 'monthlyRent'
  | 'loanAmount'
  | 'moveInAvailable'
  | 'memo';

export interface ListingIntakesFilter {
  lifecycleStatus?: IntakeLifecycleStatus;
  confirmationState?: IntakeConfirmationState;
  availability?: ListingAvailability;
  availabilities?: string;
  nextConfirmFrom?: string;
  nextConfirmTo?: string;
  includeClosed?: boolean;
  propertyId?: string;
  transactionType?: string;
  siteType?: string;
  siteTypes?: string;
  /** 쉼표로 여러 개: owner_occupied,tenant,vacant,unknown */
  occupancies?: string;
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
  /** Unit override를 우선 적용한 유효 방 수 exact */
  roomCount?: number;
  /** 유효 방 수 하한 (예: 4개 이상) */
  roomCountMin?: number;
  /** Unit override를 우선 적용한 유효 욕실 수 exact */
  bathRoomCount?: number;
  /** 유효 욕실 수 하한 (예: 3개 이상) */
  bathRoomCountMin?: number;
  hasAdvertisement?: boolean;
  isJointBrokerage?: boolean;
  provinceCode?: string;
  districtCode?: string;
  siteId?: string;
  siteIds?: string;
  search?: string;
  dong?: string;
  unit?: string;
  moveInFrom?: string;
  moveInTo?: string;
  sortBy?: ListingIntakeSortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ListingIntakesResponse {
  items: ListingIntake[];
  pagination: {
    page: number;
    limit: number;
    hasNextPage: boolean;
    total: number | null;
    totalPages: number | null;
  };
}

export interface ListingIntakesMapResponse {
  items: ListingIntake[];
  truncated: boolean;
  limit: number;
}

export interface CreateListingForIntakeDto {
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
  isPaused?: boolean;
  memo?: string | null;
}

export interface CreateListingIntakeDto {
  propertyId: string;
  projectId?: string;
  lifecycleStatus?: IntakeLifecycleStatus;
  closedReason?: IntakeClosedReason | null;
  receivedAt?: string | null;
  lastCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  lastCheckResult?: IntakeCheckResult | null;
  nextConfirmAt?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  occupancyStatus?: import('@estate-erp/shared').OccupancyStatus | null;
  memo?: string | null;
  listings?: CreateListingForIntakeDto[];
}

export interface UpdateListingIntakeDto {
  lifecycleStatus?: IntakeLifecycleStatus;
  closedReason?: IntakeClosedReason | null;
  receivedAt?: string | null;
  lastCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  lastCheckResult?: IntakeCheckResult | null;
  nextConfirmAt?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  occupancyStatus?: import('@estate-erp/shared').OccupancyStatus | null;
  memo?: string | null;
  expectedUpdatedAt?: string | null;
}

export interface ConfirmListingIntakeDto {
  /** 확인은 "유효함" 하나다(보내지 않아도 된다). 의뢰 종료는 lifecycle, 가격 변경은 거래 조건 수정으로 한다 */
  result?: 'alive';
  channel?: ListingIntakeConfirmChannel | string;
  memo?: string | null;
  checkedAt?: string | null;
  nextConfirmAt?: string | null;
  contactId?: string | null;
  expectedUpdatedAt?: string | null;
}

export function createListingIntakesApi(request: RequestFn) {
  return {
    findAll: (filters?: ListingIntakesFilter) =>
      request<ListingIntakesResponse>('/listing-intakes', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    map: (filters?: ListingIntakesFilter) =>
      request<ListingIntakesMapResponse>('/listing-intakes/map', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<ListingIntake>(`/listing-intakes/${id}`),

    create: (dto: CreateListingIntakeDto) =>
      request<ListingIntake>('/listing-intakes', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateListingIntakeDto) =>
      request<ListingIntake>(`/listing-intakes/${id}`, { method: 'PATCH', body: dto }),

    updateLifecycleStatus: (
      id: string,
      lifecycleStatus: IntakeLifecycleStatus,
      options?: {
        closedReason?: IntakeClosedReason | null;
        expectedUpdatedAt?: string | null;
      },
    ) =>
      request<ListingIntake>(`/listing-intakes/${id}/lifecycle`, {
        method: 'PATCH',
        body: {
          lifecycleStatus,
          closedReason: options?.closedReason,
          expectedUpdatedAt: options?.expectedUpdatedAt,
        },
      }),

    closeWithActiveDeals: (
      id: string,
      options?: {
        closedReason?: IntakeClosedReason;
        expectedUpdatedAt?: string | null;
      },
    ) =>
      request<ListingIntake>(
        `/listing-intakes/${id}/close-with-active-deals`,
        {
          method: 'PATCH',
          body: {
            closedReason: options?.closedReason,
            expectedUpdatedAt: options?.expectedUpdatedAt,
          },
        },
      ),

    confirm: (id: string, dto: ConfirmListingIntakeDto) =>
      request<ListingIntake>(`/listing-intakes/${id}/confirm`, {
        method: 'POST',
        body: dto,
      }),

    addListing: (id: string, dto: CreateListingForIntakeDto) =>
      request<ListingIntakeListing>(`/listing-intakes/${id}/listings`, {
        method: 'POST',
        body: dto,
      }),

    /** 의뢰와 그 거래 조건을 모두 지운다(대표·매니저). 종료는 update의 lifecycleStatus로 한다. */
    remove: (id: string) =>
      request<{ id: string; propertyId: string; deletedListingIds: string[] }>(
        `/listing-intakes/${id}`,
        { method: 'DELETE' },
      ),
  };
}
