import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  contactPhonesSelectOrdered,
  normalizePhone,
  withPrimaryPhone,
  withPrimaryContactPhone,
} from './contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { withContactRelationPerspective } from '../contact-relations/contact-relation.presenter';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from '../buyer-requirements/buyer-requirement.presenter';
import { CONTACT_CATEGORY_KEYS, type ContactCategoryKey, formatUnitLabel } from '@estate-erp/shared';
import {
  CONTACT_TAG_NAMES_INCLUDE,
  setContactTags,
  toTagNames,
  withTagNames,
} from './contact-tags.service';
import {
  CONTACT_ROLE_INCLUDE,
  CONTACT_ROLE_INTAKE_SELECT,
  contactCategoryWhere,
  deriveContactRoles,
} from './contact-categories';

export interface ContactSearchQuery {
  search?: string;
  tags?: string[];
  /** 그룹 이름. 그 그룹에 속한 연락처만 */
  group?: string;
  category?: ContactCategoryKey;
  /** 여러 분류를 모두 만족하는 연락처만 (목록 화면의 필터 칩) */
  categories?: ContactCategoryKey[];
  hasPropertyContact?: boolean;
  hasBuyerReq?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ContactPhoneInput {
  phone: string;
  label?: string;
  isPrimary?: boolean;
  memo?: string | null;
}

export interface ContactWriteInput {
  name?: string;
  phone?: string | null;
  phones?: ContactPhoneInput[];
  email?: string | null;
  tags?: string[];
  memo?: string | null;
}

/** 연락처가 속한 그룹의 이름만 읽는다. */
const CONTACT_GROUP_NAMES_INCLUDE = {
  select: { group: { select: { name: true } } },
} satisfies Prisma.Contact$groupMembershipsArgs;

function toGroupNames(memberships: Array<{ group: { name: string } }>) {
  return memberships
    .map(({ group }) => group.name)
    .sort((left, right) => left.localeCompare(right, 'ko'));
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: ContactSearchQuery = {}) {
    const where: Prisma.ContactWhereInput = { officeId };

    if (query.search) {
      const canonicalSearch = normalizePhone(query.search);
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        ...(canonicalSearch
          ? [{ phones: { some: { phone: { contains: canonicalSearch } } } }]
          : []),
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const tagNames = (query.tags ?? []).map((name) => name.trim()).filter(Boolean);

    if (query.group) {
      where.groupMemberships = { some: { group: { name: query.group } } };
    }

    const categories = [
      ...(query.category ? [query.category] : []),
      ...(query.categories ?? []),
    ];
    if (categories.length > 0 || tagNames.length > 0) {
      // 검색의 OR와 섞이지 않도록 AND로 묶는다. 여러 분류와 여러 태그는 모두 만족해야 한다.
      where.AND = [
        ...categories.map((key) => contactCategoryWhere(key)),
        ...tagNames.map((name) => ({
          tagAssignments: { some: { tag: { name } } },
        })),
      ];
    }

    if (query.hasPropertyContact) {
      where.propertyContacts = { some: {} };
    }

    if (query.hasBuyerReq) {
      where.buyerIntakeContacts = {
        some: { buyerIntake: { requirements: { some: {} } } },
      };
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: {
          _count: {
            select: { propertyContacts: true, consultations: true },
          },
          ...CONTACT_ROLE_INCLUDE,
          buyerIntakeContacts: {
            select: {
              buyerIntake: {
                select: {
                  ...CONTACT_ROLE_INTAKE_SELECT,
                  _count: { select: { requirements: true } },
                },
              },
            },
          },
          phones: this.contactPhonesInclude(),
          groupMemberships: CONTACT_GROUP_NAMES_INCLUDE,
          tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
          consultations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              type: true,
              createdAt: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      items: items.map(
        ({
          consultations,
          buyerIntakeContacts,
          propertyContacts,
          tenants,
          dealsAsBuyer,
          dealsAsSeller,
          groupMemberships,
          tagAssignments,
          _count,
          ...contact
        }) => ({
          ...withPrimaryPhone(contact),
          tags: toTagNames(tagAssignments),
          groups: toGroupNames(groupMemberships),
          _count: {
            ..._count,
            buyerRequirements: (buyerIntakeContacts ?? []).reduce(
              (total, participant) =>
                total + participant.buyerIntake._count.requirements,
              0,
            ),
          },
          roles: deriveContactRoles({
            buyerIntakeContacts,
            propertyContacts,
            tenants,
            dealsAsBuyer,
            dealsAsSeller,
          }),
          latestConsultation: this.formatLatestConsultation(consultations[0]),
        }),
      ),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 사이드바의 분류별 건수와 그룹 목록. 그룹은 만들어 둔 것만 나오고, 태그는 그룹이 아니다. */
  async getCategorySummary(officeId: string) {
    const now = new Date();
    const [total, categoryCounts, groups] = await Promise.all([
      this.prisma.contact.count({ where: { officeId } }),
      Promise.all(
        CONTACT_CATEGORY_KEYS.map((key) =>
          this.prisma.contact.count({
            where: { officeId, AND: [contactCategoryWhere(key, now)] },
          }),
        ),
      ),
      this.prisma.contactGroup.findMany({
        where: { officeId },
        select: { name: true, _count: { select: { members: true } } },
      }),
    ]);

    return {
      total,
      counts: Object.fromEntries(
        CONTACT_CATEGORY_KEYS.map((key, index) => [key, categoryCounts[index]]),
      ) as Record<ContactCategoryKey, number>,
      groups: groups
        .map(({ name, _count }) => ({ name, count: _count.members }))
        .sort((left, right) => left.name.localeCompare(right.name, 'ko')),
    };
  }

  async findOne(id: string, officeId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, officeId },
      include: {
        phones: this.contactPhonesInclude(),
        groupMemberships: CONTACT_GROUP_NAMES_INCLUDE,
        tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
        propertyContacts: { include: { property: { include: { site: true } } } },
        buyerIntakeContacts: {
          include: {
            buyerIntake: {
              include: {
                contacts: buyerIntakeContactsInclude,
                requirements: {
                  where: { status: 'active' },
                  orderBy: [
                    { priorityRank: 'asc' },
                    { createdAt: 'asc' },
                  ],
                },
              },
            },
          },
        },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10, include: { createdBy: { select: { id: true, name: true } } } },
        relationsAsMain: { include: { relatedContact: { include: { phones: this.contactPhonesInclude() } } } },
        relationsAsRelated: { include: { contact: { include: { phones: this.contactPhonesInclude() } } } },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    const buyerRequirements = contact.buyerIntakeContacts.flatMap(
      ({ buyerIntake }) =>
        buyerIntake.requirements.map((requirement) =>
          withBuyerRequirementContact({ ...requirement, buyerIntake }),
        ),
    );
    const { groupMemberships, tagAssignments, ...contactFields } = contact;
    return {
      ...withPrimaryPhone(contactFields),
      tags: toTagNames(tagAssignments),
      groups: toGroupNames(groupMemberships),
      buyerRequirements,
      relationsAsMain: contact.relationsAsMain.map((relation) =>
        withContactRelationPerspective(
          {
            ...relation,
            relatedContact: withPrimaryPhone(relation.relatedContact),
          },
          false,
        ),
      ),
      relationsAsRelated: contact.relationsAsRelated.map((relation) =>
        withContactRelationPerspective(
          {
            ...relation,
            contact: withPrimaryPhone(relation.contact),
          },
          true,
        ),
      ),
    };
  }

  async create(
    officeId: string,
    dto: ContactWriteInput & { name: string },
    actorId?: string,
  ) {
    const { phones } = this.prepareContactPhones(dto);
    try {
      // 연락처와 태그를 함께 만든다. 태그가 틀려 실패하면 연락처도 남지 않는다.
      const contact = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contact.create({
        data: {
          officeId,
          name: dto.name,
          email: dto.email ?? null,
          memo: dto.memo ?? null,
          phones: phones.length > 0
            ? {
                create: phones.map((phone) => ({
                  ...phone,
                  office: { connect: { id: officeId } },
                })),
              }
            : undefined,
        },
          select: { id: true },
        });
        if (dto.tags !== undefined) {
          await setContactTags(tx, officeId, created.id, dto.tags, actorId);
        }
        return tx.contact.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            phones: this.contactPhonesInclude(),
            tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
          },
        });
      });
      return withPrimaryPhone(withTagNames(contact));
    } catch (error) {
      this.rethrowPhoneConflict(error);
    }
  }

  async update(
    id: string,
    officeId: string,
    dto: ContactWriteInput,
    actorId?: string,
  ) {
    await this.findOne(id, officeId);
    const shouldReplacePhones = dto.phones !== undefined || dto.phone !== undefined;
    const { phones } = this.prepareContactPhones(dto);

    const data: Prisma.ContactUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.memo !== undefined && { memo: dto.memo }),
      ...(shouldReplacePhones && {
        phones: {
          deleteMany: {},
          create: phones.map((phone) => ({
            ...phone,
            office: { connect: { id: officeId } },
          })),
        },
      }),
    };

    try {
      const contact = await this.prisma.$transaction(async (tx) => {
        if (dto.tags !== undefined) {
          await setContactTags(tx, officeId, id, dto.tags, actorId);
        }
        return tx.contact.update({
          where: { id },
          data,
          include: {
            phones: this.contactPhonesInclude(),
            tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
          },
        });
      });
      return withPrimaryPhone(withTagNames(contact));
    } catch (error) {
      this.rethrowPhoneConflict(error);
    }
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.contact.delete({ where: { id } });
  }

  async getPhoneIndex(officeId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        phones: { some: {} },
      },
      select: {
        id: true,
        name: true,
        phones: this.contactPhonesSelect(),
        tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
        propertyContacts: {
          where: { role: 'owner', status: 'active' },
          take: 3,
          select: {
            role: true,
            property: {
              select: {
                site: { select: { name: true } },
                unit: { select: { name: true, floor: true, floorEnd: true, floorLabel: true, dong: { select: { name: true, isPlaceholder: true } } } },
              },
            },
          },
        },
        consultations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: withPrimaryPhone(c).phone,
      phones: c.phones,
      tags: toTagNames(c.tagAssignments),
      ownedProperties: c.propertyContacts.map((pc) => {
        const site = pc.property.site;
        const unit = pc.property.unit;
        const dong = unit?.dong;
        const unitLabel = unit
          ? `${dong && !dong.isPlaceholder ? dong.name + ' ' : ''}${formatUnitLabel(unit)}`
          : null;
        return { siteName: site.name, unitLabel };
      }),
      latestConsultation: c.consultations[0]
        ? {
            content: c.consultations[0].content.length > 80
              ? c.consultations[0].content.substring(0, 80) + '…'
              : c.consultations[0].content,
            type: c.consultations[0].type,
            createdAt: c.consultations[0].createdAt,
          }
        : null,
    }));
  }

  async findByPhone(officeId: string, phone?: string) {
    if (!phone) return [];
    const canonicalPhone = normalizePhone(phone);
    if (canonicalPhone.length < 4) return [];
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        phones: { some: { phone: canonicalPhone } },
      },
      select: {
        id: true,
        name: true,
        phones: this.contactPhonesSelect(),
        tagAssignments: CONTACT_TAG_NAMES_INCLUDE,
        propertyContacts: {
          where: { role: 'owner', status: 'active' },
          take: 3,
          select: {
            role: true,
            property: {
              select: {
                site: { select: { name: true } },
                unit: { select: { name: true, floor: true, floorEnd: true, floorLabel: true, dong: { select: { name: true, isPlaceholder: true } } } },
              },
            },
          },
        },
        consultations: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          select: {
            content: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: withPrimaryPhone(c).phone,
      phones: c.phones,
      tags: toTagNames(c.tagAssignments),
      ownedProperties: c.propertyContacts.map((pc) => {
        const site = pc.property.site;
        const unit = pc.property.unit;
        const dong = unit?.dong;
        const unitLabel = unit
          ? `${dong && !dong.isPlaceholder ? dong.name + ' ' : ''}${formatUnitLabel(unit)}`
          : null;
        return { siteName: site.name, unitLabel };
      }),
      latestConsultation: c.consultations[0]
        ? {
            content: c.consultations[0].content.length > 80
              ? c.consultations[0].content.substring(0, 80) + '…'
              : c.consultations[0].content,
            type: c.consultations[0].type,
            createdAt: c.consultations[0].createdAt,
          }
        : null,
    }));
  }

  async getPropertyContacts(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.findMany({
      where: { contactId: id, officeId },
      include: { property: { include: { site: true, unit: true } } },
    });
  }

  async getBuyerRequirements(id: string, officeId: string) {
    await this.findOne(id, officeId);
    const requirements = await this.prisma.buyerRequirement.findMany({
      where: {
        officeId,
        buyerIntake: { contacts: { some: { contactId: id } } },
      },
      include: {
        buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
      },
      orderBy: [
        { buyerIntakeId: 'asc' },
        { priorityRank: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return requirements.map(withBuyerRequirementContact);
  }

  async getConsultations(id: string, officeId: string) {
    const contact = await this.findOne(id, officeId);
    const relatedContactIds = [
      ...contact.relationsAsMain.map((relation) => relation.relatedContactId),
      ...contact.relationsAsRelated.map((relation) => relation.contactId),
    ];

    const consultations = await this.prisma.consultation.findMany({
      where: { contactId: { in: [id, ...relatedContactIds] }, officeId },
      include: {
        contact: { select: { id: true, name: true, phones: this.contactPhonesSelect() } },
        property: { select: { id: true, site: { select: { name: true } } } },
        listing: {
          select: {
            id: true,
            transactionType: true,
            price: true,
            isPaused: true,
            intake: { select: LISTING_INTAKE_STATE_SELECT },
            deals: OCCUPYING_DEALS_SELECT,
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return consultations.map(withPrimaryContactPhone);
  }

  private prepareContactPhones(dto: ContactWriteInput) {
    const sourcePhones = dto.phones !== undefined
      ? dto.phones
      : dto.phone
        ? [{ phone: dto.phone, label: 'mobile', isPrimary: true }]
        : [];

    const seen = new Set<string>();
    const phones = sourcePhones
      .map((item) => {
        const canonicalPhone = normalizePhone(item.phone);
        if (!canonicalPhone || seen.has(canonicalPhone)) return null;
        seen.add(canonicalPhone);
        return {
          phone: canonicalPhone,
          label: item.label?.trim() || 'mobile',
          isPrimary: item.isPrimary ?? false,
          memo: item.memo?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (phones.filter((phone) => phone.isPrimary).length > 1) {
      throw new BadRequestException(
        '대표 전화번호는 연락처당 하나만 지정할 수 있습니다.',
      );
    }

    if (phones.length > 0 && !phones.some((phone) => phone.isPrimary)) {
      phones[0].isPrimary = true;
    }

    return { phones };
  }

  private rethrowPhoneConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        '이미 이 사무소의 다른 연락처가 사용 중인 전화번호입니다.',
      );
    }
    throw error;
  }

  private contactPhonesInclude() {
    return contactPhonesIncludeOrdered;
  }

  private contactPhonesSelect() {
    return contactPhonesSelectOrdered;
  }

  private formatLatestConsultation(
    consultation?: { content: string; type: string; createdAt: Date } | null,
  ) {
    if (!consultation) return null;

    return {
      content: consultation.content.length > 120
        ? consultation.content.substring(0, 120) + '…'
        : consultation.content,
      type: consultation.type,
      createdAt: consultation.createdAt,
    };
  }
}
