import type { RequestFn } from '../client.js';

export interface Tenant {
  id: string;
  officeId: string;
  propertyId: string;
  contactId: string;
  deposit: number | null;
  monthlyRent: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  moveOutDate: string | null;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null };
}

export interface CreateTenantDto {
  propertyId: string;
  contactId: string;
  deposit?: number;
  monthlyRent?: number;
  contractStart?: string;
  contractEnd?: string;
  moveOutDate?: string;
  memo?: string;
}

export interface CreateTenantWithNewContactDto {
  propertyId: string;
  name: string;
  phone?: string;
  deposit?: number;
  monthlyRent?: number;
  contractStart?: string;
  contractEnd?: string;
  moveOutDate?: string;
  memo?: string;
}

export interface UpdateTenantDto {
  deposit?: number;
  monthlyRent?: number;
  contractStart?: string;
  contractEnd?: string;
  moveOutDate?: string;
  status?: string;
  memo?: string;
}

export function createTenantsApi(request: RequestFn) {
  return {
    findByProperty: (propertyId: string) =>
      request<Tenant[]>('/tenants', { params: { propertyId } }),

    findExpiring: (days?: number) =>
      request<Tenant[]>('/tenants/expiring', { params: { days } }),

    findOne: (id: string) =>
      request<Tenant>(`/tenants/${id}`),

    create: (dto: CreateTenantDto) =>
      request<Tenant>('/tenants', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreateTenantWithNewContactDto) =>
      request<Tenant>('/tenants/with-contact', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateTenantDto) =>
      request<Tenant>(`/tenants/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/tenants/${id}`, { method: 'DELETE' }),
  };
}
