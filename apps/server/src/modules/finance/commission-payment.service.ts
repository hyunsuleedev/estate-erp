import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { contactPhonesSelectOrdered } from '../contacts/contact-phone.utils';

export interface DistributionInput {
  recipientType: 'our_office' | 'partner_broker';
  partnerBrokerId?: string | null;
  shareRatio: number;
}

const EDITABLE_PAYMENT_STATUSES = new Set([
  'draft',
  'pending',
  'partial',
  'overdue',
]);

@Injectable()
export class CommissionPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async listByDeal(officeId: string, dealId: string) {
    return this.prisma.commissionPayment.findMany({
      where: { officeId, dealId },
      include: {
        payerContact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
        distributions: {
          include: {
            partnerBroker: { select: { id: true, name: true } },
          },
        },
        adjustments: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listByOffice(officeId: string, filters: { status?: string }) {
    return this.prisma.commissionPayment.findMany({
      where: {
        officeId,
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: {
        deal: {
          select: {
            id: true,
            stage: true,
            agreedPrice: true,
            agreedDeposit: true,
            agreedMonthlyRent: true,
            transactionType: true,
            listing: {
              select: {
                id: true,
                transactionType: true,
                property: {
                  select: {
                    id: true,
                    site: { select: { name: true } },
                    unit: { select: { name: true, floor: true, floorEnd: true, floorLabel: true, dong: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
        payerContact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * 수금 처리. 화면은 지금까지 받은 누적액(만원, 부가세를 뺀 금액)을 보낸다.
   * 예전에는 그 값으로 청구의 받은 금액·입금일을 덮어써서 앞선 입금의 날짜가 사라졌다.
   * 이제는 늘어난 만큼을 입금 기록 한 줄로 쌓고, 청구의 받은 금액·입금일·상태는 기록에서 다시 계산한다.
   */
  async collect(
    id: string,
    officeId: string,
    userId: string | null,
    data: {
      actualAmount: number;
      method: string;
      paidAt?: string;
      note?: string;
    },
  ) {
    if (!Number.isInteger(data.actualAmount) || data.actualAmount <= 0) {
      throw new BadRequestException('받은 금액은 0보다 큰 정수(만원)여야 합니다.');
    }
    const receivedAt = parseMoneyDate(data.paidAt);
    return this.prisma.$transaction(async (tx) => {
      const payment = await lockPayment(tx, id, officeId);
      const before = await sumReceipts(tx, id);
      const delta = data.actualAmount * WON_PER_MANWON - before.supplyWon;
      if (delta <= 0) {
        throw new ConflictException(
          '이미 그만큼 받은 것으로 적혀 있습니다. 줄이려면 입금 기록을 취소해 주세요.',
        );
      }
      await this.appendReceipt(tx, payment, {
        supplyWon: delta,
        amountWon: withVat(delta),
        receivedAt,
        method: data.method,
        memo: data.note,
        userId,
      });
      return refreshPaymentFromReceipts(tx, id);
    });
  }

  /** 이 청구의 입금 기록 (취소한 줄 포함, 오래된 것부터) */
  async listReceipts(officeId: string, paymentId: string) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id: paymentId, officeId },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException();
    return this.prisma.commissionReceipt.findMany({
      where: { officeId, paymentId },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 입금 한 건을 원 단위(부가세 포함)로 기록한다. */
  async addReceipt(
    paymentId: string,
    officeId: string,
    userId: string | null,
    data: { amountWon: number; receivedAt?: string; method?: string; memo?: string },
  ) {
    if (!Number.isInteger(data.amountWon) || data.amountWon <= 0) {
      throw new BadRequestException('받은 금액은 0보다 큰 정수(원)여야 합니다.');
    }
    const receivedAt = parseMoneyDate(data.receivedAt);
    return this.prisma.$transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId, officeId);
      await this.appendReceipt(tx, payment, {
        supplyWon: withoutVat(data.amountWon),
        amountWon: data.amountWon,
        receivedAt,
        method: data.method,
        memo: data.memo,
        userId,
      });
      return refreshPaymentFromReceipts(tx, paymentId);
    });
  }

  /**
   * 돌려준 돈을 기록한다. 지난 입금 기록은 그대로 두고 음수 줄을 하나 더한다.
   * 이미 정산한 돈을 돌려준 경우 이 줄이 다음 정산에서 직원 몫을 깎는다.
   */
  async refund(
    paymentId: string,
    officeId: string,
    userId: string | null,
    data: { amountWon: number; refundedAt?: string; memo?: string },
  ) {
    if (!Number.isInteger(data.amountWon) || data.amountWon <= 0) {
      throw new BadRequestException('돌려준 금액은 0보다 큰 정수(원)여야 합니다.');
    }
    const receivedAt = parseMoneyDate(data.refundedAt);
    return this.prisma.$transaction(async (tx) => {
      await lockPayment(tx, paymentId, officeId, { anyStatus: true });
      const before = await sumReceipts(tx, paymentId);
      if (data.amountWon > before.amountWon) {
        throw new ConflictException('받은 돈보다 많이 돌려줄 수 없습니다.');
      }
      await tx.commissionReceipt.create({
        data: {
          officeId,
          paymentId,
          kind: 'refund',
          receivedAt,
          amountWon: -data.amountWon,
          // 전부 돌려주면 남는 금액이 정확히 0이 되게 한다 (반올림 차이를 남기지 않는다)
          supplyWon: -(data.amountWon === before.amountWon ? before.supplyWon : withoutVat(data.amountWon)),
          memo: data.memo,
          createdById: userId,
        },
      });
      return refreshPaymentFromReceipts(tx, paymentId);
    });
  }

  /** 잘못 넣은 입금 기록을 취소한다. 정산에 들어간 줄은 취소할 수 없다. */
  async voidReceipt(
    receiptId: string,
    officeId: string,
    userId: string | null,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.commissionReceipt.findFirst({ where: { id: receiptId, officeId } });
      if (!receipt) throw new NotFoundException();
      await lockPayment(tx, receipt.paymentId, officeId, { anyStatus: true });
      const { count } = await tx.commissionReceipt.updateMany({
        where: { id: receiptId, officeId, voidedAt: null, settlementId: null },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: reason?.trim() || null },
      });
      if (count === 0) {
        throw new ConflictException(
          receipt.settlementId
            ? '이미 정산에 들어간 입금은 취소할 수 없습니다. 돌려준 돈으로 기록해 주세요.'
            : '이미 취소한 입금입니다.',
        );
      }
      const after = await sumReceipts(tx, receipt.paymentId);
      if (after.amountWon < 0) {
        throw new ConflictException('이 입금을 취소하면 돌려준 돈이 받은 돈보다 많아집니다.');
      }
      return refreshPaymentFromReceipts(tx, receipt.paymentId);
    });
  }

  private async appendReceipt(
    tx: Prisma.TransactionClient,
    payment: LockedPayment,
    input: {
      supplyWon: number;
      amountWon: number;
      receivedAt: Date;
      method?: string;
      memo?: string;
      userId: string | null;
    },
  ) {
    const before = await sumReceipts(tx, payment.id);
    const limit = payment.expectedAmount * WON_PER_MANWON;
    if (before.supplyWon + input.supplyWon > limit) {
      throw new ConflictException(
        `남은 금액보다 많습니다. 더 받을 수 있는 금액은 부가세를 빼고 ${(limit - before.supplyWon).toLocaleString('ko-KR')}원입니다.`,
      );
    }
    await tx.commissionReceipt.create({
      data: {
        officeId: payment.officeId,
        paymentId: payment.id,
        kind: 'receipt',
        receivedAt: input.receivedAt,
        amountWon: input.amountWon,
        supplyWon: input.supplyWon,
        method: input.method?.trim() || null,
        memo: input.memo?.trim() || null,
        createdById: input.userId,
      },
    });
  }

  async waive(id: string, officeId: string, note?: string) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
    });
    if (!payment) throw new NotFoundException();

    return this.prisma.commissionPayment.update({
      where: { id },
      data: { status: 'waived', note },
    });
  }

  /**
   * draft payment 를 pending 으로 확정. Deal.contracted 자동 전이와 별개로
   * 담당자가 개별 청구를 먼저 확정하고 싶을 때 사용.
   */
  async confirmDraft(
    id: string,
    officeId: string,
    data: { dueDate?: string },
  ) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
    });
    if (!payment) throw new NotFoundException();
    if (payment.status !== 'draft') {
      throw new ConflictException(
        `draft 상태가 아닌 청구 (${payment.status}) 는 확정할 수 없습니다.`,
      );
    }
    return this.prisma.commissionPayment.update({
      where: { id },
      data: {
        status: 'pending',
        ...(data.dueDate ? { dueDate: new Date(data.dueDate) } : {}),
      },
    });
  }

  async issueTaxInvoice(
    id: string,
    officeId: string,
    data: { taxInvoiceNo: string; taxInvoiceDate?: string },
  ) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
    });
    if (!payment) throw new NotFoundException();

    return this.prisma.commissionPayment.update({
      where: { id },
      data: {
        taxInvoiceStatus: 'issued',
        taxInvoiceNo: data.taxInvoiceNo,
        taxInvoiceDate: data.taxInvoiceDate
          ? new Date(data.taxInvoiceDate)
          : new Date(),
      },
    });
  }

  /**
   * 개별 Payment 의 분배율을 교체한다.
   * - shareRatio 합계 100 검증
   * - payment.status ∈ (pending, partial, overdue) 만 허용
   * - 이미 settled 된 distribution 이 있으면 거부
   * - shareAmount 재계산: floor(expected × ratio / 100), 잔여 원(1원 단위)은 our_office 에 가산
   */
  async replaceDistributions(
    id: string,
    officeId: string,
    items: DistributionInput[],
  ) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
      include: { distributions: true },
    });
    if (!payment) throw new NotFoundException();
    if (!EDITABLE_PAYMENT_STATUSES.has(payment.status)) {
      throw new ConflictException(
        `수금이 ${payment.status} 상태라 분배를 수정할 수 없습니다.`,
      );
    }
    if (payment.distributions.some((d) => d.status === 'settled')) {
      throw new ConflictException(
        '이미 정산 완료된 분배가 있어 수정할 수 없습니다.',
      );
    }

