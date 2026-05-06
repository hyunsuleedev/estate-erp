import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface Consultation {
  id: string;
  officeId: string;
  contactId: string;
  createdById: string;
  type: string;
  content: string;
  propertyId: string | null;
  listingId: string | null;
  matchId: string | null;
  buyerReqId: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
  createdBy?: { id: string; name: string } | null;
  property?: {
    id: string;
    memo: string | null;
    site?: { name: string | null } | null;
    unit?: {
      id: string;
      name: string;
      floor: number | null;
      lineNo: number | null;
      dong?: {
        id: string;
        name: string;
        isPlaceholder: boolean;
      } | null;
    } | null;
  } | null;
  listing?: {
    id: string;
    transactionType: string;
    price: number | null;
    checkStatus: string;
  } | null;
  match?: {
    id: string;
    stage: string;
  } | null;
  buyerRequirement?: {
    id: string;
    status: string;
    transactionType: string | null;
  } | null;
}

export interface ConsultationsFilter {
  q?: string;
  contactId?: string;
  propertyId?: string;
  siteId?: string;
  dongId?: string;
  unitId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
  context?: 'property' | 'listing' | 'match' | 'buyerRequirement' | 'unlinked';
  outcome?: 'actionRequired' | 'confirmed' | 'held';
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateConsultationDto {
  contactId: string;
  type: string;
  content: string;
  propertyId?: string;
  listingId?: string;
  matchId?: string;
  buyerReqId?: string;
}

export interface UpdateConsultationDto {
  type?: string;
  content?: string;
}

export function createConsultationsApi(request: RequestFn) {
  return {
    getRecent: (limit?: number) =>
      request<Consultation[]>('/consultations/recent', { params: { limit } }),

    findAll: (filters?: ConsultationsFilter) =>
      request<PaginatedResponse<Consultation>>('/consultations', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<Consultation>(`/consultations/${id}`),

    create: (dto: CreateConsultationDto) =>
      request<Consultation>('/consultations', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateConsultationDto) =>
      request<Consultation>(`/consultations/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/consultations/${id}`, { method: 'DELETE' }),
  };
}
