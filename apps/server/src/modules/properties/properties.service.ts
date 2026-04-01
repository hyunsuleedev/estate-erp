import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckStatus, SiteType, TransactionType } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_CHECK_STATUSES: ReadonlySet<string> = new Set(
  Object.values(CheckStatus),
);
const VALID_SITE_TYPES: ReadonlySet<string> = new Set(Object.values(SiteType));
const UNIT_REQUIRED_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.APARTMENT,
  SiteType.OFFICETEL,
]);
const UNIT_FORBIDDEN_SITE_TYPES: ReadonlySet<string> = new Set([
  SiteType.HOUSE,
  SiteType.LAND,
]);
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'price',
  'createdAt',
  'updatedAt',
]);
const VALID_SORT_ORDERS: ReadonlySet<string> = new Set(['asc', 'desc']);

const CHECK_STATUS_TRANSITIONS: Record<string, string[]> = {
  [CheckStatus.UNVERIFIED]: [CheckStatus.VERIFIED, CheckStatus.HOLD],
  [CheckStatus.VERIFIED]: [CheckStatus.IN_CONTRACT, CheckStatus.HOLD],
  [CheckStatus.IN_CONTRACT]: [CheckStatus.HOLD, CheckStatus.DONE],
  [CheckStatus.HOLD]: [
    CheckStatus.VERIFIED,
    CheckStatus.IN_CONTRACT,
    CheckStatus.DONE,
  ],
  [CheckStatus.DONE]: [],
};

export interface PropertySearchQuery {
  transactionType?: string;
  siteType?: string;
  checkStatus?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  wardCode?: string;
  siteId?: string;
  search?: string;
  includeHidden?: boolean;
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface PropertyCreateDto {
  siteId: string;
  unitId?: string | null;
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  memo?: string | null;
  ownerName?: string;
  ownerPhone?: string;
}

interface PropertyUpdateDto {
  siteId?: string;
  unitId?: string | null;
  transactionType?: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  checkStatus?: string;
  isHidden?: boolean;
  memo?: string | null;
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: PropertySearchQuery = {}) {
    if (query.transactionType) {
      this.assertValidTransactionType(query.transactionType);
    }

    if (query.checkStatus) {
      this.assertValidCheckStatus(query.checkStatus);
    }

    if (query.siteType) {
      this.assertValidSiteType(query.siteType);
    }

    const filters: Prisma.PropertyWhereInput[] = [{ officeId }];

    if (!query.includeHidden) {
      filters.push({ isHidden: false });
    }

    if (query.transactionType) {
      filters.push({ transactionType: query.transactionType });
    }

    if (query.checkStatus) {
      filters.push({ checkStatus: query.checkStatus });
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      filters.push({
        price: {
          ...(query.priceMin !== undefined && { gte: query.priceMin }),
          ...(query.priceMax !== undefined && { lte: query.priceMax }),
        },
      });
    }

    if (query.depositMin !== undefined || query.depositMax !== undefined) {
      filters.push({
        deposit: {
          ...(query.depositMin !== undefined && { gte: query.depositMin }),
          ...(query.depositMax !== undefined && { lte: query.depositMax }),
        },
      });
    }

    if (
      query.monthlyRentMin !== undefined ||
      query.monthlyRentMax !== undefined
    ) {
      filters.push({
        monthlyRent: {
          ...(query.monthlyRentMin !== undefined && {
            gte: query.monthlyRentMin,
          }),
          ...(query.monthlyRentMax !== undefined && {
            lte: query.monthlyRentMax,
          }),
        },
      });
    }

    if (query.siteId) {
      filters.push({ siteId: query.siteId });
    }

    if (query.siteType || query.wardCode) {
      filters.push({
        site: {
          ...(query.siteType && { type: query.siteType }),
          ...(query.wardCode && { wardCode: query.wardCode }),
        },
      });
    }

    if (query.areaMin !== undefined || query.areaMax !== undefined) {
      const areaFilter = {
        ...(query.areaMin !== undefined && { gte: query.areaMin }),
        ...(query.areaMax !== undefined && { lte: query.areaMax }),
      };

      filters.push({
        OR: [
          { unit: { exclusiveAreaM2: areaFilter } },
          { unit: { siteUnitType: { exclusiveAreaM2: areaFilter } } },
        ],
      });
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
          { memo: { contains: query.search, mode: 'insensitive' } },
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
          priceHistories: {
            orderBy: { createdAt: 'desc' },
            take: 5,
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
        matches: true,
        deals: true,
        consultations: {
          include: { contact: true },
          orderBy: { createdAt: 'desc' },
        },
        priceHistories: {
          include: { user: true },
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
    this.assertValidTransactionType(dto.transactionType);

    const site = await this.findAccessibleSite(dto.siteId, officeId);
    const unit = await this.resolveUnit(site.id, officeId, dto.unitId ?? null);

    this.assertValidSiteUnitChain(site.type, unit);

    const { ownerName, ownerPhone, ...propertyData } = dto;

    if (ownerName?.trim()) {
      return this.prisma.$transaction(async (tx) => {
        const property = await tx.property.create({
          data: {
            officeId,
            ...propertyData,
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
        ...propertyData,
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

    const nextTransactionType =
      dto.transactionType ?? existingProperty.transactionType;
    this.assertValidTransactionType(nextTransactionType);

    if (dto.checkStatus) {
      this.assertValidCheckStatus(dto.checkStatus);
      this.assertCheckStatusTransition(
        existingProperty.checkStatus,
        dto.checkStatus,
      );
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
        ...dto,
        transactionType: nextTransactionType,
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

  async transitionCheckStatus(id: string, officeId: string, checkStatus: string) {
    return this.update(id, officeId, { checkStatus });
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

  private assertValidTransactionType(transactionType: string) {
    if (!VALID_TRANSACTION_TYPES.has(transactionType as TransactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }
  }

  private assertValidCheckStatus(checkStatus: string) {
    if (!VALID_CHECK_STATUSES.has(checkStatus as CheckStatus)) {
      throw new BadRequestException('Invalid checkStatus');
    }
  }

  private assertValidSiteType(siteType: string) {
    if (!VALID_SITE_TYPES.has(siteType as SiteType)) {
      throw new BadRequestException('Invalid siteType');
    }
  }

  private assertCheckStatusTransition(current: string, next: string) {
    if (current === next) {
      return;
    }

    const allowedTransitions = CHECK_STATUS_TRANSITIONS[current] ?? [];

    if (!allowedTransitions.includes(next)) {
      throw new BadRequestException(
        `Invalid checkStatus transition: ${current} -> ${next}`,
      );
    }
  }

  private assertValidSiteUnitChain(
    siteType: string,
    unit: { id: string; dongId: string | null } | null,
  ) {
    if (UNIT_REQUIRED_SITE_TYPES.has(siteType) && !unit) {
      throw new BadRequestException(
        'unitId is required for apartment/officetel properties',
      );
    }

    if (UNIT_FORBIDDEN_SITE_TYPES.has(siteType) && unit) {
      throw new BadRequestException(
        'unitId is not allowed for house/land properties',
      );
    }

    if (UNIT_REQUIRED_SITE_TYPES.has(siteType) && unit && !unit.dongId) {
      throw new BadRequestException(
        'Apartment/officetel units must belong to a dong',
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
        dongId: true,
      },
    });

    if (!unit) {
      throw new BadRequestException('Unit does not belong to the selected site');
    }

    return unit;
  }
}
