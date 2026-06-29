import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  function createService() {
    const prisma = {
      commissionPayment: { aggregate: jest.fn() },
      contract: { count: jest.fn() },
      listingIntake: { count: jest.fn() },
      buyerRequirement: { count: jest.fn() },
      listing: { count: jest.fn() },
      match: { count: jest.fn() },
      deal: { count: jest.fn() },
      task: { count: jest.fn() },
      entityDraft: { count: jest.fn() },
      proposal: { count: jest.fn() },
      calendarEvent: { count: jest.fn() },
      tenant: { count: jest.fn() },
    };

    return {
      prisma,
      service: new DashboardService(prisma as never),
    };
  }

  function stubAggregates(
    prisma: ReturnType<typeof createService>['prisma'],
    sums: Array<{ expectedAmount?: number | null; actualAmount?: number | null }>,
  ) {
    for (const sum of sums) {
      prisma.commissionPayment.aggregate.mockResolvedValueOnce({
        _sum: {
          expectedAmount: sum.expectedAmount ?? null,
          actualAmount: sum.actualAmount ?? null,
        },
      });
    }
  }

  it('aggregates monthly money figures and entity counts in a single summary', async () => {
    const { prisma, service } = createService();
    const now = new Date(2026, 5, 10, 15, 30); // 2026-06-10

    stubAggregates(prisma, [
      { actualAmount: 1200 }, // collected (이번달 paidAt)
      { expectedAmount: 3000, actualAmount: 500 }, // expected (이번달 dueDate)
      { expectedAmount: 700, actualAmount: 100 }, // status=overdue
      { expectedAmount: 400, actualAmount: 0 }, // pending/partial past due
    ]);

    prisma.contract.count.mockResolvedValue(2);
    prisma.listingIntake.count.mockResolvedValue(5);
    prisma.buyerRequirement.count.mockResolvedValue(3);
    prisma.listing.count
      .mockResolvedValueOnce(12) // activeListings
      .mockResolvedValueOnce(4); // unverifiedListings
    prisma.match.count.mockResolvedValue(6);
    prisma.deal.count.mockResolvedValue(2);
    prisma.task.count.mockResolvedValue(7);
    prisma.entityDraft.count.mockResolvedValue(3);
    prisma.proposal.count.mockResolvedValue(2);
    prisma.calendarEvent.count.mockResolvedValue(1);
    prisma.tenant.count.mockResolvedValue(2);

    const summary = await service.getSummary('office-1', now);

    expect(summary).toEqual({
      thisMonth: {
        collectedAmount: 1200,
        expectedAmount: 2500, // 3000 - 500 부분수금 차감
        overdueAmount: 1000, // (700-100) + (400-0)
        contractCount: 2,
        newIntakeCount: 5,
        newBuyerCount: 3,
      },
      counts: {
        activeListings: 12,
        unverifiedListings: 4,
        activeMatches: 6,
        activeDeals: 2,
        pendingTasks: 7,
        pendingInbox: 5, // EntityDraft 3 + Proposal 2
        todayEvents: 1,
        expiringTenants: 2,
      },
    });
  });

  it('scopes monthly aggregates to the office and the current month boundaries', async () => {
    const { prisma, service } = createService();
    const now = new Date(2026, 5, 10);
    const monthStart = new Date(2026, 5, 1);
    const nextMonthStart = new Date(2026, 6, 1);

    stubAggregates(prisma, [{}, {}, {}, {}]);
    prisma.contract.count.mockResolvedValue(0);
    prisma.listingIntake.count.mockResolvedValue(0);
    prisma.buyerRequirement.count.mockResolvedValue(0);
    prisma.listing.count.mockResolvedValue(0);
    prisma.match.count.mockResolvedValue(0);
    prisma.deal.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.entityDraft.count.mockResolvedValue(0);
    prisma.proposal.count.mockResolvedValue(0);
    prisma.calendarEvent.count.mockResolvedValue(0);
    prisma.tenant.count.mockResolvedValue(0);

    await service.getSummary('office-1', now);

    expect(prisma.commissionPayment.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        officeId: 'office-1',
        status: { in: ['collected', 'partial'] },
        paidAt: { gte: monthStart, lt: nextMonthStart },
      },
      _sum: { actualAmount: true },
    });
    expect(prisma.commissionPayment.aggregate).toHaveBeenNthCalledWith(2, {
      where: {
        officeId: 'office-1',
        status: { in: ['pending', 'partial'] },
        dueDate: { gte: monthStart, lt: nextMonthStart },
      },
      _sum: { expectedAmount: true, actualAmount: true },
    });
    expect(prisma.contract.count).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        contractDate: { gte: monthStart, lt: nextMonthStart },
      },
    });
    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isHidden: false,
        checkStatus: { in: ['unverified', 'verified'] },
      },
    });
    expect(prisma.deal.count).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isCancelled: false,
        stage: { notIn: ['completed', 'closed'] },
      },
    });
    expect(prisma.tenant.count).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        status: 'residing',
        contractEnd: {
          gte: now,
          lte: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        },
      },
    });
  });

  it('returns zero amounts when no commission payments exist', async () => {
    const { prisma, service } = createService();

    stubAggregates(prisma, [{}, {}, {}, {}]);
    prisma.contract.count.mockResolvedValue(0);
    prisma.listingIntake.count.mockResolvedValue(0);
    prisma.buyerRequirement.count.mockResolvedValue(0);
    prisma.listing.count.mockResolvedValue(0);
    prisma.match.count.mockResolvedValue(0);
    prisma.deal.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.entityDraft.count.mockResolvedValue(0);
    prisma.proposal.count.mockResolvedValue(0);
    prisma.calendarEvent.count.mockResolvedValue(0);
    prisma.tenant.count.mockResolvedValue(0);

    const summary = await service.getSummary('office-1');

    expect(summary.thisMonth.collectedAmount).toBe(0);
    expect(summary.thisMonth.expectedAmount).toBe(0);
    expect(summary.thisMonth.overdueAmount).toBe(0);
  });
});
