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
import { closeOpenMatchesForBuyerIntake } from "../matches/match-lifecycle-sync";
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from "../buyer-requirements/buyer-requirement.presenter";
import {
  normalizePhone,
  withPrimaryPhone,
} from "../contacts/contact-phone.utils";
import {
  appendIntakeStep,
  assertActiveProject,
  BUYER_INTAKE_STEP_TITLE,
} from "../projects/project-membership";

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
    if (!intake) throw new NotFoundException("구매 의뢰를 찾을 수 없습니다.");
    return this.present(intake);
  }

  async create(
    officeId: string,
    dto: {
      projectId?: string;
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
      // 프로젝트는 사용자가 고른 경우에만 붙는다. 서버가 당사자를 보고 묶지 않는다.
      if (dto.projectId) {
        await assertActiveProject(tx, officeId, dto.projectId);
      }
      const created = await tx.buyerIntake.create({
        data: {
          officeId,
          projectId: dto.projectId ?? null,
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
      if (dto.projectId) {
        await appendIntakeStep(tx, {
          officeId,
          projectId: dto.projectId,
          kind: "buyer",
          intakeId: created.id,
          title: BUYER_INTAKE_STEP_TITLE,
        });
      }
      return created;
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
    this.assertLifecycleStatus(dto.lifecycleStatus);
    // 의뢰를 닫으면(다른 곳에서 구함 등) 담긴 희망 조건들의 진행 중 매칭도 같은 트랜잭션에서 닫는다
    // (buyer_closed — 희망 조건 완료와 같다). 보류는 닫지 않고, 다시 열어도 닫힌 매칭은 되살리지 않는다.
    const intake = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ lifecycle_status: string }[]>`SELECT "lifecycle_status" FROM "buyer_intakes" WHERE "id" = ${id}::uuid AND "office_id" = ${officeId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException("구매 의뢰를 찾을 수 없습니다.");
      const closingNow =
        dto.lifecycleStatus === IntakeLifecycleStatus.CLOSED &&
        locked[0].lifecycle_status !== IntakeLifecycleStatus.CLOSED;
      const updated = await tx.buyerIntake.update({
        where: { id },
        data: {
          lifecycleStatus: dto.lifecycleStatus,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
          memo: dto.memo,
        },
        include: buyerIntakeInclude,
      });
      if (closingNow) {
        await closeOpenMatchesForBuyerIntake(tx, { officeId, buyerIntakeId: id });
      }
      return updated;
    });
    return this.present(intake);
  }

  async remove(id: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPrimaryContact(tx, id);
      const existing = await tx.buyerIntake.findFirst({
        where: { id, officeId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException("구매 의뢰를 찾을 수 없습니다.");

      const [deals, consultations, projectSteps] = await Promise.all([
        tx.deal.count({ where: { officeId, buyerIntakeId: id } }),
        tx.consultation.count({ where: { officeId, buyerIntakeId: id } }),
        tx.projectStep.count({ where: { officeId, buyerIntakeId: id } }),
      ]);
      if (deals > 0 || consultations > 0 || projectSteps > 0) {
        const reasons = [
          deals > 0 ? `거래 ${deals}건` : null,
          consultations > 0 ? `상담 기록 ${consultations}건` : null,
          projectSteps > 0 ? `프로젝트 단계 ${projectSteps}건` : null,
        ].filter(Boolean);
        throw new ConflictException(
          `${reasons.join(", ")}이 연결된 구매 의뢰는 삭제할 수 없습니다. 상태 변경(종료)을 사용하세요.`,
        );
      }

      await tx.buyerRequirement.deleteMany({ where: { officeId, buyerIntakeId: id } });
      await tx.buyerIntakeContact.deleteMany({ where: { officeId, buyerIntakeId: id } });
      return tx.buyerIntake.delete({ where: { id } });
    });
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
      if (!intake) throw new NotFoundException("구매 의뢰를 찾을 수 없습니다.");
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
        throw new NotFoundException("이 구매 의뢰에 연결된 연락처가 아닙니다.");
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
      if (!intake) throw new NotFoundException("구매 의뢰를 찾을 수 없습니다.");
      const participant = intake.contacts.find(
        (contact) => contact.contactId === contactId,
      );
      if (!participant) {
        throw new NotFoundException("이 구매 의뢰에 연결된 연락처가 아닙니다.");
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
        "구매 의뢰 상태는 진행 · 보류 · 종료 중 하나여야 합니다.",
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
