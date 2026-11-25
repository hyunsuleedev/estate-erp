import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  contactPhonesSelectOrdered,
  normalizePhone,
  phoneSearchDigits,
  withPrimaryPhone,
  withPrimaryContactPhone,
} from './contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import {
  PartiesService,
  partyIncludeWithMembers,
  presentParty,
} from '../parties/parties.service';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from '../buyer-requirements/buyer-requirement.presenter';
import {
  CONTACT_CATEGORY_KEYS,
  ConsultationScope,
  ContactKind,
  PartyKind,
  PartyMemberStatus,
  type ContactCategoryKey,
  formatUnitLabel,
} from '@estate-erp/shared';
import {
  CONTACT_TAG_NAMES_INCLUDE,
  setContactTags,
  toTagNames,
  withTagNames,
} from './contact-tags.service';
import {
  executeContactMerge,
  isConcurrentChangeError,
  lockContacts,
  maskPhone,
  planContactMerge,
  readMergeParty,
  type ContactMergePlan,
} from './contact-merge';
import { placeholderContactName } from './contact-name.utils';
import { readContactOverview, type ContactOverview } from './contact-overview';
import { getRequestContext } from '../../common/request-context/request-context';
import { isUuid } from '../tasks/linked-records';
import {
  CONTACT_ROLE_INCLUDE,
  CONTACT_ROLE_INTAKE_SELECT,
  contactCategoryWhere,
  deriveContactRoles,
} from './contact-categories';

export interface ContactSearchQuery {
  search?: string;
  kind?: ContactKind;
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
  kind?: ContactKind;
  name?: string;
  businessRegNo?: string | null;
  referredByContactId?: string | null;
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

const CONTACT_NAME_MAX = 100;
/** 지역번호 없는 7자리 집 전화부터 +82 국제 표기(정리 후 11자리)까지 받는다. */
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 12;

/** 이름은 비워 둘 수 없다. 앞뒤 공백은 떼고 저장한다. */
function requireContactName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new BadRequestException('이름을 입력하세요.');
  if (trimmed.length > CONTACT_NAME_MAX) {
    throw new BadRequestException(`이름은 ${CONTACT_NAME_MAX}자까지 쓸 수 있습니다.`);
  }
  return trimmed;
}

