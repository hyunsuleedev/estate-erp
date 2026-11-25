import type {
  ContactTagColor,
  ContactCategoryKey,
  ContactRoleKey,
  ContactKind,
  ConsultationScope,
} from '@estate-erp/shared';
import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { Consultation } from './consultations.js';
import type { PartiesByContact, Party } from './parties.js';
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
  kind: ContactKind;
  name: string;
  businessRegNo: string | null;
  referredByContactId: string | null;
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
  referredBy?: { id: string; name: string; kind: ContactKind } | null;
  propertyContacts: PropertyContact[];
  buyerRequirements: BuyerRequirement[];
  /** 최근 상담 10건. 전체 건수는 consultationCount */
  consultations: Consultation[];
  consultationCount?: number;
  parties: PartiesByContact;
  organizationParty?: Party | null;
}

export interface ContactDeleteCheckItem {
  key: string;
  label: string;
  count: number;
}

/** GET /contacts/:id/delete-check — 지우기 전에 무슨 일이 생기는지 */
export interface ContactDeleteCheck {
  /** 하나라도 있으면 지울 수 없다 */
  blockers: ContactDeleteCheckItem[];
  /** 지우면 함께 지워지는 것 (가족 연결) */
  removed: ContactDeleteCheckItem[];
  /** 지워도 남지만 이 사람과의 연결만 풀리는 것 (할 일 · 일정 · 통화) */
  detached: ContactDeleteCheckItem[];
}

/** GET /contacts/:id/overview — 이 사람과 한 일 (연락처 상세의 거래 · 계약서 · 매칭 · 임장 · 업무 구역) */
export interface ContactOverview {
  deals: Array<{
    id: string;
    /** 매매면 매도인/매수인, 임대차면 임대인/임차인으로 읽는다 */
    role: 'seller' | 'buyer';
    transactionType: string;
    stage: string;
    isCancelled: boolean;
    /** "고덕그라시움 102동 2203호" (외부 매물이면 null) */
    place: string | null;
    propertyId: string | null;
    agreedPrice: number | null;
    agreedDeposit: number | null;
    agreedMonthlyRent: number | null;
    stageChangedAt: string;
    /** 수수료 받음 / 받는 중 / 청구 없음. 금액은 수수료 화면에서만 본다 */
    commission: 'collected' | 'collecting' | null;
  }>;
  contracts: Array<{
    id: string;
    dealId: string | null;
    role: 'seller' | 'buyer';
    transactionType: string;
    status: string;
    place: string | null;
    totalPrice: number;
    monthlyRent: number | null;
    contractDate: string | null;
    statedBalanceDate: string | null;
  }>;
  /** 이 손님에게 연결한 매물(진행 중인 매칭 — 매수측 및 매도측) */
  matches: Array<{
    id: string;
    side?: 'buyer' | 'seller';
    stage: string;
    buyerReqId: string;
    listingId: string;
    propertyId: string;
    place: string | null;
    transactionType: string;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
    updatedAt: string;
  }>;
  /** 오늘부터의 일정: 손님으로 보러 가는 임장, 소유한 집을 보여 주는 임장, 거주 중인 집의 임장, 이 사람에게 걸린 일정 */
  events: Array<{
    id: string;
    title: string;
    type: string;
    start: string;
    allDay: boolean;
    place: string | null;
    relation: 'buyer' | 'owner' | 'tenant' | 'contact';
    /** 이 임장이 걸린 매칭이 끝났는지. 일정은 지우지 않고 "매칭 종료"로 보인다 (캘린더와 같다) */
    matchClosed?: boolean;
    /** 임장을 이미 마친 매칭의 일정인지 (고객 검토 · 협상 · 거래 전환으로 갔거나 거래가 생김) */
    viewingDone?: boolean;
  }>;
  /** 이 사람에게 걸린 열린 업무 */
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assignedTo: { id: string; name: string } | null;
  }>;
}

/** GET /contacts/:id/merge-check?into= — 합치기 전 미리보기 */
export interface ContactMergeCheck {
  /** 하나라도 있으면 합칠 수 없다 (주체 종류 불일치, 같은 거래·계약의 양쪽 당사자, 같은 세대 소속) */
  conflicts: Array<{ key: 'kind_mismatch' | 'deal_parties' | 'contract_parties' | 'household'; message: string }>;
  /** 합친 뒤 남는 이름 (남길 쪽이 "미확인 5678"이고 지울 쪽에 진짜 이름이 있으면 그 이름) */
  resultName: string | null;
  /** 원본에서 남길 쪽으로 옮겨지는 것 */
  moved: ContactDeleteCheckItem[];
  /** 남길 쪽에 같은 자리가 이미 있어 원본 줄을 버리는 것 (빈 칸은 남길 쪽에 채운다) */
  dropped: ContactDeleteCheckItem[];
}

export interface ContactsFilter {
  search?: string;
  kind?: ContactKind;
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
  kind?: ContactKind;
  name: string;
  businessRegNo?: string | null;
  referredByContactId?: string | null;
  phone?: string;
  phones?: ContactPhoneInput[];
  email?: string;
  tags?: string[];
  memo?: string;
}

export interface UpdateContactDto {
  kind?: ContactKind;
  name?: string;
  businessRegNo?: string | null;
  referredByContactId?: string | null;
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

    getConsultations: (id: string, scope?: Exclude<ConsultationScope, 'context'>) =>
      request<Consultation[]>(`/contacts/${id}/consultations`, {
        params: scope ? { scope } : undefined,
      }),

    getOverview: (id: string) => request<ContactOverview>(`/contacts/${id}/overview`),

    getDeleteCheck: (id: string) =>
      request<ContactDeleteCheck>(`/contacts/${id}/delete-check`),

    create: (dto: CreateContactDto) =>
      request<Contact>('/contacts', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateContactDto) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/contacts/${id}`, { method: 'DELETE' }),

    /**
     * 같은 사람이 두 번 등록됐을 때: id의 상담·매물·의뢰·거래·전화번호·태그·그룹·메모를 모두
     * intoContactId로 옮기고 id를 지운다. 되돌릴 수 없다.
     */
    merge: (id: string, intoContactId: string) =>
      request<{
        id: string;
        mergedFrom: { id: string; name: string };
        moved: Record<string, number>;
        dropped: Record<string, number>;
      }>(`/contacts/${id}/merge`, {
        method: 'POST',
        body: { intoContactId },
      }),

    getMergeCheck: (id: string, intoContactId: string) =>
      request<ContactMergeCheck>(`/contacts/${id}/merge-check`, { params: { into: intoContactId } }),
  };
}
