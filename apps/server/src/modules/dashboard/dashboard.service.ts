import { Injectable } from '@nestjs/common';
import { IntakeConfirmationState } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildIntakeConfirmationWhere,
  MARKETABLE_LISTING_WHERE,
  NON_CLOSED_INTAKE_WHERE,
} from '../listings/listing-state';

const TENANT_EXPIRY_WINDOW_DAYS = 60;

interface OutstandingAggregate {
  _sum: {
    expectedAmount: number | null;
    actualAmount: number | null;
  };
}

export interface DashboardSummary {
  thisMonth: {
    /** 이번달 수금 완료액 (만원) — collected/partial, paidAt 이번달 */
    collectedAmount: number;
    /** 이번달 수금 예정액 (만원) — pending/partial, dueDate 이번달, 부분수금분 차감 */
    expectedAmount: number;
    /** 연체액 (만원) — status overdue + 기한 지난 pending/partial */
    overdueAmount: number;
    /** 계약일이 이번달인 계약 수 */
    contractCount: number;
    /** receivedAt 이번달 신규 접수 */
    newIntakeCount: number;
    /** createdAt 이번달 신규 구매고객 */
    newBuyerCount: number;
  };
  counts: {
    activeListings: number;
    unverifiedListings: number;
    activeMatches: number;
    activeDeals: number;
    pendingTasks: number;
    todayEvents: number;
    /** 60일 내 계약 만료 예정 세입자 (residing) */
    expiringTenants: number;
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(officeId: string, now = new Date()): Promise<DashboardSummary> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const tenantExpiryLimit = new Date(
      now.getTime() + TENANT_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [
      collectedAgg,
      expectedAgg,
      overdueStatusAgg,
      pastDueAgg,
      contractCount,
      newIntakeCount,
      newBuyerCount,
      activeListings,
      unverifiedListings,
      activeMatches,
      activeDeals,
      pendingTasks,
      todayEvents,
      expiringTenants,
    ] = await Promise.all([
      // 이번달 수금 완료: collected/partial 의 실수금액 합 (paidAt 기준)
      this.prisma.commissionPayment.aggregate({
        where: {
          officeId,
          status: { in: ['collected', 'partial'] },
          paidAt: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { actualAmount: true },
      }),
      // 이번달 수금 예정: pending/partial 의 미수금액 합 (dueDate 기준)
      this.prisma.commissionPayment.aggregate({
        where: {
          officeId,
          status: { in: ['pending', 'partial'] },
          dueDate: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { expectedAmount: true, actualAmount: true },
      }),
      // 연체 1: status 가 overdue 로 마킹된 건
      this.prisma.commissionPayment.aggregate({
        where: { officeId, status: 'overdue' },
        _sum: { expectedAmount: true, actualAmount: true },
      }),
      // 연체 2: pending/partial 인데 dueDate 가 지난 건 (cashflow 서비스와 동일 규칙)
      this.prisma.commissionPayment.aggregate({
        where: {
          officeId,
          status: { in: ['pending', 'partial'] },
          dueDate: { lt: now },
        },
        _sum: { expectedAmount: true, actualAmount: true },
      }),
      this.prisma.contract.count({
        where: {
          officeId,
          contractDate: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.listingIntake.count({
        where: {
          officeId,
          receivedAt: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.buyerRequirement.count({
        where: {
          officeId,
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.listing.count({
        where: {
          officeId,
          ...MARKETABLE_LISTING_WHERE,
        },
      }),
      this.prisma.listing.count({
        where: {
          officeId,
          intake: {
            ...NON_CLOSED_INTAKE_WHERE,
            ...buildIntakeConfirmationWhere(
              IntakeConfirmationState.UNVERIFIED,
              now,
            ),
          },
        },
      }),
      this.prisma.match.count({
        where: { officeId, stage: { not: 'closed' } },
      }),
      this.prisma.deal.count({
        where: {
          officeId,
          isCancelled: false,
          stage: { notIn: ['completed', 'closed'] },
        },
      }),
      this.prisma.task.count({
        where: { officeId, status: 'pending' },
      }),
      this.prisma.calendarEvent.count({
        where: { officeId, start: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.tenant.count({
        where: {
          officeId,
          status: 'residing',
          contractEnd: { gte: now, lte: tenantExpiryLimit },
        },
      }),
    ]);

    return {
      thisMonth: {
        collectedAmount: collectedAgg._sum.actualAmount ?? 0,
        expectedAmount: this.outstanding(expectedAgg),
        overdueAmount:
          this.outstanding(overdueStatusAgg) + this.outstanding(pastDueAgg),
        contractCount,
        newIntakeCount,
        newBuyerCount,
      },
      counts: {
        activeListings,
        unverifiedListings,
        activeMatches,
        activeDeals,
        pendingTasks,
        todayEvents,
        expiringTenants,
      },
    };
  }

  /** 청구액 - 부분수금액 (음수 방지) */
  private outstanding(aggregate: OutstandingAggregate) {
    const expected = aggregate._sum.expectedAmount ?? 0;
    const actual = aggregate._sum.actualAmount ?? 0;
    return Math.max(expected - actual, 0);
  }
}
