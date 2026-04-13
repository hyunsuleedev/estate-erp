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
      request<ContactRelation[]>('/contact-relations', { params: { contactId } }),

    create: (dto: CreateContactRelationDto) =>
      request<ContactRelation>('/contact-relations', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreateContactRelationWithNewContactDto) =>
      request<ContactRelation>('/contact-relations/with-contact', { method: 'POST', body: dto }),

    remove: (id: string) =>
      request<void>(`/contact-relations/${id}`, { method: 'DELETE' }),
  };
}
