import type { RequestFn } from '../client.js';

export interface DashboardThisMonth {
  /** 이번달 수금 완료액 (만원) */
  collectedAmount: number;
  /** 이번달 수금 예정액 (만원, 부분수금 차감) */
  expectedAmount: number;
  /** 연체액 (만원) */
  overdueAmount: number;
  /** 계약일이 이번달인 계약 수 */
  contractCount: number;
  /** 이번달 신규 접수 (receivedAt 기준) */
  newIntakeCount: number;
  /** 이번달 신규 구매고객 (createdAt 기준) */
  newBuyerCount: number;
}

export interface DashboardCounts {
  /** unverified + verified, isHidden=false */
  activeListings: number;
  unverifiedListings: number;
  /** stage != closed */
  activeMatches: number;
  /** stage not in (completed, closed), isCancelled=false */
  activeDeals: number;
  pendingTasks: number;
  todayEvents: number;
  /** 60일 내 계약 만료 예정 세입자 (residing) */
  expiringTenants: number;
}

export interface DashboardSummary {
  thisMonth: DashboardThisMonth;
  counts: DashboardCounts;
}

export function createDashboardApi(request: RequestFn) {
  return {
    summary: () => request<DashboardSummary>('/dashboard/summary'),
  };
}
