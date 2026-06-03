import type { RequestFn } from '../client.js';
import type { ListingAdvertisement, ListingPriceHistory } from './listings.js';
import type { Property } from './properties.js';

export type ListingIntakeStatus =
  | 'unverified'
  | 'active'
  | 'in_contract'
  | 'hold'
  | 'done';

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
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  checkStatusChangedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  jointBrokeragePartner?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
}

export interface ListingIntake {
  id: string;
  officeId: string;
  propertyId: string;
  status: ListingIntakeStatus | string;
  receivedAt: string;
  confirmedAt: string | null;
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

export type ListingIntakeConfirmResult =
  | 'alive'
  | 'price_changed'
  | 'unavailable'
  | 'no_answer'
  | 'pending';

export type ListingIntakeConfirmChannel =
  | 'phone'
  | 'sms'
  | 'visit'
  | 'owner_message'
  | 'note'
  | 'mcp';

export interface ListingIntakesFilter {
  status?: string;
  nextConfirmFrom?: string;
  nextConfirmTo?: string;
  includeInactive?: boolean;
  propertyId?: string;
  transactionType?: string;
  siteType?: string;
  checkStatus?: string;
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
  sortBy?: 'receivedAt' | 'createdAt' | 'updatedAt' | 'price';
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

export interface CreateListingForIntakeDto {
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
  memo?: string | null;
}

export interface CreateListingIntakeDto {
  propertyId: string;
  status?: ListingIntakeStatus | string;
  receivedAt?: string | null;
  confirmedAt?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
  listings?: CreateListingForIntakeDto[];
}

export interface UpdateListingIntakeDto {
  status?: ListingIntakeStatus | string;
  receivedAt?: string | null;
  confirmedAt?: string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
  expectedUpdatedAt?: string | null;
}

export interface ConfirmListingIntakeDto {
  result: ListingIntakeConfirmResult | string;
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

    findOne: (id: string) =>
      request<ListingIntake>(`/listing-intakes/${id}`),

    create: (dto: CreateListingIntakeDto) =>
      request<ListingIntake>('/listing-intakes', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateListingIntakeDto) =>
      request<ListingIntake>(`/listing-intakes/${id}`, { method: 'PATCH', body: dto }),

    updateStatus: (
      id: string,
      status: ListingIntakeStatus | string,
      options?: { expectedUpdatedAt?: string | null },
    ) =>
      request<ListingIntake>(`/listing-intakes/${id}/status`, {
        method: 'PATCH',
        body: { status, expectedUpdatedAt: options?.expectedUpdatedAt },
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
