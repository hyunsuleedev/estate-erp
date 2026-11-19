import type {
  ContactTagColor, ContactCategoryKey, ContactRoleKey } from '@estate-erp/shared';
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
  /** 그 사람에게 붙은 태그의 이름(붙인 순서). 색은 태그 목록(getTags)에서 찾는다. 그룹 소속과는 무관하다. */
  tags: string[];
  /** 속한 그룹의 이름. 목록 조회와 상세 조회에 포함된다. */
  groups?: string[];
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: ContactCounts;
  /** 희망조건·매물·세입·거래 데이터에서 계산한 역할. 목록 조회에만 포함된다. */
  roles?: ContactRoleKey[];
  latestConsultation?: ContactLatestConsultation | null;
}

/** 사무소의 연락처 태그 하나. count는 이 태그가 붙은 연락처 수 */
export interface ContactTagSummary {
  name: string;
  color: ContactTagColor;
  count: number;
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
  /** 그룹 이름. 그 그룹에 속한 연락처만 */
  group?: string;
  /**
   * 분류 하나, 또는 쉼표로 이은 여러 분류("owner,in_deal").
   * 여러 개면 모두 만족하는 연락처만 돌아온다.
   */
  category?: ContactCategoryKey | `${ContactCategoryKey},${string}`;
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

    /** 사무소의 태그 목록(만든 순서). 색과 붙은 수를 함께 준다. */
    getTags: () => request<ContactTagSummary[]>('/contact-tags'),

    /** 태그를 붙인다. 없는 이름이면 서버가 만들고 색을 붙인다. 저장된 이름은 응답의 name을 쓴다. */
    assignTag: (name: string, contactIds: string[]) =>
      request<{ name: string; updated: number }>('/contact-tags/assign', {
        method: 'POST',
        body: { name, contactIds },
      }),

    unassignTag: (name: string, contactIds: string[]) =>
      request<{ updated: number }>('/contact-tags/unassign', {
        method: 'POST',
        body: { name, contactIds },
      }),

    updateTag: (name: string, changes: { newName?: string; color?: ContactTagColor }) =>
      request<{ name: string }>('/contact-tags', {
        method: 'PATCH',
        body: { name, ...changes },
      }),

    deleteTag: (name: string) =>
      request<{ removedFrom: number }>('/contact-tags', {
        method: 'DELETE',
        params: { name },
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
