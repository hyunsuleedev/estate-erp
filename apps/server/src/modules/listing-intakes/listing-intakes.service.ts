import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  MaintenanceFeeInclude,
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES,
  OCCUPYING_DEAL_STAGES,
  TransactionType,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { buildIntakeConfirmationWhere } from '../listings/listing-state';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import { RealtimeService } from '../../realtime/realtime.service';

const DEFAULT_INTAKE_LIFECYCLE_STATUS = IntakeLifecycleStatus.OPEN;
const VALID_INTAKE_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set(
  Object.values(IntakeLifecycleStatus),
);
const VALID_INTAKE_CLOSED_REASONS: ReadonlySet<string> = new Set(
  Object.values(IntakeClosedReason),
);
const VALID_CONFIRMATION_STATES: ReadonlySet<string> = new Set(
  Object.values(IntakeConfirmationState),
);

/** 의뢰 생명주기 전이 규칙 — 확인/거래 상태와 독립된 유일한 저장 상태 */
const INTAKE_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  [IntakeLifecycleStatus.OPEN]: [
    IntakeLifecycleStatus.HOLD,
    IntakeLifecycleStatus.CLOSED,
  ],
  [IntakeLifecycleStatus.HOLD]: [
    IntakeLifecycleStatus.OPEN,
    IntakeLifecycleStatus.CLOSED,
  ],
  [IntakeLifecycleStatus.CLOSED]: [IntakeLifecycleStatus.OPEN],
};

const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_MAINTENANCE_FEE_INCLUDES: ReadonlySet<string> = new Set(
  Object.values(MaintenanceFeeInclude),
);

/** "이 거래 옵션이 거래중" 파생용 — 점유 Deal 최소 select */
const OCCUPYING_DEALS_SELECT = {
  where: {
    isCancelled: false,
    stage: { in: [...OCCUPYING_DEAL_STAGES] },
  },
  select: {
    id: true,
    stage: true,
    stageChangedAt: true,
  },
} satisfies Prisma.Listing$dealsArgs;
const VALID_CONFIRM_RESULTS: ReadonlySet<string> = new Set(
  Object.values(IntakeCheckResult),
);
const VALID_CONFIRM_CHANNELS = new Set([
  'phone',
  'sms',
  'visit',
  'owner_message',
  'note',
  'mcp',
]);
const MAP_INTAKES_LIMIT = 5000;

