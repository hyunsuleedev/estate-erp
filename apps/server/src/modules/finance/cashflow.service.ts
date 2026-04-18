import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeExpenseService } from './office-expense.service';

export interface PipelineDeal {
  id: string;
  stage: string;
  isCancelled: boolean;
  agreedPrice: number | null;
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
  transactionType: string;
  commissionTotal: number | null;
  buyerContactName: string | null;
  sellerContactName: string | null;
  balanceDueDate: string | null;
  payments: Array<{
    id: string;
    side: string;
    expectedAmount: number;
    actualAmount: number | null;
    dueDate: string | null;
    paidAt: string | null;
    status: string;
    taxInvoiceStatus: string;
  }>;
  participants: Array<{
    id: string;
    userName: string;
    role: string;
    side: string;
    commissionAmount: number | null;
    settlementStatus: string;
  }>;
}

export interface CashflowSummary {
  collected: number;
  pending: number;
  overdue: number;
  expected: number;
  monthlyExpense: number;
  netProfit: number;
  taxInvoicePending: number;
  pipeline: {
    negotiating: { count: number; amount: number };
    contract: { count: number; amount: number };
    balanceWaiting: { count: number; amount: number };
    collected: { count: number; amount: number };
    overdue: { count: number; amount: number };
  };
  deals: PipelineDeal[];
  monthlyTrend: Array<{
    month: string;
    collected: number;
    expense: number;
    net: number;
  }>;
}

// Deal 파이프라인에서 "활성" 구간으로 볼 stage 값
const ACTIVE_STAGES = [
  'selection',
  'negotiating',
  'preContract',
  'contracted',
  'settling',
  'completed',
] as const;

// 본계약 이후 단계 (계약서 체결됨)
const CONTRACT_STAGES = new Set(['contracted', 'settling']);

// 잔금 대기 단계
const BALANCE_WAITING_STAGES = new Set(['completed', 'closed']);

