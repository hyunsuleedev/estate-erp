import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from './buyer-requirement.presenter';
import {
  buyerCaseParticipants,
  resolveBrokerageCaseForIntake,
} from '../brokerage-cases/brokerage-case.resolver';

export interface BuyerRequirementSearchQuery {
  // Multi-value filters (comma-separated or arrays). Single string is treated
  // as a single-value legacy filter.
  status?: string | string[];
  urgency?: string | string[];
  transactionType?: string | string[];
  siteTypes?: string | string[];
  buyerIntakeId?: string;
  contactId?: string;
  assignedToId?: string | string[];
  // Preferred Site filter: list of site UUIDs. Matches buyers with any of them.
  preferredSiteIds?: string | string[];
  // Region filters at any of the three legal-dong levels. Each is CSV of codes.
  // Matching semantics (OR across buyer rows):
  //   - provinceCodes: buyer region with matching province_code
  //   - districtCodes: buyer district_code == x OR ward_code startsWith x
  //   - wardCodes: buyer ward_code == x
  provinceCodes?: string | string[];
  districtCodes?: string | string[];
  wardCodes?: string | string[];
  // Range filters. BuyerRequirement stores a range (min..max) per money/area
  // field; a filter is considered a match when the two ranges overlap.
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  // Date ranges (ISO strings)
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  // Free-text search over contact name/phone, memo
  search?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const BUYER_REQUIREMENT_STATUSES = new Set(['active', 'hold', 'completed']);

const buyerRequirementMutationInclude = {
  buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
  preferredSites: {
    include: { site: { select: { id: true, name: true, type: true } } },
    orderBy: { priority: 'asc' as const },
  },
  preferredRegions: {
    include: { province: true, district: true, ward: true },
  },
} satisfies Prisma.BuyerRequirementInclude;

function assertPositivePriorityRank(priorityRank: number) {
  if (!Number.isInteger(priorityRank) || priorityRank < 1) {
    throw new BadRequestException('priorityRank는 1 이상의 정수여야 합니다.');
  }
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const arr = Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

@Injectable()
export class BuyerRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: BuyerRequirementSearchQuery = {}) {
    const where: Prisma.BuyerRequirementWhereInput = { officeId };
    const AND: Prisma.BuyerRequirementWhereInput[] = [];

    // ── Multi-value filters ─────────────────────────────────────
    const statusList = toArray(query.status);
    if (statusList) where.status = { in: statusList };

    const urgencyList = toArray(query.urgency);
    if (urgencyList) where.urgency = { in: urgencyList };

    const txList = toArray(query.transactionType);
    if (txList) where.transactionType = { in: txList };

    const assigneeList = toArray(query.assignedToId);
    if (assigneeList) where.assignedToId = { in: assigneeList };

    const siteTypesList = toArray(query.siteTypes);
    if (siteTypesList) where.siteTypes = { hasSome: siteTypesList };

    const preferredSiteIds = toArray(query.preferredSiteIds);
    if (preferredSiteIds) {
      AND.push({
        preferredSites: { some: { siteId: { in: preferredSiteIds } } },
      });
    }

    const provinceCodes = toArray(query.provinceCodes);
    const districtCodes = toArray(query.districtCodes);
    const wardCodes = toArray(query.wardCodes);
    if (provinceCodes || districtCodes || wardCodes) {
      const regionOR: Prisma.BuyerRequirementRegionWhereInput[] = [];
      if (provinceCodes) regionOR.push({ provinceCode: { in: provinceCodes } });
      // districtCode filter matches either buyer.districtCode OR buyer.wardCode
      // starting with that district (ward codes are 10 digits, first 5 = district)
      if (districtCodes) {
        regionOR.push({ districtCode: { in: districtCodes } });
        for (const dc of districtCodes) {
          regionOR.push({ wardCode: { startsWith: dc } });
        }
      }
      if (wardCodes) regionOR.push({ wardCode: { in: wardCodes } });
      AND.push({
        preferredRegions: { some: { OR: regionOR } },
      });
    }

    if (query.buyerIntakeId) where.buyerIntakeId = query.buyerIntakeId;
    if (query.contactId) {
      where.buyerIntake = {
        contacts: { some: { contactId: query.contactId } },
      };
    }

