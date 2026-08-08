import type { RequestFn } from '../client.js';
import type {
  ContactRelationDisplayType,
  ContactRelationType,
} from '@estate-erp/shared';

export interface ContactRelation {
  id: string;
  officeId: string;
  contactId: string;
  relatedContactId: string;
  /** relatedContact가 contact에게 어떤 관계인지 나타내는 DB 원본 방향 */
  relationType: ContactRelationType;
  label: string | null;
  inverseLabel: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  /** 현재 조회한 연락처가 DB 원본 관계의 relatedContact 쪽인지 여부 */
  isReverse: boolean;
  /** 현재 조회한 연락처 관점으로 변환된 관계 */
  displayRelationType: ContactRelationDisplayType;
  displayLabel: string | null;
  relatedContact?: { id: string; name: string; phone: string | null };
  contact?: { id: string; name: string; phone: string | null };
}

/** GET /contact-relations?contactId= 응답 — 주체로 연결한 관계 + 상대로 연결된 관계 */
export interface ContactRelationsByContact {
  relations: ContactRelation[];
  relatedBy: ContactRelation[];
  /** 방향 차이를 해소해 현재 연락처 관점으로 합친 배열 */
  items: ContactRelation[];
}

export interface CreateContactRelationDto {
  contactId: string;
  relatedContactId: string;
  relationType: ContactRelationType;
  label?: string;
  inverseLabel?: string;
  memo?: string;
}

export interface CreateContactRelationWithNewContactDto {
  contactId: string;
  relationType: ContactRelationType;
  label?: string;
  inverseLabel?: string;
  phone: string;
  name?: string;
  memo?: string;
}

export interface UpdateContactRelationDto {
  relationType?: ContactRelationType;
  label?: string | null;
  inverseLabel?: string | null;
  memo?: string | null;
}

export function createContactRelationsApi(request: RequestFn) {
  return {
    findByContact: (contactId: string) =>
      request<ContactRelationsByContact>('/contact-relations', { params: { contactId } }),

    create: (dto: CreateContactRelationDto) =>
      request<ContactRelation>('/contact-relations', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreateContactRelationWithNewContactDto) =>
      request<ContactRelation>('/contact-relations/with-contact', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateContactRelationDto) =>
      request<ContactRelation>(`/contact-relations/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/contact-relations/${id}`, { method: 'DELETE' }),
  };
}
