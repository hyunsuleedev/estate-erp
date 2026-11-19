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
  /** 호 이름 또는 층의 일부에 붙인 이름. 호 없이 층이 단위인 공간은 null (표기는 shared의 formatUnitLabel) */
  name: string | null;
  /** 층. 지하는 음수(-2 = B2), 0은 없다 */
  floor: number | null;
  /** 여러 층을 한 공간으로 둘 때의 끝 층 */
  floorEnd?: number | null;
  /** 숫자로 안 떨어지는 층의 표시 이름 (반지하, M층) */
  floorLabel?: string | null;
  /** 건축물대장 전유부 번호. 대장에서 온 호에만 있다 */
  registerPk?: string | null;
  lineNo: number | null;
  exclusiveAreaM2: number | null;
  supplyAreaM2: number | null;
  /** 호실별 구조 override. null이면 SiteUnitType 값을 사용한다. */
  roomCount: number | null;
  /** 호실별 구조 override. null이면 SiteUnitType 값을 사용한다. */
  bathRoomCount: number | null;
  isPiloti: boolean;
  cellType?: string;
  createdAt: string;
  updatedAt: string;
  siteUnitType?: SiteUnitType | null;
  properties?: UnitProperty[];
}

export interface CreateUnitDto {
  siteId: string;
  dongId: string;
  /** 호 이름. 호 없이 층이 단위인 공간은 비우고 층을 준다 */
  name?: string | null;
  siteUnitTypeId?: string;
  floor?: number | null;
  floorEnd?: number | null;
  floorLabel?: string | null;
  lineNo?: number;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
  roomCount?: number | null;
  bathRoomCount?: number | null;
}

export interface UpdateUnitDto {
  name?: string | null;
  dongId?: string;
  siteUnitTypeId?: string | null;
  floor?: number | null;
  floorEnd?: number | null;
  floorLabel?: string | null;
  lineNo?: number | null;
  exclusiveAreaM2?: number;
  supplyAreaM2?: number;
  roomCount?: number | null;
  bathRoomCount?: number | null;
}

export function createUnitsApi(request: RequestFn) {
  return {
    findAll: (filters?: { siteId?: string; dongId?: string; dongIds?: string[] }) =>
      request<Unit[]>('/units', {
        params: {
          siteId: filters?.siteId,
          dongId: filters?.dongId,
          dongIds: filters?.dongIds?.join(','),
        },
      }),

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
