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
}

export interface UpdateEmployeeDto {
  name?: string;
  phone?: string | null;
  email?: string | null;
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
      request<{ success: true }>(`/employees/${id}/reset-password`, {
        method: 'POST',
        body: { newPassword },
      }),
    getPerformance: (id: string) =>
      request<EmployeePerformance>(`/employees/${id}/performance`),
  };
}
