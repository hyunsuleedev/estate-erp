import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteType } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_SITE_TYPES: ReadonlySet<string> = new Set(Object.values(SiteType));
// 토지/단독은 Unit 자체가 없음 → property는 siteId만으로 식별
const UNIT_FORBIDDEN_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.HOUSE,
  SiteType.LAND,
]);
// 나머지(아파트/오피스텔/빌라/상가/숙박시설 등)는 모두 Unit 필수
const UNIT_REQUIRED_SITE_TYPES: ReadonlySet<string> = new Set(
  Object.values(SiteType).filter((t) => !UNIT_FORBIDDEN_SITE_TYPES.has(t)),
);
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'createdAt',
  'updatedAt',
]);
const VALID_SORT_ORDERS: ReadonlySet<string> = new Set(['asc', 'desc']);

export interface PropertySearchQuery {
  siteType?: string;
  wardCode?: string;
  siteId?: string;
  unitId?: string;
  search?: string;
  hasListing?: boolean;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface PropertyCreateDto {
  siteId: string;
  unitId?: string | null;
  ownerName?: string;
  ownerPhone?: string;
}

interface PropertyUpdateDto {
  siteId?: string;
  unitId?: string | null;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: PropertySearchQuery = {}) {
    if (query.siteType) {
      this.assertValidSiteType(query.siteType);
    }

    const filters: Prisma.PropertyWhereInput[] = [{ officeId }];

    if (query.siteId) {
      filters.push({ siteId: query.siteId });
    }

    if (query.unitId) {
      filters.push({ unitId: query.unitId });
    }

    if (query.siteType || query.wardCode) {
      filters.push({
        site: {
          ...(query.siteType && { type: query.siteType }),
          ...(query.wardCode && { wardCode: query.wardCode }),
        },
      });
    }

    if (query.hasListing) {
      filters.push({ listings: { some: {} } });
    }

    if (query.search) {
      filters.push({
        OR: [
          { site: { name: { contains: query.search, mode: 'insensitive' } } },
          {
            site: {
              roadAddress: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            site: {
              jibunAddress: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            site: {
              ward: { name: { contains: query.search, mode: 'insensitive' } },
            },
          },
          {
            site: {
              ward: {
                district: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            site: {
              ward: {
                district: {
                  province: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            },
          },
        ],
      });
    }

    const where =
      filters.length === 1 ? filters[0] : ({ AND: filters } as Prisma.PropertyWhereInput);
    const sortBy = this.resolveSortField(query.sortBy);
    const sortOrder = this.resolveSortOrder(query.sortOrder);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
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
          unit: {
            include: {
              dong: true,
              siteUnitType: true,
            },
          },
          propertyContacts: { include: { contact: true } },
          tenants: {
            include: { contact: true },
            orderBy: { createdAt: 'desc' },
          },
          listings: {
            orderBy: { createdAt: 'desc' },
            include: {
            advertisements: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            jointBrokeragePartner: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, officeId: string) {
    const property = await this.prisma.property.findFirst({
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
          },
        },
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
        propertyContacts: { include: { contact: true } },
        tenants: {
          include: { contact: true },
          orderBy: { createdAt: 'desc' },
        },
        listings: {
          orderBy: { createdAt: 'desc' },
          include: {
            advertisements: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            priceHistories: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            jointBrokeragePartner: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        consultations: {
          include: { contact: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  async create(officeId: string, dto: PropertyCreateDto) {
    const site = await this.findAccessibleSite(dto.siteId, officeId);
    const unit = await this.resolveUnit(site.id, officeId, dto.unitId ?? null);

    this.assertValidSiteUnitChain(site.type, unit);

    const { ownerName, ownerPhone: rawOwnerPhone } = dto;
    const ownerPhone = rawOwnerPhone
      ? rawOwnerPhone.replace(/[\s\-()]/g, '')
      : undefined;

    if (ownerName?.trim()) {
      return this.prisma.$transaction(async (tx) => {
        const property = await tx.property.create({
          data: {
            officeId,
            siteId: site.id,
            unitId: unit?.id ?? null,
          },
        });

        let contact = ownerPhone
          ? await tx.contact.findFirst({
              where: { officeId, phone: ownerPhone },
            })
          : null;

        if (!contact) {
          contact = await tx.contact.create({
            data: {
              officeId,
              name: ownerName.trim(),
              phone: ownerPhone,
            },
          });
        }

        await tx.propertyContact.create({
          data: {
            officeId,
            contactId: contact.id,
            propertyId: property.id,
            role: 'owner',
            isPrimary: true,
          },
        });

        return tx.property.findUnique({
          where: { id: property.id },
          include: {
            site: true,
            unit: {
              include: {
                dong: true,
                siteUnitType: true,
              },
            },
            propertyContacts: { include: { contact: true } },
          },
        });
      });
    }

    return this.prisma.property.create({
      data: {
        officeId,
        siteId: site.id,
        unitId: unit?.id ?? null,
      },
      include: {
        site: true,
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
      },
    });
  }

  async update(id: string, officeId: string, dto: PropertyUpdateDto) {
    const existingProperty = await this.prisma.property.findFirst({
      where: { id, officeId },
      include: {
        site: true,
        unit: true,
      },
    });

    if (!existingProperty) {
      throw new NotFoundException('Property not found');
    }

    const nextSite = dto.siteId
      ? await this.findAccessibleSite(dto.siteId, officeId)
      : existingProperty.site;
    const nextUnitId =
      dto.unitId === undefined ? existingProperty.unitId : dto.unitId;
    const nextUnit = await this.resolveUnit(nextSite.id, officeId, nextUnitId);

    this.assertValidSiteUnitChain(nextSite.type, nextUnit);

    return this.prisma.property.update({
      where: { id },
      data: {
        siteId: nextSite.id,
        unitId: nextUnit?.id ?? null,
      },
      include: {
        site: true,
        unit: {
          include: {
            dong: true,
            siteUnitType: true,
          },
        },
      },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);

    return this.prisma.property.delete({ where: { id } });
  }

  private resolveSortField(sortBy?: string) {
    return VALID_SORT_FIELDS.has(sortBy || '') ? sortBy! : 'createdAt';
  }

  private resolveSortOrder(sortOrder?: string) {
    return VALID_SORT_ORDERS.has(sortOrder || '') ? (sortOrder as 'asc' | 'desc') : 'desc';
  }

  private assertValidSiteType(siteType: string) {
    if (!VALID_SITE_TYPES.has(siteType as SiteType)) {
      throw new BadRequestException('Invalid siteType');
    }
  }

  private assertValidSiteUnitChain(
    siteType: string,
    unit: { id: string } | null,
  ) {
    if (UNIT_REQUIRED_SITE_TYPES.has(siteType) && !unit) {
      throw new BadRequestException(
        'unitId is required for building-type properties',
      );
    }

    if (UNIT_FORBIDDEN_SITE_TYPES.has(siteType) && unit) {
      throw new BadRequestException(
        'unitId is not allowed for house/land properties',
      );
    }
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

  private async resolveUnit(
    siteId: string,
    officeId: string,
    unitId?: string | null,
  ) {
    if (!unitId) {
      return null;
    }

    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        siteId,
        OR: [{ officeId }, { officeId: null }],
        site: {
          OR: [{ officeId }, { isPublic: true }],
        },
      },
      select: {
        id: true,
      },
    });

    if (!unit) {
      throw new BadRequestException('Unit does not belong to the selected site');
    }

    return unit;
  }
}
