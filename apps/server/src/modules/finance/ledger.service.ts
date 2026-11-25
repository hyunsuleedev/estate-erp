import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeDealCommissionSummary, formatPlaceLabel, formatUnitName } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { monthRange } from './settlement-calc';
import { loadOurCollections } from './our-collections';

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
    /** "고덕그라시움 102동 2203호" */
    placeLabel: string | null;
    /** "102동 2203호" (단지가 문맥에 있을 때) */
    placeShort: string | null;
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
    taxInvoiceDate: string | null;
    /** 입금 기록 합계 (원). 취소한 기록은 빼고 돌려준 돈은 뺀 값. */
    receivedAmountWon: number;
    /** 위 금액에서 부가세를 뺀 값 (원). 청구액과 비교하는 기준. */
    receivedSupplyWon: number;
    /** 입금 기록 (취소한 것은 뺌, 오래된 것부터). 상대가 수금한 청구는 상대 통장에 들어온 돈이다. */
    receipts: Array<{
      id: string;
      kind: string;
      receivedAt: string;
      amountWon: number;
      supplyWon: number;
    }>;
    /**
     * 우리 통장에 들어온 돈 (loadOurCollections): 우리가 수금한 청구의 입금 기록 +
     * 상대가 수금한 청구에서 받은 우리 몫. 캘린더의 입금과 원장·캐시플로우의 수금 합계가 이것으로 센다.
     */
    collections: Array<{ id: string; kind: 'receipt' | 'refund' | 'partner_share'; at: string; won: number }>;
    /** 위 합계 (원, 부가세 뺀 금액) */
    ourCollectedWon: number;
    distributions: Array<{
      id: string;
      recipientType: string;
      partnerBrokerId: string | null;
      partnerBrokerName: string | null;
      shareRatio: number;
      shareAmount: number;
      status: string;
      settledAt: string | null;
      settlementMemo: string | null;
    }>;
    pendingAdjustments: number;
  }>;
}

export type LedgerPreset = 'upcoming' | 'this-month' | 'month' | 'all';

export interface LedgerView {
  /** 사무소에 확정된 청구(작성 중 제외)가 하나라도 있는지. 빈 화면에서 '아직 없음'과 '이 기간에 없음'을 나눈다. */
  hasAnyPayment: boolean;
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
    paymentId: string;
    paymentCode: string | null;
    dealId: string;
    reason: string;
    requestedByName: string | null;
    requestedAt: string;
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
    // 달의 경계는 한국 시각으로 센다. 서버 시간대(UTC)로 세면 1일 00:00~09:00에 받은 돈이 앞 달로 간다.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [kstYear, kstMonth] = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7)
      .split('-')
      .map(Number);

    const validMonth = (m: number | undefined) => m !== undefined && Number.isInteger(m) && m >= 1 && m <= 12;
    const validYear = (y: number | undefined) => y !== undefined && Number.isInteger(y) && y >= 2000 && y <= 2100;
    const year = validYear(params.year) ? (params.year as number) : kstYear;
    const month = validMonth(params.month) ? (params.month as number) : kstMonth;
    const range = monthRange(`${year}-${String(month).padStart(2, '0')}`);
    const startOfMonth = range.start;
    const endOfMonth = new Date(range.end.getTime() - 1);

    // 이번 달 범위 (한국 시각 기준 캘린더 월)
    const nowYear = kstYear;
    const nowMonth = kstMonth - 1;
    const thisRange = monthRange(`${kstYear}-${String(kstMonth).padStart(2, '0')}`);
    const startOfThisMonth = thisRange.start;
    const endOfThisMonth = new Date(thisRange.end.getTime() - 1);

    // 원장은 draft(계약 준비 단계 선생성) payment 는 제외
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

    // 빈 화면 안내용: 기간과 상관없이 확정된 청구가 있는지 (취소한 거래 제외)
    const hasAnyPayment =
      dealIds.length > 0 ||
      (await this.prisma.commissionPayment.count({
        where: { officeId, status: { not: 'draft' } },
        take: 1,
      })) > 0;

