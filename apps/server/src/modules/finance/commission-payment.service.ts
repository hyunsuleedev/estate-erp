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

/** 청구를 보는 사람. 직원(agent)은 자기가 담당으로 배정된 거래의 청구만 본다. */
export interface FinanceViewer {
  userId: string;
  role: string;
}

/** 대표·매니저만 사무소 전체 청구를 본다. 모르는 역할은 중개사(agent)와 같이 좁힌다. */
export const seesAllPayments = (viewer?: FinanceViewer) =>
  !viewer || viewer.role === 'owner' || viewer.role === 'manager';

/**
 * 청구 조회를 좁히는 조건. 직원은 거래의 담당 배정(정산 배분에 쓰는 DealParticipant.sharePercent)에
 * 자기가 들어 있는 거래의 청구만 본다. 공동 담당이면 둘 다 본다. 배정이 없는 거래의 청구는 보이지 않는다.
 * viewer 를 넘기지 않은 내부 호출(정산 계산 등)은 좁히지 않는다.
 */
export function paymentScopeFor(viewer?: FinanceViewer): Prisma.CommissionPaymentWhereInput {
  if (seesAllPayments(viewer)) return {};
  return {
    deal: {
      participants: { some: { userId: (viewer as FinanceViewer).userId, sharePercent: { not: null } } },
    },
  };
}

