import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CheckStatus,
  MaintenanceFeeInclude,
  TransactionType,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import { RealtimeService } from '../../realtime/realtime.service';

const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_CHECK_STATUSES: ReadonlySet<string> = new Set(
  Object.values(CheckStatus),
);
const VALID_MAINTENANCE_FEE_INCLUDES: ReadonlySet<string> = new Set(
  Object.values(MaintenanceFeeInclude),
);
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'price',
  'createdAt',
  'updatedAt',
]);
const VALID_SORT_ORDERS: ReadonlySet<string> = new Set(['asc', 'desc']);
const ACTIVE_INTAKE_STATUS = 'active';

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
  sortBy?: 'price' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface ListingCreateDto {
  propertyId: string;
  intakeId?: string | null;
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
  privateMemo?: string | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: Date | string | null;
  moveInAvailableTo?: Date | string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
}

interface ListingUpdateDto {
  transactionType?: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  maintenanceFee?: number | null;
  maintenanceFeeIncludes?: string[];
  loanAmount?: number | null;
  premium?: number | null;
  privateMemo?: string | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: Date | string | null;
  moveInAvailableTo?: Date | string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  checkStatus?: string;
  memo?: string | null;
  expectedUpdatedAt?: Date | string | null;
}

interface ListingFilterSite {
  id: string;
  name: string;
  type: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  listingCount: number;
  propertyCount: number;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async findAll(officeId: string, query: ListingSearchQuery = {}) {
    if (query.transactionType) {
      this.assertValidTransactionType(query.transactionType);
    }

    if (query.checkStatus) {
      this.assertValidCheckStatus(query.checkStatus);
    }

    const filters: Prisma.ListingWhereInput[] = [{ officeId }];

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
      const normalizedSearch = normalizePhone(query.search);
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
                    phones: { some: { normalizedPhone: { contains: normalizedSearch } } },
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
              propertyContacts: { include: { contact: { include: { phones: contactPhonesIncludeOrdered } } } },
              tenants: {
                include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
                orderBy: { createdAt: 'desc' },
              },
              listings: {
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  intakeId: true,
                  transactionType: true,
                  price: true,
                  deposit: true,
                  monthlyRent: true,
                  maintenanceFee: true,
                  maintenanceFeeIncludes: true,
                  loanAmount: true,
                  premium: true,
                  privateMemo: true,
                  moveInAvailableType: true,
                  moveInAvailableFrom: true,
                  moveInAvailableTo: true,
                  isJointBrokerageRequired: true,
                  jointBrokeragePartnerId: true,
                  checkStatus: true,
                  memo: true,
                  createdAt: true,
                  updatedAt: true,
                  // 매물 목록 매칭 칩 카운트용
                  _count: { select: { matches: true } },
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
          },
          jointBrokeragePartner: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          advertisements: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          priceHistories: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          // 매물 목록 매칭 칩 카운트용
          _count: { select: { matches: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: items.map((listing) => this.withContactPhones(listing)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findFilterSites(officeId: string) {
    const listings = await this.prisma.listing.findMany({
      where: {
        officeId,
      },
      select: {
        propertyId: true,
        property: {
          select: {
            site: {
              select: {
                id: true,
                name: true,
                type: true,
                roadAddress: true,
                jibunAddress: true,
              },
            },
          },
        },
      },
    });

    const sitesById = new Map<
      string,
      ListingFilterSite & { propertyIds: Set<string> }
    >();

    listings.forEach((listing) => {
      const site = listing.property?.site;

      if (!site) {
        return;
      }

      const existing = sitesById.get(site.id);

      if (existing) {
        existing.listingCount += 1;
        existing.propertyIds.add(listing.propertyId);
        existing.propertyCount = existing.propertyIds.size;
        return;
      }

      sitesById.set(site.id, {
        ...site,
        listingCount: 1,
        propertyCount: 1,
        propertyIds: new Set([listing.propertyId]),
      });
    });

    return Array.from(sitesById.values())
      .map((site) => ({
        id: site.id,
        name: site.name,
        type: site.type,
        roadAddress: site.roadAddress,
        jibunAddress: site.jibunAddress,
        listingCount: site.listingCount,
        propertyCount: site.propertyCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
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
            propertyContacts: { include: { contact: { include: { phones: contactPhonesIncludeOrdered } } } },
            tenants: {
              include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
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
        },
        jointBrokeragePartner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        advertisements: {
          orderBy: { createdAt: 'desc' },
          take: 5,
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

    return this.withContactPhones(listing);
  }

  async create(officeId: string, dto: ListingCreateDto) {
    this.assertValidTransactionType(dto.transactionType);
    this.assertValidMaintenanceFeeIncludes(dto.maintenanceFeeIncludes);

    // Verify the property exists and belongs to this office
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, officeId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const intake = await this.resolveActiveIntakeForCreate(
      officeId,
      dto.propertyId,
      dto.intakeId,
    );

    await this.assertNoDuplicateTransactionType(
      officeId,
      intake.id,
      dto.transactionType,
    );
    await this.assertAccessiblePartnerBroker(
      officeId,
      dto.jointBrokeragePartnerId,
    );

    const listing = await this.prisma.listing.create({
      data: {
        officeId,
        propertyId: dto.propertyId,
        intakeId: intake.id,
        transactionType: dto.transactionType,
        price: dto.price,
        deposit: dto.deposit,
        monthlyRent: dto.monthlyRent,
        maintenanceFee: dto.maintenanceFee,
        maintenanceFeeIncludes: dto.maintenanceFeeIncludes ?? undefined,
        loanAmount: dto.loanAmount,
        premium: dto.premium,
        privateMemo: dto.privateMemo,
        moveInAvailableType: dto.moveInAvailableType,
        moveInAvailableFrom: dto.moveInAvailableFrom,
        moveInAvailableTo: dto.moveInAvailableTo,
        isJointBrokerageRequired: dto.isJointBrokerageRequired,
        jointBrokeragePartnerId: dto.jointBrokeragePartnerId,
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
        jointBrokeragePartner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    this.realtime?.emitListingUpdated({
      officeId,
      listingId: listing.id,
      propertyId: listing.propertyId,
      intakeId: listing.intakeId,
    });

    return listing;
  }

  async update(id: string, officeId: string, dto: ListingUpdateDto) {
    const { expectedUpdatedAt, ...patch } = dto;
    const existingListing = await this.prisma.listing.findFirst({
      where: { id, officeId },
    });

    if (!existingListing) {
      throw new NotFoundException('Listing not found');
    }

    const nextTransactionType =
      patch.transactionType ?? existingListing.transactionType;
    this.assertValidTransactionType(nextTransactionType);
    this.assertValidMaintenanceFeeIncludes(patch.maintenanceFeeIncludes);

    if (nextTransactionType !== existingListing.transactionType) {
      await this.assertNoDuplicateTransactionType(
        officeId,
        existingListing.intakeId,
        nextTransactionType,
        id,
      );
    }

    if (patch.checkStatus) {
      this.assertValidCheckStatus(patch.checkStatus);
      this.assertCheckStatusTransition(
        existingListing.checkStatus,
        patch.checkStatus,
      );
    }
    await this.assertAccessiblePartnerBroker(
      officeId,
      patch.jointBrokeragePartnerId,
    );

    let listing;
    if (expectedUpdatedAt) {
      const expectedUpdatedAtDate = this.parseExpectedUpdatedAt(expectedUpdatedAt);
      const result = await this.prisma.listing.updateMany({
        where: { id, officeId, updatedAt: expectedUpdatedAtDate },
        data: {
          ...patch,
          transactionType: nextTransactionType,
        },
      });

      if (result.count === 0) {
        throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
      }

      listing = await this.findOne(id, officeId);
    } else {
      listing = await this.prisma.listing.update({
        where: { id },
        data: {
          ...patch,
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
          jointBrokeragePartner: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });
    }

    this.realtime?.emitListingUpdated({
      officeId,
      listingId: listing.id,
      propertyId: listing.propertyId,
      intakeId: listing.intakeId,
    });

    return listing;
  }

  async transitionCheckStatus(id: string, officeId: string, checkStatus: string) {
    return this.update(id, officeId, { checkStatus });
  }

  /**
   * 물건(호실) 단위 확인 상태 일괄 전환 — 같은 호실의 매매/전세/월세 Listing 이
   * 하나의 상태를 공유하는 UI 를 위해 원자적으로 전환한다.
   * updateMany 대신 트랜잭션 내 개별 update 를 사용해 ActivityLog 미들웨어의
   * 레코드별 감사 추적을 유지한다. 하나라도 실패하면 전체 롤백.
   */
  async bulkTransitionCheckStatus(
    listingIds: string[],
    officeId: string,
    checkStatus: string,
  ) {
    this.assertValidCheckStatus(checkStatus);
    const uniqueIds = Array.from(new Set(listingIds));
    if (uniqueIds.length === 0) return { count: 0 };

    // 검증-갱신 사이에 다른 요청이 상태를 바꾸면 금지 전환이 기록될 수 있으므로
    // (TOCTOU), 트랜잭션 안에서 행 잠금(FOR UPDATE) 후 검증하고 같은 잠금
    // 아래에서 갱신한다. 동시 전환 요청은 잠금 해제 후 자신의 검증을 다시 탄다.
    const listings = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; property_id: string; intake_id: string; check_status: string }>
      >`
        SELECT id, property_id, intake_id, check_status FROM listings
        WHERE id = ANY(${uniqueIds}::uuid[]) AND office_id = ${officeId}::uuid
        FOR UPDATE`;
      if (rows.length !== uniqueIds.length) {
        throw new NotFoundException('Listing not found');
      }

      // 단건 경로와 동일한 파이프라인 전환 규칙 — 하나라도 금지 전환이면
      // (예: done → unverified) 전체 롤백으로 아무것도 반영하지 않는다.
      for (const row of rows) {
        this.assertCheckStatusTransition(row.check_status, checkStatus);
      }

      for (const row of rows) {
        if (row.check_status === checkStatus) continue;
        // 개별 update 유지 — ActivityLog 미들웨어의 레코드별 감사 추적 보존
        await tx.listing.update({
          where: { id: row.id },
          data: { checkStatus },
        });
      }
      return rows;
    });

    for (const listing of listings) {
      this.realtime?.emitListingUpdated({
        officeId,
        listingId: listing.id,
        propertyId: listing.property_id,
        intakeId: listing.intake_id,
      });
    }

    return { count: listings.length };
  }

  async remove(id: string, officeId: string) {
    const listing = await this.findOne(id, officeId);

    const deleted = await this.prisma.listing.delete({ where: { id } });

    this.realtime?.emitListingUpdated({
      officeId,
      listingId: listing.id,
      propertyId: listing.propertyId,
      intakeId: listing.intakeId,
    });

    return deleted;
  }

  private resolveSortField(sortBy?: string) {
    return VALID_SORT_FIELDS.has(sortBy || '') ? sortBy! : 'createdAt';
  }

  private resolveSortOrder(sortOrder?: string) {
    return VALID_SORT_ORDERS.has(sortOrder || '') ? (sortOrder as 'asc' | 'desc') : 'desc';
  }

  private withContactPhones<T>(listing: T): T {
    const draft = listing as Record<string, unknown>;
    const property = draft.property as
      | {
          propertyContacts?: Array<{ contact?: { phones?: [] } | null }>;
          tenants?: Array<{ contact?: { phones?: [] } | null }>;
        }
      | undefined;
    if (property?.propertyContacts) {
      property.propertyContacts = property.propertyContacts.map((propertyContact) => ({
        ...propertyContact,
        contact: propertyContact.contact ? withPrimaryPhone(propertyContact.contact) : propertyContact.contact,
      }));
    }
    if (property?.tenants) {
      property.tenants = property.tenants.map((tenant) => ({
        ...tenant,
        contact: tenant.contact ? withPrimaryPhone(tenant.contact) : tenant.contact,
      }));
    }
    return listing;
  }

  private assertValidTransactionType(transactionType: string) {
    if (!VALID_TRANSACTION_TYPES.has(transactionType as TransactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }
  }

  private assertValidMaintenanceFeeIncludes(includes?: string[] | null) {
    if (!includes) return;
    for (const slug of includes) {
      if (!VALID_MAINTENANCE_FEE_INCLUDES.has(slug)) {
        throw new BadRequestException(
          `Invalid maintenanceFeeIncludes slug: ${slug}`,
        );
      }
    }
  }

  private async assertNoDuplicateTransactionType(
    officeId: string,
    intakeId: string,
    transactionType: string,
    excludeListingId?: string,
  ) {
    const duplicateListing = await this.prisma.listing.findFirst({
      where: {
        officeId,
        intakeId,
        transactionType,
        ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
      },
      select: { id: true },
    });

    if (duplicateListing) {
      throw new ConflictException(
        '같은 매물에는 동일한 거래 유형의 매물을 중복 등록할 수 없습니다.',
      );
    }
  }

  private async resolveActiveIntakeForCreate(
    officeId: string,
    propertyId: string,
    intakeId?: string | null,
  ) {
    if (intakeId) {
      const intake = await this.prisma.listingIntake.findFirst({
        where: {
          id: intakeId,
          officeId,
          propertyId,
          status: ACTIVE_INTAKE_STATUS,
        },
        select: { id: true },
      });

      if (!intake) {
        throw new NotFoundException('Active ListingIntake not found');
      }

      return intake;
    }

    const existingIntake = await this.prisma.listingIntake.findFirst({
      where: {
        officeId,
        propertyId,
        status: ACTIVE_INTAKE_STATUS,
      },
      select: { id: true },
    });

    if (existingIntake) {
      return existingIntake;
    }

    return this.prisma.listingIntake.create({
      data: {
        officeId,
        propertyId,
      },
      select: { id: true },
    });
  }

  private async assertAccessiblePartnerBroker(
    officeId: string,
    partnerBrokerId?: string | null,
  ) {
    if (!partnerBrokerId) return;

    const partnerBroker = await this.prisma.partnerBroker.findFirst({
      where: { id: partnerBrokerId, officeId },
      select: { id: true },
    });

    if (!partnerBroker) {
      throw new NotFoundException('PartnerBroker not found');
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

  private parseExpectedUpdatedAt(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expectedUpdatedAt must be a valid date');
    }
    return date;
  }
}
