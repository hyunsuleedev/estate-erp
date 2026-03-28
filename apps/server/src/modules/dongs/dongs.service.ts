import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DongsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, siteId: string) {
    return this.prisma.dong.findMany({
      where: { officeId, siteId },
      include: { _count: { select: { units: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: { id, officeId },
      include: { units: { orderBy: { name: 'asc' } } },
    });
    if (!dong) throw new NotFoundException('Dong not found');
    return dong;
  }

  async create(
    officeId: string,
    dto: { siteId: string; name: string },
  ) {
    return this.prisma.dong.create({
      data: { officeId, ...dto },
    });
  }

  async update(id: string, officeId: string, dto: { name?: string }) {
    await this.findOne(id, officeId);
    return this.prisma.dong.update({ where: { id }, data: dto });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.dong.delete({ where: { id } });
  }
}
