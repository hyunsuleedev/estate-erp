import type { RequestFn } from '../client.js';

export interface SiteUnitType {
  id: string;
  siteId: string;
  name: string;
  nameType: string | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  contractAreaM2: number | null;
  roomCount: number | null;
  bathRoomCount: number | null;
  householdCount: number | null;
  entranceType: string | null;
  direction: string | null;
  isDuplex: boolean;
  naverPyeongNo: string | null;
}

export interface UnitContact {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
}

export interface UnitPropertyContact {
  id: string;
  role: string;
  isPrimary: boolean;
  isResident: boolean;
  contact: UnitContact;
}

export interface UnitTenant {
  id: string;
  deposit: number | null;
  monthlyRent: number | null;
  status: string;
  contact: UnitContact;
}

export interface UnitConsultation {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  contact: UnitContact;
}

export interface UnitProperty {
  id: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  checkStatus: string;
  propertyContacts: UnitPropertyContact[];
  tenants: UnitTenant[];
  consultations: UnitConsultation[];
}

export interface Unit {
  id: string;
  officeId: string | null;
  siteId: string;
  dongId: string | null;
  siteUnitTypeId: string | null;
  name: string;
  floor: number | null;
  lineNo: number | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  isPiloti: boolean;
  createdAt: string;
  updatedAt: string;
  siteUnitType?: SiteUnitType | null;
  properties?: UnitProperty[];
}

export interface CreateUnitDto {
  siteId: string;
  dongId?: string;
  name: string;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
}

export interface UpdateUnitDto {
  name?: string;
  dongId?: string;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
}

export function createUnitsApi(request: RequestFn) {
  return {
    findAll: (filters?: { siteId?: string; dongId?: string }) =>
      request<Unit[]>('/units', { params: filters }),

    findOne: (id: string) =>
      request<Unit>(`/units/${id}`),

    create: (dto: CreateUnitDto) =>
      request<Unit>('/units', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateUnitDto) =>
      request<Unit>(`/units/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/units/${id}`, { method: 'DELETE' }),
  };
}
