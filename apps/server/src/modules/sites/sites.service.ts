import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrivateSiteRecord, type PrivateSiteData } from './private-site';
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
        _count: { select: { dongs: true, units: true, properties: { where: { officeId } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, officeId?: string, includeUnits = true) {
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
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { units: true } },
          },
        },
        ...(includeUnits
          ? {
              units: {
                where: {
                  OR: officeId ? [{ officeId }, { officeId: null }] : undefined,
                },
                orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
                include: {
                  siteUnitType: true,
                  properties: {
                    where: officeId ? { officeId } : undefined,
                    include: {
                      propertyContacts: {
                        where: {
                          ...(officeId ? { officeId } : {}),
                          role: 'owner',
                          status: 'active',
                        },
                        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
                      },
                      leases: {
                        where: {
                          ...(officeId ? { officeId } : {}),
                          status: 'residing',
                        },
                        include: propertyLeaseInclude,
                      },
                      consultations: {
                        where: officeId ? { officeId } : undefined,
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
                      },
                      listings: {
                        where: {
                          ...(officeId ? { officeId } : {}),
                          // 호실 그리드의 "매물 있음" 은 열린 의뢰만 — 목록과 동일 기준
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
              },
            }
          : {}),
      },
    });
    if (!site) throw new NotFoundException('단지를 찾을 수 없습니다.');
    return this.withContactPhones(site);
  }

  async overview(id: string, officeId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id, OR: [{ officeId }, { isPublic: true }] },
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
            OR: [{ officeId }, { officeId: null }],
          },
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { units: true } },
          },
        },
        _count: { select: { dongs: true, units: true, properties: { where: { officeId } } } },
      },
    });
    if (!site) throw new NotFoundException('단지를 찾을 수 없습니다.');

    const defaultDongId = site.dongs[0]?.id ?? null;
    const units = defaultDongId
      ? await this.findUnitsForOverview(id, officeId, defaultDongId)
      : [];

    return this.withContactPhones({
      ...site,
      defaultDongId,
      units,
    });
  }

  private findUnitsForOverview(siteId: string, officeId: string, dongId: string) {
    return this.prisma.unit.findMany({
      where: {
        siteId,
        dongId,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      orderBy: [{ floor: 'desc' }, { lineNo: 'asc' }, { name: 'asc' }],
      include: {
        siteUnitType: true,
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
                // 호실 그리드의 "매물 있음" 은 열린 의뢰만 — 목록과 동일 기준
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
    });
  }

  private withContactPhones<T>(site: T): T {
    const hydrateProperty = (property: {
      propertyContacts?: Array<{ contact?: { phones?: [] } | null }>;
      leases?: Parameters<typeof presentPropertyLease>[0][];
      tenants?: unknown[];
      consultations?: Array<{ contact?: { phones?: [] } | null }>;
    }) => {
      if (property.propertyContacts) {
        property.propertyContacts = property.propertyContacts.map((propertyContact) => ({
          ...propertyContact,
          contact: propertyContact.contact ? withPrimaryPhone(propertyContact.contact) : propertyContact.contact,
        }));
      }
      if (property.leases) {
        const presented = property.leases.map((lease) => presentPropertyLease(lease));
        property.leases = presented;
        property.tenants = presented;
      }
      if (property.consultations) {
        property.consultations = property.consultations.map((consultation) => ({
          ...consultation,
          contact: consultation.contact ? withPrimaryPhone(consultation.contact) : consultation.contact,
        }));
      }
    };

    const draft = site as Record<string, unknown>;
    for (const unit of (draft.units as Array<{ properties?: unknown[] }> | undefined) ?? []) {
      for (const property of unit.properties ?? []) {
        hydrateProperty(property as Parameters<typeof hydrateProperty>[0]);
      }
    }
    for (const dong of (draft.dongs as Array<{ units?: Array<{ properties?: unknown[] }> }> | undefined) ?? []) {
      for (const unit of dong.units ?? []) {
        for (const property of unit.properties ?? []) {
          hydrateProperty(property as Parameters<typeof hydrateProperty>[0]);
        }
      }
    }
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
    // 받는 칸만 골라 넣는다(본문의 officeId·isPublic은 쓰지 않는다). 소유 사무소·비공개는 createPrivateSiteRecord가 고정한다
    const data: PrivateSiteData = {
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

    // 관리단지 화면의 직접 등록과 같은 함수: 단독·다가구 등에는 동 구분 없는 동을 함께 만든다
    return this.prisma.$transaction((tx) => createPrivateSiteRecord(tx, officeId, data));
  }

  async update(id: string, officeId: string, dto: SiteWriteDto) {
    const site = await this.findEditableSite(id, officeId);
    if (site.isLocked) throw new ForbiddenException('공공 단지 정보는 고칠 수 없습니다.');
    if (site.officeId === null) throw new ForbiddenException('공공 단지 정보는 고칠 수 없습니다.');
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
    if (site.isLocked) throw new ForbiddenException('공공 단지는 지울 수 없습니다.');
    if (site.officeId === null) throw new ForbiddenException('공공 단지는 지울 수 없습니다.');
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
      throw new NotFoundException('단지를 찾을 수 없습니다.');
    }

    return site;
  }
}
