import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export interface Contact {
  id: string;
  officeId: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  tags: string[];
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsFilter {
  search?: string;
  tags?: string;
  hasPropertyContact?: boolean;
  hasBuyerReq?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateContactDto {
  name: string;
  phone?: string;
  phone2?: string;
  email?: string;
  tags?: string[];
  memo?: string;
}

export interface UpdateContactDto {
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  tags?: string[];
  memo?: string;
}

export function createContactsApi(request: RequestFn) {
  return {
    findAll: (filters?: ContactsFilter) =>
      request<PaginatedResponse<Contact>>('/contacts', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findByPhone: (phone: string) =>
      request<Contact | null>('/contacts/search-by-phone', { params: { phone } }),

    findOne: (id: string) =>
      request<Contact>(`/contacts/${id}`),

    getPropertyContacts: (id: string) =>
      request<unknown[]>(`/contacts/${id}/property-contacts`),

    getBuyerRequirements: (id: string) =>
      request<unknown[]>(`/contacts/${id}/buyer-requirements`),

    getConsultations: (id: string) =>
      request<unknown[]>(`/contacts/${id}/consultations`),

    create: (dto: CreateContactDto) =>
      request<Contact>('/contacts', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateContactDto) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/contacts/${id}`, { method: 'DELETE' }),
  };
}
