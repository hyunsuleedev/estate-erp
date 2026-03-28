import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OfficeSitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.officeSite.findMany({
      where: { officeId },
      include: {
        site: {
          include: { _count: { select: { dongs: true, units: true, properties: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(officeId: string, dto: { siteId: string; memo?: string }) {
    return this.prisma.officeSite.create({
      data: { officeId, ...dto },
      include: { site: true },
    });
  }

  async remove(id: string, officeId: string) {
    const os = await this.prisma.officeSite.findFirst({
      where: { id, officeId },
    });
    if (!os) throw new NotFoundException('OfficeSite not found');
    return this.prisma.officeSite.delete({ where: { id } });
  }

  async searchCentralSites(query: string) {
    return this.prisma.site.findMany({
      where: {
        officeId: null,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { roadAddress: { contains: query, mode: 'insensitive' } },
          { jibunAddress: { contains: query, mode: 'insensitive' } },
          { eupmyeondong: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { dongs: true, units: true } } },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }
}
