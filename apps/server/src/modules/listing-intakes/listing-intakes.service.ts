import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CheckStatus, TransactionType } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import { RealtimeService } from '../../realtime/realtime.service';

const ACTIVE_INTAKE_STATUS = 'active';
const VALID_INTAKE_STATUSES = new Set([
  'active',
  'paused',
  'completed',
  'cancelled',
]);
const VALID_TRANSACTION_TYPES: ReadonlySet<string> = new Set(
  Object.values(TransactionType),
);
const VALID_CHECK_STATUSES: ReadonlySet<string> = new Set(
  Object.values(CheckStatus),
);
const VALID_CONFIRM_RESULTS = new Set([
  'alive',
  'price_changed',
  'unavailable',
  'no_answer',
  'pending',
]);
const VALID_CONFIRM_CHANNELS = new Set([
  'phone',
  'sms',
  'visit',
  'owner_message',
  'note',
  'mcp',
]);

export interface ListingIntakeSearchQuery {
  status?: string;
  confirmStatus?: string;
  nextConfirmFrom?: Date | string;
  nextConfirmTo?: Date | string;
  includeInactive?: boolean;
  includeHidden?: boolean;
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
  sortBy?: 'receivedAt' | 'updatedAt' | 'createdAt' | 'price';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface ListingInputDto {
  transactionType: string;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: Date | string | null;
  moveInAvailableTo?: Date | string | null;
  memo?: string | null;
}

interface ListingIntakeCreateDto {
  propertyId: string;
  status?: string;
  receivedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
  isJointBrokerageRequired?: boolean;
  jointBrokeragePartnerId?: string | null;
  memo?: string | null;
  listings?: ListingInputDto[];
}

interface ListingIntakeUpdateDto {
  status?: string;
  receivedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
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

    const listingWhere = this.buildListingWhere(query);
    const filters: Prisma.ListingIntakeWhereInput[] = [{ officeId }];

    if (query.status) {
      filters.push({ status: query.status });
    } else if (!query.includeInactive) {
      filters.push({ status: ACTIVE_INTAKE_STATUS });
    }

    if (query.confirmStatus) {
      this.assertValidConfirmStatus(query.confirmStatus);
      filters.push({ confirmStatus: query.confirmStatus });
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
    } else if (!query.includeHidden) {
      filters.push({ listings: { some: { isHidden: false } } });
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
      filters.push(this.buildSearchFilter(query.search));
    }

    const where =
      filters.length === 1
        ? filters[0]
        : ({ AND: filters } as Prisma.ListingIntakeWhereInput);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const orderBy = this.resolveOrderBy(query.sortBy, query.sortOrder);
    const includedListingWhere = query.includeHidden ? {} : { isHidden: false };

