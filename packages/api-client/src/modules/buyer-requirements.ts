import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { ListingIntakeState, ListingOccupyingDeal } from './listings.js';

export type BuyerRequirementStatus = 'active' | 'hold' | 'completed';

export interface BuyerRequirementPreferredSite {
  id: string;
  siteId: string;
  priority: number | null;
  memo: string | null;
  site?: { id: string; name: string; type: string };
}

export interface BuyerRequirementPreferredRegion {
  id: string;
  provinceCode: string | null;
  districtCode: string | null;
  wardCode: string | null;
  province?: { code: string; name: string } | null;
  district?: { code: string; name: string } | null;
  ward?: { code: string; name: string } | null;
}

/** findOne include: matches → listing → property → site */
export interface BuyerRequirementMatch {
  id: string;
  officeId: string;
  listingId: string;
  buyerReqId: string;
  stage: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  listing?: {
    id: string;
    propertyId: string;
    transactionType: string;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
    isPaused: boolean;
    intake?: ListingIntakeState | null;
    deals?: ListingOccupyingDeal[];
    property?: {
      id: string;
      siteId: string;
      unitId: string | null;
      site?: {
        id: string;
        name: string;
        type: string;
        roadAddress: string | null;
        jibunAddress: string | null;
      } | null;
    } | null;
  } | null;
}

/** findOne include: consultations (최근 10건, 관계 미포함 raw row) */
export interface BuyerRequirementConsultation {
  id: string;
  contactId: string;
  createdById: string;
  type: string;
  purpose?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerRequirement {
  id: string;
  officeId: string;
  buyerIntakeId: string;
  priorityRank: number;
  /** @deprecated 대표 연락 대상에서 파생되는 구버전 응답 별칭 */
  contactId: string;
  status: BuyerRequirementStatus;
  urgency: string;
  transactionType: string | null;
  siteTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  depositMin: number | null;
  depositMax: number | null;
  monthlyRentMin: number | null;
  monthlyRentMax: number | null;
  /** 희망 공급면적 하한 (m²). 사용자 화면에서는 평으로 변환한다. */
  areaMin: number | null;
  /** 희망 공급면적 상한 (m²). 사용자 화면에서는 평으로 변환한다. */
  areaMax: number | null;
  moveInDate: string | null;
  assignedToId: string | null;
  lastContactDate: string | null;
  nextContactDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
  buyerIntake?: {
    id: string;
    officeId: string;
    lifecycleStatus: 'open' | 'hold' | 'closed';
    contacts: Array<{
      id: string;
      contactId: string;
      role: string;
      isPrimary: boolean;
      contact?: { id: string; name: string; phone: string | null };
    }>;
  };
  /** findAll/findOne include — 담당자 요약 */
  assignedTo?: { id: string; name: string } | null;
  /** findAll include — 연결 매칭/상담 수 */
  _count?: { matches: number; consultations: number };
  /** findOne 전용 include */
  matches?: BuyerRequirementMatch[];
  consultations?: BuyerRequirementConsultation[];
  preferredSites?: BuyerRequirementPreferredSite[];
  preferredRegions?: BuyerRequirementPreferredRegion[];
}

export interface BuyerRequirementsFilter {
  // Multi-value: pass as comma-joined strings. Server splits on ','.
  status?: string;
  urgency?: string;
  transactionType?: string;
  siteTypes?: string;
  buyerIntakeId?: string;
  contactId?: string;
  assignedToId?: string;
  // Preferred Site UUIDs (CSV)
  preferredSiteIds?: string;
  // Region codes at each level (CSV). Each filters preferredRegions rows.
  provinceCodes?: string;
  districtCodes?: string;
  wardCodes?: string;
  // Range filters (overlap semantics against buyer's own range fields).
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  // Date ranges (ISO strings)
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  // Free-text search
  search?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateBuyerRequirementDto {
  buyerIntakeId?: string;
  /** 구버전 UI 호환. 신규 코드는 buyerIntakeId를 사용한다. */
  contactId?: string;
  priorityRank?: number;
  transactionType?: string;
  siteTypes?: string[];
  // 범위 필드는 null 허용 — 수정 시 null을 보내면 서버가 해당 값을 비움 (replace 의미)
  priceMin?: number | null;
  priceMax?: number | null;
  depositMin?: number | null;
  depositMax?: number | null;
  monthlyRentMin?: number | null;
  monthlyRentMax?: number | null;
  /** 희망 공급면적 하한 (m²) */
  areaMin?: number | null;
  /** 희망 공급면적 상한 (m²) */
  areaMax?: number | null;
  moveInDate?: string;
  urgency?: string;
  assignedToId?: string;
  nextContactDate?: string;
  memo?: string;
  preferredSites?: { siteId: string; priority?: number; memo?: string }[];
  preferredRegions?: {
    provinceCode?: string;
    districtCode?: string;
    wardCode?: string;
  }[];
}

export interface UpdateBuyerRequirementDto extends Omit<
  CreateBuyerRequirementDto,
  'buyerIntakeId' | 'contactId'
> {
  lastContactDate?: string;
}

export function createBuyerRequirementsApi(request: RequestFn) {
  return {
    findDueContacts: () =>
      request<BuyerRequirement[]>('/buyer-requirements/due-contacts'),

    findAll: (filters?: BuyerRequirementsFilter) =>
      request<PaginatedResponse<BuyerRequirement>>('/buyer-requirements', {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),

    findOne: (id: string) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}`),

    create: (dto: CreateBuyerRequirementDto) =>
      request<BuyerRequirement>('/buyer-requirements', {
        method: 'POST',
        body: dto,
      }),

    update: (id: string, dto: UpdateBuyerRequirementDto) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    reorder: (id: string, priorityRank: number) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}/priority`, {
        method: 'PATCH',
        body: { priorityRank },
      }),

    updateStatus: (id: string, status: BuyerRequirementStatus) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),

    remove: (id: string) =>
      request<void>(`/buyer-requirements/${id}`, { method: 'DELETE' }),
  };
}
