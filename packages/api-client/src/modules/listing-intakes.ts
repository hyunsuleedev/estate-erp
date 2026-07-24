import type { RequestFn } from '../client.js';
import type {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
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
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isPaused: boolean;
  isHidden: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  /** 이 거래 옵션을 점유한 활성 Deal — 있으면 "거래중/완료" */
  deals?: Array<{ id: string; stage: string; stageChangedAt: string | null }>;
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
}

export interface ListingIntake {
  id: string;
  officeId: string;
  propertyId: string;
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

export interface ListingIntakesFilter {
  lifecycleStatus?: IntakeLifecycleStatus;
  confirmationState?: IntakeConfirmationState;
  nextConfirmFrom?: string;
  nextConfirmTo?: string;
  includeClosed?: boolean;
  propertyId?: string;
  transactionType?: string;
  siteType?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  hasAdvertisement?: boolean;
  isJointBrokerage?: boolean;
  provinceCode?: string;
  districtCode?: string;
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  siteId?: string;
  search?: string;
  dong?: string;
  unit?: string;
  moveInFrom?: string;
  moveInTo?: string;
  sortBy?: 'receivedAt' | 'createdAt' | 'updatedAt';
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
  lifecycleStatus?: IntakeLifecycleStatus;
  closedReason?: IntakeClosedReason | null;
  receivedAt?: string | null;
  lastCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  lastCheckResult?: IntakeCheckResult | null;
  nextConfirmAt?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
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
  memo?: string | null;
  expectedUpdatedAt?: string | null;
}

export interface ConfirmListingIntakeDto {
  result: ListingIntakeConfirmResult;
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

    remove: (id: string) =>
      request<ListingIntake>(`/listing-intakes/${id}`, { method: 'DELETE' }),
  };
}