    const [items, total] = await Promise.all([
      this.prisma.listingIntake.findMany({
        where,
        include: this.buildListInclude(includedListingWhere),
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.listingIntake.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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
    const status = dto.status ?? ACTIVE_INTAKE_STATUS;
    this.assertValidIntakeStatus(status);
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

    if (status === ACTIVE_INTAKE_STATUS) {
      await this.assertNoActiveIntake(officeId, dto.propertyId);
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
      const created = await tx.listingIntake.create({
        data: {
          officeId,
          propertyId: dto.propertyId,
          status,
          receivedAt: dto.receivedAt ?? undefined,
          confirmedAt: dto.confirmedAt,
          isJointBrokerageRequired: dto.isJointBrokerageRequired ?? false,
          jointBrokeragePartnerId: dto.isJointBrokerageRequired
            ? (dto.jointBrokeragePartnerId ?? null)
            : null,
          memo: dto.memo,
        },
        select: { id: true },
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
            moveInAvailableType: listing.moveInAvailableType,
            moveInAvailableFrom: listing.moveInAvailableFrom,
            moveInAvailableTo: listing.moveInAvailableTo,
            memo: listing.memo,
          },
        });
      }

      return created;
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

    const nextStatus = patch.status ?? existing.status;
    this.assertValidIntakeStatus(nextStatus);
    await this.assertAccessiblePartnerBroker(
      officeId,
      patch.isJointBrokerageRequired === false ? null : patch.jointBrokeragePartnerId,
    );

    if (
      nextStatus === ACTIVE_INTAKE_STATUS &&
      existing.status !== ACTIVE_INTAKE_STATUS
    ) {
      await this.assertNoActiveIntake(officeId, existing.propertyId, id);
    }

    const data = {
      status: nextStatus,
      receivedAt: patch.receivedAt ?? undefined,
      confirmedAt: patch.confirmedAt,
      isJointBrokerageRequired: patch.isJointBrokerageRequired,
      jointBrokeragePartnerId:
        patch.isJointBrokerageRequired === false
          ? null
          : patch.jointBrokeragePartnerId,
      memo: patch.memo,
    };
    let intake: { id: string };

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

    this.realtime?.emitListingIntakeUpdated({
      officeId,
      intakeId: intake.id,
      propertyId: existing.propertyId,
    });

    return this.findOne(intake.id, officeId);
  }

  async updateStatus(id: string, officeId: string, status: string) {
    return this.update(id, officeId, { status });
  }

  async addListing(id: string, officeId: string, dto: ListingInputDto) {
    this.assertValidListingInputs([dto]);

    const intake = await this.prisma.listingIntake.findFirst({
      where: { id, officeId },
      select: { id: true, propertyId: true, status: true },
    });

    if (!intake) {
      throw new NotFoundException('ListingIntake not found');
    }

    if (intake.status !== ACTIVE_INTAKE_STATUS) {
      throw new BadRequestException('Only active intakes can add listings');
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
    const shouldUpdateConfirmedAt =
      dto.result === 'alive' || dto.result === 'price_changed';
    const nextStatus =
      dto.result === 'unavailable' ? 'completed' : intake.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const consultation = contactId
        ? await tx.consultation.create({
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
          })
        : null;

      const data = {
        status: nextStatus,
        confirmStatus: dto.result,
        confirmedAt: shouldUpdateConfirmedAt ? checkedAt : undefined,
        nextConfirmAt,
        lastConfirmMemo: dto.memo ?? null,
        lastConfirmConsultationId: consultation?.id ?? null,
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
    return this.updateStatus(id, officeId, 'cancelled');
  }

  private buildListingWhere(query: ListingIntakeSearchQuery) {
    const where: Prisma.ListingWhereInput = {};

    if (!query.includeHidden) {
      where.isHidden = false;
    }

    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }

    if (query.checkStatus) {
      where.checkStatus = query.checkStatus;
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

  private buildListInclude(listingWhere: Prisma.ListingWhereInput) {
    return {
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
            orderBy: { createdAt: 'desc' as const },
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
      listings: {
        where: listingWhere,
        orderBy: { createdAt: 'desc' as const },
        include: {
          advertisements: {
            orderBy: { createdAt: 'desc' as const },
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
    } satisfies Prisma.ListingIntakeInclude;
  }

  private buildDetailInclude() {
    return {
      ...this.buildListInclude({}),
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

  private resolveOrderBy(
    sortBy: ListingIntakeSearchQuery['sortBy'],
    sortOrder: ListingIntakeSearchQuery['sortOrder'],
  ): Prisma.ListingIntakeOrderByWithRelationInput {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    if (sortBy === 'createdAt') return { createdAt: order };
    if (sortBy === 'receivedAt') return { receivedAt: order };
    return { updatedAt: order };
  }

  private assertValidQuery(query: ListingIntakeSearchQuery) {
    if (query.status) {
      this.assertValidIntakeStatus(query.status);
    }

    if (
      query.transactionType &&
      !VALID_TRANSACTION_TYPES.has(query.transactionType as TransactionType)
    ) {
      throw new BadRequestException('Invalid transactionType');
    }

    if (
      query.checkStatus &&
      !VALID_CHECK_STATUSES.has(query.checkStatus as CheckStatus)
    ) {
      throw new BadRequestException('Invalid checkStatus');
    }

    if (query.confirmStatus) {
      this.assertValidConfirmStatus(query.confirmStatus);
    }
  }

  private assertValidListingInputs(listings: ListingInputDto[]) {
    for (const listing of listings) {
      if (!VALID_TRANSACTION_TYPES.has(listing.transactionType as TransactionType)) {
        throw new BadRequestException('Invalid transactionType');
      }
    }
  }

  private assertValidIntakeStatus(status: string) {
    if (!VALID_INTAKE_STATUSES.has(status)) {
      throw new BadRequestException('Invalid ListingIntake status');
    }
  }

  private assertValidConfirmResult(result: string) {
    if (!VALID_CONFIRM_RESULTS.has(result)) {
      throw new BadRequestException('Invalid confirmation result');
    }
  }

  private assertValidConfirmStatus(status: string) {
    if (status === 'unknown') return;
    this.assertValidConfirmResult(status);
  }

  private assertValidConfirmChannel(channel?: string | null) {
    if (channel && !VALID_CONFIRM_CHANNELS.has(channel)) {
      throw new BadRequestException('Invalid confirmation channel');
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

  private async assertNoActiveIntake(
    officeId: string,
    propertyId: string,
    excludeIntakeId?: string,
  ) {
    const existing = await this.prisma.listingIntake.findFirst({
      where: {
        officeId,
        propertyId,
        status: ACTIVE_INTAKE_STATUS,
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
