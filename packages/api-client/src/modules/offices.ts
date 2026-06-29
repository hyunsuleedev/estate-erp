import type { RequestFn } from '../client.js';

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
  subscription: string;
  maxUsers: number;
  isActive: boolean;
  commissionConfig: unknown;
  /** AI 직원(Rule Engine + Proposal) 전체 on/off */
  agentEnabled: boolean;
  /** Proposal type별 trust tier 오버라이드. 예: { ad_takedown: 'approval_required' } */
  agentTrustConfig: Record<string, string>;
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

export interface CreateOfficeDto {
  name: string;
  licenseNo?: string | null;
  ceoName?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface AgentConfigDto {
  agentEnabled?: boolean;
  /** 키: Proposal type(=Rule name), 값: trust tier. null이면 오버라이드 제거(기본값 사용). */
  agentTrustConfig?: Record<string, string | null>;
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
    updateCommissionConfig: (dto: CommissionConfigDto) =>
      request<OfficeProfile>('/offices/me/commission-config', {
        method: 'PATCH',
        body: dto,
      }),
    updateAgentConfig: (dto: AgentConfigDto) =>
      request<OfficeProfile>('/offices/me/agent-config', {
        method: 'PATCH',
        body: dto,
      }),
  };
}