export interface ListingIntakeSearchQuery {
  lifecycleStatus?: string;
  confirmationState?: string;
  nextConfirmFrom?: Date | string;
  nextConfirmTo?: Date | string;
  includeClosed?: boolean;
  propertyId?: string;
  transactionType?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  hasAdvertisement?: boolean;
  isJointBrokerage?: boolean;
  siteType?: string;
  provinceCode?: string;
  districtCode?: string;
  wardCode?: string;
  siteId?: string;
  search?: string;
  dong?: string;
  unit?: string;
  moveInFrom?: Date | string;
  moveInTo?: Date | string;
  sortBy?: 'receivedAt' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface ListingInputDto {
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

interface ListingIntakeCreateDto {
  propertyId: string;
  lifecycleStatus?: string;
  closedReason?: string | null;
  receivedAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  lastVerifiedAt?: Date | string | null;
  lastCheckResult?: string | null;
  nextConfirmAt?: Date | string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
  listings?: ListingInputDto[];
}

interface ListingIntakeUpdateDto {
  lifecycleStatus?: string;
  closedReason?: string | null;
  receivedAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  lastVerifiedAt?: Date | string | null;
  lastCheckResult?: string | null;
  nextConfirmAt?: Date | string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
  expectedUpdatedAt?: Date | string | null;
}

interface ListingIntakeConfirmDto {
  result: string;
  channel?: string;
  memo?: string | null;
  checkedAt?: Date | string | null;
  nextConfirmAt?: Date | string | null;
  contactId?: string | null;
  expectedUpdatedAt?: Date | string | null;
}

@Injectable()
export class ListingIntakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async findAll(officeId: string, query: ListingIntakeSearchQuery = {}) {
    this.assertValidQuery(query);

    const { where, listingWhere } = this.buildFindManyWhere(officeId, query);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const orderBy = this.resolveOrderBy(query.sortBy, query.sortOrder);
    const includedListingWhere = {};

    const rows = await this.prisma.listingIntake.findMany({
      where,
      select: this.buildListSelect(includedListingWhere),
      orderBy,
      skip,
      take: limit + 1,
    });
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page,
        limit,
        hasNextPage,
        total: null,
        totalPages: null,
      },
    };
  }

  async findMapIntakes(officeId: string, query: ListingIntakeSearchQuery = {}) {
    this.assertValidQuery(query);

    const { where, listingWhere } = this.buildFindManyWhere(officeId, query);
    const rows = await this.prisma.listingIntake.findMany({
      where,
      select: this.buildMapSelect(listingWhere),
      orderBy: this.resolveOrderBy(query.sortBy, query.sortOrder),
      take: MAP_INTAKES_LIMIT + 1,
    });
    const truncated = rows.length > MAP_INTAKES_LIMIT;
    const items = truncated ? rows.slice(0, MAP_INTAKES_LIMIT) : rows;

    return {
      items: items.map((item) => this.toResponse(item)),
      truncated,
      limit: MAP_INTAKES_LIMIT,
    };
  }

  async findOne(id: string, officeId: string) {
    const intake = await this.prisma.listingIntake.findFirst({
      where: { id, officeId },
      include: this.buildDetailInclude(),
    });

    if (!intake) {
      throw new NotFoundException('ListingIntake not found');
    }

    return this.toResponse(intake);
  }

  async create(officeId: string, dto: ListingIntakeCreateDto) {
    const lifecycleStatus =
      dto.lifecycleStatus ?? DEFAULT_INTAKE_LIFECYCLE_STATUS;
    this.assertValidIntakeLifecycleStatus(lifecycleStatus);
    const closedReason = this.resolveClosedReason(
      lifecycleStatus,
      dto.closedReason,
    );
    this.assertValidConfirmResult(dto.lastCheckResult, true);
    this.assertValidConfirmationHistory(
      dto.lastCheckedAt ?? null,
      dto.lastVerifiedAt ?? null,
      dto.lastCheckResult ?? null,
    );
    this.assertValidListingInputs(dto.listings ?? []);
    await this.assertAccessiblePartnerBroker(
      officeId,
      dto.isJointBrokerageRequired ? dto.jointBrokeragePartnerId : null,
    );

    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, officeId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (this.isNonClosedIntakeLifecycle(lifecycleStatus)) {
      await this.assertNoNonClosedIntake(officeId, dto.propertyId);
    }

    const duplicateTypes = new Set<string>();
    for (const listing of dto.listings ?? []) {
      if (duplicateTypes.has(listing.transactionType)) {
        throw new ConflictException(
          '같은 의뢰에는 동일한 거래 유형의 매물을 중복 등록할 수 없습니다.',
        );
      }
      duplicateTypes.add(listing.transactionType);
    }

    const intake = await this.prisma.$transaction(async (tx) => {
      const created = await tx.listingIntake
        .create({
          data: {
            officeId,
            propertyId: dto.propertyId,
            lifecycleStatus,
            lifecycleChangedAt: new Date(),
            lifecycleChangedBy: 'user',
            closedReason,
            receivedAt: dto.receivedAt ?? undefined,
            lastCheckedAt: dto.lastCheckedAt,
            lastVerifiedAt: dto.lastVerifiedAt,
            lastCheckResult: dto.lastCheckResult,
            nextConfirmAt: dto.nextConfirmAt,
            isJointBrokerageRequired: dto.isJointBrokerageRequired ?? false,
            jointBrokeragePartnerId: dto.isJointBrokerageRequired
              ? (dto.jointBrokeragePartnerId ?? null)
              : null,
            memo: dto.memo,
          },
          select: { id: true },
        })
        .catch((error) => {
          // 동시 생성 경쟁 — non-closed partial unique index
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException(
              '같은 관리 매물에는 활성 의뢰를 하나만 등록할 수 있습니다.',
            );
          }
          throw error;
        });

      for (const listing of dto.listings ?? []) {
        await tx.listing.create({
          data: {
            officeId,
            propertyId: dto.propertyId,
            intakeId: created.id,
            transactionType: listing.transactionType,
            price: listing.price,
            deposit: listing.deposit,
            monthlyRent: listing.monthlyRent,
            maintenanceFee: listing.maintenanceFee,
            maintenanceFeeIncludes: listing.maintenanceFeeIncludes ?? undefined,
            loanAmount: listing.loanAmount,
            premium: listing.premium,
            privateMemo: listing.privateMemo,
            moveInAvailableType: listing.moveInAvailableType,
            moveInAvailableFrom: listing.moveInAvailableFrom,
            moveInAvailableTo: listing.moveInAvailableTo,
            isPaused: listing.isPaused,
            memo: listing.memo,
          },
        });
      }

      return created;
    });

    this.realtime?.emitListingIntakeUpdated({
      officeId,
      intakeId: intake.id,
      propertyId: dto.propertyId,
    });

    return this.findOne(intake.id, officeId);
  }

  async update(id: string, officeId: string, dto: ListingIntakeUpdateDto) {
    const { expectedUpdatedAt, ...patch } = dto;
    const existing = await this.prisma.listingIntake.findFirst({
      where: { id, officeId },
    });

    if (!existing) {
      throw new NotFoundException('ListingIntake not found');
    }

    const nextLifecycleStatus =
      patch.lifecycleStatus ?? existing.lifecycleStatus;
    this.assertValidIntakeLifecycleStatus(nextLifecycleStatus);
    this.assertValidConfirmResult(patch.lastCheckResult, true);
    this.assertValidConfirmationHistory(
      patch.lastCheckedAt === undefined
        ? existing.lastCheckedAt
        : patch.lastCheckedAt,
      patch.lastVerifiedAt === undefined
        ? existing.lastVerifiedAt
        : patch.lastVerifiedAt,
      patch.lastCheckResult === undefined
        ? existing.lastCheckResult
        : patch.lastCheckResult,
    );
    const lifecycleChanged =
      nextLifecycleStatus !== existing.lifecycleStatus;
    // 사용자가 lifecycleStatus를 명시했으면 값이 같아도 전이 주체를 user로 승격 —
    // Deal이 자동 종결한 의뢰를 사용자가 "종결"로 재확인한 경우,
    // 이후 Deal 취소의 자동 복구 대상에서 빠져야 한다 (수동 종료로 취급).
    const lifecycleExplicit = patch.lifecycleStatus !== undefined;
    if (lifecycleChanged) {
      this.assertIntakeLifecycleTransition(
        existing.lifecycleStatus,
        nextLifecycleStatus,
      );
    }
    const closedReason = this.resolveClosedReason(
      nextLifecycleStatus,
      patch.closedReason ??
        (nextLifecycleStatus === IntakeLifecycleStatus.CLOSED
          ? existing.closedReason
          : null),
    );
    await this.assertAccessiblePartnerBroker(
      officeId,
      patch.isJointBrokerageRequired === false ? null : patch.jointBrokeragePartnerId,
    );

    if (
      this.isNonClosedIntakeLifecycle(nextLifecycleStatus) &&
      !this.isNonClosedIntakeLifecycle(existing.lifecycleStatus)
    ) {
      await this.assertNoNonClosedIntake(officeId, existing.propertyId, id);
    }

    const data = {
      lifecycleStatus: nextLifecycleStatus,
      lifecycleChangedAt: lifecycleChanged ? new Date() : undefined,
      lifecycleChangedBy:
        lifecycleChanged || lifecycleExplicit ? 'user' : undefined,
      closedReason,
      receivedAt: patch.receivedAt ?? undefined,
      lastCheckedAt: patch.lastCheckedAt,
      lastVerifiedAt: patch.lastVerifiedAt,
      lastCheckResult: patch.lastCheckResult,
      nextConfirmAt: patch.nextConfirmAt,
      isJointBrokerageRequired: patch.isJointBrokerageRequired,
      jointBrokeragePartnerId:
        patch.isJointBrokerageRequired === false
          ? null
          : patch.jointBrokeragePartnerId,
      memo: patch.memo,
    };
    let intake: { id: string };

    try {
      if (expectedUpdatedAt) {
        const expectedUpdatedAtDate = this.parseExpectedUpdatedAt(expectedUpdatedAt);
        const result = await this.prisma.listingIntake.updateMany({
          where: { id, officeId, updatedAt: expectedUpdatedAtDate },
          data,
        });

        if (result.count === 0) {
          throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
        }

        intake = { id };
      } else {
        intake = await this.prisma.listingIntake.update({
          where: { id },
          data,
          select: { id: true },
        });
      }
    } catch (error) {
      // 재개(closed → open) 경쟁 — 사전 검사 후 다른 요청이 먼저
      // 열린 의뢰를 만들면 partial unique index 가 잡는다. 500 대신 충돌로 응답.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          '같은 관리 매물에는 활성 의뢰를 하나만 등록할 수 있습니다.',
        );
      }
      throw error;
    }

    this.realtime?.emitListingIntakeUpdated({
      officeId,
      intakeId: intake.id,
      propertyId: existing.propertyId,
    });

    return this.findOne(intake.id, officeId);
  }

  async updateLifecycleStatus(
    id: string,
    officeId: string,
    lifecycleStatus: string,
    closedReason?: string | null,
  ) {
    return this.update(id, officeId, { lifecycleStatus, closedReason });
  }

  async addListing(id: string, officeId: string, dto: ListingInputDto) {
    this.assertValidListingInputs([dto]);

    const intake = await this.prisma.listingIntake.findFirst({
      where: { id, officeId },
      select: { id: true, propertyId: true, lifecycleStatus: true },
    });

    if (!intake) {
      throw new NotFoundException('ListingIntake not found');
    }

    if (!this.isNonClosedIntakeLifecycle(intake.lifecycleStatus)) {
      throw new BadRequestException('Closed intakes cannot add listings');
    }

    return this.listings.create(officeId, {
      ...dto,
      propertyId: intake.propertyId,
      intakeId: intake.id,
    });
  }

  async confirm(
    id: string,
    officeId: string,
    userId: string,
    dto: ListingIntakeConfirmDto,
  ) {
    this.assertValidConfirmResult(dto.result);
    this.assertValidConfirmChannel(dto.channel);

    const intake = await this.prisma.listingIntake.findFirst({
      where: { id, officeId },
      include: {
        property: {
          include: {
            propertyContacts: {
              orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'desc' as const }],
              select: {
                contactId: true,
                role: true,
                isPrimary: true,
              },
            },
          },
        },
      },
    });

    if (!intake) {
      throw new NotFoundException('ListingIntake not found');
    }

    const checkedAt = this.resolveDate(dto.checkedAt) ?? new Date();
    const nextConfirmAt = this.resolveNextConfirmAt(dto.result, checkedAt, dto.nextConfirmAt);
    const contactId = dto.contactId ?? this.resolveDefaultConfirmContactId(intake);
    const content = this.buildConfirmConsultationContent(dto.result, dto.memo);
    const consultationType = this.resolveConsultationType(dto.channel);
    const shouldUpdateLastVerifiedAt =
      dto.result === 'alive' || dto.result === 'price_changed';
    // 확인 결과는 확인 축에 기록하고, unavailable만 생명주기를 종결한다.
    const nextLifecycleStatus =
      dto.result === 'unavailable'
        ? IntakeLifecycleStatus.CLOSED
        : intake.lifecycleStatus;
    const lifecycleChanged =
      nextLifecycleStatus !== intake.lifecycleStatus;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (contactId) {
        await tx.consultation.create({
          data: {
            officeId,
            createdById: userId,
            contactId,
            type: consultationType,
            purpose: 'listing_confirm',
            content,
            propertyId: intake.propertyId,
            listingIntakeId: intake.id,
          },
          select: { id: true },
        });
      }

      const data = {
        lifecycleStatus: nextLifecycleStatus,
        lifecycleChangedAt: lifecycleChanged ? new Date() : undefined,
        // unavailable 확인은 이미 closed인 의뢰라도 사용자의 명시적 종결 승인 —
        // 주체를 user 로 승격해 자동 복구 대상에서 제외한다.
        lifecycleChangedBy:
          lifecycleChanged || dto.result === 'unavailable'
            ? 'user'
            : undefined,
        closedReason:
          dto.result === 'unavailable'
            ? IntakeClosedReason.UNAVAILABLE
            : undefined,
        lastCheckedAt: checkedAt,
        lastVerifiedAt: shouldUpdateLastVerifiedAt ? checkedAt : undefined,
        lastCheckResult: dto.result,
        nextConfirmAt,
      };

      if (dto.expectedUpdatedAt) {
        const result = await tx.listingIntake.updateMany({
          where: {
            id,
            officeId,
            updatedAt: this.parseExpectedUpdatedAt(dto.expectedUpdatedAt),
          },
          data,
        });

        if (result.count === 0) {
          throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
        }

        return { id };
      }

      return tx.listingIntake.update({
        where: { id },
        data,
        select: { id: true },
      });
    });

    this.realtime?.emitListingIntakeUpdated({
      officeId,
      intakeId: updated.id,
      propertyId: intake.propertyId,
      actorUserId: userId,
    });

    return this.findOne(updated.id, officeId);
  }

  async remove(id: string, officeId: string) {
    return this.updateLifecycleStatus(
      id,
      officeId,
      IntakeLifecycleStatus.CLOSED,
      IntakeClosedReason.OTHER,
    );
  }

  private buildFindManyWhere(officeId: string, query: ListingIntakeSearchQuery) {
    const listingWhere = this.buildListingWhere(query);
    const filters: Prisma.ListingIntakeWhereInput[] = [{ officeId }];

    if (query.lifecycleStatus) {
      filters.push({ lifecycleStatus: query.lifecycleStatus });
    } else if (!query.includeClosed) {
      filters.push({
        lifecycleStatus: {
          in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
        },
      });
    }

    if (query.confirmationState) {
      filters.push(
        buildIntakeConfirmationWhere(query.confirmationState, new Date()),
      );
    }

    if (query.nextConfirmFrom || query.nextConfirmTo) {
      filters.push({
        nextConfirmAt: {
          ...(query.nextConfirmFrom && { gte: this.resolveDate(query.nextConfirmFrom) ?? undefined }),
          ...(query.nextConfirmTo && { lte: this.resolveDate(query.nextConfirmTo) ?? undefined }),
        },
      });
    }

    if (query.propertyId) {
      filters.push({ propertyId: query.propertyId });
    }

    if (Object.keys(listingWhere).length > 0) {
      filters.push({ listings: { some: listingWhere } });
    }

    if (query.isJointBrokerage !== undefined) {
      // 공동중개는 의뢰(ListingIntake)가 단일 소유 — Listing 쪽 판정 없음
      filters.push({ isJointBrokerageRequired: query.isJointBrokerage });
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

    if (query.siteId || query.siteType || query.provinceCode || query.districtCode || query.wardCode) {
      filters.push({
        property: {
          ...(query.siteId && { siteId: query.siteId }),
          site: {
            ...(query.siteType && { type: query.siteType }),
            ...(query.wardCode && { wardCode: query.wardCode }),
            ...(!query.wardCode && (query.districtCode || query.provinceCode) && {
              ward: {
                ...(query.districtCode && { districtCode: query.districtCode }),
                ...(!query.districtCode && query.provinceCode && {
                  district: { provinceCode: query.provinceCode },
                }),
              },
            }),
          },
        },
      });
    }

    if (query.dong || query.unit) {
      filters.push({
        property: {
          unit: {
            AND: [
              ...(query.dong
                ? [{
                    dong: {
                      name: { equals: query.dong.trim(), mode: 'insensitive' as const },
                    },
                  }]
                : []),
              ...(query.unit
                ? [{
                    name: { equals: query.unit.trim(), mode: 'insensitive' as const },
                  }]
                : []),
            ],
          },
        },
      });
    }

    if (query.search) {
      filters.push(this.buildSearchFilter(query.search));
    }

    return {
      listingWhere,
      where: filters.length === 1
        ? filters[0]
        : ({ AND: filters } as Prisma.ListingIntakeWhereInput),
    };
  }

  private buildListingWhere(query: ListingIntakeSearchQuery) {
    const where: Prisma.ListingWhereInput = {};

    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      where.price = {
        ...(query.priceMin !== undefined && { gte: query.priceMin }),
        ...(query.priceMax !== undefined && { lte: query.priceMax }),
      };
    }

    if (query.depositMin !== undefined || query.depositMax !== undefined) {
      where.deposit = {
        ...(query.depositMin !== undefined && { gte: query.depositMin }),
        ...(query.depositMax !== undefined && { lte: query.depositMax }),
      };
    }

    if (
      query.monthlyRentMin !== undefined ||
      query.monthlyRentMax !== undefined
    ) {
      where.monthlyRent = {
        ...(query.monthlyRentMin !== undefined && {
          gte: query.monthlyRentMin,
        }),
        ...(query.monthlyRentMax !== undefined && {
          lte: query.monthlyRentMax,
        }),
      };
    }

    if (query.hasAdvertisement !== undefined) {
      where.advertisements = query.hasAdvertisement ? { some: {} } : { none: {} };
    }

    if (query.moveInFrom || query.moveInTo) {
      const range = {
        ...(query.moveInFrom && { gte: this.resolveDate(query.moveInFrom) ?? undefined }),
        ...(query.moveInTo && { lte: this.resolveDate(query.moveInTo) ?? undefined }),
      };
      where.moveInAvailableFrom = range;
    }

    return where;
  }

  private buildSearchFilter(search: string): Prisma.ListingIntakeWhereInput {
    const normalizedSearch = normalizePhone(search);
    return {
      OR: [
        { property: { site: { name: { contains: search, mode: 'insensitive' } } } },
        {
          property: {
            site: {
              roadAddress: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          property: {
            site: {
              jibunAddress: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          property: {
            site: {
              ward: { name: { contains: search, mode: 'insensitive' } },
            },
          },
        },
        {
          property: {
            unit: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          property: {
            unit: {
              dong: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
          },
        },
        {
          property: {
            propertyContacts: {
              some: {
                contact: {
                  name: { contains: search, mode: 'insensitive' },
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
        { memo: { contains: search, mode: 'insensitive' } },
        { listings: { some: { memo: { contains: search, mode: 'insensitive' } } } },
      ],
    };
  }

  private toResponse<T extends Record<string, unknown>>(intake: T) {
    const {
      requesterContactId,
      requesterContact,
      occupancyStatus,
      viewingMemo,
      rightsMemo,
      fieldMemo,
      ...rest
    } = intake;
    void requesterContactId;
    void requesterContact;
    void occupancyStatus;
    void viewingMemo;
    void rightsMemo;
    void fieldMemo;
    const response = rest as Record<string, unknown>;
    const property = response.property as
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
    const consultations = response.consultations as Array<{ contact?: { phones?: [] } | null }> | undefined;
    if (consultations) {
      response.consultations = consultations.map((consultation) => ({
        ...consultation,
        contact: consultation.contact ? withPrimaryPhone(consultation.contact) : consultation.contact,
      }));
    }
    return response;
  }

  private buildListSelect(listingWhere: Prisma.ListingWhereInput) {
    return {
      id: true,
      officeId: true,
      propertyId: true,
      lifecycleStatus: true,
      lifecycleChangedAt: true,
      lifecycleChangedBy: true,
      closedReason: true,
      receivedAt: true,
      lastCheckedAt: true,
      lastVerifiedAt: true,
      lastCheckResult: true,
      isJointBrokerageRequired: true,
      jointBrokeragePartnerId: true,
      nextConfirmAt: true,
      memo: true,
      createdAt: true,
      updatedAt: true,
      property: {
        select: this.buildListPropertySelect(),
      },
      jointBrokeragePartner: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      listings: {
        where: listingWhere,
        orderBy: { createdAt: 'desc' as const },
        select: {
          id: true,
          officeId: true,
          propertyId: true,
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
          isHidden: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          deals: OCCUPYING_DEALS_SELECT,
          advertisements: {
            orderBy: { createdAt: 'desc' as const },
            take: 5,
            select: {
              id: true,
              channel: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
    } satisfies Prisma.ListingIntakeSelect;
  }

  private buildMapSelect(listingWhere: Prisma.ListingWhereInput) {
    return {
      id: true,
      officeId: true,
      propertyId: true,
      lifecycleStatus: true,
      lifecycleChangedAt: true,
      lifecycleChangedBy: true,
      closedReason: true,
      receivedAt: true,
      lastCheckedAt: true,
      lastVerifiedAt: true,
      lastCheckResult: true,
      isJointBrokerageRequired: true,
      jointBrokeragePartnerId: true,
      nextConfirmAt: true,
      memo: true,
      createdAt: true,
      updatedAt: true,
      property: {
        select: this.buildListPropertySelect(),
      },
      listings: {
        where: listingWhere,
        orderBy: { createdAt: 'desc' as const },
        select: {
          id: true,
          officeId: true,
          propertyId: true,
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
          isHidden: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          deals: OCCUPYING_DEALS_SELECT,
        },
      },
    } satisfies Prisma.ListingIntakeSelect;
  }

  private buildListInclude(listingWhere: Prisma.ListingWhereInput) {
    return {
      property: {
        include: this.buildListPropertyInclude(),
      },
      jointBrokeragePartner: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      listings: {
        where: listingWhere,
        orderBy: { createdAt: 'desc' as const },
        include: {
          deals: OCCUPYING_DEALS_SELECT,
          advertisements: {
            orderBy: { createdAt: 'desc' as const },
            take: 5,
          },
        },
      },
    } satisfies Prisma.ListingIntakeInclude;
  }

  private buildDetailInclude() {
    return {
      ...this.buildListInclude({}),
      property: {
        include: this.buildDetailPropertyInclude(),
      },
      consultations: {
        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
        orderBy: { createdAt: 'desc' as const },
      },
      tasks: {
        orderBy: { createdAt: 'desc' as const },
        take: 20,
      },
    } satisfies Prisma.ListingIntakeInclude;
  }

  private buildListPropertyInclude() {
    return {
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
    } satisfies Prisma.PropertyInclude;
  }

  private buildListPropertySelect() {
    return {
      id: true,
      officeId: true,
      siteId: true,
      unitId: true,
      createdAt: true,
      updatedAt: true,
      site: {
        select: {
          id: true,
          name: true,
          type: true,
          roadAddress: true,
          jibunAddress: true,
          lat: true,
          lng: true,
          wardCode: true,
          ward: {
            select: {
              code: true,
              name: true,
              district: {
                select: {
                  code: true,
                  name: true,
                  province: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      unit: {
        select: {
          id: true,
          name: true,
          floor: true,
          exclusiveAreaM2: true,
          supplyAreaM2: true,
          dong: {
            select: {
              id: true,
              name: true,
              isPlaceholder: true,
            },
          },
          siteUnitType: {
            select: {
              id: true,
              name: true,
              exclusiveAreaM2: true,
              supplyAreaM2: true,
            },
          },
        },
      },
    } satisfies Prisma.PropertySelect;
  }

  private buildDetailPropertyInclude() {
    return {
      ...this.buildListPropertyInclude(),
      propertyContacts: { include: { contact: { include: { phones: contactPhonesIncludeOrdered } } } },
      tenants: {
        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
        orderBy: { createdAt: 'desc' as const },
      },
    } satisfies Prisma.PropertyInclude;
  }

  private resolveOrderBy(
    sortBy: ListingIntakeSearchQuery['sortBy'],
    sortOrder: ListingIntakeSearchQuery['sortOrder'],
  ): Prisma.ListingIntakeOrderByWithRelationInput {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    if (sortBy === 'createdAt') return { createdAt: order };
    if (sortBy === 'receivedAt') return { receivedAt: order };
    if (sortBy === 'updatedAt') return { updatedAt: order };
    return { receivedAt: order };
  }

  private assertValidQuery(query: ListingIntakeSearchQuery) {
    if (query.lifecycleStatus) {
      this.assertValidIntakeLifecycleStatus(query.lifecycleStatus);
    }
    if (
      query.confirmationState &&
      !VALID_CONFIRMATION_STATES.has(query.confirmationState)
    ) {
      throw new BadRequestException('Invalid confirmation state');
    }

    if (
      query.transactionType &&
      !VALID_TRANSACTION_TYPES.has(query.transactionType as TransactionType)
    ) {
      throw new BadRequestException('Invalid transactionType');
    }
  }

  private assertValidListingInputs(listings: ListingInputDto[]) {
    for (const listing of listings) {
      if (!VALID_TRANSACTION_TYPES.has(listing.transactionType as TransactionType)) {
        throw new BadRequestException('Invalid transactionType');
      }
      for (const slug of listing.maintenanceFeeIncludes ?? []) {
        if (
          !VALID_MAINTENANCE_FEE_INCLUDES.has(slug as MaintenanceFeeInclude)
        ) {
          throw new BadRequestException(
            `Invalid maintenanceFeeIncludes slug: ${slug}`,
          );
        }
      }
    }
  }

  private resolveClosedReason(
    lifecycleStatus: string,
    closedReason?: string | null,
  ) {
    if (lifecycleStatus !== IntakeLifecycleStatus.CLOSED) {
      if (closedReason !== undefined && closedReason !== null) {
        throw new BadRequestException(
          'closedReason is only valid for closed intakes',
        );
      }
      return null;
    }

    const resolved = closedReason ?? IntakeClosedReason.OTHER;
    if (!VALID_INTAKE_CLOSED_REASONS.has(resolved)) {
      throw new BadRequestException('Invalid ListingIntake closed reason');
    }
    return resolved;
  }

  private assertValidIntakeLifecycleStatus(lifecycleStatus: string) {
    if (!VALID_INTAKE_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
      throw new BadRequestException('Invalid ListingIntake lifecycle status');
    }
  }

  private assertIntakeLifecycleTransition(current: string, next: string) {
    const allowedTransitions = INTAKE_LIFECYCLE_TRANSITIONS[current] ?? [];
    if (!allowedTransitions.includes(next)) {
      throw new BadRequestException(
        `Invalid intake lifecycle transition: ${current} -> ${next}`,
      );
    }
  }

  private assertValidConfirmResult(
    result?: string | null,
    optional = false,
  ) {
    if (optional && (result === undefined || result === null)) return;
    if (!result || !VALID_CONFIRM_RESULTS.has(result)) {
      throw new BadRequestException('Invalid confirmation result');
    }
  }

  private assertValidConfirmChannel(channel?: string | null) {
    if (channel && !VALID_CONFIRM_CHANNELS.has(channel)) {
      throw new BadRequestException('Invalid confirmation channel');
    }
  }

  private assertValidConfirmationHistory(
    lastCheckedAt: Date | string | null,
    lastVerifiedAt: Date | string | null,
    lastCheckResult: string | null,
  ) {
    const checkedAt = this.resolveDate(lastCheckedAt);
    const verifiedAt = this.resolveDate(lastVerifiedAt);
    if (Boolean(checkedAt) !== Boolean(lastCheckResult)) {
      throw new BadRequestException(
        'lastCheckedAt and lastCheckResult must be set or cleared together',
      );
    }
    if (
      verifiedAt &&
      (!checkedAt || verifiedAt.getTime() > checkedAt.getTime())
    ) {
      throw new BadRequestException(
        'lastVerifiedAt cannot be after lastCheckedAt',
      );
    }
  }

  private resolveDate(value?: Date | string | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return date;
  }

  private parseExpectedUpdatedAt(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expectedUpdatedAt must be a valid date');
    }
    return date;
  }

  private resolveNextConfirmAt(
    result: string,
    checkedAt: Date,
    nextConfirmAt?: Date | string | null,
  ) {
    const explicit = this.resolveDate(nextConfirmAt);
    if (explicit) return explicit;
    if (result === 'unavailable') return null;

    const days =
      result === 'no_answer' ? 1 : result === 'pending' ? 2 : 7;
    return new Date(checkedAt.getTime() + days * 86_400_000);
  }

  private resolveDefaultConfirmContactId(
    intake: Prisma.ListingIntakeGetPayload<{
      include: {
        property: {
          include: {
            propertyContacts: {
              select: { contactId: true; role: true; isPrimary: true };
            };
          };
        };
      };
    }>,
  ) {
    const contacts = intake.property?.propertyContacts ?? [];
    return (
      contacts.find((contact) => contact.role === 'owner' && contact.isPrimary)
        ?.contactId ??
      contacts.find((contact) => contact.role === 'owner')?.contactId ??
      contacts[0]?.contactId ??
      null
    );
  }

  private buildConfirmConsultationContent(result: string, memo?: string | null) {
    const resultLabel: Record<string, string> = {
      alive: '살아있음',
      price_changed: '가격변경',
      unavailable: '거래완료/불가',
      no_answer: '부재중',
      pending: '답변대기',
    };
    const head = `[매물확인] ${resultLabel[result] ?? result}`;
    const body = memo?.trim();
    return body ? `${head}\n${body}` : head;
  }

  private resolveConsultationType(channel?: string | null) {
    if (channel === 'phone') return 'phone';
    if (channel === 'visit') return 'visit';
    return 'online';
  }

  private isNonClosedIntakeLifecycle(lifecycleStatus: string) {
    return NON_CLOSED_INTAKE_LIFECYCLE_STATUSES.includes(
      lifecycleStatus as (typeof NON_CLOSED_INTAKE_LIFECYCLE_STATUSES)[number],
    );
  }

  private async assertNoNonClosedIntake(
    officeId: string,
    propertyId: string,
    excludeIntakeId?: string,
  ) {
    const existing = await this.prisma.listingIntake.findFirst({
      where: {
        officeId,
        propertyId,
        lifecycleStatus: {
          in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
        },
        ...(excludeIntakeId ? { id: { not: excludeIntakeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        '같은 관리 매물에는 활성 의뢰를 하나만 등록할 수 있습니다.',
      );
    }
  }

  private async assertAccessiblePartnerBroker(
    officeId: string,
    partnerBrokerId?: string | null,
  ) {
    if (!partnerBrokerId) return;

    const partnerBroker = await this.prisma.partnerBroker.findFirst({
      where: { id: partnerBrokerId, officeId, isActive: true },
      select: { id: true },
    });

    if (!partnerBroker) {
      throw new NotFoundException('Partner broker not found');
    }
  }

}
