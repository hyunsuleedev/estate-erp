import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteType } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

// 토지/단독주택은 Unit 자체를 만들지 않는다.
// 그 외(아파트/오피스텔/빌라/상가/지식산업센터 등 건물형)는 모두
// Site → Dong → Unit 체인을 사용하며, 단일 동 건물은 placeholder Dong을 사용한다.
const UNIT_DISABLED_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.HOUSE,
  SiteType.LAND,
]);

const UNIT_CELL_TYPES = [
  'unit',
  'empty',
  'piloti',
  'common_facility',
  'commercial_facility',
  'safety_area',
] as const;

const UNIT_CELL_TYPE_SET: ReadonlySet<string> = new Set(UNIT_CELL_TYPES);

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
      dongId: string;
      siteUnitTypeId?: string;
      name: string;
      floor?: number;
      lineNo?: number;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
      cellType?: string;
    },
  ) {
    const site = await this.findEditableSite(dto.siteId, officeId);

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('This site type does not support units');
    }

    if (!dto.dongId) {
      throw new BadRequestException(
        'dongId is required (use placeholder Dong for single-building sites)',
      );
    }

    await this.findOwnedDong(dto.dongId, officeId, site.id);

    if (dto.siteUnitTypeId) {
      await this.findOwnedSiteUnitType(dto.siteUnitTypeId, site.id, officeId);
    }

    const data = this.normalizeUnitCell(dto);

    return this.prisma.unit.create({
      data: { officeId, ...data },
      include: { site: true, dong: true, siteUnitType: true },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      name?: string;
      dongId?: string;
      siteUnitTypeId?: string | null;
      floor?: number | null;
      lineNo?: number | null;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
      cellType?: string;
    },
  ) {
    const existingUnit = await this.findOwnedUnit(id, officeId);
    const site = await this.findEditableSite(existingUnit.siteId, officeId);
    const nextDongId = dto.dongId ?? existingUnit.dongId;
    const nextSiteUnitTypeId =
      dto.siteUnitTypeId === undefined
        ? existingUnit.siteUnitTypeId
        : dto.siteUnitTypeId;

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('This site type does not support units');
    }

    await this.findOwnedDong(nextDongId, officeId, site.id);

    if (nextSiteUnitTypeId) {
      await this.findOwnedSiteUnitType(nextSiteUnitTypeId, site.id, officeId);
    }

    const data = this.normalizeUnitCell(dto);

    return this.prisma.unit.update({
      where: { id },
      data,
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

  private normalizeUnitCell<T extends { cellType?: string; isPiloti?: boolean }>(
    dto: T,
  ): T {
    if (dto.cellType !== undefined && !UNIT_CELL_TYPE_SET.has(dto.cellType)) {
      throw new BadRequestException(
        `cellType must be one of: ${UNIT_CELL_TYPES.join(', ')}`,
      );
    }

    if (dto.cellType === 'piloti' && dto.isPiloti === false) {
      throw new BadRequestException('cellType=piloti requires isPiloti=true');
    }

    if (
      dto.cellType !== undefined &&
      dto.cellType !== 'piloti' &&
      dto.isPiloti === true
    ) {
      throw new BadRequestException('isPiloti=true requires cellType=piloti');
    }

    if (dto.cellType !== undefined) {
      return { ...dto, isPiloti: dto.cellType === 'piloti' };
    }

    if (dto.isPiloti !== undefined) {
      return { ...dto, cellType: dto.isPiloti ? 'piloti' : 'unit' };
    }

    return dto;
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
