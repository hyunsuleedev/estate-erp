import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.deal.findMany({
      where: { officeId },
      include: {
        property: { include: { site: true, unit: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, officeId },
      include: {
        property: { include: { site: true, unit: true } },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async create(
    officeId: string,
    dto: {
      propertyId: string;
      price?: number;
      memo?: string;
    },
  ) {
    return this.prisma.deal.create({
      data: { officeId, ...dto },
      include: { property: { include: { site: true } } },
    });
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; price?: number; memo?: string },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.deal.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.deal.delete({ where: { id } });
  }
}
