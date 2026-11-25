import type { PropertyLeaseTenantRole } from '@estate-erp/shared';
import type { RequestFn } from '../client.js';

export interface PropertyLeaseTenant {
  id: string;
  officeId: string;
  leaseId: string;
  contactId: string;
  role: PropertyLeaseTenantRole | string;
  isPrimary: boolean;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string | null; kind?: string };
}

export interface PropertyLease {
  id: string;
  officeId: string;
  propertyId: string;
  deposit: number | null;
  monthlyRent: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  moveOutDate: string | null;
  status: string;
  sourceDealId?: string | null;
  sourceContractId?: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  tenants: PropertyLeaseTenant[];
  /** 호환용 파생 필드: 대표 임차인(PropertyLeaseTenant.isPrimary) */
  contactId: string;
  contact?: { id: string; name: string; phone: string | null; kind?: string };
}

/** 호환 별칭 (기존 코드의 Tenant 타입) */
export type Tenant = PropertyLease;

export interface CreateTenantDto {
  propertyId: string;
  contactId: string;
  role?: PropertyLeaseTenantRole | string;
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
  role?: PropertyLeaseTenantRole | string;
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

export interface AddLeaseTenantDto {
  contactId: string;
  role?: PropertyLeaseTenantRole | string;
  isPrimary?: boolean;
  memo?: string;
}

export interface UpdateLeaseTenantDto {
  role?: PropertyLeaseTenantRole | string;
  isPrimary?: boolean;
  memo?: string | null;
}

export function createTenantsApi(request: RequestFn) {
  return {
    findByProperty: (propertyId: string) =>
      request<PropertyLease[]>('/tenants', { params: { propertyId } }),

    findExpiring: (days?: number) =>
      request<PropertyLease[]>('/tenants/expiring', { params: { days } }),

    findOne: (id: string) =>
      request<PropertyLease>(`/tenants/${id}`),

    create: (dto: CreateTenantDto) =>
      request<PropertyLease>('/tenants', { method: 'POST', body: dto }),

    createWithNewContact: (dto: CreateTenantWithNewContactDto) =>
      request<PropertyLease>('/tenants/with-contact', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateTenantDto) =>
      request<PropertyLease>(`/tenants/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/tenants/${id}`, { method: 'DELETE' }),

    addMember: (leaseId: string, dto: AddLeaseTenantDto) =>
      request<PropertyLease>(`/tenants/${leaseId}/members`, { method: 'POST', body: dto }),

    updateMember: (leaseId: string, contactId: string, dto: UpdateLeaseTenantDto) =>
      request<PropertyLease>(`/tenants/${leaseId}/members/${contactId}`, {
        method: 'PATCH',
        body: dto,
      }),

    removeMember: (leaseId: string, contactId: string) =>
      request<PropertyLease>(`/tenants/${leaseId}/members/${contactId}`, {
        method: 'DELETE',
      }),
  };
}