/** 오류 문구에 쓰는 번호 모양 (010-1234-5678, 02-123-4567). 화면 표기와 같은 규칙이다. */
function formatPhoneForMessage(digits: string): string {
  if (digits.startsWith('02')) {
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (digits.startsWith('0')) {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export interface ContactDeleteCheckItem {
  key: string;
  label: string;
  count: number;
}

export interface ContactDeleteCheck {
  /** 이것이 하나라도 있으면 지울 수 없다 (지우면 기록이 사라지거나 누구의 일인지 모르게 된다) */
  blockers: ContactDeleteCheckItem[];
  /** 지우면 함께 지워지는 것 */
  removed: ContactDeleteCheckItem[];
  /** 지워도 남지만 이 사람과의 연결만 풀리는 것 */
  detached: ContactDeleteCheckItem[];
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly parties?: PartiesService,
  ) {}

  async findAll(officeId: string, query: ContactSearchQuery = {}) {
    const where: Prisma.ContactWhereInput = { officeId };

    if (query.kind) {
      where.kind = query.kind;
    }

    if (query.search) {
      const canonicalSearch = phoneSearchDigits(query.search);
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
          leaseTenancies,
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
            leaseTenancies,
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
        referredBy: {
          select: {
            id: true,
            kind: true,
            name: true,
            phones: this.contactPhonesInclude(),
          },
        },
        propertyContacts: { include: { property: { include: { site: true } } } },
        buyerIntakeContacts: {
          where: {
            buyerIntake: {
              lifecycleStatus: { in: ['open', 'hold'] },
            },
          },
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
        organizationParty: {
          include: partyIncludeWithMembers,
        },
        partyMemberships: {
          where: { status: PartyMemberStatus.ACTIVE },
          include: {
            party: {
              include: partyIncludeWithMembers,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        // 위의 상담은 최근 10건만 싣는다. 화면이 건수를 "10"으로 잘못 말하지 않게 전체 건수를 따로 준다.
        _count: { select: { consultations: true } },
      },
    });
    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
    const buyerRequirements = contact.buyerIntakeContacts.flatMap(
      ({ buyerIntake }) =>
        buyerIntake.requirements.map((requirement) =>
          withBuyerRequirementContact({ ...requirement, buyerIntake }),
        ),
    );
    const {
      groupMemberships,
      tagAssignments,
      _count,
      organizationParty,
      partyMemberships,
      referredBy,
      ...contactFields
    } = contact;
    const orgPartyPresented =
      contact.kind === ContactKind.ORGANIZATION && organizationParty
        ? presentParty(organizationParty)
        : null;
    const membershipParties = (partyMemberships ?? []).map((membership) =>
      presentParty(membership.party),
    );
    const household =
      membershipParties.find((party) => party.kind === PartyKind.HOUSEHOLD) ?? null;
    const organizations =
      contact.kind === ContactKind.ORGANIZATION
        ? orgPartyPresented
          ? [orgPartyPresented]
          : []
        : membershipParties.filter((party) => party.kind === PartyKind.ORGANIZATION);
    const partyItems =
      contact.kind === ContactKind.ORGANIZATION ? organizations : membershipParties;

    return {
      ...withPrimaryPhone(contactFields),
      referredBy: referredBy ? withPrimaryPhone(referredBy) : null,
      tags: toTagNames(tagAssignments),
      groups: toGroupNames(groupMemberships),
      consultationCount: _count.consultations,
      buyerRequirements,
      parties: {
        household,
        organizations,
        items: partyItems,
      },
    };
  }

  async create(
    officeId: string,
    dto: ContactWriteInput & { name: string },
    actorId?: string,
  ) {
    const kind = dto.kind ?? ContactKind.PERSON;
    if (kind !== ContactKind.PERSON && kind !== ContactKind.ORGANIZATION) {
      throw new BadRequestException('올바른 연락처 유형이 아닙니다.');
    }
    if (dto.referredByContactId) {
      const referrer = await this.prisma.contact.findFirst({
        where: { id: dto.referredByContactId, officeId },
        select: { id: true },
      });
      if (!referrer) {
        throw new BadRequestException('소개한 연락처를 찾을 수 없습니다.');
      }
    }

    const { phones } = this.prepareContactPhones(dto);
    // 이름을 모르면(비워 두면) 번호 끝 네 자리로 임시 이름을 붙인다. 번호도 없으면 받지 않는다.
    const hasName = typeof dto.name === 'string' && dto.name.trim().length > 0;
    if (!hasName && phones.length === 0) {
      throw new BadRequestException('이름이나 전화번호 중 하나는 입력하세요.');
    }
    const name = hasName
      ? requireContactName(dto.name)
      : placeholderContactName((phones.find((phone) => phone.isPrimary) ?? phones[0]).phone);
    try {
      // 연락처와 태그를 함께 만든다. 태그가 틀려 실패하면 연락처도 남지 않는다.
      const contact = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contact.create({
          data: {
            officeId,
            kind,
            name,
            businessRegNo: dto.businessRegNo?.trim() || null,
            referredByContactId: dto.referredByContactId ?? null,
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
      return this.rethrowPhoneConflict(error, officeId, phones, null);
    }
  }

  async update(
    id: string,
    officeId: string,
    dto: ContactWriteInput,
    actorId?: string,
  ) {
    const existing = await this.findOne(id, officeId);
    if (dto.kind !== undefined) {
      if (dto.kind !== ContactKind.PERSON && dto.kind !== ContactKind.ORGANIZATION) {
        throw new BadRequestException('올바른 연락처 유형이 아닙니다.');
      }
      if (dto.kind !== existing.kind) {
        if (dto.kind === ContactKind.ORGANIZATION) {
          const activeMemberships = await this.prisma.partyMember.count({
            where: { officeId, contactId: id, status: PartyMemberStatus.ACTIVE },
          });
          if (activeMemberships > 0) {
            throw new BadRequestException(
              '세대나 법인에 소속된 개인은 법인으로 유형을 바꿀 수 없습니다. 먼저 소속에서 빼 주세요.',
            );
          }
        } else {
          const orgParty = await this.prisma.party.findFirst({
            where: { officeId, organizationContactId: id },
            select: { id: true },
          });
          if (orgParty) {
            throw new BadRequestException(
              '구성원이 연결된 법인은 개인으로 유형을 바꿀 수 없습니다. 먼저 법인 구성을 정리하세요.',
            );
          }
        }
      }
    }
    if (dto.referredByContactId !== undefined && dto.referredByContactId !== null) {
      if (dto.referredByContactId === id) {
        throw new BadRequestException('자기 자신을 소개인으로 지정할 수 없습니다.');
      }
      const referrer = await this.prisma.contact.findFirst({
        where: { id: dto.referredByContactId, officeId },
        select: { id: true },
      });
      if (!referrer) {
        throw new BadRequestException('소개한 연락처를 찾을 수 없습니다.');
      }
    }

    const shouldReplacePhones = dto.phones !== undefined || dto.phone !== undefined;
    const name = dto.name !== undefined ? requireContactName(dto.name) : undefined;
    const { phones } = this.prepareContactPhones(dto);

    const data: Prisma.ContactUpdateInput = {
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(name !== undefined && { name }),
      ...(dto.businessRegNo !== undefined && {
        businessRegNo: dto.businessRegNo?.trim() || null,
      }),
      ...(dto.referredByContactId !== undefined && {
        referredBy: dto.referredByContactId
          ? { connect: { officeId_id: { officeId, id: dto.referredByContactId } } }
          : { disconnect: true },
      }),
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
      return this.rethrowPhoneConflict(error, officeId, phones, id);
    }
  }

  /**
   * 지우기 전에 무슨 일이 생기는지 알려 준다. 화면은 이것으로 "지울 수 없음 / 지우면 이렇게 됨"을 미리 말한다.
   * DB의 연결 규칙을 그대로 따른다: 상담·매물·의뢰·계약은 지우는 것을 막고(RESTRICT), 거래·프로젝트는
   * 지우면 당사자 칸이 비어 버리므로(SET NULL) 여기서 막는다. 가족 연결은 함께 지우고, 할 일·일정·통화는 남긴다.
   */
  async getDeleteCheck(
    id: string,
    officeId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<ContactDeleteCheck> {
    const contact = await client.contact.findFirst({
      where: { id, officeId },
      select: {
        organizationParty: { select: { id: true } },
        _count: {
          select: {
            consultations: true,
            propertyContacts: true,
            buyerIntakeContacts: true,
            requestedListingIntakes: true,
            leaseTenancies: true,
            contractParties: true,
            dealsAsBuyer: true,
            dealsAsSeller: true,
            primaryProjects: true,
            commissionPayments: true,
            partyMemberships: true,
            tasks: true,
            calendarEvents: true,
            callLogs: true,
            callRecordings: true,
            callActionSuggestions: true,
            referrals: true,
          },
        },
      },
    });
    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
    const count = contact._count;
    const pick = (items: ContactDeleteCheckItem[]) => items.filter((item) => item.count > 0);
    return {
      blockers: pick([
        { key: 'consultations', label: '상담 기록', count: count.consultations },
        { key: 'propertyContacts', label: '연결 매물', count: count.propertyContacts },
        { key: 'buyerIntakes', label: '희망 조건', count: count.buyerIntakeContacts },
        { key: 'requestedListingIntakes', label: '매물 접수 요청', count: count.requestedListingIntakes },
        { key: 'tenants', label: '세입자 기록', count: count.leaseTenancies },
        { key: 'deals', label: '거래', count: count.dealsAsBuyer + count.dealsAsSeller },
        {
          key: 'contracts',
          label: '계약서',
          count: count.contractParties,
        },
        // 담긴 의뢰의 당사자인 프로젝트는 의뢰 쪽에서 막히므로, 여기서는 대표 고객인 것만 센다
        { key: 'projects', label: '대표 고객인 프로젝트', count: count.primaryProjects },
        { key: 'commissionPayments', label: '수수료 입금 기록', count: count.commissionPayments },
      ]),
      removed: pick([
        {
          key: 'parties',
          label: '세대·법인 소속',
          count: count.partyMemberships + (contact.organizationParty ? 1 : 0),
        },
      ]),
      detached: pick([
        { key: 'tasks', label: '업무', count: count.tasks },
        { key: 'calendarEvents', label: '일정', count: count.calendarEvents },
        {
          key: 'calls',
          label: '통화 기록',
          count: count.callLogs + count.callRecordings + count.callActionSuggestions,
        },
        { key: 'referrals', label: '소개 연결', count: count.referrals },
      ]),
    };
  }

  async remove(id: string, officeId: string) {
    const blockedError = (check: ContactDeleteCheck) =>
      new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `${check.blockers.map((item) => `${item.label} ${item.count}건`).join(', ')}이 이 연락처에 걸려 있어 지울 수 없습니다.`,
        blockers: check.blockers,
      });
    // 먼저 밖에서 한 번 보고(없는 연락처는 404), 지울 때는 줄을 잠근 뒤 다시 센다.
    // 확인과 지우기 사이에 거래·프로젝트가 붙으면 DB가 그 칸을 비워 버리므로 잠근 채로 세야 한다.
    const firstCheck = await this.getDeleteCheck(id, officeId);
    if (firstCheck.blockers.length > 0) throw blockedError(firstCheck);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await lockContacts(tx, officeId, [id]);
        if (!locked.has(id)) throw new NotFoundException('연락처를 찾을 수 없습니다.');
        const check = await this.getDeleteCheck(id, officeId, tx);
        if (check.blockers.length > 0) throw blockedError(check);

        // 복합 FK(office_id, contact_id)가 ON DELETE RESTRICT이므로 남기는 기록은 직접 비운 뒤 삭제한다.
        await tx.task.updateMany({ where: { officeId, contactId: id }, data: { contactId: null } });
        await tx.calendarEvent.updateMany({ where: { officeId, contactId: id }, data: { contactId: null } });
        await tx.callLog.updateMany({ where: { officeId, contactId: id }, data: { contactId: null } });
        await tx.callRecording.updateMany({ where: { officeId, contactId: id }, data: { contactId: null } });
        await tx.callActionSuggestion.updateMany({ where: { officeId, contactId: id }, data: { contactId: null } });
        await tx.contact.updateMany({ where: { officeId, referredByContactId: id }, data: { referredByContactId: null } });

        const householdMemberships = await tx.partyMember.findMany({
          where: { officeId, contactId: id, partyKind: PartyKind.HOUSEHOLD },
          select: { partyId: true },
        });
        await tx.partyMember.deleteMany({ where: { officeId, contactId: id } });
        for (const { partyId } of householdMemberships) {
          const remaining = await tx.partyMember.count({
            where: { officeId, partyId, status: PartyMemberStatus.ACTIVE },
          });
          if (remaining <= 1) {
            await tx.party.deleteMany({
              where: { id: partyId, officeId, kind: PartyKind.HOUSEHOLD },
            });
          }
        }
        return tx.contact.delete({ where: { id } });
      });
    } catch (error) {
      if (isConcurrentChangeError(error)) {
        throw new ConflictException(
          '방금 다른 곳에서 이 연락처가 바뀌었습니다. 화면을 새로 고친 뒤 다시 해 주세요.',
        );
      }
      throw error;
    }
  }

  /**
   * 이 사람과 한 일: 거래 · 계약서 · 연결한 매물(매칭) · 다가오는 임장과 일정 · 열린 업무.
   * 손님이 다시 전화했을 때 연락처 화면 하나에서 지금까지의 일을 보이기 위한 읽기 전용 조회다.
   */
  async getOverview(
    id: string,
    officeId: string,
    viewer?: { userId: string; role: string },
  ): Promise<ContactOverview> {
    const contact = await this.prisma.contact.findFirst({ where: { id, officeId }, select: { id: true } });
    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
    return readContactOverview(this.prisma, officeId, id, new Date(), viewer);
  }

  /** 합치기 전 미리보기: 합칠 수 없는 이유, 옮겨지는 것, 겹쳐서 버려지는 것 */
  async getMergeCheck(sourceId: string, targetId: string, officeId: string): Promise<ContactMergePlan> {
    this.assertMergePair(sourceId, targetId);
    const [source, target] = await Promise.all([
      this.prisma.contact.findFirst({ where: { id: sourceId, officeId }, select: { id: true } }),
      this.prisma.contact.findFirst({ where: { id: targetId, officeId }, select: { id: true } }),
    ]);
    if (!source || !target) throw new NotFoundException('연락처를 찾을 수 없습니다.');
    return planContactMerge(this.prisma, officeId, sourceId, targetId);
  }

  /**
   * 같은 사람이 두 번 등록됐을 때 정리한다: source의 기록을 모두 target으로 옮기고 source를 지운다.
   * 지우기는 상담·거래가 걸린 연락처를 막으므로, 중복을 정리하는 길은 이것뿐이다.
   * 두 줄을 잠근 뒤 트랜잭션 안에서 읽고 판단한다(두 직원이 같은 대상으로 합쳐도 메모가 덮이지 않게).
   * 한 사람이 같은 거래·계약의 양쪽 당사자가 되거나, 두 사람이 가족으로 이어져 있으면 합치지 않는다.
   * 무엇을 옮기고 버렸는지는 같은 트랜잭션 안에서 변경 기록(ActivityLog)에 한 줄 남긴다.
   */
  async merge(sourceId: string, targetId: string, officeId: string, actorId?: string) {
    this.assertMergePair(sourceId, targetId);
    const context = getRequestContext();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await lockContacts(tx, officeId, [sourceId, targetId]);
        if (!locked.has(sourceId) || !locked.has(targetId)) {
          throw new NotFoundException('연락처를 찾을 수 없습니다.');
        }
        const plan = await planContactMerge(tx, officeId, sourceId, targetId);
        if (plan.conflicts.length > 0) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: plan.conflicts.map((conflict) => conflict.message).join(' '),
            conflicts: plan.conflicts,
          });
        }
        const [source, target] = await Promise.all([
          readMergeParty(tx, officeId, sourceId),
          readMergeParty(tx, officeId, targetId),
        ]);
        if (!source || !target) throw new NotFoundException('연락처를 찾을 수 없습니다.');

        const result = await executeContactMerge(tx, officeId, source, target, actorId ?? null);

        // 변경 기록: 원본은 곧 지워지므로 누구를 누구에게 합쳤는지 대상 쪽에 남긴다.
        // 전화번호는 감사 기록에 복사하지 않는 규칙이라 끝 네 자리만 남긴다.
        await tx.activityLog.create({
          data: {
            officeId,
            userId: context?.userId ?? actorId ?? null,
            actor: context?.actor ?? 'user',
            source: context?.source ?? 'web',
            action: 'update',
            entityType: 'contact',
            entityId: targetId,
            reason: `연락처 합치기: '${source.name}'을(를) '${target.name}'에 합침`,
            changes: {
              mergedFrom: {
                after: { id: source.id, name: source.name, phone: maskPhone(source.primaryPhone) },
              },
              moved: { after: result.moved },
              dropped: { after: result.dropped },
              // 남길 쪽이 임시 이름이라 지운 쪽의 진짜 이름으로 바꿨을 때만
              ...(result.name !== target.name ? { name: { before: target.name, after: result.name } } : {}),
            } as Prisma.InputJsonValue,
          },
        });

        await tx.contact.delete({ where: { id: sourceId } });
        return { id: targetId, mergedFrom: { id: source.id, name: source.name }, ...result };
      });
    } catch (error) {
      if (isConcurrentChangeError(error)) {
        throw new ConflictException('방금 다른 곳에서 이 연락처가 바뀌었습니다. 다시 해 주세요.');
      }
      throw error;
    }
  }

  private assertMergePair(sourceId: string, targetId: string) {
    if (!targetId || typeof targetId !== 'string') {
      throw new BadRequestException('남길 연락처를 고르세요.');
    }
    if (!isUuid(targetId)) throw new BadRequestException('합칠 연락처를 찾을 수 없습니다.');
    if (sourceId === targetId) {
      throw new BadRequestException('같은 연락처끼리는 합칠 수 없습니다.');
    }
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
      // 동까지 읽어 "고덕그라시움 102동 2203호"로 적는다 (동이 100개가 넘는 단지가 있다)
      include: { property: { include: { site: true, unit: { include: { dong: true } } } } },
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
        // 연락처 상세의 희망 조건 카드가 "30평 ~ 39평 · 고덕동, 고덕그라시움"처럼 지역 · 단지를 함께 적는다
        // (예전에는 빠져 있어 카드에 지역이 보이지 않았다)
        preferredSites: {
          include: { site: { select: { id: true, name: true, type: true } } },
          orderBy: { priority: 'asc' },
        },
        preferredRegions: {
          include: { province: true, district: true, ward: true },
        },
      },
      orderBy: [
        { buyerIntakeId: 'asc' },
        { priorityRank: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return requirements.map(withBuyerRequirementContact);
  }

  async getConsultations(
    id: string,
    officeId: string,
    scope: ConsultationScope = ConsultationScope.SELF,
  ) {
    const contact = await this.findOne(id, officeId);
    const contactIds = new Set<string>([id]);
    if (scope === ConsultationScope.PARTY) {
      for (const party of contact.parties.items) {
        if (party.organizationContactId) {
          contactIds.add(party.organizationContactId);
        }
        for (const member of party.members) {
          contactIds.add(member.contactId);
        }
      }
    }

    const consultations = await this.prisma.consultation.findMany({
      where: { contactId: { in: Array.from(contactIds) }, officeId },
      include: {
        contact: { select: { id: true, name: true, phones: this.contactPhonesSelect() } },
        // 동 · 호까지 읽어 상담 꼬리표를 "고덕그라시움 102동 2204호"로 적는다 (단지명만으로는 어느 집인지 모른다)
        property: {
          select: {
            id: true,
            site: { select: { name: true } },
            unit: {
              select: {
                name: true,
                floor: true,
                floorEnd: true,
                floorLabel: true,
                dong: { select: { name: true, isPlaceholder: true } },
              },
            },
          },
        },
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
        const raw = typeof item?.phone === 'string' ? item.phone.trim() : '';
        // 빈 칸은 "번호 없음"으로 보고 건너뛴다
        if (!raw) return null;
        const canonicalPhone = normalizePhone(raw);
        // 글자만 적었거나 자릿수가 맞지 않는 번호를 조용히 버리지 않는다 — 저장했는데 번호가 사라지는 일을 막는다
        if (
          canonicalPhone.length < PHONE_DIGITS_MIN ||
          canonicalPhone.length > PHONE_DIGITS_MAX
        ) {
          throw new BadRequestException(
            `전화번호 "${raw}"의 자릿수가 맞지 않습니다. 010-1234-5678처럼 숫자로 입력하세요.`,
          );
        }
        if (seen.has(canonicalPhone)) return null;
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

  /** 같은 휴대폰 번호를 다른 사람이 쓰고 있으면 누구의 번호인지 알려 준다 (그 사람을 열어 확인할 수 있게). */
  private async rethrowPhoneConflict(
    error: unknown,
    officeId: string,
    phones: Array<{ phone: string; label?: string }>,
    selfId: string | null,
  ): Promise<never> {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const mobilePhones = phones
        .filter((item) => !item.label || item.label === 'mobile')
        .map((item) => item.phone);
      const owner = mobilePhones.length
        ? await this.prisma.contactPhone.findFirst({
            where: {
              officeId,
              label: 'mobile',
              phone: { in: mobilePhones },
              ...(selfId ? { contactId: { not: selfId } } : {}),
            },
            select: { phone: true, contact: { select: { id: true, name: true } } },
          })
        : null;
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: owner
          ? `${formatPhoneForMessage(owner.phone)} 번호는 이미 '${owner.contact.name}' 님의 연락처에 있습니다. 같은 번호를 두 사람에게 저장할 수 없습니다.`
          : '이미 이 사무소의 다른 연락처가 사용 중인 전화번호입니다.',
        ...(owner ? { contactId: owner.contact.id, contactName: owner.contact.name } : {}),
      });
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
