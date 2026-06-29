import type { RequestFn } from '../client.js';

export interface ContactRelation {
  id: string;
  officeId: string;
  contactId: string;
  relatedContactId: string;
  relationType: string;
  label: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  relatedContact?: { id: string; name: string; phone: string | null };
  contact?: { id: string; name: string; phone: string | null };
}

/** GET /contact-relations?contactId= 응답 — 주체로 연결한 관계 + 상대로 연결된 관계 */
export interface ContactRelationsByContact {
  relations: ContactRelation[];
  relatedBy: ContactRelation[];
}

export interface CreateContactRelationDto {
  contactId: string;
  relatedContactId: string;
  relationType: string;
  label?: string;
  memo?: string;
}

export interface CreateContactRelationWithNewContactDto {
  contactId: string;
  relationType: string;
  label?: string;
  phone: string;
  name?: string;
  memo?: string;
}

export function createContactRelationsApi(request: RequestFn) {
  return {
    findByContact: (contactId: string) =>
      request<ContactRelationsByContact>('/contact-relations', { params: { contactId } }),

    create: (dto: CreateContactRelationDto) =>
      request<ContactRelation>('/contact-relations', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreateContactRelationWithNewContactDto) =>
      request<ContactRelation>('/contact-relations/with-contact', { method: 'POST', body: dto }),

    remove: (id: string) =>
      request<void>(`/contact-relations/${id}`, { method: 'DELETE' }),
  };
}
