import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: { siteId?: string; dongId?: string }) {
    return this.prisma.unit.findMany({
      where: {
        officeId,
        ...(query.siteId && { siteId: query.siteId }),
        ...(query.dongId && { dongId: query.dongId }),
      },
      include: {
        dong: true,
        _count: { select: { properties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, officeId },
      include: {
        site: true,
        dong: true,
        properties: true,
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async create(
    officeId: string,
    dto: {
      siteId: string;
      dongId?: string;
      name: string;
      exclusiveAreaM2?: number;
      supplyAreaM2?: number;
    },
  ) {
    return this.prisma.unit.create({
      data: { officeId, ...dto },
      include: { dong: true },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      name?: string;
      dongId?: string;
      exclusiveAreaM2?: number;
      supplyAreaM2?: number;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.unit.update({
      where: { id },
      data: dto,
      include: { dong: true },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.unit.delete({ where: { id } });
  }
}
