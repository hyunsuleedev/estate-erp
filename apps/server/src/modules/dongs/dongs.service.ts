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
      throw new BadRequestException('단지를 골라 주세요.');
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
    if (!dong) throw new NotFoundException('동을 찾을 수 없습니다.');
    return dong;
  }

  async create(
    officeId: string,
    dto: { siteId: string; name: string },
  ) {
    await this.findEditableSite(dto.siteId, officeId);

    // 요청 본문을 펼치지 않는다 — officeId 같은 칸을 요청으로 바꾸지 못하게
    return this.prisma.dong.create({
      data: { officeId, siteId: dto.siteId, name: dto.name },
    });
  }

  async update(id: string, officeId: string, dto: { name?: string }) {
    await this.findOwnedDong(id, officeId);
    return this.prisma.dong.update({ where: { id }, data: { name: dto.name } });
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
      throw new NotFoundException('단지를 찾을 수 없습니다.');
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
      throw new NotFoundException('단지를 찾을 수 없습니다.');
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
      throw new NotFoundException('동을 찾을 수 없습니다.');
    }

    return dong;
  }
}
