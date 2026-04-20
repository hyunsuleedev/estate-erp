import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeDealCommissionSummary } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 수금 원장 (Ledger) 뷰 — Deal 그룹 + CommissionPayment 라인 단위.
 *
 * 캐시플로우 요약 탭과 달리 "청구 한 건 단위" 관리가 목적이라 payload 형태가
 * 다르다. 원장 테이블이 Deal 을 그룹 헤더로, CommissionPayment 를 하위 행으로
 * 표시하기 때문에 서버에서 이 구조로 묶어 내린다.
 */

export interface LedgerDealGroup {
  deal: {
    id: string;
    transactionType: string;
    stage: string;
    stageChangedAt: string;
    isCancelled: boolean;
    agreedPrice: number | null;
    agreedDeposit: number | null;
    agreedMonthlyRent: number | null;
    balanceDueDate: string | null;
    siteName: string | null;
    dongName: string | null;
    unitName: string | null;
    buyerContactName: string | null;
    sellerContactName: string | null;
    partnerBroker: { id: string; name: string } | null;
    summary: {
      billed: number;
      ourShare: number;
      partnerShare: number;
      collected: number;
    };
    participants: Array<{ id: string; userName: string; role: string }>;
  };
  payments: Array<{
    id: string;
    code: string | null;
    clientSide: string;
    collectedByOffice: string;
    baseAmount: number | null;
    rate: number | null;
    expectedAmount: number;
    actualAmount: number | null;
    dueDate: string | null;
    paidAt: string | null;
    agreedRemainingDate: string | null;
    status: string;
    method: string | null;
    note: string | null;
    taxInvoiceStatus: string;
    taxInvoiceNo: string | null;
    distributions: Array<{
      id: string;
      recipientType: string;
      partnerBrokerId: string | null;
      partnerBrokerName: string | null;
      shareRatio: number;
      shareAmount: number;
      status: string;
    }>;
    pendingAdjustments: number;
  }>;
}

export type LedgerPreset = 'upcoming' | 'this-month' | 'month' | 'all';

