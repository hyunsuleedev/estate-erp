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
                    unit: { select: { name: true, dong: { select: { name: true } } } },
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

  async collect(
    id: string,
    officeId: string,
    data: {
      actualAmount: number;
      method: string;
      paidAt?: string;
      note?: string;
    },
  ) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id, officeId },
    });
    if (!payment) throw new NotFoundException();

    return this.prisma.commissionPayment.update({
      where: { id },
      data: {
        actualAmount: data.actualAmount,
        method: data.method,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        status: data.actualAmount < payment.expectedAmount ? 'partial' : 'collected',
        note: data.note,
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