    // ── Range filters: overlap semantics ────────────────────────
    // Filter [F.min, F.max] overlaps Buyer [priceMin, priceMax] when:
    //   (F.min == null OR priceMax == null OR priceMax >= F.min)
    //   AND (F.max == null OR priceMin == null OR priceMin <= F.max)
    const addOverlap = (
      fieldMin: keyof Prisma.BuyerRequirementWhereInput,
      fieldMax: keyof Prisma.BuyerRequirementWhereInput,
      filterMin: number | undefined,
      filterMax: number | undefined,
    ) => {
      if (filterMin === undefined && filterMax === undefined) return;
      if (filterMin !== undefined) {
        AND.push({
          OR: [{ [fieldMax]: null }, { [fieldMax]: { gte: filterMin } }] as any,
        });
      }
      if (filterMax !== undefined) {
        AND.push({
          OR: [{ [fieldMin]: null }, { [fieldMin]: { lte: filterMax } }] as any,
        });
      }
    };

    addOverlap('priceMin', 'priceMax', query.priceMin, query.priceMax);
    addOverlap('depositMin', 'depositMax', query.depositMin, query.depositMax);
    addOverlap(
      'monthlyRentMin',
      'monthlyRentMax',
      query.monthlyRentMin,
      query.monthlyRentMax,
    );
    addOverlap('areaMin', 'areaMax', query.areaMin, query.areaMax);

    // ── Date ranges ─────────────────────────────────────────────
    if (query.nextContactAfter || query.nextContactBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.nextContactAfter) cond.gte = new Date(query.nextContactAfter);
      if (query.nextContactBefore) cond.lte = new Date(query.nextContactBefore);
      where.nextContactDate = cond;
    }
    if (query.moveInAfter || query.moveInBefore) {
      const cond: Prisma.DateTimeNullableFilter = {};
      if (query.moveInAfter) cond.gte = new Date(query.moveInAfter);
      if (query.moveInBefore) cond.lte = new Date(query.moveInBefore);
      where.moveInDate = cond;
    }

