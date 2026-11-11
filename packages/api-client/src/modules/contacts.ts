import type { ContactCategoryKey, ContactRoleKey } from '@estate-erp/shared';
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
  label: string;
  isPrimary: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPhoneInput {
  phone: string;
  label?: string;
  isPrimary?: boolean;
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
  /** 희망조건·매물·세입·거래 데이터에서 계산한 역할. 목록 조회에만 포함된다. */
  roles?: ContactRoleKey[];
  latestConsultation?: ContactLatestConsultation | null;
}

export interface ContactGroupSummary {
  name: string;
  count: number;
}

export interface ContactCategorySummary {
  total: number;
  counts: Record<ContactCategoryKey, number>;
  groups: ContactGroupSummary[];
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
  category?: ContactCategoryKey;
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
  /** null = 이메일 제거 (서버 ContactWriteInput이 null 허용) */
  email?: string | null;
  tags?: string[];
  /** null = 메모 제거 */
  memo?: string | null;
}

export function createContactsApi(request: RequestFn) {
  return {
    findAll: (filters?: ContactsFilter) =>
      request<PaginatedResponse<Contact>>('/contacts', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    getCategorySummary: () =>
      request<ContactCategorySummary>('/contacts/categories'),

    /** contactIds를 주면 만들기와 넣기를 서버가 한 번에 처리한다. 저장된 이름은 응답의 name을 쓴다. */
    createGroup: (name: string, contactIds?: string[]) =>
      request<{ name: string; updated: number }>('/contact-groups', {
        method: 'POST',
        body: { name, contactIds },
      }),

    renameGroup: (name: string, newName: string) =>
      request<{ name: string }>('/contact-groups', {
        method: 'PATCH',
        body: { name, newName },
      }),

    deleteGroup: (name: string) =>
      request<{ removedFrom: number }>('/contact-groups', {
        method: 'DELETE',
        params: { name },
      }),

    addGroupMembers: (name: string, contactIds: string[]) =>
      request<{ updated: number }>('/contact-groups/members', {
        method: 'POST',
        body: { name, contactIds },
      }),

    removeGroupMembers: (name: string, contactIds: string[]) =>
      request<{ updated: number }>('/contact-groups/members/remove', {
        method: 'POST',
        body: { name, contactIds },
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
