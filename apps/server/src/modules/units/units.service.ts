import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SiteType } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  NON_CLOSED_INTAKE_WHERE,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { presentPropertyLease, propertyLeaseInclude } from '../tenants/tenants.service';

// 토지(land)는 Unit 자체를 만들지 않는다.
// 그 외(아파트/오피스텔/빌라/상가/지식산업센터 등 건물형)는 모두
// Site → Dong → Unit 체인을 사용하며, 단일 동 건물은 placeholder Dong을 사용한다.
// 단독/다가구주택(house)은 101호/201호 개별 임대가 일상이므로 Unit 생성을 허용한다
// (호실 없이 통건물로 관리하는 것도 가능 — Property 쪽에서 둘 다 허용).
const UNIT_DISABLED_SITE_TYPES: ReadonlySet<string> = new Set([SiteType.LAND]);

const UNIT_CELL_TYPES = [
  'unit',
  'empty',
  'piloti',
  'common_facility',
  'commercial_facility',
  'safety_area',
] as const;

const UNIT_CELL_TYPE_SET: ReadonlySet<string> = new Set(UNIT_CELL_TYPES);

/** 요청으로 고칠 수 있는 공간 칸. 사무소·대지(siteId)는 서버가 정한다. */
const UNIT_INPUT_FIELDS = [
  'siteUnitTypeId',
  'name',
  'floor',
  'floorEnd',
  'floorLabel',
  'lineNo',
  'exclusiveAreaM2',
  'supplyAreaM2',
  'roomCount',
  'bathRoomCount',
  'isPiloti',
  'cellType',
] as const;

function pickUnitFields<T extends object>(dto: T) {
  const picked: Record<string, unknown> = {};
  for (const field of UNIT_INPUT_FIELDS) {
    const value = (dto as Record<string, unknown>)[field];
    if (value !== undefined) picked[field] = value;
  }
  return picked as {
    siteUnitTypeId?: string | null;
    name?: string | null;
    floor?: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
    lineNo?: number | null;
    exclusiveAreaM2?: number | null;
    supplyAreaM2?: number | null;
    roomCount?: number | null;
    bathRoomCount?: number | null;
    isPiloti?: boolean;
    cellType?: string;
  };
}

/**
 * 호 목록에 싣는 평형 칸. 평형 한 종류가 그 평형의 호 수만큼 되풀이되므로(5,150호에 2.2MB였다)
 * 호 줄이 실제로 쓰는 칸만 싣는다: 이름, 면적, 방 · 욕실 수(호의 값이 비었을 때 대신 쓴다).
 * 평형의 나머지 칸은 단지 조회의 siteUnitTypes에 한 번씩 들어 있다.
 */
