import type { RequestFn } from '../client.js';

export interface OfficeUserSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
}

export interface OfficeProfile {
  id: string;
  code: string;
  name: string;
  licenseNo: string | null;
  ceoName: string | null;
  phone: string | null;
  address: string | null;
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
    getMe: () => request<OfficeProfile>('/offices/me'),
    updateMe: (dto: UpdateOfficeDto) =>
      request<OfficeProfile>('/offices/me', { method: 'PATCH', body: dto }),
    updateCommissionConfig: (dto: CommissionConfigDto) =>
      request<OfficeProfile>('/offices/me/commission-config', {
        method: 'PATCH',
        body: dto,
      }),
  };
}
