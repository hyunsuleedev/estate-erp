import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OfficeExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: string) {
    return this.prisma.officeExpenseTemplate.findMany({
      where: { officeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    officeId: string,
    data: {
      title: string;
      category: string;
      amount: number;
      frequency?: string;
      dayOfMonth?: number;
      taxDeductible?: boolean;
      note?: string;
    },
  ) {
    return this.prisma.officeExpenseTemplate.create({
      data: {
        officeId,
        title: data.title,
        category: data.category,
        amount: data.amount,
        frequency: data.frequency ?? 'monthly',
        dayOfMonth: data.dayOfMonth,
        taxDeductible: data.taxDeductible ?? false,
        note: data.note,
      },
    });
  }

  async update(
    id: string,
    officeId: string,
    data: {
      title?: string;
      category?: string;
      amount?: number;
      frequency?: string;
      dayOfMonth?: number;
      taxDeductible?: boolean;
      isActive?: boolean;
      note?: string;
    },
  ) {
    const existing = await this.prisma.officeExpenseTemplate.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException();

    return this.prisma.officeExpenseTemplate.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, officeId: string) {
    const existing = await this.prisma.officeExpenseTemplate.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException();

    return this.prisma.officeExpenseTemplate.delete({ where: { id } });
  }

  async getMonthlyTotal(officeId: string): Promise<number> {
    const templates = await this.prisma.officeExpenseTemplate.findMany({
      where: { officeId, isActive: true },
    });
    let total = 0;
    for (const t of templates) {
      if (t.frequency === 'monthly') total += t.amount;
      else if (t.frequency === 'quarterly') total += Math.round(t.amount / 3);
      else if (t.frequency === 'yearly') total += Math.round(t.amount / 12);
    }
    return total;
  }
}
