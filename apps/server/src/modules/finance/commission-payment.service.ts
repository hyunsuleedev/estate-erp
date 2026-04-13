import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CommissionPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async listByDeal(officeId: string, dealId: string) {
    return this.prisma.commissionPayment.findMany({
      where: { officeId, dealId },
      include: { payerContact: { select: { id: true, name: true, phone: true } } },
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
            price: true,
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
        payerContact: { select: { id: true, name: true, phone: true } },
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
}
