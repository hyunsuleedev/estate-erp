import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface BuyerRequirement {
  id: string;
  officeId: string;
  contactId: string;
  status: string;
  urgency: string;
  transactionType: string | null;
  siteTypes: string[];
  regions: string[];
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
}

export interface BuyerRequirementsFilter {
  status?: string;
  urgency?: string;
  transactionType?: string;
  contactId?: string;
  assignedToId?: string;
  nextContactBefore?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateBuyerRequirementDto {
  contactId: string;
  transactionType?: string;
  siteTypes?: string[];
  regions?: string[];
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
