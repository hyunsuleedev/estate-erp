import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactKind, PartyKind, PartyMemberStatus } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  AddHouseholdMemberDto,
  AddOrganizationMemberDto,
  AddPartyMemberDto,
  CreatePartyDto,
  UpdatePartyDto,
  UpdatePartyMemberDto,
} from './dto/party.dto';

export const partyIncludeWithMembers = {
  organizationContact: {
    select: {
      id: true,
      kind: true,
      name: true,
      email: true,
      phones: contactPhonesIncludeOrdered,
    },
  },
  members: {
    where: { status: PartyMemberStatus.ACTIVE },
    include: {
      contact: {
        select: {
          id: true,
          kind: true,
          name: true,
          email: true,
          phones: contactPhonesIncludeOrdered,
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.PartyInclude;

type PartyWithMembers = Prisma.PartyGetPayload<{
  include: typeof partyIncludeWithMembers;
}>;

export function presentParty(party: PartyWithMembers) {
  return {
    ...party,
    organizationContact: party.organizationContact
      ? withPrimaryPhone(party.organizationContact)
      : null,
    members: party.members.map((member) => ({
      ...member,
      contact: member.contact ? withPrimaryPhone(member.contact) : undefined,
    })),
  };
}

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByContact(officeId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, officeId },
      select: { id: true, kind: true },
    });
    if (!contact) {
      throw new NotFoundException('연락처를 찾을 수 없습니다.');
    }

    if (contact.kind === ContactKind.ORGANIZATION) {
      const orgParty = await this.prisma.party.findFirst({
        where: {
          officeId,
          kind: PartyKind.ORGANIZATION,
          organizationContactId: contactId,
        },
        include: partyIncludeWithMembers,
      });
      const presented = orgParty ? presentParty(orgParty) : null;
      return {
        household: null,
        organizations: presented ? [presented] : [],
        items: presented ? [presented] : [],
      };
    }

    const memberships = await this.prisma.partyMember.findMany({
      where: {
        officeId,
        contactId,
        status: PartyMemberStatus.ACTIVE,
      },
      include: {
        party: {
          include: partyIncludeWithMembers,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const parties = memberships.map((item) => presentParty(item.party));
    const household = parties.find((party) => party.kind === PartyKind.HOUSEHOLD) ?? null;
    const organizations = parties.filter((party) => party.kind === PartyKind.ORGANIZATION);

    return {
      household,
      organizations,
      items: parties,
    };
  }

  async searchParties(
    officeId: string,
    params: { search?: string; kind?: string; limit?: number } = {},
  ) {
    const trimmed = params.search?.trim();
    const kindFilter =
      params.kind === PartyKind.HOUSEHOLD || params.kind === PartyKind.ORGANIZATION
        ? params.kind
        : undefined;
    const take = Math.min(Math.max(Number(params.limit) || 12, 1), 30);

    const parties = await this.prisma.party.findMany({
      where: {
        officeId,
        ...(kindFilter ? { kind: kindFilter } : {}),
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: 'insensitive' } },
                {
                  organizationContact: {
                    is: { name: { contains: trimmed, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      },
      include: partyIncludeWithMembers,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return { items: parties.map(presentParty) };
  }

  async createParty(officeId: string, dto: CreatePartyDto) {
    return this.prisma.$transaction(async (tx) => {
      const normalizedHomePhone = dto.homePhone
        ? normalizePhone(dto.homePhone) || null
        : null;
      if (dto.homePhone?.trim() && (!normalizedHomePhone || normalizedHomePhone.length < 7)) {
        throw new BadRequestException('전화번호를 정확히 입력해 주세요.');
      }

      if (dto.kind === PartyKind.HOUSEHOLD) {
        if (!dto.contactId) {
          throw new BadRequestException('세대 기준 연락처를 골라 주세요.');
        }
        const baseContact = await tx.contact.findFirst({
          where: { id: dto.contactId, officeId },
          select: { id: true, kind: true, name: true },
        });
        if (!baseContact) {
          throw new NotFoundException('기준 연락처를 찾을 수 없습니다.');
        }
        if (baseContact.kind !== ContactKind.PERSON) {
          throw new BadRequestException('법인 연락처에는 세대·가족을 연결할 수 없습니다.');
        }

        const existingHousehold = await tx.partyMember.findFirst({
          where: {
            officeId,
            contactId: baseContact.id,
            partyKind: PartyKind.HOUSEHOLD,
            status: PartyMemberStatus.ACTIVE,
          },
          select: { partyId: true },
        });
        if (existingHousehold) {
          throw new ConflictException(
            '이미 다른 세대에 속해 있습니다. 기존 세대에 구성원을 추가하거나 기존 세대를 먼저 삭제해 주세요.',
          );
        }

        const createdParty = await tx.party.create({
          data: {
            officeId,
            kind: PartyKind.HOUSEHOLD,
            name: this.trimNullable(dto.name) ?? `${baseContact.name} 님 세대`,
            homePhone: normalizedHomePhone,
            memo: this.trimNullable(dto.memo) ?? null,
          },
          select: { id: true },
        });

        const initialMembers = dto.initialMembers ?? [];
        const resolvedInitials: Array<{
          contactId: string;
          roleLabel: string | null;
          isPrimary: boolean;
          memo: string | null;
        }> = [];
        const seenContactIds = new Set<string>([baseContact.id]);

        for (const item of initialMembers) {
          const memberContact = await this.resolveOrCreatePersonMember(tx, officeId, {
            excludedContactId: baseContact.id,
            memberContactId: item.memberContactId,
            name: item.name,
            phone: item.phone,
            fallbackName: item.roleLabel?.trim() || '세대원',
          });
          if (seenContactIds.has(memberContact.id)) continue;
          seenContactIds.add(memberContact.id);

          const otherHousehold = await tx.partyMember.findFirst({
            where: {
              officeId,
              contactId: memberContact.id,
              partyKind: PartyKind.HOUSEHOLD,
              status: PartyMemberStatus.ACTIVE,
            },
            select: { partyId: true },
          });
          if (otherHousehold) {
            throw new ConflictException(
              '상대 연락처가 이미 다른 세대에 속해 있습니다. 먼저 기존 세대에서 분리한 뒤 추가하세요.',
            );
          }

          resolvedInitials.push({
            contactId: memberContact.id,
            roleLabel: this.trimNullable(item.roleLabel) ?? null,
            isPrimary: Boolean(item.isPrimary),
            memo: this.trimNullable(item.memo) ?? null,
          });
        }

        const anyInitialPrimary = resolvedInitials.some((m) => m.isPrimary);
        const selfIsPrimary =
          dto.selfIsPrimary !== undefined ? dto.selfIsPrimary : !anyInitialPrimary;

        await tx.partyMember.create({
          data: {
            officeId,
            partyId: createdParty.id,
            partyKind: PartyKind.HOUSEHOLD,
            contactId: baseContact.id,
            contactKind: ContactKind.PERSON,
            roleLabel: this.trimNullable(dto.selfRoleLabel) ?? null,
            isPrimary: anyInitialPrimary ? false : selfIsPrimary,
            status: PartyMemberStatus.ACTIVE,
          },
        });

        for (let i = 0; i < resolvedInitials.length; i += 1) {
          const item = resolvedInitials[i];
          await tx.partyMember.create({
            data: {
              officeId,
              partyId: createdParty.id,
              partyKind: PartyKind.HOUSEHOLD,
              contactId: item.contactId,
              contactKind: ContactKind.PERSON,
              roleLabel: item.roleLabel,
              isPrimary:
                anyInitialPrimary &&
                i === resolvedInitials.findIndex((m) => m.isPrimary),
              status: PartyMemberStatus.ACTIVE,
              memo: item.memo,
            },
          });
        }

        const party = await tx.party.findUniqueOrThrow({
          where: { id: createdParty.id },
          include: partyIncludeWithMembers,
        });
        return presentParty(party);
      }

      // PartyKind.ORGANIZATION
      let orgContactId: string;
      let anchorPersonId: string | null = null;

      if (dto.contactId) {
        const anchorContact = await tx.contact.findFirst({
          where: { id: dto.contactId, officeId },
          select: { id: true, kind: true, name: true },
        });
        if (!anchorContact) {
          throw new NotFoundException('기준 연락처를 찾을 수 없습니다.');
        }

        if (anchorContact.kind === ContactKind.ORGANIZATION) {
          const existingOrgParty = await tx.party.findFirst({
            where: {
              officeId,
              kind: PartyKind.ORGANIZATION,
              organizationContactId: anchorContact.id,
            },
            select: { id: true },
          });
          if (existingOrgParty) {
            throw new ConflictException('이미 이 법인의 파티가 존재합니다.');
          }
          orgContactId = anchorContact.id;
        } else {
          const orgName = dto.name?.trim();
          if (!orgName) {
            throw new BadRequestException('법인·단체명을 입력해 주세요.');
          }
          const createdOrg = await tx.contact.create({
            data: {
              officeId,
              kind: ContactKind.ORGANIZATION,
              name: orgName,
              businessRegNo: this.trimNullable(dto.businessRegNo) ?? null,
              ...(normalizedHomePhone
                ? {
                    phones: {
                      create: [
                        {
                          phone: normalizedHomePhone,
                          label: 'office',
                          isPrimary: true,
                          office: { connect: { id: officeId } },
                        },
                      ],
                    },
                  }
                : {}),
            },
            select: { id: true },
          });
          orgContactId = createdOrg.id;
          anchorPersonId = anchorContact.id;
        }
      } else {
        const orgName = dto.name?.trim();
        if (!orgName) {
          throw new BadRequestException('법인·단체명을 입력해 주세요.');
        }
        const createdOrg = await tx.contact.create({
          data: {
            officeId,
            kind: ContactKind.ORGANIZATION,
            name: orgName,
            businessRegNo: this.trimNullable(dto.businessRegNo) ?? null,
            ...(normalizedHomePhone
              ? {
                  phones: {
                    create: [
                      {
                        phone: normalizedHomePhone,
                        label: 'office',
                        isPrimary: true,
                        office: { connect: { id: officeId } },
                      },
                    ],
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        orgContactId = createdOrg.id;
      }

      const createdOrgParty = await tx.party.create({
        data: {
          officeId,
          kind: PartyKind.ORGANIZATION,
          organizationContactId: orgContactId,
          organizationContactKind: ContactKind.ORGANIZATION,
          homePhone: normalizedHomePhone,
          memo: this.trimNullable(dto.memo) ?? null,
        },
        select: { id: true },
      });

      const seenOrgMembers = new Set<string>();
      const orgMemberRows: Array<{
        contactId: string;
        roleLabel: string | null;
        isPrimary: boolean;
        memo: string | null;
      }> = [];

      if (anchorPersonId) {
        seenOrgMembers.add(anchorPersonId);
        orgMemberRows.push({
          contactId: anchorPersonId,
          roleLabel: this.trimNullable(dto.selfRoleLabel) ?? null,
          isPrimary: dto.selfIsPrimary ?? true,
          memo: null,
        });
      }

      for (const item of dto.initialMembers ?? []) {
        const memberContact = await this.resolveOrCreatePersonMember(tx, officeId, {
          excludedContactId: orgContactId,
          memberContactId: item.memberContactId,
          name: item.name,
          phone: item.phone,
          fallbackName: item.roleLabel?.trim() || '담당자',
        });
        if (seenOrgMembers.has(memberContact.id)) continue;
        seenOrgMembers.add(memberContact.id);
        orgMemberRows.push({
          contactId: memberContact.id,
          roleLabel: this.trimNullable(item.roleLabel) ?? null,
          isPrimary: Boolean(item.isPrimary),
          memo: this.trimNullable(item.memo) ?? null,
        });
      }

      if (orgMemberRows.length > 0 && !orgMemberRows.some((m) => m.isPrimary)) {
        orgMemberRows[0].isPrimary = true;
      }
      const primaryIdx = orgMemberRows.findIndex((m) => m.isPrimary);

      for (let i = 0; i < orgMemberRows.length; i += 1) {
        const item = orgMemberRows[i];
        await tx.partyMember.create({
          data: {
            officeId,
            partyId: createdOrgParty.id,
            partyKind: PartyKind.ORGANIZATION,
            contactId: item.contactId,
            contactKind: ContactKind.PERSON,
            roleLabel: item.roleLabel,
            isPrimary: i === primaryIdx,
            status: PartyMemberStatus.ACTIVE,
            memo: item.memo,
          },
        });
      }

      const party = await tx.party.findUniqueOrThrow({
        where: { id: createdOrgParty.id },
        include: partyIncludeWithMembers,
      });
      return presentParty(party);
    });
  }

  async addHouseholdMember(officeId: string, dto: AddHouseholdMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      const baseContact = await tx.contact.findFirst({
        where: { id: dto.contactId, officeId },
        select: { id: true, kind: true, name: true },
      });
      if (!baseContact) {
        throw new NotFoundException('기준 연락처를 찾을 수 없습니다.');
      }
      if (baseContact.kind !== ContactKind.PERSON) {
        throw new BadRequestException('법인 연락처에는 세대·가족을 연결할 수 없습니다.');
      }

      const memberContact = await this.resolveOrCreatePersonMember(tx, officeId, {
        excludedContactId: dto.contactId,
        memberContactId: dto.memberContactId,
        name: dto.name,
        phone: dto.phone,
        fallbackName: dto.roleLabel?.trim() || '가족',
      });

      if (memberContact.id === dto.contactId) {
        throw new BadRequestException('자기 자신을 가족으로 연결할 수 없습니다.');
      }

      // 기준 연락처가 속한 활성 세대를 찾고, 없으면 상대방의 세대도 확인한다.
      const [baseMembership, memberMembership] = await Promise.all([
        tx.partyMember.findFirst({
          where: {
            officeId,
            contactId: dto.contactId,
            partyKind: PartyKind.HOUSEHOLD,
            status: PartyMemberStatus.ACTIVE,
          },
          select: { partyId: true },
        }),
        tx.partyMember.findFirst({
          where: {
            officeId,
            contactId: memberContact.id,
            partyKind: PartyKind.HOUSEHOLD,
            status: PartyMemberStatus.ACTIVE,
          },
          select: { partyId: true },
        }),
      ]);

      if (baseMembership && memberMembership) {
        if (baseMembership.partyId === memberMembership.partyId) {
          throw new ConflictException('이미 같은 세대로 연결되어 있습니다.');
        }
        throw new ConflictException(
          '상대 연락처가 이미 다른 세대에 속해 있습니다. 먼저 기존 세대에서 분리한 뒤 추가하세요.',
        );
      }

      let partyId = baseMembership?.partyId ?? memberMembership?.partyId ?? null;
      if (!partyId) {
        const createdParty = await tx.party.create({
          data: {
            officeId,
            kind: PartyKind.HOUSEHOLD,
            name: `${baseContact.name} 님 세대`,
          },
          select: { id: true },
        });
        partyId = createdParty.id;

        await tx.partyMember.create({
          data: {
            officeId,
            partyId,
            partyKind: PartyKind.HOUSEHOLD,
            contactId: dto.contactId,
            contactKind: ContactKind.PERSON,
            roleLabel: this.trimNullable(dto.selfRoleLabel) ?? null,
            isPrimary: !dto.isPrimary,
            status: PartyMemberStatus.ACTIVE,
          },
        });
      }

      const targetContactId = baseMembership ? memberContact.id : memberMembership ? dto.contactId : memberContact.id;
      const roleLabel = baseMembership
        ? this.trimNullable(dto.roleLabel)
        : memberMembership
          ? this.trimNullable(dto.selfRoleLabel) ?? this.trimNullable(dto.roleLabel)
          : this.trimNullable(dto.roleLabel);

      if (dto.isPrimary) {
        await this.demotePrimaryMembers(tx, officeId, partyId);
      }

      await tx.partyMember.create({
        data: {
          officeId,
          partyId,
          partyKind: PartyKind.HOUSEHOLD,
          contactId: targetContactId,
          contactKind: ContactKind.PERSON,
          roleLabel: roleLabel ?? null,
          isPrimary: Boolean(dto.isPrimary),
          status: PartyMemberStatus.ACTIVE,
          memo: this.trimNullable(dto.memo) ?? null,
        },
      });

      const party = await tx.party.findUniqueOrThrow({
        where: { id: partyId },
        include: partyIncludeWithMembers,
      });
      return presentParty(party);
    });
  }

  async addOrganizationMember(officeId: string, dto: AddOrganizationMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      const orgContact = await tx.contact.findFirst({
        where: { id: dto.organizationContactId, officeId },
        select: { id: true, kind: true, name: true },
      });
      if (!orgContact) {
        throw new NotFoundException('법인 연락처를 찾을 수 없습니다.');
      }
      if (orgContact.kind !== ContactKind.ORGANIZATION) {
        throw new BadRequestException('법인·단체 연락처에만 담당자를 추가할 수 있습니다.');
      }

      const memberContact = await this.resolveOrCreatePersonMember(tx, officeId, {
        excludedContactId: dto.organizationContactId,
        memberContactId: dto.memberContactId,
        name: dto.name,
        phone: dto.phone,
        fallbackName: dto.roleLabel?.trim() || '담당자',
      });

      let orgParty = await tx.party.findFirst({
        where: {
          officeId,
          kind: PartyKind.ORGANIZATION,
          organizationContactId: orgContact.id,
        },
        select: { id: true },
      });

      if (!orgParty) {
        orgParty = await tx.party.create({
          data: {
            officeId,
            kind: PartyKind.ORGANIZATION,
            organizationContactId: orgContact.id,
            organizationContactKind: ContactKind.ORGANIZATION,
          },
          select: { id: true },
        });
      }

      const existing = await tx.partyMember.findFirst({
        where: {
          officeId,
          partyId: orgParty.id,
          contactId: memberContact.id,
          status: PartyMemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('이미 이 법인에 소속된 담당자입니다.');
      }

      const activeCount = await tx.partyMember.count({
        where: { officeId, partyId: orgParty.id, status: PartyMemberStatus.ACTIVE },
      });
      const makePrimary = dto.isPrimary ?? activeCount === 0;
      if (makePrimary) {
        await this.demotePrimaryMembers(tx, officeId, orgParty.id);
      }

      await tx.partyMember.create({
        data: {
          officeId,
          partyId: orgParty.id,
          partyKind: PartyKind.ORGANIZATION,
          contactId: memberContact.id,
          contactKind: ContactKind.PERSON,
          roleLabel: this.trimNullable(dto.roleLabel) ?? null,
          isPrimary: makePrimary,
          status: PartyMemberStatus.ACTIVE,
          memo: this.trimNullable(dto.memo) ?? null,
        },
      });

      const party = await tx.party.findUniqueOrThrow({
        where: { id: orgParty.id },
        include: partyIncludeWithMembers,
      });
      return presentParty(party);
    });
  }

  async updateParty(officeId: string, partyId: string, dto: UpdatePartyDto) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, officeId },
      select: { id: true, kind: true },
    });
    if (!party) {
      throw new NotFoundException('집단 정보를 찾을 수 없습니다.');
    }

    const updated = await this.prisma.party.update({
      where: { id: partyId },
      data: {
        ...(dto.name !== undefined && party.kind === PartyKind.HOUSEHOLD
          ? { name: this.trimNullable(dto.name) }
          : {}),
        ...(dto.homePhone !== undefined
          ? { homePhone: dto.homePhone ? normalizePhone(dto.homePhone) || null : null }
          : {}),
        ...(dto.memo !== undefined ? { memo: this.trimNullable(dto.memo) } : {}),
      },
      include: partyIncludeWithMembers,
    });
    return presentParty(updated);
  }

  async updateMember(
    officeId: string,
    partyId: string,
    memberId: string,
    dto: UpdatePartyMemberDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.partyMember.findFirst({
        where: { id: memberId, partyId, officeId },
      });
      if (!member) {
        throw new NotFoundException('구성원을 찾을 수 없습니다.');
      }

      if (dto.isPrimary === true) {
        await this.demotePrimaryMembers(tx, officeId, partyId, memberId);
      }

      await tx.partyMember.update({
        where: { id: memberId },
        data: {
          ...(dto.roleLabel !== undefined ? { roleLabel: this.trimNullable(dto.roleLabel) } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.memo !== undefined ? { memo: this.trimNullable(dto.memo) } : {}),
        },
      });

      const party = await tx.party.findUniqueOrThrow({
        where: { id: partyId },
        include: partyIncludeWithMembers,
      });
      return presentParty(party);
    });
  }

  async addMemberToParty(officeId: string, partyId: string, dto: AddPartyMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.findFirst({
        where: { id: partyId, officeId },
        select: { id: true, kind: true, organizationContactId: true },
      });
      if (!party) {
        throw new NotFoundException('집단 정보를 찾을 수 없습니다.');
      }

      const memberContact = await this.resolveOrCreatePersonMember(tx, officeId, {
        excludedContactId: party.organizationContactId ?? '',
        memberContactId: dto.memberContactId,
        name: dto.name,
        phone: dto.phone,
        fallbackName:
          dto.roleLabel?.trim() ||
          (party.kind === PartyKind.HOUSEHOLD ? '세대원' : '담당자'),
      });

      const existing = await tx.partyMember.findFirst({
        where: {
          officeId,
          partyId: party.id,
          contactId: memberContact.id,
          status: PartyMemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('이미 이 파티에 소속된 구성원입니다.');
      }

      if (party.kind === PartyKind.HOUSEHOLD) {
        const otherHousehold = await tx.partyMember.findFirst({
          where: {
            officeId,
            contactId: memberContact.id,
            partyKind: PartyKind.HOUSEHOLD,
            status: PartyMemberStatus.ACTIVE,
          },
          select: { partyId: true },
        });
        if (otherHousehold) {
          throw new ConflictException(
            '상대 연락처가 이미 다른 세대에 속해 있습니다. 먼저 기존 세대에서 분리한 뒤 추가하세요.',
          );
        }
      }

      const activeCount = await tx.partyMember.count({
        where: { officeId, partyId: party.id, status: PartyMemberStatus.ACTIVE },
      });
      const makePrimary = dto.isPrimary ?? activeCount === 0;
      if (makePrimary) {
        await this.demotePrimaryMembers(tx, officeId, party.id);
      }

      await tx.partyMember.create({
        data: {
          officeId,
          partyId: party.id,
          partyKind: party.kind,
          contactId: memberContact.id,
          contactKind: ContactKind.PERSON,
          roleLabel: this.trimNullable(dto.roleLabel) ?? null,
          isPrimary: makePrimary,
          status: PartyMemberStatus.ACTIVE,
          memo: this.trimNullable(dto.memo) ?? null,
        },
      });

      const updated = await tx.party.findUniqueOrThrow({
        where: { id: party.id },
        include: partyIncludeWithMembers,
      });
      return presentParty(updated);
    });
  }

  async deleteParty(officeId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, officeId },
      select: { id: true },
    });
    if (!party) {
      throw new NotFoundException('집단 정보를 찾을 수 없습니다.');
    }
    await this.prisma.party.delete({ where: { id: party.id } });
    return { deleted: true, id: party.id };
  }

  async removeMember(officeId: string, partyId: string, memberId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.partyMember.findFirst({
        where: { id: memberId, partyId, officeId },
        include: { party: { select: { id: true, kind: true } } },
      });
      if (!member) {
        throw new NotFoundException('구성원을 찾을 수 없습니다.');
      }

      await tx.partyMember.delete({ where: { id: memberId } });

      const remaining = await tx.partyMember.findMany({
        where: { officeId, partyId, status: PartyMemberStatus.ACTIVE },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      // 세대(household)에 활성 구성원이 0명 남으면 빈 파티를 정리한다 (1인 세대는 유지).
      if (member.party.kind === PartyKind.HOUSEHOLD && remaining.length === 0) {
        await tx.party.delete({ where: { id: partyId } });
        return { deletedParty: true, party: null };
      }

      if (member.isPrimary && remaining.length > 0 && !remaining.some((m) => m.isPrimary)) {
        await tx.partyMember.update({
          where: { id: remaining[0].id },
          data: { isPrimary: true },
        });
      }

      const party = await tx.party.findUniqueOrThrow({
        where: { id: partyId },
        include: partyIncludeWithMembers,
      });
      return { deletedParty: false, party: presentParty(party) };
    });
  }

  private async resolveOrCreatePersonMember(
    tx: Prisma.TransactionClient,
    officeId: string,
    input: {
      excludedContactId: string;
      memberContactId?: string;
      name?: string;
      phone?: string;
      fallbackName: string;
    },
  ) {
    if (input.memberContactId) {
      const existing = await tx.contact.findFirst({
        where: { id: input.memberContactId, officeId },
        select: { id: true, kind: true, name: true },
      });
      if (!existing) {
        throw new NotFoundException('연결할 연락처를 찾을 수 없습니다.');
      }
      if (existing.kind !== ContactKind.PERSON) {
        throw new BadRequestException('개인 연락처만 구성원으로 추가할 수 있습니다.');
      }
      return existing;
    }

    const canonicalPhone = input.phone ? normalizePhone(input.phone) : '';
    if (canonicalPhone && canonicalPhone.length < 7) {
      throw new BadRequestException('전화번호를 정확히 입력해 주세요.');
    }

    if (canonicalPhone) {
      const byPhone = await tx.contact.findFirst({
        where: {
          officeId,
          kind: ContactKind.PERSON,
          phones: { some: { phone: canonicalPhone } },
        },
        select: { id: true, kind: true, name: true },
      });
      if (byPhone) {
        if (byPhone.id === input.excludedContactId) {
          throw new BadRequestException('기준 연락처와 같은 번호로 추가할 수 없습니다.');
        }
        return byPhone;
      }
    }

    const name = input.name?.trim() || input.fallbackName;
    if (!name && !canonicalPhone) {
      throw new BadRequestException('연락처를 고르거나 이름·전화번호를 입력해 주세요.');
    }

    return tx.contact.create({
      data: {
        officeId,
        kind: ContactKind.PERSON,
        name,
        ...(canonicalPhone
          ? {
              phones: {
                create: [
                  {
                    phone: canonicalPhone,
                    label: 'mobile',
                    isPrimary: true,
                    office: { connect: { id: officeId } },
                  },
                ],
              },
            }
          : {}),
      },
      select: { id: true, kind: true, name: true },
    });
  }

  private async demotePrimaryMembers(
    tx: Prisma.TransactionClient,
    officeId: string,
    partyId: string,
    exceptId?: string,
  ) {
    const primaries = await tx.partyMember.findMany({
      where: {
        officeId,
        partyId,
        status: PartyMemberStatus.ACTIVE,
        isPrimary: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    for (const primary of primaries) {
      await tx.partyMember.update({
        where: { id: primary.id },
        data: { isPrimary: false },
      });
    }
  }

  private trimNullable(value: string | null | undefined) {
    if (value === undefined) return undefined;
    return value?.trim() || null;
  }
}
