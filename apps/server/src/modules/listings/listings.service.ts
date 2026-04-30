import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CheckStatus, TransactionType } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_CHECK_STATUSES: ReadonlySet<string> = new Set(
  Object.values(CheckStatus),
);
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

export interface ListingSearchQuery {
  propertyId?: string;
  transactionType?: string;
  checkStatus?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  siteType?: string;
  wardCode?: string;
  siteId?: string;
  search?: string;
  includeHidden?: boolean;
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface ListingCreateDto {
  propertyId: string;
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  memo?: string | null;
}

interface ListingUpdateDto {
  transactionType?: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  checkStatus?: string;
  isHidden?: boolean;
  memo?: string | null;
}

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: ListingSearchQuery = {}) {
    if (query.transactionType) {
      this.assertValidTransactionType(query.transactionType);
    }

    if (query.checkStatus) {
      this.assertValidCheckStatus(query.checkStatus);
    }

    const filters: Prisma.ListingWhereInput[] = [{ officeId }];

    if (!query.includeHidden) {
      filters.push({ isHidden: false });
    }

    if (query.propertyId) {
      filters.push({ propertyId: query.propertyId });
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

    if (query.areaMin !== undefined || query.areaMax !== undefined) {
      const areaRange = {
        ...(query.areaMin !== undefined && { gte: query.areaMin }),
        ...(query.areaMax !== undefined && { lte: query.areaMax }),
      };

      filters.push({
        property: {
          unit: {
            OR: [
              { exclusiveAreaM2: areaRange },
              { siteUnitType: { exclusiveAreaM2: areaRange } },
            ],
          },
        },
      });
    }

    if (query.siteId || query.siteType || query.wardCode) {
      filters.push({
        property: {
          ...(query.siteId && { siteId: query.siteId }),
          site: {
            ...(query.siteType && { type: query.siteType }),
            ...(query.wardCode && { wardCode: query.wardCode }),
          },
        },
      });
    }

    if (query.search) {
      filters.push({
        OR: [
          { property: { site: { name: { contains: query.search, mode: 'insensitive' } } } },
          {
            property: {
              site: {
                roadAddress: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
          {
            property: {
              site: {
                jibunAddress: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
          {
            property: {
              site: {
                ward: { name: { contains: query.search, mode: 'insensitive' } },
              },
            },
          },
          {
            property: {
              unit: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
          {
            property: {
              unit: {
                dong: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            property: {
              propertyContacts: {
                some: {
                  contact: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            },
          },
          {
            property: {
              propertyContacts: {
                some: {
                  contact: {
                    phone: { contains: query.search },
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
      filters.length === 1 ? filters[0] : ({ AND: filters } as Prisma.ListingWhereInput);
    const sortBy = this.resolveSortField(query.sortBy);
    const sortOrder = this.resolveSortOrder(query.sortOrder);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          property: {
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
            },
          },
          priceHistories: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
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
    const listing = await this.prisma.listing.findFirst({
      where: { id, officeId },
      include: {
        property: {
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
          },
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

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing;
  }

  async create(officeId: string, dto: ListingCreateDto) {
    this.assertValidTransactionType(dto.transactionType);

    // Verify the property exists and belongs to this office
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, officeId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return this.prisma.listing.create({
      data: {
        officeId,
        propertyId: dto.propertyId,
        transactionType: dto.transactionType,
        price: dto.price,
        deposit: dto.deposit,
        monthlyRent: dto.monthlyRent,
        memo: dto.memo,
      },
      include: {
        property: {
          include: {
            site: true,
            unit: {
              include: {
                dong: true,
                siteUnitType: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, officeId: string, dto: ListingUpdateDto) {
    const existingListing = await this.prisma.listing.findFirst({
      where: { id, officeId },
    });

    if (!existingListing) {
      throw new NotFoundException('Listing not found');
    }

    const nextTransactionType =
      dto.transactionType ?? existingListing.transactionType;
    this.assertValidTransactionType(nextTransactionType);

    if (dto.checkStatus) {
      this.assertValidCheckStatus(dto.checkStatus);
      this.assertCheckStatusTransition(
        existingListing.checkStatus,
        dto.checkStatus,
      );
    }

    return this.prisma.listing.update({
      where: { id },
      data: {
        ...dto,
        transactionType: nextTransactionType,
      },
      include: {
        property: {
          include: {
            site: true,
            unit: {
              include: {
                dong: true,
                siteUnitType: true,
              },
            },
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

    return this.prisma.listing.delete({ where: { id } });
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
}
