import type { RequestFn } from '../client.js';

export interface PropertyContact {
  id: string;
  officeId: string;
  contactId: string;
  propertyId: string;
  role: string;
  shareRatio: number | null;
  isResident: boolean;
  isPrimary: boolean;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
  property?: {
    id: string;
    memo: string | null;
    site?: {
      id: string;
      name: string | null;
      roadAddress?: string | null;
      jibunAddress?: string | null;
    } | null;
    unit?: {
      id: string;
      name: string | null;
    } | null;
  };
}

export interface CreatePropertyContactDto {
  contactId: string;
  propertyId: string;
  role: string;
  shareRatio?: number;
  isResident?: boolean;
  isPrimary?: boolean;
  memo?: string;
}

export interface CreatePropertyContactWithNewContactDto {
  propertyId: string;
  role: string;
  name: string;
  phone?: string;
  shareRatio?: number;
  isResident?: boolean;
  isPrimary?: boolean;
  memo?: string;
}

export interface UpdatePropertyContactDto {
  role?: string;
  shareRatio?: number;
  isResident?: boolean;
  isPrimary?: boolean;
  status?: string;
  memo?: string;
}

export function createPropertyContactsApi(request: RequestFn) {
  return {
    findByProperty: (propertyId: string) =>
      request<PropertyContact[]>('/property-contacts', { params: { propertyId } }),

    findByContact: (contactId: string) =>
      request<PropertyContact[]>('/property-contacts', { params: { contactId } }),

    findOne: (id: string) =>
      request<PropertyContact>(`/property-contacts/${id}`),

    create: (dto: CreatePropertyContactDto) =>
      request<PropertyContact>('/property-contacts', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreatePropertyContactWithNewContactDto) =>
      request<PropertyContact>('/property-contacts/with-contact', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdatePropertyContactDto) =>
      request<PropertyContact>(`/property-contacts/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/property-contacts/${id}`, { method: 'DELETE' }),
  };
}
