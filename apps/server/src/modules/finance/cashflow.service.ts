import { Injectable } from '@nestjs/common';
import { formatUnitName } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OfficeExpenseService } from './office-expense.service';
import { monthRange } from './settlement-calc';
import { kstMonthOf, loadOurCollections } from './our-collections';

const WON_PER_MANWON = 10_000;
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

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
  /** 그 달에 들어온 수수료 (만원, 부가세 뺀 금액, 돌려준 돈은 뺌). 입금 기록의 받은 날로 센다. */
  collected: number;
  pending: number;
  overdue: number;
  expected: number;
  monthlyExpense: number;
  /**
   * 그 달 수금 가운데 공동중개 상대에게 넘겨줄 몫 (만원). 우리가 수금한 청구의 상대 분배 비율만큼이다.
   * 보냈는지와 상관없이 우리 돈이 아니라 순이익에서 뺀다.
   */
  partnerShare: number;
  /** 수금 − 공동중개 줄 몫 − 고정비 */
  netProfit: number;
  taxInvoicePending: number;
  pipeline: {
    preparing: { count: number; amount: number };
    contract: { count: number; amount: number };
    balanceWaiting: { count: number; amount: number };
    collected: { count: number; amount: number };
    overdue: { count: number; amount: number };
  };
  deals: PipelineDeal[];
  monthlyTrend: Array<{
    month: string;
    collected: number;
    /** 상대에게 넘겨줄 몫 (만원) */
    partnerShare: number;
    expense: number;
    net: number;
  }>;
}

// Deal 파이프라인에서 "활성" 구간으로 볼 stage 값
const ACTIVE_STAGES = [
  'preparing',
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
    // 한국 시각의 달 경계
    const range = monthRange(monthKey(year, month));
    const startOfMonth = range.start;
    const endOfMonth = new Date(range.end.getTime() - 1);

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
                    name: true, floor: true, floorEnd: true, floorLabel: true,
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

    let pending = 0;
    let overdue = 0;
    let taxInvoicePending = 0;

    const now = new Date();

    const pipelineCounts = {
      preparing: { count: 0, amount: 0 },
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

      // commissionPayments 집계 — Deal 본체에 캐시 필드 없으므로 현장 계산
      const billed = deal.commissionPayments.reduce(
        (sum, p) =>
          p.status === 'waived' || p.status === 'cancelled'
            ? sum
            : sum + p.expectedAmount,
        0,
      );

      const pDeal: PipelineDeal = {
        id: deal.id,
        stage: deal.stage,
        isCancelled: deal.isCancelled,
        agreedPrice: deal.agreedPrice,
        siteName: prop?.site.name ?? null,
        dongName: prop?.unit?.dong?.name ?? null,
        // 이름 없는 공간(상가 2층 등)은 층으로 적는다
            unitName: prop?.unit ? formatUnitName(prop.unit) || null : null,
        transactionType: deal.transactionType,
        commissionTotal: billed,
        buyerContactName: deal.buyerContact?.name ?? null,
        sellerContactName: deal.sellerContact?.name ?? null,
        balanceDueDate,
        payments: deal.commissionPayments.map((p) => ({
          id: p.id,
          side: p.clientSide,
          expectedAmount: p.expectedAmount,
          actualAmount: p.actualAmount,
          dueDate: p.dueDate?.toISOString() ?? null,
          paidAt: p.paidAt?.toISOString() ?? null,
          status: p.status,
          taxInvoiceStatus: p.taxInvoiceStatus,
        })),
        // 담당 = 맡은 비중이 있는 사람 (수금 원장·거래 화면과 같은 기준, 옛 거래는 배정된 사람)
        participants: (deal.participants.some((dp) => dp.sharePercent != null)
          ? deal.participants.filter((dp) => dp.sharePercent != null)
          : deal.participants
        ).map((dp) => ({
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
        // 공동중개 상대가 수금하는 청구는 우리가 받을 돈·연체가 아니다 (그 안의 우리 몫은 공동중개 정산으로 받는다)
        const ours = payment.collectedByOffice !== 'partner';
        if (ours && payment.status === 'pending') {
          if (payment.dueDate && payment.dueDate < now) {
            overdue += payment.expectedAmount;
          } else {
            pending += payment.expectedAmount;
          }
        }
        if (ours && payment.status === 'overdue') {
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
      const dealCommission = billed;
      const hasOverdue = deal.commissionPayments.some(
        (p) =>
          p.collectedByOffice !== 'partner' &&
          (p.status === 'overdue' || (p.status === 'pending' && p.dueDate && p.dueDate < now)),
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
        pipelineCounts.preparing.count++;
        pipelineCounts.preparing.amount += dealCommission;
      }
    }

    const expected = pending + pipelineCounts.preparing.amount;
    const monthlyExpense = await this.expenseService.getMonthlyTotal(officeId);

    // 월별 추이 (최근 6개월). 맨 끝이 고른 달이다.
    // 예전에는 진행 중인 거래 전체의 받은 금액을 '수금'으로 내려 달과 상관없는 누계였다.
    const monthlyTrend = await this.getMonthlyTrend(officeId, year, month, 6, monthlyExpense);
    const last = monthlyTrend[monthlyTrend.length - 1];
    const collected = last?.collected ?? 0;
    const partnerShare = last?.partnerShare ?? 0;

    return {
      collected,
      pending,
      overdue,
      expected,
      monthlyExpense,
      partnerShare,
      netProfit: collected - partnerShare - monthlyExpense,
      taxInvoicePending,
      pipeline: pipelineCounts,
      deals: pipelineDeals,
      monthlyTrend,
    };
  }

  /**
   * 달마다 우리 통장에 들어온 수수료 (만원). 우리가 수금한 청구의 입금 기록(받은 날) +
   * 상대가 수금한 청구에서 받은 우리 몫(받음 기록 날짜)을 한국 시각의 달로 모은다 (loadOurCollections 한 곳에서 정함).
   * 부가세를 뺀 금액이고, 돌려준 돈은 돌려준 달에서 뺀다.
   */
  private async getMonthlyTrend(
    officeId: string,
    year: number,
    month: number,
    months: number,
    monthlyExpense: number,
  ) {
    const keys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month - 1 - i, 1));
      keys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1));
    }
    const collections = await loadOurCollections(this.prisma, officeId, {
      from: monthRange(keys[0]).start,
      to: monthRange(keys[keys.length - 1]).end,
    });
    const sums = new Map<string, { won: number; partnerWon: number }>();
    for (const c of collections) {
      const key = kstMonthOf(c.at);
      const sum = sums.get(key) ?? { won: 0, partnerWon: 0 };
      sum.won += c.won;
      sum.partnerWon += c.partnerWon;
      sums.set(key, sum);
    }
    // 원으로 더한 뒤 만원으로 바꾼다 (수금과 줄 몫 각각)
    return keys.map((key) => {
      const collected = Math.round((sums.get(key)?.won ?? 0) / WON_PER_MANWON);
      const partnerShare = Math.round((sums.get(key)?.partnerWon ?? 0) / WON_PER_MANWON);
      return {
        month: key,
        collected,
        partnerShare,
        expense: monthlyExpense,
        net: collected - partnerShare - monthlyExpense,
      };
    });
  }
}
