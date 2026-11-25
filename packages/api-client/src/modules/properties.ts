import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { Consultation } from './consultations.js';
import type {
  ListingAdvertisement,
  ListingIntakeState,
  ListingPriceHistory,
} from './listings.js';
import type { PropertyContact } from './property-contacts.js';
import type { PropertyLease, Tenant } from './tenants.js';

export interface PropertyListingIntake extends ListingIntakeState {
  isJointBrokerageRequired: boolean;
  jointBrokeragePartner?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
}

export interface PropertyListing {
  id: string;
  intakeId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isPaused: boolean;
  /** 의뢰 컨텍스트 — 확인 상태/공동중개의 단일 출처 */
  intake?: PropertyListingIntake | null;
  /** 이 거래 옵션의 비취소 Deal — 있으면 "거래중/종료" */
  deals?: Array<{ id: string; stage: string; stageChangedAt: string | null }>;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  advertisements?: ListingAdvertisement[];
  priceHistories?: ListingPriceHistory[];
}

export interface Property {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
  createdAt: string;
  updatedAt: string;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };
  unit?: {
    id: string;
    /** 호 이름. 호 없이 층이 단위인 공간은 null */
    name: string | null;
    floor: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
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
  propertyContacts?: PropertyContact[];
  leases?: PropertyLease[];
  tenants?: Tenant[];
  consultations?: Consultation[];
  listings?: PropertyListing[];
  /**
   * 끝난 의뢰의 거래 조건(상세 조회에만, 최근 30개). 가격 변경·광고 기록을 이어 보이고,
   * 의뢰를 끝낸 뒤에도 게재 중인 광고를 알리는 데 쓴다. intake는 id·생명주기·종료 사유만 온다.
   */
  pastListings?: Array<
    Omit<PropertyListing, 'intake' | 'deals'> & {
      intake?: {
        id: string;
        lifecycleStatus: string;
        closedReason: string | null;
        lifecycleChangedAt: string | null;
      } | null;
    }
  >;
  /** 이 집의 거래 요약(상세 조회에만). 지난 의뢰의 거래까지, 완료 · 취소 포함 */
  deals?: import('./deals.js').DealSummary[];
}

export interface PropertiesFilter {
  withoutUnit?: boolean;
  siteType?: string;
  siteId?: string;
  unitId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreatePropertyDto {
  siteId: string;
  unitId?: string;
}

export interface UpdatePropertyDto {
  siteId?: string;
  unitId?: string | null;
}

export function createPropertiesApi(request: RequestFn) {
  return {
    findAll: (filters?: PropertiesFilter) =>
      request<PaginatedResponse<Property>>('/properties', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Property>(`/properties/${id}`),

    /** 그 자리의 관리 공간을 돌려주고 없으면 만든다 (매물 없이 광고를 넣을 때) */
    ensure: (dto: { siteId: string; unitId?: string | null }) =>
      request<{ id: string; siteId: string; unitId: string | null; created: boolean }>(
        '/properties/ensure',
        { method: 'POST', body: dto },
      ),

    create: (dto: CreatePropertyDto) =>
      request<Property>('/properties', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdatePropertyDto) =>
      request<Property>(`/properties/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/properties/${id}`, { method: 'DELETE' }),
  };
}