export const UNIT_TYPE_SUMMARY_SELECT = {
  id: true,
  name: true,
  exclusiveAreaM2: true,
  supplyAreaM2: true,
  roomCount: true,
  bathRoomCount: true,
} satisfies Prisma.SiteUnitTypeSelect;

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 호 목록. 호마다 단지 · 동을 통째로 싣지 않는다 — 5,150호 단지에서 같은 단지 한 곳과 동 53곳이
   * 호 수만큼 되풀이되어 응답의 절반을 넘었다(10.9MB 중 5.9MB). 호는 siteId · dongId를 갖고 있고,
   * 부르는 쪽은 이미 단지와 동을 알고 있다. 이름이 필요한 곳(MCP)만 withPlace로 id · 이름을 받는다.
   */
  async findAll(
    officeId: string,
    query: { siteId?: string; dongId?: string; dongIds?: string[] },
    options: { withPlace?: boolean } = {},
  ) {
    const dongIds = Array.from(new Set((query.dongIds ?? []).filter(Boolean)));

    if (query.siteId) {
      await this.findAccessibleSite(query.siteId, officeId);
    }

    if (dongIds.length > 0) {
      await Promise.all(dongIds.map((dongId) => this.findAccessibleDong(dongId, officeId)));
    } else if (query.dongId) {
      await this.findAccessibleDong(query.dongId, officeId);
    }

    const units = await this.prisma.unit.findMany({
      where: {
        OR: [{ officeId }, { officeId: null }],
        ...(query.siteId && { siteId: query.siteId }),
        ...(dongIds.length > 0
          ? { dongId: { in: dongIds } }
          : query.dongId && { dongId: query.dongId }),
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      include: {
        ...(options.withPlace
          ? {
              site: { select: { id: true, name: true } },
              dong: { select: { id: true, name: true, isPlaceholder: true } },
            }
          : {}),
        siteUnitType: { select: UNIT_TYPE_SUMMARY_SELECT },
        properties: {
          where: { officeId },
          include: {
            propertyContacts: {
              where: { officeId, role: 'owner', status: 'active' },
              include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
            },
            leases: {
              where: { officeId, status: 'residing' },
              include: propertyLeaseInclude,
            },
            consultations: {
              where: { officeId },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
            },
            listings: {
              where: {
                officeId,
                intake: NON_CLOSED_INTAKE_WHERE,
              },
              orderBy: { updatedAt: 'desc' },
              include: {
                intake: { select: LISTING_INTAKE_STATE_SELECT },
                deals: OCCUPYING_DEALS_SELECT,
              },
            },
          },
        },
      },
      orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
    });

    return this.withContactPhones(units);
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
        properties: { where: { officeId } },
      },
    });
    if (!unit) throw new NotFoundException('호수를 찾을 수 없습니다.');
    return unit;
  }

  async create(
    officeId: string,
    dto: {
      siteId: string;
      dongId: string;
      siteUnitTypeId?: string;
      /** 호 이름 또는 층의 일부에 붙인 이름. 호가 없는 공간(상가건물 2층)은 비우고 층만 준다 */
      name?: string | null;
      floor?: number | null;
      /** 여러 층을 한 공간으로 둘 때의 끝 층 (1~2층 통임대) */
      floorEnd?: number | null;
      /** 숫자로 안 떨어지는 층의 표시 이름 (반지하, M층) */
      floorLabel?: string | null;
      lineNo?: number;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      roomCount?: number | null;
      bathRoomCount?: number | null;
      isPiloti?: boolean;
      cellType?: string;
    },
  ) {
    // 공공 건물 아래에도 사무소의 공간을 만들 수 있다. 다가구 · 일반 상가건물처럼 대장에 호가 없는
    // 건물은 사무소가 층 · 구획을 붙여야 하기 때문이다. 공공 행 자체는 여전히 못 고친다
    // (만든 공간은 officeId가 붙은 이 사무소만의 것이다).
    const site = await this.findAccessibleSite(dto.siteId, officeId);

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('토지에는 호수를 만들 수 없습니다.');
    }

    if (!dto.dongId) {
      throw new BadRequestException(
        '동을 골라 주세요.',
      );
    }

    await this.findDongInSite(dto.dongId, officeId, site.id);

    if (dto.siteUnitTypeId) {
      await this.findOwnedSiteUnitType(dto.siteUnitTypeId, site.id, officeId);
    }

    this.assertValidLayoutCounts(dto);
    const space = this.normalizeSpace(dto);
    // 요청 본문을 그대로 펼치면 officeId 같은 칸까지 바뀐다 — 만들 수 있는 칸만 받는다.
    const data = this.normalizeUnitCell({
      ...pickUnitFields(dto),
      siteId: site.id,
      dongId: dto.dongId,
      ...space,
    });

    // 대장에서 온 공공 호가 이미 있으면 같은 이름의 사무소 공간을 또 만들지 않는다 (그 호를 쓰면 된다)
    if (space.name) {
      const publicUnit = await this.prisma.unit.findFirst({
        where: { dongId: dto.dongId, officeId: null, name: space.name },
        select: { id: true },
      });
      if (publicUnit) {
        throw new ConflictException({
          message: '이 건물에 같은 이름의 호가 이미 있습니다. 그 호를 사용해 주세요.',
          unitId: publicUnit.id,
        });
      }
    }
    const duplicate = await this.prisma.unit.findFirst({
      where: {
        officeId,
        dongId: dto.dongId,
        name: space.name,
        floor: space.floor,
        floorEnd: space.floorEnd,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: '같은 공간이 이미 있습니다.',
        unitId: duplicate.id,
      });
    }

    try {
      return await this.prisma.unit.create({
        data: { officeId, ...data },
        include: { site: true, dong: true, siteUnitType: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('같은 공간이 이미 있습니다.');
      }
      throw error;
    }
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      name?: string | null;
      dongId?: string;
      siteUnitTypeId?: string | null;
      floor?: number | null;
      floorEnd?: number | null;
      floorLabel?: string | null;
      lineNo?: number | null;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      roomCount?: number | null;
      bathRoomCount?: number | null;
      isPiloti?: boolean;
      cellType?: string;
    },
  ) {
    const existingUnit = await this.findOwnedUnit(id, officeId);
    // 사무소가 만든 공간은 공공 건물 아래에 있어도 그 사무소가 고친다
    const site = await this.findAccessibleSite(existingUnit.siteId, officeId);
    const nextDongId = dto.dongId ?? existingUnit.dongId;
    const nextSiteUnitTypeId =
      dto.siteUnitTypeId === undefined
        ? existingUnit.siteUnitTypeId
        : dto.siteUnitTypeId;

    if (UNIT_DISABLED_SITE_TYPES.has(site.type)) {
      throw new BadRequestException('토지에는 호수를 만들 수 없습니다.');
    }

    await this.findDongInSite(nextDongId, officeId, site.id);

    if (nextSiteUnitTypeId) {
      await this.findOwnedSiteUnitType(nextSiteUnitTypeId, site.id, officeId);
    }

    this.assertValidLayoutCounts(dto);
    // 이름 · 층 중 하나라도 건드리면 고친 뒤의 모양으로 다시 확인한다
    const touchesSpace =
      dto.name !== undefined ||
      dto.floor !== undefined ||
      dto.floorEnd !== undefined ||
      dto.floorLabel !== undefined;
    const space = touchesSpace
      ? this.normalizeSpace({
          name: dto.name !== undefined ? dto.name : existingUnit.name,
          floor: dto.floor !== undefined ? dto.floor : existingUnit.floor,
          floorEnd: dto.floorEnd !== undefined ? dto.floorEnd : existingUnit.floorEnd,
          floorLabel:
            dto.floorLabel !== undefined ? dto.floorLabel : existingUnit.floorLabel,
        })
      : {};
    const data = this.normalizeUnitCell({
      ...pickUnitFields(dto),
      ...(dto.dongId !== undefined ? { dongId: dto.dongId } : {}),
      ...space,
    });

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
      throw new NotFoundException('단지를 찾을 수 없습니다.');
    }

    return site;
  }

  private normalizeUnitCell<T extends { cellType?: string; isPiloti?: boolean }>(
    dto: T,
  ): T {
    if (dto.cellType !== undefined && !UNIT_CELL_TYPE_SET.has(dto.cellType)) {
      throw new BadRequestException(
        `알 수 없는 칸 종류입니다: ${dto.cellType}`,
      );
    }

    if (dto.cellType === 'piloti' && dto.isPiloti === false) {
      throw new BadRequestException('필로티 칸 설정이 맞지 않습니다.');
    }

    if (
      dto.cellType !== undefined &&
      dto.cellType !== 'piloti' &&
      dto.isPiloti === true
    ) {
      throw new BadRequestException('필로티 칸 설정이 맞지 않습니다.');
    }

    if (dto.cellType !== undefined) {
      return { ...dto, isPiloti: dto.cellType === 'piloti' };
    }

    if (dto.isPiloti !== undefined) {
      return { ...dto, cellType: dto.isPiloti ? 'piloti' : 'unit' };
    }

    return dto;
  }

  private assertValidLayoutCounts(dto: {
    roomCount?: number | null;
    bathRoomCount?: number | null;
  }) {
    for (const [field, value] of [
      ['roomCount', dto.roomCount],
      ['bathRoomCount', dto.bathRoomCount],
    ] as const) {
      if (
        value !== undefined &&
        value !== null &&
        (!Number.isInteger(value) || value < 0)
      ) {
        throw new BadRequestException(`${field === 'roomCount' ? '방 수' : '욕실 수'}는 0 이상의 정수로 입력해 주세요.`);
      }
    }
  }

  private withContactPhones<T extends Array<{ properties?: Array<{
    propertyContacts?: Array<{ contact?: { phones?: [] } | null }>;
    leases?: Parameters<typeof presentPropertyLease>[0][];
    consultations?: Array<{ contact?: { phones?: [] } | null }>;
  }> }>>(units: T): T {
    return units.map((unit) => ({
      ...unit,
      properties: unit.properties?.map((property) => {
        const leases = property.leases?.map((lease) => presentPropertyLease(lease));
        return {
          ...property,
          propertyContacts: property.propertyContacts?.map((propertyContact) => ({
            ...propertyContact,
            contact: propertyContact.contact ? withPrimaryPhone(propertyContact.contact) : propertyContact.contact,
          })),
          ...(leases ? { leases, tenants: leases } : {}),
          consultations: property.consultations?.map((consultation) => ({
            ...consultation,
            contact: consultation.contact ? withPrimaryPhone(consultation.contact) : consultation.contact,
          })),
        };
      }),
    })) as T;
  }

  /**
   * 공간의 이름과 층을 다듬고 모양을 확인한다 (DB의 CHECK와 같은 규칙을 먼저 알려 주기 위해서다).
   * - 이름과 층 중 하나는 있어야 한다. 빈 글자 이름은 이름이 없는 것이다.
   * - 0층은 없다 (지하 1층 = -1, 지상 1층 = 1).
   * - 끝 층은 시작 층이 있을 때만, 그보다 위다.
   */
  private normalizeSpace(dto: {
    name?: string | null;
    floor?: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
  }) {
    const name = dto.name?.trim() || null;
    const floor = dto.floor ?? null;
    const floorEnd = dto.floorEnd ?? null;
    const floorLabel = dto.floorLabel?.trim() || null;

    for (const [field, value] of [
      ['floor', floor],
      ['floorEnd', floorEnd],
    ] as const) {
      if (value !== null && (!Number.isInteger(value) || value === 0)) {
        throw new BadRequestException(
          `${field}는 0이 아닌 정수여야 합니다 (지하는 음수: B2 = -2)`,
        );
      }
    }
    if (!name && floor === null) {
      throw new BadRequestException('호 이름이나 층 중 하나는 있어야 합니다');
    }
    if (floorEnd !== null && (floor === null || floorEnd <= floor)) {
      throw new BadRequestException('끝 층은 시작 층보다 위여야 합니다');
    }
    return { name, floor, floorEnd, floorLabel };
  }

  /** 그 대지 안의 건물. 공공 건물이거나 이 사무소가 만든 건물이어야 한다 */
  private async findDongInSite(id: string, officeId: string, siteId: string) {
    const dong = await this.prisma.dong.findFirst({
      where: {
        id,
        siteId,
        OR: [{ officeId }, { officeId: null }],
      },
    });

    if (!dong) {
      throw new BadRequestException('고른 동이 이 단지의 동이 아닙니다.');
    }

    return dong;
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
      throw new NotFoundException('동을 찾을 수 없습니다.');
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
      throw new BadRequestException('고른 평형이 이 단지의 평형이 아닙니다.');
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
      throw new NotFoundException('호수를 찾을 수 없습니다.');
    }

    return unit;
  }
}
