import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { Consultation } from './consultations.js';
import type { ContactRelation } from './contact-relations.js';
import type { PropertyContact } from './property-contacts.js';

export interface ContactCounts {
  propertyContacts: number;
  buyerRequirements: number;
  consultations: number;
}

export interface ContactLatestConsultation {
  content: string;
  type: string;
  createdAt: string;
}

export interface ContactPhone {
  id: string;
  phone: string;
  normalizedPhone: string;
  label: string;
  isPrimary: boolean;
  isActive: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPhoneInput {
  phone: string;
  label?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  memo?: string | null;
}

export interface Contact {
  id: string;
  officeId: string;
  name: string;
  phone: string | null;
  phones?: ContactPhone[];
  email: string | null;
  tags: string[];
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: ContactCounts;
  latestConsultation?: ContactLatestConsultation | null;
}

export interface ContactDetail extends Contact {
  propertyContacts: PropertyContact[];
  buyerRequirements: BuyerRequirement[];
  consultations: Consultation[];
  relationsAsMain: ContactRelation[];
  relationsAsRelated: ContactRelation[];
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
  phones?: ContactPhoneInput[];
  email?: string;
  tags?: string[];
  memo?: string;
}

export interface UpdateContactDto {
  name?: string;
  phone?: string;
  phones?: ContactPhoneInput[];
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
      request<Contact[]>('/contacts/search-by-phone', { params: { phone } }),

    findOne: (id: string) =>
      request<ContactDetail>(`/contacts/${id}`),

    getPropertyContacts: (id: string) =>
      request<PropertyContact[]>(`/contacts/${id}/property-contacts`),

    getBuyerRequirements: (id: string) =>
      request<BuyerRequirement[]>(`/contacts/${id}/buyer-requirements`),

    getConsultations: (id: string) =>
      request<Consultation[]>(`/contacts/${id}/consultations`),

    create: (dto: CreateContactDto) =>
      request<Contact>('/contacts', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateContactDto) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/contacts/${id}`, { method: 'DELETE' }),
  };
}
