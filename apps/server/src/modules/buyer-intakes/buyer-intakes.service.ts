import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BUYER_INTAKE_CONTACT_ROLES,
  IntakeLifecycleStatus,
  type BuyerIntakeContactRole,
} from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from "../buyer-requirements/buyer-requirement.presenter";
import {
  normalizePhone,
  withPrimaryPhone,
} from "../contacts/contact-phone.utils";
import {
  buyerCaseParticipants,
  mergeBuyerIntakeCaseParticipants,
  resolveBrokerageCaseForIntake,
} from "../brokerage-cases/brokerage-case.resolver";

export interface BuyerIntakeContactInput {
  contactId: string;
  role?: BuyerIntakeContactRole;
  isPrimary?: boolean;
}

export interface BuyerIntakeSearchQuery {
  contactId?: string;
  lifecycleStatus?: string;
  status?: string | string[];
  urgency?: string | string[];
  transactionType?: string | string[];
  siteTypes?: string | string[];
  assignedToId?: string | string[];
  preferredSiteIds?: string | string[];
  provinceCodes?: string | string[];
  districtCodes?: string | string[];
  wardCodes?: string | string[];
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  search?: string;
  sortBy?: "createdAt" | "receivedAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

const BUYER_INTAKE_LIFECYCLE_STATUSES = new Set<string>(
  Object.values(IntakeLifecycleStatus),
);
const BUYER_INTAKE_CONTACT_ROLE_SET = new Set<string>(
  BUYER_INTAKE_CONTACT_ROLES,
);

function toArray(value: string | string[] | undefined) {
  if (value === undefined || value === null || value === "") return undefined;
  const values = Array.isArray(value)
    ? value
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

const buyerIntakeInclude = {
  contacts: buyerIntakeContactsInclude,
  requirements: {
    include: {
      preferredSites: {
        include: {
          site: { select: { id: true, name: true, type: true } },
        },
        orderBy: { priority: "asc" as const },
      },
      preferredRegions: {
        include: { province: true, district: true, ward: true },
      },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { matches: true, consultations: true } },
    },
    orderBy: [{ priorityRank: "asc" as const }, { createdAt: "asc" as const }],
  },
} satisfies Prisma.BuyerIntakeInclude;

type BuyerIntakeWithRelations = Prisma.BuyerIntakeGetPayload<{
  include: typeof buyerIntakeInclude;
}>;

@Injectable()
export class BuyerIntakesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: BuyerIntakeSearchQuery = {}) {
    this.assertLifecycleStatus(query.lifecycleStatus);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const filters: Prisma.BuyerIntakeWhereInput[] = [];
    const where: Prisma.BuyerIntakeWhereInput = {
      officeId,
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.contactId
        ? { contacts: { some: { contactId: query.contactId } } }
        : {}),
    };
    const requirementWhere = this.buildRequirementFilter(query);
    if (Object.keys(requirementWhere).length > 0) {
      filters.push({ requirements: { some: requirementWhere } });
    }

    const search = query.search?.trim();
    if (search) {
      const canonicalPhone = normalizePhone(search);
      filters.push({
        OR: [
          { memo: { contains: search, mode: "insensitive" } },
          {
            contacts: {
              some: {
                contact: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    ...(canonicalPhone
                      ? [{
                          phones: {
                            some: {
                              phone: { contains: canonicalPhone },
                            },
                          },
                        },
                      ]
                      : []),
                  ],
                },
              },
            },
          },
          {
            requirements: {
              some: {
                OR: [
                  { memo: { contains: search, mode: "insensitive" } },
                  {
                    preferredSites: {
                      some: {
                        site: {
                          name: { contains: search, mode: "insensitive" },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }
    if (filters.length > 0) where.AND = filters;

    const sortOrder = query.sortOrder ?? "desc";
    const orderBy: Prisma.BuyerIntakeOrderByWithRelationInput =
      query.sortBy === "receivedAt"
        ? { receivedAt: sortOrder }
        : query.sortBy === "createdAt"
          ? { createdAt: sortOrder }
          : { updatedAt: sortOrder };

    const [items, total] = await Promise.all([
      this.prisma.buyerIntake.findMany({
        where,
        include: buyerIntakeInclude,
        orderBy: [orderBy, { id: "asc" }],
        skip,
        take: limit,
      }),
      this.prisma.buyerIntake.count({ where }),
    ]);

    return {
      items: items.map((intake) => this.present(intake)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private buildRequirementFilter(
    query: BuyerIntakeSearchQuery,
  ): Prisma.BuyerRequirementWhereInput {
    const where: Prisma.BuyerRequirementWhereInput = {};
    const and: Prisma.BuyerRequirementWhereInput[] = [];

    const status = toArray(query.status);
    if (status) where.status = { in: status };
    const urgency = toArray(query.urgency);
    if (urgency) where.urgency = { in: urgency };
    const transactionTypes = toArray(query.transactionType);
    if (transactionTypes) where.transactionType = { in: transactionTypes };
    const siteTypes = toArray(query.siteTypes);
    if (siteTypes) where.siteTypes = { hasSome: siteTypes };
    const assignedToIds = toArray(query.assignedToId);
    if (assignedToIds) where.assignedToId = { in: assignedToIds };
    const preferredSiteIds = toArray(query.preferredSiteIds);
    if (preferredSiteIds) {
      where.preferredSites = { some: { siteId: { in: preferredSiteIds } } };
    }

    const provinceCodes = toArray(query.provinceCodes);
    const districtCodes = toArray(query.districtCodes);
    const wardCodes = toArray(query.wardCodes);
    if (provinceCodes || districtCodes || wardCodes) {
      const regionOr: Prisma.BuyerRequirementRegionWhereInput[] = [];
      if (provinceCodes) regionOr.push({ provinceCode: { in: provinceCodes } });
      if (districtCodes) {
        regionOr.push({ districtCode: { in: districtCodes } });
        for (const districtCode of districtCodes) {
          regionOr.push({ wardCode: { startsWith: districtCode } });
        }
      }
      if (wardCodes) regionOr.push({ wardCode: { in: wardCodes } });
      and.push({ preferredRegions: { some: { OR: regionOr } } });
    }

    const addOverlap = (
      fieldMin: keyof Prisma.BuyerRequirementWhereInput,
      fieldMax: keyof Prisma.BuyerRequirementWhereInput,
      filterMin: number | undefined,
      filterMax: number | undefined,
    ) => {
      if (filterMin !== undefined) {
        and.push({
          OR: [
            { [fieldMax]: null },
            { [fieldMax]: { gte: filterMin } },
          ] as Prisma.BuyerRequirementWhereInput[],
        });
      }
      if (filterMax !== undefined) {
        and.push({
          OR: [
            { [fieldMin]: null },
            { [fieldMin]: { lte: filterMax } },
          ] as Prisma.BuyerRequirementWhereInput[],
        });
      }
    };

    addOverlap("priceMin", "priceMax", query.priceMin, query.priceMax);
    addOverlap("depositMin", "depositMax", query.depositMin, query.depositMax);
    addOverlap(
      "monthlyRentMin",
      "monthlyRentMax",
      query.monthlyRentMin,
      query.monthlyRentMax,
    );
    addOverlap("areaMin", "areaMax", query.areaMin, query.areaMax);

    if (query.nextContactAfter || query.nextContactBefore) {
      where.nextContactDate = {
        ...(query.nextContactAfter
          ? { gte: new Date(query.nextContactAfter) }
          : {}),
        ...(query.nextContactBefore
          ? { lte: new Date(query.nextContactBefore) }
          : {}),
      };
    }
    if (query.moveInAfter || query.moveInBefore) {
      where.moveInDate = {
        ...(query.moveInAfter ? { gte: new Date(query.moveInAfter) } : {}),
        ...(query.moveInBefore ? { lte: new Date(query.moveInBefore) } : {}),
      };
    }
    if (and.length > 0) where.AND = and;
    return where;
  }

  async findOne(id: string, officeId: string) {
    const intake = await this.prisma.buyerIntake.findFirst({
      where: { id, officeId },
      include: buyerIntakeInclude,
    });
    if (!intake) throw new NotFoundException("BuyerIntake not found");
    return this.present(intake);
  }

  async create(
    officeId: string,
    dto: {
      brokerageCaseId?: string;
      lifecycleStatus?: string;
      receivedAt?: string;
      memo?: string;
      contacts: BuyerIntakeContactInput[];
    },
  ) {
    this.assertLifecycleStatus(dto.lifecycleStatus);
    const contacts = this.normalizeContacts(dto.contacts);
    await this.assertContactsBelongToOffice(
      officeId,
      contacts.map((contact) => contact.contactId),
    );

    const lifecycleStatus =
      dto.lifecycleStatus ?? IntakeLifecycleStatus.OPEN;
    const intake = await this.prisma.$transaction(async (tx) => {
      const resolvedCase = await resolveBrokerageCaseForIntake(tx, {
        officeId,
        requestedCaseId: dto.brokerageCaseId,
        autoAttach: lifecycleStatus !== IntakeLifecycleStatus.CLOSED,
        intakeKind: "buyer",
        participants: buyerCaseParticipants(contacts),
      });
      return tx.buyerIntake.create({
        data: {
          officeId,
          ...resolvedCase,
          lifecycleStatus,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
          memo: dto.memo,
          contacts: {
            create: contacts.map((contact) => ({
              role: contact.role,
              isPrimary: contact.isPrimary,
              office: { connect: { id: officeId } },
              contact: {
                connect: {
                  officeId_id: { officeId, id: contact.contactId },
                },
              },
            })),
          },
        },
        include: buyerIntakeInclude,
      });
    });

    return this.present(intake);
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      lifecycleStatus?: string;
      receivedAt?: string;
      memo?: string | null;
    },
  ) {
    await this.findOne(id, officeId);
    this.assertLifecycleStatus(dto.lifecycleStatus);
    const intake = await this.prisma.buyerIntake.update({
      where: { id },
      data: {
        lifecycleStatus: dto.lifecycleStatus,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        memo: dto.memo,
      },
      include: buyerIntakeInclude,
    });
    return this.present(intake);
  }

  async addContact(id: string, officeId: string, dto: BuyerIntakeContactInput) {
    this.assertRole(dto.role);
    await this.assertContactsBelongToOffice(officeId, [dto.contactId]);

    return this.prisma.$transaction(async (tx) => {
      await this.lockPrimaryContact(tx, id);
      const intake = await tx.buyerIntake.findFirst({
        where: { id, officeId },
        include: { contacts: true },
      });
      if (!intake) throw new NotFoundException("BuyerIntake not found");
      if (
        intake.contacts.some((contact) => contact.contactId === dto.contactId)
      ) {
        throw new ConflictException("이미 구매 의뢰에 연결된 연락처입니다.");
      }

      const makePrimary = dto.isPrimary ?? intake.contacts.length === 0;
      if (makePrimary) {
        await this.demoteOtherPrimaryContacts(tx, id);
      }

      await tx.buyerIntakeContact.create({
        data: {
          officeId,
          buyerIntakeId: id,
          contactId: dto.contactId,
          role: dto.role ?? "buyer",
          isPrimary: makePrimary,
        },
      });
      await mergeBuyerIntakeCaseParticipants(tx, officeId, id);

      const updated = await tx.buyerIntake.findUniqueOrThrow({
        where: { id },
        include: buyerIntakeInclude,
      });
      return this.present(updated);
    });
  }

  async updateContact(
    id: string,
    contactId: string,
    officeId: string,
    dto: {
      role?: BuyerIntakeContactRole;
      isPrimary?: boolean;
    },
  ) {
    this.assertRole(dto.role);
    return this.prisma.$transaction(async (tx) => {
      await this.lockPrimaryContact(tx, id);
      const participant = await tx.buyerIntakeContact.findFirst({
        where: { officeId, buyerIntakeId: id, contactId },
      });
      if (!participant) {
        throw new NotFoundException("BuyerIntake contact not found");
      }
      if (participant.isPrimary && dto.isPrimary === false) {
        throw new BadRequestException(
          "대표 연락 대상을 해제하려면 다른 연락처를 대표로 지정하세요.",
        );
      }

      if (dto.isPrimary === true) {
        await this.demoteOtherPrimaryContacts(tx, id, contactId);
      }

      await tx.buyerIntakeContact.update({
        // Audit middleware reads the previous record through findFirst, so use
        // the row PK rather than a compound-unique selector here.
        where: { id: participant.id },
        data: dto,
      });
      await mergeBuyerIntakeCaseParticipants(tx, officeId, id);
      const updated = await tx.buyerIntake.findUniqueOrThrow({
        where: { id },
        include: buyerIntakeInclude,
      });
      return this.present(updated);
    });
  }

  async removeContact(id: string, contactId: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPrimaryContact(tx, id);
      const intake = await tx.buyerIntake.findFirst({
        where: { id, officeId },
        include: { contacts: { orderBy: { createdAt: "asc" } } },
      });
      if (!intake) throw new NotFoundException("BuyerIntake not found");
      const participant = intake.contacts.find(
        (contact) => contact.contactId === contactId,
      );
      if (!participant) {
        throw new NotFoundException("BuyerIntake contact not found");
      }
      if (intake.contacts.length === 1) {
        throw new BadRequestException(
          "구매 의뢰에는 최소 한 명의 연락처가 필요합니다.",
        );
      }

      await tx.buyerIntakeContact.delete({
        // PK selector keeps tenant scoping and audit before-read compatible.
        where: { id: participant.id },
      });
      if (participant.isPrimary) {
        const replacement = intake.contacts.find(
          (contact) => contact.contactId !== contactId,
        );
        if (replacement) {
          await tx.buyerIntakeContact.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }

      const updated = await tx.buyerIntake.findUniqueOrThrow({
        where: { id },
        include: buyerIntakeInclude,
      });
      return this.present(updated);
    });
  }

  private present(intake: BuyerIntakeWithRelations) {
    const contacts = intake.contacts.map((participant) => ({
      ...participant,
      contact: withPrimaryPhone(participant.contact),
    }));
    const { requirements, ...intakeBase } = intake;
    const buyerIntake = { ...intakeBase, contacts };
    return {
      ...buyerIntake,
      requirements: requirements.map((requirement) =>
        withBuyerRequirementContact({ ...requirement, buyerIntake }),
      ),
    };
  }

  private normalizeContacts(contacts: BuyerIntakeContactInput[] | undefined) {
    if (!contacts || contacts.length === 0) {
      throw new BadRequestException(
        "구매 의뢰에는 최소 한 명의 연락처가 필요합니다.",
      );
    }
    const uniqueIds = new Set(contacts.map((contact) => contact.contactId));
    if (uniqueIds.size !== contacts.length) {
      throw new BadRequestException(
        "같은 연락처를 중복으로 연결할 수 없습니다.",
      );
    }
    contacts.forEach((contact) => this.assertRole(contact.role));
    if (contacts.filter((contact) => contact.isPrimary).length > 1) {
      throw new BadRequestException(
        "대표 연락 대상은 한 명만 지정할 수 있습니다.",
      );
    }

    const hasPrimary = contacts.some((contact) => contact.isPrimary);
    return contacts.map((contact, index) => ({
      contactId: contact.contactId,
      role: contact.role ?? (index === 0 ? "buyer" : "co_buyer"),
      isPrimary: contact.isPrimary ?? (!hasPrimary && index === 0),
    }));
  }

  private async lockPrimaryContact(
    tx: Prisma.TransactionClient,
    buyerIntakeId: string,
  ) {
    const lockKey = `buyer-intake-primary:${buyerIntakeId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
  }

  private async demoteOtherPrimaryContacts(
    tx: Prisma.TransactionClient,
    buyerIntakeId: string,
    exceptContactId?: string,
  ) {
    const primaries = await tx.buyerIntakeContact.findMany({
      where: {
        buyerIntakeId,
        isPrimary: true,
        contactId: exceptContactId ? { not: exceptContactId } : undefined,
      },
      select: { id: true },
    });
    for (const primary of primaries) {
      await tx.buyerIntakeContact.update({
        where: { id: primary.id },
        data: { isPrimary: false },
      });
    }
  }

  private async assertContactsBelongToOffice(
    officeId: string,
    contactIds: string[],
  ) {
    const count = await this.prisma.contact.count({
      where: { officeId, id: { in: contactIds } },
    });
    if (count !== new Set(contactIds).size) {
      throw new BadRequestException(
        "구매 의뢰 연락처가 없거나 다른 사무소에 속해 있습니다.",
      );
    }
  }

  private assertLifecycleStatus(status?: string) {
    if (status && !BUYER_INTAKE_LIFECYCLE_STATUSES.has(status)) {
      throw new BadRequestException(
        "구매 의뢰 상태는 open, hold, closed 중 하나여야 합니다.",
      );
    }
  }

  private assertRole(role?: string) {
    if (role && !BUYER_INTAKE_CONTACT_ROLE_SET.has(role)) {
      throw new BadRequestException(
        "유효하지 않은 구매 의뢰 연락처 역할입니다.",
      );
    }
  }
}
