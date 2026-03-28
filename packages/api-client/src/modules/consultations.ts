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
  matchId: string | null;
  buyerReqId: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
}

export interface ConsultationsFilter {
  contactId?: string;
  propertyId?: string;
  matchId?: string;
  buyerReqId?: string;
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
