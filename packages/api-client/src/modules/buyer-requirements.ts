import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

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

export interface BuyerRequirement {
  id: string;
  officeId: string;
  contactId: string;
  status: string;
  urgency: string;
  transactionType: string | null;
  siteTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  depositMin: number | null;
  depositMax: number | null;
  monthlyRentMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  mustConditions: string[];
  preferConditions: string[];
  moveInDate: string | null;
  assignedToId: string | null;
  lastContactDate: string | null;
  nextContactDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
  preferredSites?: BuyerRequirementPreferredSite[];
  preferredRegions?: BuyerRequirementPreferredRegion[];
}

export interface BuyerRequirementsFilter {
  // Multi-value: pass as comma-joined strings. Server splits on ','.
  status?: string;
  urgency?: string;
  transactionType?: string;
  siteTypes?: string;
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
  contactId: string;
  transactionType?: string;
  siteTypes?: string[];
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  mustConditions?: string[];
  preferConditions?: string[];
  moveInDate?: string;
  urgency?: string;
  assignedToId?: string;
  memo?: string;
  preferredSites?: { siteId: string; priority?: number; memo?: string }[];
  preferredRegions?: {
    provinceCode?: string;
    districtCode?: string;
    wardCode?: string;
  }[];
}

export function createBuyerRequirementsApi(request: RequestFn) {
  return {
    findDueContacts: () =>
      request<BuyerRequirement[]>('/buyer-requirements/due-contacts'),

    findAll: (filters?: BuyerRequirementsFilter) =>
      request<PaginatedResponse<BuyerRequirement>>('/buyer-requirements', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}`),

    create: (dto: CreateBuyerRequirementDto) =>
      request<BuyerRequirement>('/buyer-requirements', { method: 'POST', body: dto }),

    update: (id: string, dto: Record<string, unknown>) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}`, { method: 'PATCH', body: dto }),

    updateStatus: (id: string, status: string) =>
      request<BuyerRequirement>(`/buyer-requirements/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),

    remove: (id: string) =>
      request<void>(`/buyer-requirements/${id}`, { method: 'DELETE' }),
  };
}
