import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OfficeSitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.officeSite.findMany({
      where: { officeId },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
            _count: { select: { dongs: true, units: true, properties: { where: { officeId } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const officeSite = await this.prisma.officeSite.findFirst({
      where: { id, officeId },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
            _count: { select: { dongs: true, units: true, properties: { where: { officeId } } } },
          },
        },
      },
    });

    if (!officeSite) {
      throw new NotFoundException('OfficeSite not found');
    }

    return officeSite;
  }

  async add(officeId: string, dto: { siteId: string; memo?: string }) {
    await this.findAccessibleSite(dto.siteId, officeId);

    return this.prisma.officeSite.upsert({
      where: {
        officeId_siteId: {
          officeId,
          siteId: dto.siteId,
        },
      },
      update: {
        memo: dto.memo,
      },
      create: { officeId, ...dto },
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, officeId: string, dto: { memo?: string | null }) {
    const officeSite = await this.findOne(id, officeId);

    return this.prisma.officeSite.update({
      where: { id: officeSite.id },
      data: dto,
      include: {
        site: {
          include: {
            ward: {
              include: {
                district: {
                  include: {
                    province: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async remove(id: string, officeId: string) {
    const officeSite = await this.findOne(id, officeId);

    return this.prisma.officeSite.delete({ where: { id: officeSite.id } });
  }

  async searchCentralSites(query: string) {
    const searchTerm = query.trim();

    if (searchTerm.length === 0) {
      throw new BadRequestException('q is required');
    }

    return this.prisma.site.findMany({
      where: {
        isPublic: true,
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { roadAddress: { contains: searchTerm, mode: 'insensitive' } },
          { jibunAddress: { contains: searchTerm, mode: 'insensitive' } },
          { ward: { name: { contains: searchTerm, mode: 'insensitive' } } },
          {
            ward: {
              district: {
                name: { contains: searchTerm, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: {
        ward: {
          include: {
            district: {
              include: {
                province: true,
              },
            },
          },
        },
        _count: { select: { dongs: true, units: true } },
      },
      take: 20,
      orderBy: { name: 'asc' },
    });
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
}