    const rows = this.computeDistributionRows(payment.expectedAmount, items);

    await this.prisma.$transaction(async (tx) => {
      await tx.commissionDistribution.deleteMany({ where: { paymentId: id } });
      await tx.commissionDistribution.createMany({
        data: rows.map((r) => ({
          officeId,
          paymentId: id,
          recipientType: r.recipientType,
          partnerBrokerId: r.partnerBrokerId,
          shareRatio: new Prisma.Decimal(r.shareRatio),
          shareAmount: r.shareAmount,
          status: 'pending',
        })),
      });
    });

    return this.findWithRelations(id, officeId);
  }

  /**
   * Deal 내 편집 가능한 모든 Payment 에 동일 분배율을 일괄 적용한다.
   * - 편집 가능 = EDITABLE_PAYMENT_STATUSES 이면서 settled distribution 없음
   * - 적용 대상 없으면 빈 결과 반환 (예외 아님)
   */
  async applyDistributionsToDeal(
    dealId: string,
    officeId: string,
    items: DistributionInput[],
  ): Promise<{
    updated: string[];
    skipped: Array<{ id: string; reason: string }>;
  }> {
    this.validateRatioSum(items);

    const payments = await this.prisma.commissionPayment.findMany({
      where: { officeId, dealId },
      include: { distributions: true },
    });
    if (payments.length === 0) {
      throw new NotFoundException('거래에 연결된 수수료 청구가 없습니다.');
    }

    const updated: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        if (!EDITABLE_PAYMENT_STATUSES.has(payment.status)) {
          skipped.push({
            id: payment.id,
            reason: `status=${payment.status}`,
          });
          continue;
        }
        if (payment.distributions.some((d) => d.status === 'settled')) {
          skipped.push({ id: payment.id, reason: 'has_settled_distribution' });
          continue;
        }

        const rows = this.computeDistributionRows(
          payment.expectedAmount,
          items,
        );

        await tx.commissionDistribution.deleteMany({
          where: { paymentId: payment.id },
        });
        await tx.commissionDistribution.createMany({
          data: rows.map((r) => ({
            officeId,
            paymentId: payment.id,
            recipientType: r.recipientType,
            partnerBrokerId: r.partnerBrokerId,
            shareRatio: new Prisma.Decimal(r.shareRatio),
            shareAmount: r.shareAmount,
            status: 'pending',
          })),
        });
        updated.push(payment.id);
      }
    });

    return { updated, skipped };
  }

  // ─────────────────────────────────────────────

  private validateRatioSum(items: DistributionInput[]) {
    if (items.length === 0) {
      throw new BadRequestException('분배 항목이 비어 있습니다.');
    }
    for (const item of items) {
      if (item.shareRatio < 0 || item.shareRatio > 100) {
        throw new BadRequestException(
          '분배율은 0 이상 100 이하여야 합니다.',
        );
      }
      if (
        item.recipientType === 'partner_broker' &&
        !item.partnerBrokerId
      ) {
        throw new BadRequestException(
          '파트너 중개 분배는 partnerBrokerId 가 필요합니다.',
        );
      }
    }
    const sum = items.reduce((acc, it) => acc + it.shareRatio, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new BadRequestException(
        `분배율 합계가 100이 아닙니다 (현재 ${sum}%).`,
      );
    }
  }

  /**
   * shareRatio × expectedAmount / 100 을 floor 로 계산한 뒤,
   * 합계가 expectedAmount 가 되도록 잔여 원 단위를 our_office 에 가산.
   * our_office 가 없으면 첫 row 에 가산.
   */
  private computeDistributionRows(
    expectedAmount: number,
    items: DistributionInput[],
  ): Array<{
    recipientType: 'our_office' | 'partner_broker';
    partnerBrokerId: string | null;
    shareRatio: number;
    shareAmount: number;
  }> {
    this.validateRatioSum(items);

    const rows = items.map((it) => ({
      recipientType: it.recipientType,
      partnerBrokerId:
        it.recipientType === 'partner_broker'
          ? (it.partnerBrokerId ?? null)
          : null,
      shareRatio: it.shareRatio,
      shareAmount: Math.floor((expectedAmount * it.shareRatio) / 100),
    }));
    const total = rows.reduce((acc, r) => acc + r.shareAmount, 0);
    const remainder = expectedAmount - total;
    if (remainder !== 0) {
      const ourIdx = rows.findIndex((r) => r.recipientType === 'our_office');
      const target = ourIdx >= 0 ? ourIdx : 0;
      rows[target].shareAmount += remainder;
    }
    return rows;
  }

  private findWithRelations(id: string, officeId: string) {
    return this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
      include: {
        payerContact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
        distributions: {
          include: {
            partnerBroker: { select: { id: true, name: true } },
          },
        },
        adjustments: true,
      },
    });
  }
}