export interface LedgerView {
  preset: LedgerPreset;
  period: string; // "upcoming" / "2026-04" / "all"
  periodLabel: string;
  summary: {
    paymentCount: number;
    billedTotal: number;
    average: number;
    collectedTotal: number;
    collectedCount: number;
    overdueCount: number;
    partialCount: number;
  };
  adjustmentsPending: Array<{
    id: string;
    code: string | null;
    type: string;
    amount: number;
    paymentCode: string | null;
    dealId: string;
    reason: string;
  }>;
  groups: LedgerDealGroup[];
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getLedger(
    officeId: string,
    params: {
      preset: LedgerPreset;
      year?: number;
      month?: number;
    },
  ): Promise<LedgerView> {
    const { preset } = params;

    // preset 별 CommissionPayment 필터 조건 결정
    // - 'upcoming': dueDate >= 오늘 OR 미완료 상태 OR 최근 30일 내 수금 완료
    // - 'month':    dueDate 또는 paidAt 이 해당 월 내
    // - 'all':      전체
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

    const year = params.year ?? today.getFullYear();
    const month = params.month ?? today.getMonth() + 1;
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // 이번 달 범위 (현재 시점 기준 캘린더 월)
    const nowYear = today.getFullYear();
    const nowMonth = today.getMonth();
    const startOfThisMonth = new Date(nowYear, nowMonth, 1);
    const endOfThisMonth = new Date(nowYear, nowMonth + 1, 0, 23, 59, 59, 999);

    // 원장은 draft(협상 단계 선생성 시뮬레이션) payment 는 제외
    //
    // - upcoming: 앞으로 받을 것 + 이미 연체 (시간 무관 미완료 전부 + 최근 30일 수금)
    // - this-month: 이번 달 진행 페이스 — 이번 달 dueDate/paidAt + 이월된 연체/미수
    // - month: 특정 월 스냅샷 — 해당 월 내 활동만 (감사 용도, 이월 연체 미포함)
    // - all: draft 외 전체
    const presetWhere: Prisma.CommissionPaymentWhereInput =
      preset === 'upcoming'
        ? {
            OR: [
              { status: { in: ['pending', 'partial', 'overdue'] } },
              {
                status: { in: ['collected', 'partial'] },
                paidAt: { gte: thirtyDaysAgo },
              },
            ],
          }
        : preset === 'this-month'
          ? {
              OR: [
                { dueDate: { gte: startOfThisMonth, lte: endOfThisMonth } },
                { paidAt: { gte: startOfThisMonth, lte: endOfThisMonth } },
                // 이월된 연체/미수 — 이번 달에 해결해야 할 과거 잔여
                { status: { in: ['overdue', 'partial', 'pending'] } },
              ],
            }
          : preset === 'month'
            ? {
                OR: [
                  { dueDate: { gte: startOfMonth, lte: endOfMonth } },
                  { paidAt: { gte: startOfMonth, lte: endOfMonth } },
                  // fallback: 해당 월에 생성된 것
                  {
                    createdAt: { gte: startOfMonth, lte: endOfMonth },
                    dueDate: null,
                    paidAt: null,
                  },
                ],
              }
            : {}; // all

    const paymentWhere: Prisma.CommissionPaymentWhereInput = {
      AND: [{ status: { not: 'draft' } }, presetWhere],
    };

    // 1) 해당 범위에 포함되는 CommissionPayment 들이 속한 dealId 수집
    const payments = await this.prisma.commissionPayment.findMany({
      where: { officeId, ...paymentWhere },
      select: { dealId: true },
    });
    const dealIds = Array.from(new Set(payments.map((p) => p.dealId)));

    if (dealIds.length === 0) {
      return {
        preset,
        period:
          preset === 'upcoming'
            ? 'upcoming'
            : preset === 'all'
              ? 'all'
              : preset === 'this-month'
                ? `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}`
                : `${year}-${String(month).padStart(2, '0')}`,
        periodLabel: this.buildPeriodLabel(preset, year, month),
        summary: {
          paymentCount: 0,
          billedTotal: 0,
          average: 0,
          collectedTotal: 0,
          collectedCount: 0,
          overdueCount: 0,
          partialCount: 0,
        },
        adjustmentsPending: await this.fetchAdjustmentsPending(officeId),
        groups: [],
      };
    }

    // 2) 해당 Deal 들을 상세 조회, payment 는 동일 필터 재적용
    // payment.status != 'draft' 필터로 이미 계약 이전 단계 payment 는 제외됨
    const deals = await this.prisma.deal.findMany({
      where: {
        id: { in: dealIds },
        officeId,
        isCancelled: false,
      },
      include: {
        listing: {
          select: {
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
        partnerBroker: { select: { id: true, name: true } },
        payments: {
          where: { kind: 'balance' },
          orderBy: { sequence: 'asc' },
          take: 1,
        },
        participants: {
          include: { user: { select: { name: true } } },
        },
        commissionPayments: {
          where: paymentWhere,
          include: {
            distributions: {
              include: {
                partnerBroker: { select: { id: true, name: true } },
              },
            },
            adjustments: { where: { status: 'requested' } },
          },
          orderBy: [{ clientSide: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ stageChangedAt: 'desc' }, { createdAt: 'desc' }],
    });

    let paymentCount = 0;
    let billedTotal = 0;
    let collectedTotal = 0;
    let collectedCount = 0;
    let overdueCount = 0;
    let partialCount = 0;

    const now = new Date();

    const groups: LedgerDealGroup[] = deals
      .filter((d) => d.commissionPayments.length > 0)
      .map((d) => {
        const summary = computeDealCommissionSummary(
          d.commissionPayments.map((p) => ({
            expectedAmount: p.expectedAmount,
            actualAmount: p.actualAmount,
            status: p.status,
            distributions: (p.distributions ?? []).map((dist) => ({
              recipientType: dist.recipientType,
              shareRatio: dist.shareRatio.toString(),
              shareAmount: dist.shareAmount,
            })),
          })),
        );

        const prop = d.listing?.property ?? null;
        const balancePayment = d.payments[0] ?? null;

        for (const p of d.commissionPayments) {
          if (p.status === 'waived' || p.status === 'cancelled') continue;
          paymentCount++;
          billedTotal += p.expectedAmount;
          if (p.status === 'collected') {
            collectedCount++;
            collectedTotal += p.actualAmount ?? p.expectedAmount;
          }
          if (p.status === 'partial') {
            partialCount++;
            collectedTotal += p.actualAmount ?? 0;
          }
          if (
            p.status === 'overdue' ||
            (p.status === 'pending' && p.dueDate && p.dueDate < now)
          ) {
            overdueCount++;
          }
        }

        return {
          deal: {
            id: d.id,
            transactionType: d.transactionType,
            stage: d.stage,
            stageChangedAt: d.stageChangedAt.toISOString(),
            isCancelled: d.isCancelled,
            agreedPrice: d.agreedPrice,
            agreedDeposit: d.agreedDeposit,
            agreedMonthlyRent: d.agreedMonthlyRent,
            balanceDueDate: balancePayment?.scheduledDate?.toISOString() ?? null,
            siteName: prop?.site.name ?? null,
            dongName: prop?.unit?.dong?.name ?? null,
            unitName: prop?.unit?.name ?? null,
            buyerContactName: d.buyerContact?.name ?? null,
            sellerContactName: d.sellerContact?.name ?? null,
            partnerBroker: d.partnerBroker
              ? { id: d.partnerBroker.id, name: d.partnerBroker.name }
              : null,
            summary,
            participants: d.participants.map((dp) => ({
              id: dp.id,
              userName: dp.user.name,
              role: dp.role,
            })),
          },
          payments: d.commissionPayments.map((p) => ({
            id: p.id,
            code: p.code,
            clientSide: p.clientSide,
            collectedByOffice: p.collectedByOffice,
            baseAmount: p.baseAmount,
            rate: p.rate ? Number(p.rate) : null,
            expectedAmount: p.expectedAmount,
            actualAmount: p.actualAmount,
            dueDate: p.dueDate?.toISOString() ?? null,
            paidAt: p.paidAt?.toISOString() ?? null,
            agreedRemainingDate: p.agreedRemainingDate?.toISOString() ?? null,
            status: p.status,
            method: p.method,
            note: p.note,
            taxInvoiceStatus: p.taxInvoiceStatus,
            taxInvoiceNo: p.taxInvoiceNo,
            distributions: (p.distributions ?? []).map((dist) => ({
              id: dist.id,
              recipientType: dist.recipientType,
              partnerBrokerId: dist.partnerBrokerId,
              partnerBrokerName: dist.partnerBroker?.name ?? null,
              shareRatio: Number(dist.shareRatio),
              shareAmount: dist.shareAmount,
              status: dist.status,
            })),
            pendingAdjustments: p.adjustments?.length ?? 0,
          })),
        };
      });

    return {
      preset,
      period:
        preset === 'upcoming'
          ? 'upcoming'
          : preset === 'all'
            ? 'all'
            : preset === 'this-month'
              ? `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}`
              : `${year}-${String(month).padStart(2, '0')}`,
      periodLabel: this.buildPeriodLabel(preset, year, month),
      summary: {
        paymentCount,
        billedTotal,
        average: paymentCount > 0 ? Math.round(billedTotal / paymentCount) : 0,
        collectedTotal,
        collectedCount,
        overdueCount,
        partialCount,
      },
      adjustmentsPending: await this.fetchAdjustmentsPending(officeId),
      groups,
    };
  }

  private async fetchAdjustmentsPending(officeId: string) {
    const rows = await this.prisma.commissionAdjustment.findMany({
      where: { officeId, status: 'requested' },
      include: { payment: { select: { code: true, dealId: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      type: a.type,
      amount: a.amount,
      paymentCode: a.payment?.code ?? null,
      dealId: a.payment?.dealId ?? '',
      reason: a.reason,
    }));
  }

  private buildPeriodLabel(
    preset: LedgerPreset,
    year: number,
    month: number,
  ): string {
    if (preset === 'upcoming') return '오늘부터 전체';
    if (preset === 'all') return '전체 기간';
    if (preset === 'this-month') {
      const now = new Date();
      return `${now.getFullYear()}년 ${now.getMonth() + 1}월 진행 (이월 연체 포함)`;
    }
    return `${year}년 ${month}월`;
  }
}
