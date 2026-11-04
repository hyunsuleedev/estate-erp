import type { RequestFn } from '../client.js';

export interface OfficePostalAddress {
  roadAddress: string | null;
  jibunAddress: string | null;
  detailAddress: string | null;
  zipCode: string | null;
  buildingCode: string | null;
}

export interface OfficeUserSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** broker_owner / broker_associate / assistant (shared USER_LICENSE_TYPE_LABELS) */
  licenseType: string | null;
  isActive: boolean;
}

export interface OfficeProfile {
  id: string;
  name: string;
  licenseNo: string | null;
  ceoName: string | null;
  phone: string | null;
  address: string | null;
  postalAddress: OfficePostalAddress | null;
  geocodingStatus: 'pending' | 'ready' | 'failed' | 'unconfigured' | null;
  geocodedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  naverVerificationId: string | null;
  subscription: string;
  maxUsers: number;
  isActive: boolean;
  commissionConfig: unknown;
  createdAt: string;
  updatedAt: string;
  counts: {
    totalUsers: number;
    activeUsers: number;
    managers: number;
  };
  owner: OfficeUserSummary | null;
  users: OfficeUserSummary[];
}

export interface UpdateOfficeDto {
  name?: string;
  licenseNo?: string | null;
  ceoName?: string | null;
  phone?: string | null;
  address?: string | null;
  postalAddress?: OfficePostalAddress | null;
  naverVerificationId?: string | null;
}

export interface CreateOfficeDto {
  name: string;
  licenseNo?: string | null;
  ceoName?: string | null;
  phone?: string | null;
  address?: string | null;
  postalAddress?: OfficePostalAddress | null;
}

export interface CommissionConfigDto {
  distributionType?: string;
  defaultAgentRate?: number;
  listingAgentRate?: number;
  buyingAgentRate?: number;
  dualAgentRate?: number;
  managerRate?: number;
  closerBonus?: number;
}

export function createOfficesApi(request: RequestFn) {
  return {
    createForCurrentUser: (dto: CreateOfficeDto) =>
      request<OfficeProfile>('/offices/me', { method: 'POST', body: dto }),
    getMe: () => request<OfficeProfile>('/offices/me'),
    updateMe: (dto: UpdateOfficeDto) =>
      request<OfficeProfile>('/offices/me', { method: 'PATCH', body: dto }),
    retryGeocoding: () => request<OfficeProfile>('/offices/me/geocode', { method: 'POST' }),
    updateCommissionConfig: (dto: CommissionConfigDto) =>
      request<OfficeProfile>('/offices/me/commission-config', {
        method: 'PATCH',
        body: dto,
      }),
  };
}