/** 직원에게는 손님 전화번호를 주지 않는다 (금액·상태·이름만) */
function withoutPayerPhones<T extends { payerContact?: { id: string; name: string } | null }>(
  rows: T[],
  viewer?: FinanceViewer,
): T[] {
  if (seesAllPayments(viewer)) return rows;
  return rows.map((row) => ({
    ...row,
    payerContact: row.payerContact ? { id: row.payerContact.id, name: row.payerContact.name } : null,
  }));
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

  async listByDeal(officeId: string, dealId: string, viewer?: FinanceViewer) {
    const rows = await this.prisma.commissionPayment.findMany({
      where: { officeId, dealId, ...paymentScopeFor(viewer) },
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
    return withoutPayerPhones(rows, viewer);
  }

  async listByOffice(officeId: string, filters: { status?: string }, viewer?: FinanceViewer) {
    const rows = await this.prisma.commissionPayment.findMany({
      where: {
        officeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...paymentScopeFor(viewer),
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
    return withoutPayerPhones(rows, viewer);
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
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    return this.prisma.commissionReceipt.findMany({
      where: { officeId, paymentId },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 입금 한 건을 통장에 들어온 금액 그대로(원) 기록한다.
   * vat='included'(기본): 부가세를 포함해 받은 돈이다. 부가세를 뺀 금액을 청구액과 비교한다.
   * vat='none': 부가세 없이 받은 돈이다(간이과세 등). 받은 금액 전부를 수수료로 본다.
   */
  async addReceipt(
    paymentId: string,
    officeId: string,
    userId: string | null,
    data: {
      amountWon: number;
      receivedAt?: string;
      method?: string;
      memo?: string;
      vat?: 'included' | 'none';
    },
  ) {
    if (!Number.isInteger(data.amountWon) || data.amountWon <= 0) {
      throw new BadRequestException('받은 금액은 0보다 큰 정수(원)여야 합니다.');
    }
    if (data.vat !== undefined && data.vat !== 'included' && data.vat !== 'none') {
      throw new BadRequestException('부가세 포함 여부가 올바르지 않습니다.');
    }
    if (data.method && !RECEIPT_METHODS.has(data.method)) {
      throw new BadRequestException('받은 방법이 올바르지 않습니다.');
    }
    const vatIncluded = data.vat !== 'none';
    const receivedAt = parseMoneyDate(data.receivedAt);
    return this.prisma.$transaction(async (tx) => {
      const payment = await lockPayment(tx, paymentId, officeId);
      const before = await sumReceipts(tx, paymentId);
      const left = payment.expectedAmount * WON_PER_MANWON - before.supplyWon;
      let supplyWon = vatIncluded ? withoutVat(data.amountWon) : data.amountWon;
      // 남은 돈을 부가세까지 다 받았으면 반올림 차이로 1원이 남거나 넘치지 않게 맞춘다
      if (vatIncluded && left > 0 && Math.abs(supplyWon - left) <= 1) supplyWon = left;
      await this.appendReceipt(tx, payment, {
        supplyWon,
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
      if (before.amountWon <= 0) {
        throw new ConflictException('받은 돈이 없어 돌려줄 수 없습니다.');
      }
      if (data.amountWon > before.amountWon) {
        throw new ConflictException(
          `받은 돈보다 많이 돌려줄 수 없습니다. 돌려줄 수 있는 금액은 ${before.amountWon.toLocaleString('ko-KR')}원입니다.`,
        );
      }
      await tx.commissionReceipt.create({
        data: {
          officeId,
          paymentId,
          kind: 'refund',
          receivedAt,
          amountWon: -data.amountWon,
          // 받은 돈의 부가세 비율대로 뺀다 (부가세 없이 받은 돈이면 전부가 수수료다).
          // 전부 돌려주면 남는 금액이 정확히 0이 되게 한다 (반올림 차이를 남기지 않는다)
          supplyWon: -(data.amountWon === before.amountWon
            ? before.supplyWon
            : Math.round((data.amountWon * before.supplyWon) / before.amountWon)),
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
      if (!receipt) throw new NotFoundException('입금 기록을 찾지 못했습니다.');
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
      // 돌려준 돈 기록을 취소하면 받은 돈이 다시 늘어난다. 입금과 같은 상한(청구액)을 넘지 않게 한다.
      const payment = await tx.commissionPayment.findUniqueOrThrow({
        where: { id: receipt.paymentId },
        select: { expectedAmount: true },
      });
      if (after.supplyWon > payment.expectedAmount * WON_PER_MANWON) {
        throw new ConflictException('이 기록을 취소하면 받은 돈이 청구액보다 많아집니다.');
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
      const left = Math.max(0, limit - before.supplyWon);
      throw new ConflictException(
        left === 0
          ? '이 청구는 이미 다 받았습니다.'
          : `남은 금액보다 많습니다. 더 받을 수 있는 금액은 부가세 포함 ${withVat(left).toLocaleString('ko-KR')}원(부가세 빼고 ${left.toLocaleString('ko-KR')}원)입니다.`,
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

  /**
   * 남은 수수료를 받지 않기로 한다. 대표만 부른다(컨트롤러). 매니저·중개사는 조정 요청(면제)을 올리고 대표가 승인한다.
   * 할인·대손 승인과 같은 규칙을 돌아가지 않게, 받을 돈이 남은 청구만 된다.
   */
  async waive(id: string, officeId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await lockPayment(tx, id, officeId, { anyStatus: true });
      if (!['pending', 'partial', 'overdue'].includes(payment.status)) {
        throw new ConflictException(`${statusName(payment.status)} 상태의 청구는 면제할 수 없습니다.`);
      }
      const current = await tx.commissionPayment.findUniqueOrThrow({ where: { id } });
      return tx.commissionPayment.update({
        where: { id },
        data: {
          status: 'waived',
          note: note?.trim() ? `${current.note ? current.note + ' · ' : ''}면제: ${note.trim()}` : current.note,
        },
      });
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
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    if (payment.status !== 'draft') {
      throw new ConflictException(
        `${statusName(payment.status)} 상태의 청구는 확정할 수 없습니다. 작성 중인 청구만 확정합니다.`,
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

  /**
   * 현금영수증·세금계산서를 발행했다고 기록한다. 실제 발행은 홈택스 등에서 하고, 여기에는 번호와 날짜만 남긴다.
   * kind='cash_receipt'는 taxInvoiceStatus 칸에 'cash_receipt'로 적는다 (칸을 새로 만들지 않고 값으로 구분).
   */
  async issueTaxInvoice(
    id: string,
    officeId: string,
    data: { taxInvoiceNo: string; taxInvoiceDate?: string; kind?: 'tax_invoice' | 'cash_receipt' },
  ) {
    const kind = data.kind ?? 'tax_invoice';
    if (kind !== 'tax_invoice' && kind !== 'cash_receipt') {
      throw new BadRequestException('발행 종류가 올바르지 않습니다.');
    }
    const number = typeof data.taxInvoiceNo === 'string' ? data.taxInvoiceNo.trim() : '';
    if (!number) {
      throw new BadRequestException(
        kind === 'cash_receipt' ? '현금영수증 승인번호를 적어 주세요.' : '세금계산서 번호를 적어 주세요.',
      );
    }
    const issuedAt = data.taxInvoiceDate ? new Date(data.taxInvoiceDate) : new Date();
    if (Number.isNaN(issuedAt.getTime())) throw new BadRequestException('날짜 형식이 올바르지 않습니다.');
    if (issuedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('앞날의 날짜로는 기록할 수 없습니다.');
    }
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
    });
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    // 이미 기록한 것을 덮어쓰지 않는다. 잘못 적었으면 기록을 지운 뒤 다시 적는다.
    const { count } = await this.prisma.commissionPayment.updateMany({
      where: { id, officeId, taxInvoiceStatus: 'none' },
      data: {
        taxInvoiceStatus: kind === 'cash_receipt' ? 'cash_receipt' : 'issued',
        taxInvoiceNo: number,
        taxInvoiceDate: issuedAt,
      },
    });
    if (count === 0) throw new ConflictException('이미 발행을 기록한 청구입니다.');
    return this.prisma.commissionPayment.findUniqueOrThrow({ where: { id } });
  }

  /** 잘못 적은 현금영수증·세금계산서 기록을 지운다. */
  async clearTaxInvoice(id: string, officeId: string) {
    const payment = await this.prisma.commissionPayment.findFirst({ where: { id, officeId } });
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    return this.prisma.commissionPayment.update({
      where: { id },
      data: { taxInvoiceStatus: 'none', taxInvoiceNo: null, taxInvoiceDate: null },
    });
  }

  /**
   * 공동중개 상대와 그 몫을 주고받았다고 기록한다(분배 한 줄 = 한 사무소의 몫).
   * 다 받은 청구(또는 받은 뒤 면제한 청구)만 된다. 일부만 받았을 때 기록하면 나중에 들어온 돈의 몫이 빠진다.
   * 기록할 때 실제로 주고받은 금액(받은 돈 × 비율, 만원)을 shareAmount 에 굳힌다.
   */
  async settleDistribution(
    distributionId: string,
    officeId: string,
    data: { settledAt?: string; memo?: string },
  ) {
    const settledAt = parseMoneyDate(data.settledAt);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.commissionDistribution.findFirst({
        where: { id: distributionId, officeId },
        select: { id: true, paymentId: true },
      });
      if (!row) throw new NotFoundException('분배를 찾지 못했습니다.');
      await lockPayment(tx, row.paymentId, officeId, { anyStatus: true });
      const payment = await tx.commissionPayment.findUniqueOrThrow({
        where: { id: row.paymentId },
        include: { distributions: { orderBy: { createdAt: 'asc' } } },
      });
      const done = payment.status === 'collected' || payment.status === 'waived';
      const received = await sumReceipts(tx, payment.id);
      if (!done || received.supplyWon <= 0) {
        throw new ConflictException('수수료를 다 받은 청구만 공동중개 정산을 기록할 수 있습니다.');
      }
      const target = payment.distributions.find((d) => d.id === distributionId);
      if (!target) throw new NotFoundException('분배를 찾지 못했습니다.');
      if (target.recipientType === 'our_office' && payment.collectedByOffice === 'us') {
        throw new BadRequestException('우리가 받은 돈의 우리 몫은 주고받을 돈이 아닙니다.');
      }
      if (target.recipientType === 'partner_broker' && payment.collectedByOffice !== 'us') {
        throw new BadRequestException('상대가 받은 돈의 상대 몫은 주고받을 돈이 아닙니다.');
      }
      // 받은 돈(만원, 청구액까지)을 비율대로 나눈다. 화면의 계산(shareRowAmounts)과 같은 규칙: 줄마다 내림, 나머지는 우리 몫.
      const receivedManwon = Math.min(payment.expectedAmount, Math.round(received.supplyWon / WON_PER_MANWON));
      const amounts = payment.distributions.map((d) => Math.floor((receivedManwon * Number(d.shareRatio)) / 100));
      const remainder = receivedManwon - amounts.reduce((sum, value) => sum + value, 0);
      if (remainder !== 0) {
        const ourIndex = payment.distributions.findIndex((d) => d.recipientType === 'our_office');
        amounts[ourIndex >= 0 ? ourIndex : 0] += remainder;
      }
      const amount = amounts[payment.distributions.indexOf(target)];
      const { count } = await tx.commissionDistribution.updateMany({
        where: { id: distributionId, officeId, status: 'pending' },
        data: {
          status: 'settled',
          settledAt,
          settlementMemo: data.memo?.trim() || null,
          shareAmount: amount,
        },
      });
      if (count === 0) throw new ConflictException('이미 정산을 기록했습니다.');
      return tx.commissionDistribution.findUniqueOrThrow({ where: { id: distributionId } });
    });
  }

  /** 공동중개 정산 기록을 되돌린다. 금액은 지금 청구액 기준으로 다시 계산해 둔다. */
  async unsettleDistribution(distributionId: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.commissionDistribution.findFirst({
        where: { id: distributionId, officeId },
        include: { payment: { select: { expectedAmount: true } } },
      });
      if (!row) throw new NotFoundException('분배를 찾지 못했습니다.');
      if (row.status !== 'settled') throw new ConflictException('정산을 기록하지 않은 몫입니다.');
      await tx.commissionDistribution.update({
        where: { id: distributionId },
        data: { status: 'pending', settledAt: null, settlementMemo: null },
      });
      // 금액은 다른 분배 줄과 같은 규칙(줄마다 내림, 남는 만원은 우리 몫)으로 지금 청구액에서 다시 나눈다
      await recomputeShareAmounts(tx, row.paymentId);
      return tx.commissionDistribution.findUniqueOrThrow({ where: { id: distributionId } });
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
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    if (!EDITABLE_PAYMENT_STATUSES.has(payment.status)) {
      throw new ConflictException(
        `${statusName(payment.status)} 상태의 청구라 분배를 바꿀 수 없습니다.`,
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
          '상대 중개사를 골라 주세요.',
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

/* ───────── 분배 금액 다시 계산 ───────── */

/**
 * 청구액이 바뀐 뒤 분배 줄의 금액(shareAmount, 만원)을 같은 규칙으로 다시 정한다.
 * 규칙(computeDistributionRows · 화면 shareRowAmounts 와 같음): 줄마다 청구액 × 비율을 내림하고,
 * 남는 만원은 우리 사무소 줄(없으면 첫 줄)에 더한다. 이미 정산을 기록한 줄은 실제로 주고받은 금액이라 그대로 둔다.
 * 할인 승인처럼 청구액만 바꾸고 이것을 빼먹으면 거래의 수수료 요약(우리 몫)이 청구액보다 커진다.
 */
export function shareAmountsFor(
  expectedAmount: number,
  rows: Array<{ recipientType: string; shareRatio: number | { toString(): string }; shareAmount: number; status: string }>,
): number[] {
  const open = (row: (typeof rows)[number]) => row.status !== 'settled';
  const amounts = rows.map((row) =>
    open(row) ? Math.floor((expectedAmount * Number(row.shareRatio.toString())) / 100) : row.shareAmount,
  );
  const remainder = expectedAmount - amounts.reduce((sum, value) => sum + value, 0);
  if (remainder !== 0) {
    const ourIndex = rows.findIndex((row) => row.recipientType === 'our_office' && open(row));
    const target = ourIndex >= 0 ? ourIndex : rows.findIndex(open);
    if (target >= 0) amounts[target] = Math.max(0, amounts[target] + remainder);
  }
  return amounts;
}

export async function recomputeShareAmounts(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.commissionPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { distributions: { orderBy: { createdAt: 'asc' } } },
  });
  const amounts = shareAmountsFor(payment.expectedAmount, payment.distributions);
  for (const [index, row] of payment.distributions.entries()) {
    if (row.status === 'settled' || row.shareAmount === amounts[index]) continue;
    await tx.commissionDistribution.update({ where: { id: row.id }, data: { shareAmount: amounts[index] } });
  }
}

/* ───────── 입금 기록에서 청구의 받은 금액을 다시 계산한다 ───────── */

export const WON_PER_MANWON = 10_000;
/** 부가세 10%. 직원과 나누는 금액은 항상 부가세를 뺀 금액이다. */
const withVat = (supplyWon: number) => Math.round(supplyWon * 1.1);
const withoutVat = (amountWon: number) => Math.round(amountWon / 1.1);

/** 화면에 보이는 청구 상태 이름 (안내 문구에 내부 값을 그대로 쓰지 않는다) */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  draft: '작성 중',
  pending: '수금 대기',
  partial: '부분 수금',
  collected: '수금 완료',
  overdue: '연체',
  waived: '면제',
  cancelled: '취소',
};
const statusName = (status: string) => PAYMENT_STATUS_LABEL[status] ?? status;

/** 돈을 받을 수 있는 청구 상태 */
const COLLECTABLE_STATUSES = new Set(['pending', 'partial', 'overdue', 'collected']);
/** 받은 방법. 화면의 '기타'는 other 로 보낸다. */
const RECEIPT_METHODS = new Set(['transfer', 'cash', 'card', 'other', 'etc']);

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
  if (!row) throw new NotFoundException('청구를 찾지 못했습니다.');
  if (!options.anyStatus && !COLLECTABLE_STATUSES.has(row.status)) {
    throw new ConflictException(`${statusName(row.status)} 상태의 청구에는 입금을 기록할 수 없습니다.`);
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
  // 돌려준 돈을 빼기 전의 받은 돈. 다 받은 뒤 일부를 돌려줘도 손님이 그만큼 다시 낼 돈이 생기는 것이 아니므로
  // 다 받았는지는 이 금액으로 정한다 (예전에는 돌려주면 '부분수금'으로 돌아가 연체·독촉 목록에 올랐다).
  const gross = await tx.commissionReceipt.aggregate({
    where: { paymentId, voidedAt: null, kind: 'receipt' },
    _sum: { supplyWon: true },
  });
  const grossSupplyWon = gross._sum.supplyWon ?? 0;
  const latest = await tx.commissionReceipt.findFirst({
    where: { paymentId, voidedAt: null, kind: 'receipt' },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
  });
  // 규칙(한 문장): 돌려준 돈을 뺀 받은 돈이 0이면 수금 대기로 돌아가고, 0보다 크면 돌려주기 전에 받은 돈으로
  // 다 받았는지 정한다 — 다 받은 뒤 일부만 돌려준 청구는 수금 완료로 남아 연체·독촉 목록에 오르지 않는다.
  let status = payment.status;
  if (COLLECTABLE_STATUSES.has(payment.status)) {
    if (sum.supplyWon <= 0) status = 'pending';
    else if (grossSupplyWon >= payment.expectedAmount * WON_PER_MANWON) status = 'collected';
    else status = 'partial';
  }
  return tx.commissionPayment.update({
    where: { id: paymentId },
    data: {
      // 받았다가 전부 돌려줬으면 0 (null 이면 화면이 '다 받음'의 청구액으로 읽는다)
      actualAmount:
        sum.supplyWon > 0 ? Math.round(sum.supplyWon / WON_PER_MANWON) : grossSupplyWon > 0 ? 0 : null,
      paidAt: sum.supplyWon > 0 ? (latest?.receivedAt ?? payment.paidAt) : null,
      method: latest?.method ?? payment.method,
      status,
    },
  });
}
