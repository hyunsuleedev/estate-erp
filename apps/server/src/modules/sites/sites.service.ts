import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface SiteWriteDto {
  type?: string;
  name?: string;
  wardCode?: string;
  roadName?: string | null;
  roadBuildingMain?: number | null;
  roadBuildingSub?: number | null;
  roadAddress?: string | null;
  jibunMain?: string | null;
  jibunSub?: string | null;
  jibunAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  kaptComplexCode?: string | null;
  naverComplexCode?: string | null;
  kbComplexCode?: string | null;
  zipCode?: string | null;
  builtYear?: number | null;
  totalUnits?: number | null;
  totalDongs?: number | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.site.findMany({
      where: { officeId },
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
        _count: { select: { dongs: true, units: true, properties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId?: string) {
    const where = officeId
      ? { id, OR: [{ officeId }, { isPublic: true }] }
      : { id };
    const site = await this.prisma.site.findFirst({
      where,
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
        siteUnitTypes: {
          orderBy: { name: 'asc' },
        },
        dongs: {
          where: {
            OR: officeId ? [{ officeId }, { officeId: null }] : undefined,
          },
          include: {
            units: {
              where: {
                OR: officeId ? [{ officeId }, { officeId: null }] : undefined,
              },
              orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
              include: {
                siteUnitType: true,
                properties: {
                  include: {
                    propertyContacts: {
                      where: { role: 'owner', status: 'active' },
                      include: { contact: true },
                    },
                    tenants: {
                      where: { status: 'residing' },
                      include: { contact: true },
                    },
                    consultations: {
                      orderBy: { createdAt: 'desc' },
                      take: 1,
                      include: { contact: true },
                    },
                  },
                },
              },
            },
          },
        },
        units: {
          where: {
            OR: officeId ? [{ officeId }, { officeId: null }] : undefined,
          },
          orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
          include: {
            siteUnitType: true,
            properties: {
              include: {
                propertyContacts: {
                  where: { role: 'owner', status: 'active' },
                  include: { contact: true },
                },
                tenants: {
                  where: { status: 'residing' },
                  include: { contact: true },
                },
              },
            },
          },
        },
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
      wardCode: string;
      roadName?: string | null;
      roadBuildingMain?: number | null;
      roadBuildingSub?: number | null;
      roadAddress?: string | null;
      jibunMain?: string | null;
      jibunSub?: string | null;
      jibunAddress?: string | null;
      lat?: number | null;
      lng?: number | null;
      kaptComplexCode?: string | null;
      naverComplexCode?: string | null;
      kbComplexCode?: string | null;
      zipCode?: string | null;
      builtYear?: number | null;
      totalUnits?: number | null;
      totalDongs?: number | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const data: Prisma.SiteUncheckedCreateInput = {
      officeId,
      type: dto.type,
      name: dto.name,
      wardCode: dto.wardCode,
      roadName: dto.roadName,
      roadBuildingMain: dto.roadBuildingMain,
      roadBuildingSub: dto.roadBuildingSub,
      roadAddress: dto.roadAddress,
      jibunMain: dto.jibunMain,
      jibunSub: dto.jibunSub,
      jibunAddress: dto.jibunAddress,
      lat: dto.lat,
      lng: dto.lng,
      kaptComplexCode: dto.kaptComplexCode,
      naverComplexCode: dto.naverComplexCode,
      kbComplexCode: dto.kbComplexCode,
      zipCode: dto.zipCode,
      builtYear: dto.builtYear,
      totalUnits: dto.totalUnits,
      totalDongs: dto.totalDongs,
      metadata:
        dto.metadata === undefined
          ? undefined
          : dto.metadata === null
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue),
    };

    return this.prisma.site.create({
      data,
    });
  }

  async update(id: string, officeId: string, dto: SiteWriteDto) {
    const site = await this.findEditableSite(id, officeId);
    if (site.isLocked) throw new ForbiddenException('Central data cannot be modified');
    if (site.officeId === null) throw new ForbiddenException('Central data cannot be modified');
    const data: Prisma.SiteUncheckedUpdateInput = {
      type: dto.type,
      name: dto.name,
      wardCode: dto.wardCode,
      roadName: dto.roadName,
      roadBuildingMain: dto.roadBuildingMain,
      roadBuildingSub: dto.roadBuildingSub,
      roadAddress: dto.roadAddress,
      jibunMain: dto.jibunMain,
      jibunSub: dto.jibunSub,
      jibunAddress: dto.jibunAddress,
      lat: dto.lat,
      lng: dto.lng,
      kaptComplexCode: dto.kaptComplexCode,
      naverComplexCode: dto.naverComplexCode,
      kbComplexCode: dto.kbComplexCode,
      zipCode: dto.zipCode,
      builtYear: dto.builtYear,
      totalUnits: dto.totalUnits,
      totalDongs: dto.totalDongs,
      metadata:
        dto.metadata === undefined
          ? undefined
          : dto.metadata === null
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue),
    };

    return this.prisma.site.update({ where: { id }, data });
  }

  async remove(id: string, officeId: string) {
    const site = await this.findEditableSite(id, officeId);
    if (site.isLocked) throw new ForbiddenException('Central data cannot be deleted');
    if (site.officeId === null) throw new ForbiddenException('Central data cannot be deleted');
    return this.prisma.site.delete({ where: { id } });
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
}
