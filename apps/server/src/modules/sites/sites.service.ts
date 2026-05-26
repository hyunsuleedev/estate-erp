import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';

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
                      tenants: {
                        where: {
                          ...(officeId ? { officeId } : {}),
                          status: 'residing',
                        },
                        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
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
                          isHidden: false,
                        },
                        orderBy: { updatedAt: 'desc' },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
    });
    if (!site) throw new NotFoundException('Site not found');
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
    if (!site) throw new NotFoundException('Site not found');

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
            tenants: {
              where: { officeId, status: 'residing' },
              include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
            },
            consultations: {
              where: { officeId },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
            },
            listings: {
              where: { officeId, isHidden: false },
              orderBy: { updatedAt: 'desc' },
            },
          },
        },
      },
    });
  }

  private withContactPhones<T>(site: T): T {
    const hydrateProperty = (property: {
      propertyContacts?: Array<{ contact?: { phones?: [] } | null }>;
      tenants?: Array<{ contact?: { phones?: [] } | null }>;
      consultations?: Array<{ contact?: { phones?: [] } | null }>;
    }) => {
      if (property.propertyContacts) {
        property.propertyContacts = property.propertyContacts.map((propertyContact) => ({
          ...propertyContact,
          contact: propertyContact.contact ? withPrimaryPhone(propertyContact.contact) : propertyContact.contact,
        }));
      }
      if (property.tenants) {
        property.tenants = property.tenants.map((tenant) => ({
          ...tenant,
          contact: tenant.contact ? withPrimaryPhone(tenant.contact) : tenant.contact,
        }));
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
