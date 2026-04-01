import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DongsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, siteId: string) {
    if (!siteId) {
      throw new BadRequestException('siteId is required');
    }

    await this.findAccessibleSite(siteId, officeId);

    return this.prisma.dong.findMany({
      where: {
        siteId,
        OR: [{ officeId }, { officeId: null }],
      },
      include: { _count: { select: { units: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: {
        id,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      include: {
        site: true,
        units: {
          orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!dong) throw new NotFoundException('Dong not found');
    return dong;
  }

  async create(
    officeId: string,
    dto: { siteId: string; name: string },
  ) {
    await this.findEditableSite(dto.siteId, officeId);

    return this.prisma.dong.create({
      data: { officeId, ...dto },
    });
  }

  async update(id: string, officeId: string, dto: { name?: string }) {
    await this.findOwnedDong(id, officeId);
    return this.prisma.dong.update({ where: { id }, data: dto });
  }

  async remove(id: string, officeId: string) {
    await this.findOwnedDong(id, officeId);
    return this.prisma.dong.delete({ where: { id } });
  }

  private async findAccessibleSite(id: string, officeId: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id,
        OR: [{ officeId }, { isPublic: true }],
      },
    });

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    return site;
  }

  private async findEditableSite(id: string, officeId: string) {
    const site = await this.prisma.site.findFirst({
      where: {
        id,
        officeId,
      },
    });

    if (!site) {
      throw new NotFoundException('Site not found');
    }

    return site;
  }

  private async findOwnedDong(id: string, officeId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: {
        id,
        officeId,
      },
    });

    if (!dong) {
      throw new NotFoundException('Dong not found');
    }

    return dong;
  }
}
