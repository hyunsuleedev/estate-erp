import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    // 사무소 자체 등록 사이트만 (중앙 데이터는 office-sites로 관리)
    return this.prisma.site.findMany({
      where: { officeId },
      include: { dongs: true, _count: { select: { units: true, properties: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId?: string) {
    const where = officeId
      ? { id, OR: [{ officeId }, { officeId: null }] }
      : { id };
    const site = await this.prisma.site.findFirst({
      where,
      include: {
        dongs: { include: { units: true } },
        units: true,
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async create(
    officeId: string,
    dto: {
      type: string;
      name: string;
      sido: string;
      sigungu: string;
      eupmyeondong: string;
      ri?: string;
      roadAddress?: string;
      jibunAddress?: string;
      lat?: number;
      lng?: number;
      builtYear?: number;
      totalUnits?: number;
      totalDongs?: number;
    },
  ) {
    return this.prisma.site.create({
      data: { officeId, ...dto },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: Record<string, unknown>,
  ) {
    const site = await this.findOne(id, officeId);
    if (site.isLocked) throw new ForbiddenException('Central data cannot be modified');
    if (site.officeId === null) throw new ForbiddenException('Central data cannot be modified');
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, officeId: string) {
    const site = await this.findOne(id, officeId);
    if (site.isLocked) throw new ForbiddenException('Central data cannot be deleted');
    if (site.officeId === null) throw new ForbiddenException('Central data cannot be deleted');
    return this.prisma.site.delete({ where: { id } });
  }
}