@Injectable()
export class CashflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenseService: OfficeExpenseService,
  ) {}

  async getSummary(
    officeId: string,
    year: number,
    month: number,
  ): Promise<CashflowSummary> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // 활성 거래 + 이번 달 closed
    const deals = await this.prisma.deal.findMany({
      where: {
        officeId,
        OR: [
          { stage: { in: [...ACTIVE_STAGES] } },
          {
            stage: 'closed',
            updatedAt: { gte: startOfMonth, lte: endOfMonth },
          },
        ],
      },
      include: {
        listing: {
          select: {
            transactionType: true,
            property: {
              select: {
                site: { select: { name: true } },
                unit: {
                  select: {
                    name: true,
                    dong: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        buyerContact: { select: { name: true } },
        sellerContact: { select: { name: true } },
        payments: {
          where: { kind: 'balance' },
          orderBy: { sequence: 'asc' },
          take: 1,
        },
        commissionPayments: {
          orderBy: { createdAt: 'asc' },
        },
        participants: {
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let collected = 0;
    let pending = 0;
    let overdue = 0;
    let taxInvoicePending = 0;

    const now = new Date();

    const pipelineCounts = {
      negotiating: { count: 0, amount: 0 },
      contract: { count: 0, amount: 0 },
      balanceWaiting: { count: 0, amount: 0 },
      collected: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
    };

    const pipelineDeals: PipelineDeal[] = [];

    for (const deal of deals) {
      const prop = deal.listing?.property ?? null;
      const balancePayment = deal.payments[0] ?? null;
      const balanceDueDate =
        balancePayment?.scheduledDate?.toISOString() ?? null;

      const pDeal: PipelineDeal = {
        id: deal.id,
        stage: deal.stage,
        isCancelled: deal.isCancelled,
        agreedPrice: deal.agreedPrice,
        siteName: prop?.site.name ?? null,
        dongName: prop?.unit?.dong?.name ?? null,
        unitName: prop?.unit?.name ?? null,
        transactionType: deal.transactionType,
        commissionTotal: deal.commissionTotal,
        buyerContactName: deal.buyerContact?.name ?? null,
        sellerContactName: deal.sellerContact?.name ?? null,
        balanceDueDate,
        payments: deal.commissionPayments.map((p) => ({
          id: p.id,
          side: p.side,
          expectedAmount: p.expectedAmount,
          actualAmount: p.actualAmount,
          dueDate: p.dueDate?.toISOString() ?? null,
          paidAt: p.paidAt?.toISOString() ?? null,
          status: p.status,
          taxInvoiceStatus: p.taxInvoiceStatus,
        })),
        participants: deal.participants.map((dp) => ({
          id: dp.id,
          userName: dp.user.name,
          role: dp.role,
          side: dp.side,
          commissionAmount: dp.commissionAmount,
          settlementStatus: dp.settlementStatus,
        })),
      };
      pipelineDeals.push(pDeal);

      for (const payment of deal.commissionPayments) {
        if (payment.status === 'collected' || payment.status === 'partial') {
          collected += payment.actualAmount ?? 0;
        }
        if (payment.status === 'pending') {
          if (payment.dueDate && payment.dueDate < now) {
            overdue += payment.expectedAmount;
          } else {
            pending += payment.expectedAmount;
          }
        }
        if (payment.status === 'overdue') {
          overdue += payment.expectedAmount;
        }
        if (
          payment.taxInvoiceStatus === 'none' &&
          (payment.status === 'collected' || payment.status === 'partial')
        ) {
          taxInvoicePending++;
        }
      }

      // pipeline categorization
      const dealCommission = deal.commissionTotal ?? 0;
      const hasOverdue = deal.commissionPayments.some(
        (p) =>
          p.status === 'overdue' ||
          (p.status === 'pending' && p.dueDate && p.dueDate < now),
      );
      const allCollected =
        deal.commissionPayments.length > 0 &&
        deal.commissionPayments.every(
          (p) =>
            p.status === 'collected' ||
            p.status === 'partial' ||
            p.status === 'waived',
        );

      if (hasOverdue) {
        pipelineCounts.overdue.count++;
        pipelineCounts.overdue.amount += dealCommission;
      } else if (allCollected) {
        pipelineCounts.collected.count++;
        pipelineCounts.collected.amount += dealCommission;
      } else if (BALANCE_WAITING_STAGES.has(deal.stage)) {
        pipelineCounts.balanceWaiting.count++;
        pipelineCounts.balanceWaiting.amount += dealCommission;
      } else if (
        CONTRACT_STAGES.has(deal.stage) ||
        deal.stage === 'preContract'
      ) {
        pipelineCounts.contract.count++;
        pipelineCounts.contract.amount += dealCommission;
      } else {
        pipelineCounts.negotiating.count++;
        pipelineCounts.negotiating.amount += dealCommission;
      }
    }

    const expected = pending + pipelineCounts.negotiating.amount;
    const monthlyExpense = await this.expenseService.getMonthlyTotal(officeId);

    // 월별 추이 (최근 6개월)
    const monthlyTrend = await this.getMonthlyTrend(officeId, year, month, 6);

    return {
      collected,
      pending,
      overdue,
      expected,
      monthlyExpense,
      netProfit: collected - monthlyExpense,
      taxInvoicePending,
      pipeline: pipelineCounts,
      deals: pipelineDeals,
      monthlyTrend,
    };
  }

  private async getMonthlyTrend(
    officeId: string,
    year: number,
    month: number,
    months: number,
  ) {
    const trend: Array<{
      month: string;
      collected: number;
      expense: number;
      net: number;
    }> = [];

    const monthlyExpense = await this.expenseService.getMonthlyTotal(officeId);

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const startOfM = new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfM = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const result = await this.prisma.commissionPayment.aggregate({
        where: {
          officeId,
          status: { in: ['collected', 'partial'] },
          paidAt: { gte: startOfM, lte: endOfM },
        },
        _sum: { actualAmount: true },
      });

      const col = result._sum.actualAmount ?? 0;
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trend.push({
        month: label,
        collected: col,
        expense: monthlyExpense,
        net: col - monthlyExpense,
      });
    }

    return trend;
  }
}