    // ── Free-text search ────────────────────────────────────────
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      const canonicalPhone = normalizePhone(q);
      AND.push({
        OR: [
          {
            buyerIntake: {
              contacts: {
                some: {
                  contact: { name: { contains: q, mode: 'insensitive' } },
                },
              },
            },
          },
          ...(canonicalPhone
            ? [{
                buyerIntake: {
                  contacts: {
                    some: {
                      contact: {
                        phones: {
                          some: {
                            phone: { contains: canonicalPhone },
                          },
                        },
                      },
                    },
                  },
                },
              }]
            : []),
          { memo: { contains: q, mode: 'insensitive' } },
          {
            preferredSites: {
              some: { site: { name: { contains: q, mode: 'insensitive' } } },
            },
          },
        ],
      });
    }

    if (AND.length > 0) where.AND = AND;

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.buyerRequirement.findMany({
        where,
        include: {
          buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
          assignedTo: { select: { id: true, name: true } },
          preferredSites: {
            include: {
              site: { select: { id: true, name: true, type: true } },
            },
            orderBy: { priority: 'asc' },
          },
          preferredRegions: {
            include: {
              province: true,
              district: true,
              ward: true,
            },
          },
          _count: { select: { matches: true, consultations: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.buyerRequirement.count({ where }),
    ]);

    return {
      items: items.map(withBuyerRequirementContact),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const req = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
        assignedTo: { select: { id: true, name: true } },
        matches: {
          include: {
            listing: {
              include: {
                intake: { select: LISTING_INTAKE_STATE_SELECT },
                deals: OCCUPYING_DEALS_SELECT,
                property: { include: { site: true } },
              },
            },
          },
        },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
        preferredSites: {
          include: { site: { select: { id: true, name: true, type: true } } },
          orderBy: { priority: 'asc' },
        },
        preferredRegions: {
          include: { province: true, district: true, ward: true },
        },
      },
    });
    if (!req) throw new NotFoundException('BuyerRequirement not found');
    return withBuyerRequirementContact(req);
  }

  async create(
    officeId: string,
    dto: {
      buyerIntakeId?: string;
      contactId?: string;
      priorityRank?: number;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMin?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
  ) {
    const {
      buyerIntakeId,
      contactId,
      priorityRank,
      moveInDate,
      nextContactDate,
      preferredSites,
      preferredRegions,
      ...rest
    } = dto;
    if (!buyerIntakeId && !contactId) {
      throw new BadRequestException(
        'buyerIntakeId 또는 기존 호환용 contactId가 필요합니다.',
      );
    }
    if (priorityRank !== undefined) assertPositivePriorityRank(priorityRank);

    return this.prisma.$transaction(async (tx) => {
      let intake = buyerIntakeId
        ? await tx.buyerIntake.findFirst({
            where: { id: buyerIntakeId, officeId },
            include: { contacts: true },
          })
        : null;

      if (buyerIntakeId && !intake) {
        throw new NotFoundException('BuyerIntake not found');
      }
      if (
        intake &&
        contactId &&
        !intake.contacts.some((contact) => contact.contactId === contactId)
      ) {
        throw new BadRequestException(
          '선택한 연락처가 해당 구매 의뢰에 참여하고 있지 않습니다.',
        );
      }

      if (!intake && contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: contactId, officeId },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('Contact not found');

        // 구버전 UI의 contactId 기반 등록은 그 연락처가 실제 구매자로 참여한
        // 가장 최근 열린 Intake를 재사용한다. 새 UI는 buyerIntakeId를 명시한다.
        intake = await tx.buyerIntake.findFirst({
          where: {
            officeId,
            lifecycleStatus: 'open',
            contacts: {
              some: {
                contactId,
                role: { in: ['buyer', 'co_buyer'] },
              },
            },
          },
          include: { contacts: true },
          orderBy: { updatedAt: 'desc' },
        });

        if (!intake) {
          const contacts = [
            { contactId, role: 'buyer', isPrimary: true },
          ];
          const resolvedCase = await resolveBrokerageCaseForIntake(tx, {
            officeId,
            intakeKind: 'buyer',
            participants: buyerCaseParticipants(contacts),
          });
          intake = await tx.buyerIntake.create({
            data: {
              officeId,
              ...resolvedCase,
              contacts: {
                create: {
                  role: 'buyer',
                  isPrimary: true,
                  office: { connect: { id: officeId } },
                  contact: {
                    connect: {
                      officeId_id: { officeId, id: contactId },
                    },
                  },
                },
              },
            },
            include: { contacts: true },
          });
        }
      }

      if (!intake) {
        throw new BadRequestException('구매 의뢰를 확인할 수 없습니다.');
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${intake.id}`}::text, 0))`;
      const lastRequirement = await tx.buyerRequirement.findFirst({
        where: { buyerIntakeId: intake.id },
        orderBy: [{ priorityRank: 'desc' }, { createdAt: 'desc' }],
        select: { priorityRank: true },
      });
      const appendPriorityRank = (lastRequirement?.priorityRank ?? 0) + 1;
      if (priorityRank !== undefined && priorityRank > appendPriorityRank) {
        throw new BadRequestException(
          `priorityRank는 1부터 ${appendPriorityRank}까지 지정할 수 있습니다.`,
        );
      }
      const resolvedPriorityRank = priorityRank ?? appendPriorityRank;

      if (resolvedPriorityRank < appendPriorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: intake.id,
            priorityRank: { gte: resolvedPriorityRank },
          },
          data: { priorityRank: { increment: 1 } },
        });
      }

      const requirement = await tx.buyerRequirement.create({
        data: {
          officeId,
          buyerIntakeId: intake.id,
          priorityRank: resolvedPriorityRank,
          ...rest,
          moveInDate: moveInDate ? new Date(moveInDate) : undefined,
          nextContactDate: nextContactDate
            ? new Date(nextContactDate)
            : undefined,
          preferredSites: preferredSites?.length
            ? { create: preferredSites }
            : undefined,
          preferredRegions: preferredRegions?.length
            ? { create: preferredRegions }
            : undefined,
        },
        include: buyerRequirementMutationInclude,
      });
      return withBuyerRequirementContact(requirement);
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      priorityRank?: number;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMin?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      lastContactDate?: string;
      nextContactDate?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
  ) {
    const { priorityRank, preferredSites, preferredRegions, ...rest } = dto;
    if (priorityRank !== undefined) {
      const hasOtherChanges =
        preferredSites !== undefined ||
        preferredRegions !== undefined ||
        Object.keys(rest).length > 0;
      if (hasOtherChanges) {
        throw new BadRequestException(
          '우선순위 변경은 다른 희망조건 수정과 분리해서 요청해야 합니다.',
        );
      }
      return this.reorder(id, officeId, priorityRank);
    }

    await this.findOne(id, officeId);
    const requirement = await this.prisma.buyerRequirement.update({
      where: { id },
      data: {
        ...rest,
        moveInDate: rest.moveInDate ? new Date(rest.moveInDate) : undefined,
        lastContactDate: rest.lastContactDate
          ? new Date(rest.lastContactDate)
          : undefined,
        nextContactDate: rest.nextContactDate
          ? new Date(rest.nextContactDate)
          : undefined,
        // Replace-all semantics for nested sets on update
        preferredSites: preferredSites
          ? { deleteMany: {}, create: preferredSites }
          : undefined,
        preferredRegions: preferredRegions
          ? { deleteMany: {}, create: preferredRegions }
          : undefined,
      },
      include: buyerRequirementMutationInclude,
    });
    return withBuyerRequirementContact(requirement);
  }

  async reorder(id: string, officeId: string, priorityRank: number) {
    assertPositivePriorityRank(priorityRank);

    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.buyerRequirement.findFirst({
        where: { id, officeId },
        select: { id: true, buyerIntakeId: true },
      });
      if (!identity) throw new NotFoundException('BuyerRequirement not found');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${identity.buyerIntakeId}`}::text, 0))`;
      const current = await tx.buyerRequirement.findFirst({
        where: { id, officeId, buyerIntakeId: identity.buyerIntakeId },
        select: { id: true, buyerIntakeId: true, priorityRank: true },
      });
      if (!current) throw new NotFoundException('BuyerRequirement not found');

      const requirementCount = await tx.buyerRequirement.count({
        where: { officeId, buyerIntakeId: current.buyerIntakeId },
      });
      if (priorityRank > requirementCount) {
        throw new BadRequestException(
          `priorityRank는 1부터 ${requirementCount}까지 지정할 수 있습니다.`,
        );
      }

      if (priorityRank < current.priorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: current.buyerIntakeId,
            priorityRank: { gte: priorityRank, lt: current.priorityRank },
          },
          data: { priorityRank: { increment: 1 } },
        });
      } else if (priorityRank > current.priorityRank) {
        await tx.buyerRequirement.updateMany({
          where: {
            officeId,
            buyerIntakeId: current.buyerIntakeId,
            priorityRank: { gt: current.priorityRank, lte: priorityRank },
          },
          data: { priorityRank: { decrement: 1 } },
        });
      }

      if (priorityRank !== current.priorityRank) {
        await tx.buyerRequirement.update({
          where: { id },
          data: { priorityRank },
        });
      }

      const requirement = await tx.buyerRequirement.findUniqueOrThrow({
        where: { id },
        include: buyerRequirementMutationInclude,
      });
      return withBuyerRequirementContact(requirement);
    });
  }

  async updateStatus(id: string, officeId: string, status: string) {
    if (!BUYER_REQUIREMENT_STATUSES.has(status)) {
      throw new BadRequestException(
        '구매고객 상태는 active, hold, completed 중 하나여야 합니다.',
      );
    }
    await this.findOne(id, officeId);
    const requirement = await this.prisma.buyerRequirement.update({
      where: { id },
      data: { status },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
      },
    });
    return withBuyerRequirementContact(requirement);
  }

  async remove(id: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.buyerRequirement.findFirst({
        where: { id, officeId },
        select: { id: true, buyerIntakeId: true },
      });
      if (!identity) throw new NotFoundException('BuyerRequirement not found');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`buyer-intake:${identity.buyerIntakeId}`}::text, 0))`;
      const current = await tx.buyerRequirement.findFirst({
        where: { id, officeId, buyerIntakeId: identity.buyerIntakeId },
        select: { id: true, buyerIntakeId: true, priorityRank: true },
      });
      if (!current) throw new NotFoundException('BuyerRequirement not found');

      // A consultation belongs to the buyer project even when one detailed
      // requirement is removed. Keep the intake context and detach only the
      // requirement-level context before deleting it.
      await tx.consultation.updateMany({
        where: { officeId, buyerReqId: id },
        data: { buyerReqId: null },
      });

      const deleted = await tx.buyerRequirement.delete({ where: { id } });
      await tx.buyerRequirement.updateMany({
        where: {
          officeId,
          buyerIntakeId: current.buyerIntakeId,
          priorityRank: { gt: current.priorityRank },
        },
        data: { priorityRank: { decrement: 1 } },
      });
      return deleted;
    });
  }

  async findDueContacts(officeId: string) {
    const now = new Date();
    const items = await this.prisma.buyerRequirement.findMany({
      where: {
        officeId,
        status: 'active',
        nextContactDate: { lte: now },
      },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { nextContactDate: 'asc' },
    });
    return items.map(withBuyerRequirementContact);
  }
}
