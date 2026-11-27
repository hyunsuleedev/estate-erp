import type { RequestFn } from '../client.js';
import type { BuyerRequirement } from './buyer-requirements.js';
import type { Consultation } from './consultations.js';
import type { Deal } from './deals.js';
import type { Task } from './tasks.js';

export interface EmployeeAttentionItem {
  kind: 'task' | 'buyer';
  id: string;
  title: string;
  dueDate: string;
}

export interface EmployeeCounts {
  activeTaskCount: number;
  activeBuyerRequirementCount: number;
  activeProjectCount?: number;
  activeDealCount: number;
  unsettledDealCount: number;
  overdueTaskCount?: number;
  overdueBuyerCount?: number;
  unsettledCommissionTotal?: number;
  consultationCount?: number;
  commissionAmountTotal?: number;
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
  /**
   * 급여 설정(payType·baseSalary·commissionRate)을 이 응답에 담았는지.
   * 사장님과 본인에게만 true다. false면 세 값은 모두 null이다 — "정하지 않음"이 아니라 "보여 주지 않음"이다.
   */
  payVisible: boolean;
  /** fixed(고정급) | mixed(고정급+수수료) | commission_only(수수료제). payVisible이 false면 null */
  payType: string | null;
  /** 월 기본급 (만원) */
  baseSalary: number | null;
  /** 개인 수수료 배분율 (%). null이면 Office.commissionConfig 기본값 */
  commissionRate: number | null;
  /** 직원 정산에서의 구분: freelancer | employee. payVisible이 false면 null */
  employmentType: string | null;
  /** 프리랜서에게 줄 때 3.3%를 떼는지. payVisible이 false면 null */
  withholdTax: boolean | null;
  createdAt: string;
  updatedAt: string;
  counts: EmployeeCounts;
  attentionItems?: EmployeeAttentionItem[];
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

export interface EmployeeAssignedProject {
  id: string;
  title: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  primaryContact: { id: string; name: string } | null;
  completedStepCount: number;
  totalStepCount: number;
  _count: {
    listingIntakes: number;
    buyerIntakes: number;
    steps: number;
    comments: number;
  };
}

export interface EmployeeSettlementSummary {
  id: string;
  month: string;
  timing: string;
  confirmedAt: string;
  employmentType: string;
  withholdTax: boolean;
  targetWon: number;
  shareWon: number;
  baseWon: number;
  adjustWon: number;
  carryInWon: number;
  withholdingWon: number;
  netWon: number;
  carryOutWon: number;
  paidAt: string | null;
}

export interface EmployeeConsultationBreakdown {
  phone: number;
  visit: number;
  online: number;
}

export interface EmployeeWeeklyActivity {
  label: string;
  consultations: number;
  activities: number;
}

export interface EmployeeDealParticipant {
  id: string;
  role: string;
  side: string;
  commissionAmount: number | null;
  commissionRate: number | string | null;
  sharePercent?: number | null;
  settlementStatus: string;
  settlementDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  deal: Deal & {
    contract?: {
      id: string;
      status: string;
      contractDate: string | null;
      moveInDate: string | null;
      statedBalanceDate?: string | null;
    } | null;
  };
}

/** 기본 정보 + 딸린 목록 전부. 직원을 고친 뒤의 응답과, 화면이 나눠 받은 것을 합친 모양이다 */
export interface EmployeeDetail extends Omit<Employee, 'latestActivityAt'> {
  lastLoginAt?: string | null;
  office: {
    id: string;
    name: string;
    commissionConfig: unknown;
  };
  assignedTasks: Task[];
  assignedBuyerRequirements: BuyerRequirement[];
  assignedProjects?: EmployeeAssignedProject[];
  dealParticipants: EmployeeDealParticipant[];
  recentSettlementLines?: EmployeeSettlementSummary[];
  recentConsultations: Consultation[];
  recentActivities: EmployeeActivity[];
}

/**
 * 직원 상세에 딸린 목록. 한 응답에 다 붙이지 않고 하나씩 따로 받는다
 * (GET /employees/:id/sections/:section) — 업무 하나가 바뀌었을 때 그 목록만 다시 받기 위해서다.
 */
export interface EmployeeSections {
  tasks: Task[];
  buyerRequirements: BuyerRequirement[];
  projects: EmployeeAssignedProject[];
  deals: EmployeeDealParticipant[];
  settlements: EmployeeSettlementSummary[];
  consultations: Consultation[];
  activities: EmployeeActivity[];
}
export type EmployeeSection = keyof EmployeeSections;

/** 직원 한 명의 기본 정보와 건수 (GET /employees/:id). 딸린 목록은 싣지 않는다 */
export type EmployeeProfile = Omit<
  EmployeeDetail,
  | 'assignedTasks'
  | 'assignedBuyerRequirements'
  | 'assignedProjects'
  | 'dealParticipants'
  | 'recentSettlementLines'
  | 'recentConsultations'
  | 'recentActivities'
>;

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
  /** freelancer | employee */
  employmentType?: string;
  withholdTax?: boolean;
}

export interface EmployeePerformance {
  activeTaskCount: number;
  activeBuyerRequirementCount: number;
  activeDealCount: number;
  closedDealCount?: number;
  unsettledDealCount: number;
  consultationCount: number;
  commissionAmountTotal: number;
  completedTaskCount30d?: number;
  consultationCount30d?: number;
  consultationByType30d?: EmployeeConsultationBreakdown;
  weeklyActivity?: EmployeeWeeklyActivity[];
}

export function createEmployeesApi(request: RequestFn) {
  return {
    findAll: () => request<Employee[]>('/employees'),
    /** 기본 정보와 건수. 딸린 목록은 findSection으로 따로 받는다 */
    findProfile: (id: string) => request<EmployeeProfile>(`/employees/${id}`),
    findSection: <S extends EmployeeSection>(id: string, section: S) =>
      request<EmployeeSections[S]>(`/employees/${id}/sections/${section}`),
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
