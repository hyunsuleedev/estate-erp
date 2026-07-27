import type { RequestFn } from '../client.js';
import type {
  ListingIntakeState,
  ListingOccupyingDeal,
} from './listings.js';

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
}

export interface UnitPropertyContact {
  id: string;
  role: string;
  isPrimary: boolean;
  isResident: boolean;
  /** 지분비율 % — Prisma Decimal이 문자열로 내려올 수 있음 */
  shareRatio: string | number | null;
  memo: string | null;
  status: string;
  contact: UnitContact;
}

export interface UnitTenant {
  id: string;
  deposit: number | null;
  monthlyRent: number | null;
  status: string;
  contractStart: string | null;
  contractEnd: string | null;
  moveOutDate: string | null;
  memo: string | null;
  contact: UnitContact;
}

export interface UnitConsultation {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  contact: UnitContact;
}

export interface UnitListing {
  id: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  isPaused: boolean;
  intake?: ListingIntakeState | null;
  deals?: ListingOccupyingDeal[];
  updatedAt: string;
}

export interface UnitProperty {
  id: string;
  propertyContacts: UnitPropertyContact[];
  tenants: UnitTenant[];
  consultations: UnitConsultation[];
  listings: UnitListing[];
}

export interface Unit {
  id: string;
  officeId: string | null;
  siteId: string;
  dongId: string;
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
  dongId: string;
  name: string;
  siteUnitTypeId?: string;
  floor?: number;
  lineNo?: number;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
}

export interface UpdateUnitDto {
  name?: string;
  dongId?: string;
  siteUnitTypeId?: string | null;
  floor?: number | null;
  lineNo?: number | null;
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
