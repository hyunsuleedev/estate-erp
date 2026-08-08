import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  MaintenanceFeeInclude,
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES,
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
import {
  buildIntakeConfirmationWhere,
  buildListingAvailabilityWhere,
  NON_CLOSED_INTAKE_WHERE,
  OCCUPYING_DEALS_SELECT,
} from './listing-state';
import {
  listingCaseParticipants,
  resolveBrokerageCaseForIntake,
} from '../brokerage-cases/brokerage-case.resolver';

const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_INTAKE_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set(
  Object.values(IntakeLifecycleStatus),
);
const VALID_CONFIRMATION_STATES: ReadonlySet<string> = new Set(
  Object.values(IntakeConfirmationState),
);
const VALID_LISTING_AVAILABILITIES: ReadonlySet<string> = new Set(
  Object.values(ListingAvailability),
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

/**
 * "현재 매물" 표시 공통 조건 — 열린 의뢰의 매물만.
 * 목록·형제 매물·단지 필터 카운트·호실 그리드가 같은 기준을 공유해야
 * 화면 간 숫자가 어긋나지 않는다. 종료 의뢰 매물은 명시 필터로만 조회.
 */
const NON_CLOSED_INTAKE_LISTING_WHERE = {
  intake: NON_CLOSED_INTAKE_WHERE,
} satisfies Prisma.ListingWhereInput;

/** 의뢰 컨텍스트 — Listing 응답에 항상 실어 이중 조회(오버레이)를 없앤다 */
const INTAKE_SELECT = {
  select: {
    id: true,
    lifecycleStatus: true,
    lifecycleChangedAt: true,
    lifecycleChangedBy: true,
    closedReason: true,
    receivedAt: true,
    lastCheckedAt: true,
    lastVerifiedAt: true,
    lastCheckResult: true,
    nextConfirmAt: true,
    isJointBrokerageRequired: true,
    jointBrokeragePartnerId: true,
    jointBrokeragePartner: {
      select: {
        id: true,
        name: true,
        phone: true,
      },
    },
    memo: true,
    updatedAt: true,
  },
} satisfies { select: Prisma.ListingIntakeSelect };

/** update() 반환용 공통 include */
const LISTING_UPDATE_INCLUDE = {
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
  intake: INTAKE_SELECT,
  deals: OCCUPYING_DEALS_SELECT,
} satisfies Prisma.ListingInclude;

export interface ListingSearchQuery {
  propertyId?: string;
  transactionType?: string;
  /** 의뢰 생명주기 필터 */
  intakeLifecycleStatus?: string;
  /** 확인 이력에서 파생한 상태 필터 */
  confirmationState?: string;
  /** Deal/보류/종결을 합성한 Listing 가용 상태 필터 */
  availability?: string;
  /** true면 closed 의뢰의 Listing도 포함. 기본은 non-closed만. */
  includeClosed?: boolean;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  /** 공급면적 하한 (m²) */
  areaMin?: number;
  /** 공급면적 상한 (m²) */
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
  isPaused?: boolean;
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
  isPaused?: boolean;
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

    if (query.intakeLifecycleStatus) {
      this.assertValidIntakeLifecycleStatus(query.intakeLifecycleStatus);
    }
    if (
      query.confirmationState &&
      !VALID_CONFIRMATION_STATES.has(query.confirmationState)
    ) {
      throw new BadRequestException('Invalid confirmation state');
    }
    if (
      query.availability &&
      !VALID_LISTING_AVAILABILITIES.has(query.availability)
    ) {
      throw new BadRequestException('Invalid listing availability');
    }

    const filters: Prisma.ListingWhereInput[] = [{ officeId }];

    if (query.propertyId) {
      filters.push({ propertyId: query.propertyId });
    }

    if (query.transactionType) {
      filters.push({ transactionType: query.transactionType });
    }

    if (query.intakeLifecycleStatus) {
      filters.push({
        intake: { lifecycleStatus: query.intakeLifecycleStatus },
      });
    } else if (!query.includeClosed) {
      filters.push(NON_CLOSED_INTAKE_LISTING_WHERE);
    }

    if (query.confirmationState) {
      filters.push({
        intake: buildIntakeConfirmationWhere(
          query.confirmationState,
          new Date(),
        ),
      });
    }

    if (query.availability) {
      filters.push(buildListingAvailabilityWhere(query.availability));
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
      // BuyerRequirement의 areaMin/areaMax와 같은 의미: 희망 공급면적(m²).
      // Unit의 개별값을 우선하고, 없을 때만 평형 카탈로그 값을 사용한다.
      const areaRange = {
        ...(query.areaMin !== undefined && { gte: query.areaMin }),
        ...(query.areaMax !== undefined && { lte: query.areaMax }),
      };

      filters.push({
        property: {
          unit: {
            OR: [
              { supplyAreaM2: areaRange },
              {
                supplyAreaM2: null,
                siteUnitType: { supplyAreaM2: areaRange },
              },
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
      const canonicalPhone = normalizePhone(query.search);
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
          ...(canonicalPhone
            ? [{
                property: {
                  propertyContacts: {
                    some: {
                      contact: {
                        phones: { some: { phone: { contains: canonicalPhone } } },
                      },
                    },
                  },
                },
              }]
            : []),
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
          intake: INTAKE_SELECT,
          deals: OCCUPYING_DEALS_SELECT,
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
                where: NON_CLOSED_INTAKE_LISTING_WHERE,
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
                  isPaused: true,
                  memo: true,
                  createdAt: true,
                  updatedAt: true,
                  deals: OCCUPYING_DEALS_SELECT,
                  // 매물 목록 매칭 칩 카운트용
                  _count: { select: { matches: true } },
                  advertisements: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                  },
                },
              },
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
      // 단지 필터의 매물/호실 카운트는 기본 목록과 같은 기준(열린 의뢰만)
      where: {
        officeId,
        ...NON_CLOSED_INTAKE_LISTING_WHERE,
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
        intake: INTAKE_SELECT,
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
              where: NON_CLOSED_INTAKE_LISTING_WHERE,
              orderBy: { createdAt: 'desc' },
              include: {
                deals: OCCUPYING_DEALS_SELECT,
                advertisements: {
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                },
              },
            },
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

    const intake = await this.resolveNonClosedIntakeForCreate(
      officeId,
      dto.propertyId,
      dto.intakeId,
    );

    await this.assertNoDuplicateTransactionType(
      officeId,
      intake.id,
      dto.transactionType,
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
        isPaused: dto.isPaused,
        memo: dto.memo,
      },
      include: LISTING_UPDATE_INCLUDE,
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

    // transactionType 은 [intakeId, transactionType] 복합 unique 키의 일부다.
    // 값이 그대로여도 UPDATE 의 SET 대상에 포함되면 PostgreSQL 이 행 잠금을
    // FOR UPDATE(배타)로 승격시켜, 감사 미들웨어의 트랜잭션 밖 price_histories
    // INSERT(FOR KEY SHARE)와 자기 잠금 충돌이 난다 — 실제로 바뀔 때만 쓴다.
    const { transactionType: _requestedTransactionType, ...patchWithoutTx } = patch;
    const transactionTypeChanged =
      nextTransactionType !== existingListing.transactionType;
    // 빈 PATCH 는 "확인일 갱신" 시그니처다 (updatedAt = 확인일 규약) — 예전에는
    // transactionType 을 항상 써서 우연히 동작했지만, 이제는 updatedAt 을 명시로 touch 한다.
    // (updatedAt 은 감사 로그 SKIP 필드라 ActivityLog 노이즈도 없다)
    const updateData = transactionTypeChanged
      ? { ...patchWithoutTx, transactionType: nextTransactionType }
      : Object.keys(patchWithoutTx).length > 0
        ? patchWithoutTx
        : { updatedAt: new Date() };

    const updateWhere: Prisma.ListingWhereUniqueInput = expectedUpdatedAt
      ? {
          id,
          officeId,
          updatedAt: this.parseExpectedUpdatedAt(expectedUpdatedAt),
        }
      : { id };

    let listing;
    try {
      listing = await this.prisma.listing.update({
        where: updateWhere,
        data: updateData,
        include: LISTING_UPDATE_INCLUDE,
      });
    } catch (error) {
      // id(고유 키)에 updatedAt 조건을 더한 단일 행 update가 실패하면
      // 조회 이후 다른 요청이 먼저 수정한 것이다. updateMany를 사용하면
      // 수정 전/후 행을 얻지 못해 가격 이력과 감사 로그가 누락된다.
      if (
        expectedUpdatedAt &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
      }
      throw error;
    }

    this.realtime?.emitListingUpdated({
      officeId,
      listingId: listing.id,
      propertyId: listing.propertyId,
      intakeId: listing.intakeId,
    });

    return listing;
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

  /**
   * 매물 생성 시 붙일 닫히지 않은 의뢰를 찾거나 생성한다.
   * open/hold 의뢰가 있으면 재사용하고 closed 의뢰에는 추가하지 않는다.
   * 동시 생성 경쟁은 DB partial unique index 가 잡아주며, 충돌 시 재조회한다.
   */
  private async resolveNonClosedIntakeForCreate(
    officeId: string,
    propertyId: string,
    intakeId?: string | null,
  ) {
    const nonClosedLifecycleFilter = {
      in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
    };

    if (intakeId) {
      const intake = await this.prisma.listingIntake.findFirst({
        where: {
          id: intakeId,
          officeId,
          propertyId,
          lifecycleStatus: nonClosedLifecycleFilter,
        },
        select: { id: true },
      });

      if (!intake) {
        throw new NotFoundException('Non-closed ListingIntake not found');
      }

      return intake;
    }

    const existingIntake = await this.prisma.listingIntake.findFirst({
      where: {
        officeId,
        propertyId,
        lifecycleStatus: nonClosedLifecycleFilter,
      },
      select: { id: true },
    });

    if (existingIntake) {
      return existingIntake;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const participants = await listingCaseParticipants(
          tx,
          officeId,
          propertyId,
        );
        const resolvedCase = await resolveBrokerageCaseForIntake(tx, {
          officeId,
          intakeKind: 'listing',
          participants,
        });
        return tx.listingIntake.create({
          data: {
            officeId,
            ...resolvedCase,
            propertyId,
            lifecycleChangedAt: new Date(),
            lifecycleChangedBy: 'user',
          },
          select: { id: true },
        });
      });
    } catch (error) {
      // 동시 생성 경쟁 — partial unique index 충돌이면 먼저 생성된 열린 의뢰 재사용
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.listingIntake.findFirst({
          where: {
            officeId,
            propertyId,
            lifecycleStatus: nonClosedLifecycleFilter,
          },
          select: { id: true },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private assertValidIntakeLifecycleStatus(lifecycleStatus: string) {
    if (!VALID_INTAKE_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
      throw new BadRequestException('Invalid intake lifecycle status');
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