/* ───────── 입금 기록에서 청구의 받은 금액을 다시 계산한다 ───────── */

export const WON_PER_MANWON = 10_000;
/** 부가세 10%. 직원과 나누는 금액은 항상 부가세를 뺀 금액이다. */
const withVat = (supplyWon: number) => Math.round(supplyWon * 1.1);
const withoutVat = (amountWon: number) => Math.round(amountWon / 1.1);

/** 돈을 받을 수 있는 청구 상태 */
const COLLECTABLE_STATUSES = new Set(['pending', 'partial', 'overdue', 'collected']);

export interface LockedPayment {
  id: string;
  officeId: string;
  status: string;
  expectedAmount: number;
}

function parseMoneyDate(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new BadRequestException('날짜 형식이 올바르지 않습니다.');
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new BadRequestException('앞날의 날짜로는 기록할 수 없습니다.');
  }
  return date;
}

/**
 * 청구 줄을 잠근다. 같은 청구에 동시에 들어온 수금·취소가 서로의 합계를 모른 채 쓰는 일을 막는다.
 * 트랜잭션 안에서만 뜻이 있다.
 */
export async function lockPayment(
  tx: Prisma.TransactionClient,
  id: string,
  officeId: string,
  options: { anyStatus?: boolean } = {},
): Promise<LockedPayment> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; office_id: string; status: string; expected_amount: number }>
  >`SELECT id, office_id, status, expected_amount FROM commission_payments WHERE id = ${id}::uuid AND office_id = ${officeId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new NotFoundException();
  if (!options.anyStatus && !COLLECTABLE_STATUSES.has(row.status)) {
    throw new ConflictException(`이 상태(${row.status})의 청구에는 입금을 기록할 수 없습니다.`);
  }
  return { id: row.id, officeId: row.office_id, status: row.status, expectedAmount: row.expected_amount };
}

export async function sumReceipts(tx: Prisma.TransactionClient, paymentId: string) {
  const sum = await tx.commissionReceipt.aggregate({
    where: { paymentId, voidedAt: null },
    _sum: { amountWon: true, supplyWon: true },
  });
  return { amountWon: sum._sum.amountWon ?? 0, supplyWon: sum._sum.supplyWon ?? 0 };
}

/**
 * 청구의 받은 금액(만원)·입금일·받은 방법·상태를 입금 기록에서 다시 채운다.
 * 이 네 칸은 예전 화면이 읽는 값이라 남겨 두었고, 이제는 사람이 직접 고치지 않는다.
 * 면제·취소·작성중인 청구의 상태는 건드리지 않는다.
 */
export async function refreshPaymentFromReceipts(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.commissionPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const sum = await sumReceipts(tx, paymentId);
  const latest = await tx.commissionReceipt.findFirst({
    where: { paymentId, voidedAt: null, kind: 'receipt' },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
  });
  let status = payment.status;
  if (COLLECTABLE_STATUSES.has(payment.status)) {
    if (sum.supplyWon >= payment.expectedAmount * WON_PER_MANWON) status = 'collected';
    else if (sum.supplyWon > 0) status = 'partial';
    else status = 'pending';
  }
  return tx.commissionPayment.update({
    where: { id: paymentId },
    data: {
      actualAmount: sum.supplyWon > 0 ? Math.round(sum.supplyWon / WON_PER_MANWON) : null,
      paidAt: sum.supplyWon > 0 ? (latest?.receivedAt ?? payment.paidAt) : null,
      method: latest?.method ?? payment.method,
      status,
    },
  });
}
