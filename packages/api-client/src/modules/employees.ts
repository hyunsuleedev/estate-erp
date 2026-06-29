import type { RequestFn } from '../client.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { Consultation } from './consultations.js';
import type { Deal } from './deals.js';
import type { Task } from './tasks.js';

export interface EmployeeCounts {
  activeTaskCount: number;
  activeBuyerRequirementCount: number;
  activeDealCount: number;
  unsettledDealCount: number;
}

export interface Employee {
  id: string;
  officeId: string;
  loginId: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  /** broker_owner(개업공인중개사) | broker_associate(소속공인중개사) | assistant(중개보조원) */
  licenseType: string | null;
  /** 공인중개사 자격증 번호 또는 중개사무소 등록 번호 */
  licenseNo: string | null;
  /** fixed(고정급) | mixed(고정급+수수료) | commission_only(수수료제) */
  payType: string;
  /** 월 기본급 (만원) */
  baseSalary: number | null;
  /** 개인 수수료 배분율 (%). null이면 Office.commissionConfig 기본값 */
  commissionRate: number | null;
  createdAt: string;
  updatedAt: string;
  counts: EmployeeCounts;
  latestActivityAt: string | null;
}

export interface EmployeeActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  source: string;
  reason: string | null;
  createdAt: string;
}

export interface EmployeeDealParticipant {
  id: string;
  role: string;
  side: string;
  commissionAmount: number | null;
  commissionRate: number | null;
  settlementStatus: string;
  settlementDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  deal: Deal;
}

export interface EmployeeDetail extends Omit<Employee, 'latestActivityAt'> {
  office: {
    id: string;
    name: string;
    commissionConfig: unknown;
  };
  assignedTasks: Task[];
  assignedBuyerRequirements: BuyerRequirement[];
  dealParticipants: EmployeeDealParticipant[];
  recentConsultations: Consultation[];
  recentActivities: EmployeeActivity[];
}

export interface CreateEmployeeDto {
  name: string;
  password: string;
  phone?: string;
  email?: string;
  role?: string;
  loginId?: string;
  licenseType?: string | null;
  licenseNo?: string | null;
}

export interface UpdateEmployeeDto {
  name?: string;
  phone?: string | null;
  email?: string | null;
  licenseType?: string | null;
  licenseNo?: string | null;
  payType?: string;
  baseSalary?: number | null;
  commissionRate?: number | null;
}

export interface EmployeePerformance {
  activeTaskCount: number;
  activeBuyerRequirementCount: number;
  activeDealCount: number;
  unsettledDealCount: number;
  consultationCount: number;
  commissionAmountTotal: number;
}

export function createEmployeesApi(request: RequestFn) {
  return {
    findAll: () => request<Employee[]>('/employees'),
    findOne: (id: string) => request<EmployeeDetail>(`/employees/${id}`),
    create: (dto: CreateEmployeeDto) =>
      request<EmployeeDetail>('/employees', { method: 'POST', body: dto }),
    update: (id: string, dto: UpdateEmployeeDto) =>
      request<EmployeeDetail>(`/employees/${id}`, {
        method: 'PATCH',
        body: dto,
      }),
    updateStatus: (id: string, isActive: boolean) =>
      request<EmployeeDetail>(`/employees/${id}/status`, {
        method: 'PATCH',
        body: { isActive },
      }),
    updateRole: (id: string, role: string) =>
      request<EmployeeDetail>(`/employees/${id}/role`, {
        method: 'PATCH',
        body: { role },
      }),
    resetPassword: (id: string, newPassword: string) =>
      request<{ success: boolean; message?: string }>(
        `/employees/${id}/reset-password`,
        {
          method: 'POST',
          body: { newPassword },
        },
      ),
    getPerformance: (id: string) =>
      request<EmployeePerformance>(`/employees/${id}/performance`),
  };
}