    if (dealIds.length === 0) {
      return {
        hasAnyPayment,
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
        // 취소한 거래도 우리 통장에 들어온 돈이 있으면 보인다 (캐시플로우 수금과 같은 통장 기준).
        // 화면은 그 청구를 받을 돈·연체로 세지 않는다.
        OR: [
          { isCancelled: false },
          {
            commissionPayments: {
              some: {
                OR: [
                  { collectedByOffice: 'us', receipts: { some: { voidedAt: null } } },
                  { distributions: { some: { recipientType: 'our_office', status: 'settled' } } },
                ],
              },
            },
          },
        ],
      },
      include: {
        listing: {
          select: {
            property: {
              select: {
                site: { select: { name: true } },
                unit: {
                  select: {
                    name: true, floor: true, floorEnd: true, floorLabel: true,
                    dong: { select: { name: true, isPlaceholder: true } },
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

    // 청구마다 입금 기록 (원). 화면이 남은 금액을 원 단위로 세고, 캘린더가 받은 날마다 금액을 놓게 함께 내린다.
    const receiptRows = await this.prisma.commissionReceipt.findMany({
      where: {
        officeId,
        voidedAt: null,
        paymentId: { in: deals.flatMap((d) => d.commissionPayments.map((p) => p.id)) },
      },
      select: { id: true, paymentId: true, kind: true, receivedAt: true, amountWon: true, supplyWon: true },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const receivedOf = new Map<
      string,
      { amountWon: number; supplyWon: number; rows: LedgerDealGroup['payments'][number]['receipts'] }
    >();
    for (const row of receiptRows) {
      const entry = receivedOf.get(row.paymentId) ?? { amountWon: 0, supplyWon: 0, rows: [] };
      entry.amountWon += row.amountWon;
      entry.supplyWon += row.supplyWon;
      entry.rows.push({
        id: row.id,
        kind: row.kind,
        receivedAt: row.receivedAt.toISOString(),
        amountWon: row.amountWon,
        supplyWon: row.supplyWon,
      });
      receivedOf.set(row.paymentId, entry);
    }

    // 우리 통장에 들어온 돈 (캐시플로우 수금과 같은 함수). 원장의 수금 합계·캘린더의 입금이 이것으로 센다.
    const ourCollections = await loadOurCollections(this.prisma, officeId, {
      paymentIds: deals.flatMap((d) => d.commissionPayments.map((p) => p.id)),
    });
    const ourOf = new Map<string, LedgerDealGroup['payments'][number]['collections']>();
    for (const c of ourCollections) {
      const list = ourOf.get(c.paymentId) ?? [];
      list.push({ id: c.id, kind: c.kind, at: c.at.toISOString(), won: c.won });
      ourOf.set(c.paymentId, list);
    }
    let collectedWonTotal = 0;
    const collectedRange =
      preset === 'month'
        ? { start: startOfMonth, end: new Date(endOfMonth.getTime() + 1) }
        : preset === 'this-month'
          ? { start: startOfThisMonth, end: new Date(endOfThisMonth.getTime() + 1) }
          : null;

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
          // 원장의 수금 합계: '월'·'이번 달' 보기는 그 달에 받은 돈만 (캐시플로우 월 수금과 같은 범위)
          collectedWonTotal += (ourOf.get(p.id) ?? [])
            .filter(
              (c) =>
                !collectedRange ||
                (new Date(c.at) >= collectedRange.start && new Date(c.at) < collectedRange.end),
            )
            .reduce((sum, c) => sum + c.won, 0);
          if (p.status === 'waived' || p.status === 'cancelled') continue;
          paymentCount++;
          billedTotal += p.expectedAmount;
          if (p.status === 'collected') collectedCount++;
          if (p.status === 'partial') partialCount++;
          // 공동중개 상대가 수금하는 청구는 우리 연체로 세지 않는다
          if (
            p.collectedByOffice !== 'partner' &&
            (p.status === 'overdue' || (p.status === 'pending' && p.dueDate && p.dueDate < now))
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
            // 이름 없는 공간(상가 2층 등)은 층으로 적는다
            unitName: prop?.unit ? formatUnitName(prop.unit) || null : null,
            // 화면 공통 표기 "고덕그라시움 102동 2203호" (STANDARDS 주소·호수). 단지가 문맥에 있으면 placeShort.
            placeLabel:
              formatPlaceLabel({
                siteName: prop?.site.name,
                dongName: prop?.unit?.dong?.name,
                dongIsPlaceholder: prop?.unit?.dong?.isPlaceholder,
                unit: prop?.unit,
              }) || null,
            placeShort:
              formatPlaceLabel({
                dongName: prop?.unit?.dong?.name,
                dongIsPlaceholder: prop?.unit?.dong?.isPlaceholder,
                unit: prop?.unit,
              }) || null,
            buyerContactName: d.buyerContact?.name ?? null,
            sellerContactName: d.sellerContact?.name ?? null,
            partnerBroker: d.partnerBroker
              ? { id: d.partnerBroker.id, name: d.partnerBroker.name }
              : null,
            summary,
            // 담당은 맡은 비중이 있는 사람이다(직원 정산 대상, 거래 화면과 같은 기준). 담당을 바꾸면 전 담당은
            // 비중 없이 남는데, 예전에는 그 사람까지 담당자로 보였다. 비중이 하나도 없던 옛 거래는 배정된 사람을 보인다.
            participants: (d.participants.some((dp) => dp.sharePercent != null)
              ? d.participants.filter((dp) => dp.sharePercent != null)
              : d.participants
            ).map((dp) => ({
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
            taxInvoiceDate: p.taxInvoiceDate?.toISOString() ?? null,
            receivedAmountWon: receivedOf.get(p.id)?.amountWon ?? 0,
            receivedSupplyWon: receivedOf.get(p.id)?.supplyWon ?? 0,
            receipts: receivedOf.get(p.id)?.rows ?? [],
            collections: ourOf.get(p.id) ?? [],
            ourCollectedWon: (ourOf.get(p.id) ?? []).reduce((sum, c) => sum + c.won, 0),
            distributions: (p.distributions ?? []).map((dist) => ({
              id: dist.id,
              recipientType: dist.recipientType,
              partnerBrokerId: dist.partnerBrokerId,
              partnerBrokerName: dist.partnerBroker?.name ?? null,
              shareRatio: Number(dist.shareRatio),
              shareAmount: dist.shareAmount,
              status: dist.status,
              settledAt: dist.settledAt?.toISOString() ?? null,
              settlementMemo: dist.settlementMemo,
            })),
            pendingAdjustments: p.adjustments?.length ?? 0,
          })),
        };
      });

    return {
      hasAnyPayment,
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
        // 우리 통장에 들어온 돈 (만원). 면제·취소 청구에 받은 돈도 넣는다.
        collectedTotal: Math.round(collectedWonTotal / 10_000),
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
      include: {
        payment: { select: { code: true, dealId: true } },
        requestedBy: { select: { name: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      type: a.type,
      amount: a.amount,
      paymentId: a.paymentId,
      paymentCode: a.payment?.code ?? null,
      dealId: a.payment?.dealId ?? '',
      reason: a.reason,
      requestedByName: a.requestedBy?.name ?? null,
      requestedAt: a.requestedAt.toISOString(),
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
      const [y, m] = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7).split('-');
      return `${y}년 ${Number(m)}월 진행 (이월 연체 포함)`;
    }
    return `${year}년 ${month}월`;
  }
}
