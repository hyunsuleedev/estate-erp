import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteType } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DONG_REQUIRED_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.APARTMENT,
  SiteType.OFFICETEL,
]);

const UNIT_DISABLED_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.HOUSE,
  SiteType.LAND,
]);

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: { siteId?: string; dongId?: string }) {
    if (query.siteId) {
      await this.findAccessibleSite(query.siteId, officeId);
    }

    if (query.dongId) {
      await this.findAccessibleDong(query.dongId, officeId);
    }

    return this.prisma.unit.findMany({
      where: {
        OR: [{ officeId }, { officeId: null }],
        ...(query.siteId && { siteId: query.siteId }),
        ...(query.dongId && { dongId: query.dongId }),
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      include: {
        site: true,
        dong: true,
        siteUnitType: true,
        _count: { select: { properties: true } },
      },
      orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      include: {
        site: true,
        dong: true,
        siteUnitType: true,
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
      siteUnitTypeId?: string;
      name: string;
      floor?: number;
      lineNo?: number;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
    },
  ) {
    const site = await this.findEditableSite(dto.siteId, officeId);
    const dongId = dto.dongId ?? null;

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('This site type does not support units');
    }

    if (DONG_REQUIRED_SITE_TYPES.has(site.type) && !dongId) {
      throw new BadRequestException('dongId is required for apartment/officetel units');
    }

    if (dongId) {
      await this.findOwnedDong(dongId, officeId, site.id);
    }

    if (dto.siteUnitTypeId) {
      await this.findOwnedSiteUnitType(dto.siteUnitTypeId, site.id, officeId);
    }

    return this.prisma.unit.create({
      data: { officeId, ...dto },
      include: { site: true, dong: true, siteUnitType: true },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      name?: string;
      dongId?: string | null;
      siteUnitTypeId?: string | null;
      floor?: number | null;
      lineNo?: number | null;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
    },
  ) {
    const existingUnit = await this.findOwnedUnit(id, officeId);
    const site = await this.findEditableSite(existingUnit.siteId, officeId);
    const nextDongId = dto.dongId === undefined ? existingUnit.dongId : dto.dongId;
    const nextSiteUnitTypeId =
      dto.siteUnitTypeId === undefined
        ? existingUnit.siteUnitTypeId
        : dto.siteUnitTypeId;

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('This site type does not support units');
    }

    if (DONG_REQUIRED_SITE_TYPES.has(site.type) && !nextDongId) {
      throw new BadRequestException('dongId is required for apartment/officetel units');
    }

    if (nextDongId) {
      await this.findOwnedDong(nextDongId, officeId, site.id);
    }

    if (nextSiteUnitTypeId) {
      await this.findOwnedSiteUnitType(nextSiteUnitTypeId, site.id, officeId);
    }

    return this.prisma.unit.update({
      where: { id },
      data: dto,
      include: { site: true, dong: true, siteUnitType: true },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOwnedUnit(id, officeId);
    return this.prisma.unit.delete({ where: { id } });
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

  private async findAccessibleDong(id: string, officeId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: {
        id,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
    });

    if (!dong) {
      throw new NotFoundException('Dong not found');
    }

    return dong;
  }

  private async findOwnedDong(id: string, officeId: string, siteId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: {
        id,
        officeId,
        siteId,
      },
    });

    if (!dong) {
      throw new BadRequestException('Dong does not belong to this site');
    }

    return dong;
  }

  private async findOwnedSiteUnitType(
    id: string,
    siteId: string,
    officeId: string,
  ) {
    const siteUnitType = await this.prisma.siteUnitType.findFirst({
      where: {
        id,
        siteId,
        officeId,
      },
    });

    if (!siteUnitType) {
      throw new BadRequestException('SiteUnitType does not belong to this site');
    }

    return siteUnitType;
  }

  private async findOwnedUnit(id: string, officeId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id,
        officeId,
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }
}
