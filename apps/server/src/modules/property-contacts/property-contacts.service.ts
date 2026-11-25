import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryContactPhone,
} from '../contacts/contact-phone.utils';

const ACTIVE_PROPERTY_CONTACT_STATUS = 'active';
const PROPERTY_CONTACT_STATUSES = new Set([
  ACTIVE_PROPERTY_CONTACT_STATUS,
  'transferred',
  'archived',
]);

/**
 * 요청 본문에서 고칠 수 있는 칸만 고른다. 본문을 그대로 펼치면 officeId·propertyId·contactId까지
 * 바뀌어 다른 사무소의 연락처·매물을 붙이거나 관계를 다른 사무소로 옮길 수 있었다.
 * 매물·연락처는 만들 때만 정하고, 서비스가 이 사무소 것인지 확인한 값을 쓴다.
 */
const PROPERTY_CONTACT_INPUT_FIELDS = [
  'role',
  'shareRatio',
  'isResident',
  'isPrimary',
  'sourceDealId',
  'memo',
] as const;

function parseOptionalDate(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('날짜 형식이 올바르지 않습니다.');
  }
  return parsed;
}

function pickPropertyContactFields(
  dto: object,
  extra: readonly string[] = [],
): {
  role?: string;
  shareRatio?: number;
  isResident?: boolean;
  isPrimary?: boolean;
  startedAt?: Date | null;
  endedAt?: Date | null;
  sourceDealId?: string | null;
  memo?: string;
  status?: string;
} {
  const picked: Record<string, unknown> = {};
  const record = dto as Record<string, unknown>;
  for (const field of [...PROPERTY_CONTACT_INPUT_FIELDS, ...extra]) {
    const value = record[field];
    if (value !== undefined) picked[field] = value;
  }
  if (record.startedAt !== undefined) {
    picked.startedAt = parseOptionalDate(record.startedAt as string | Date | null);
  }
  if (record.endedAt !== undefined) {
    picked.endedAt = parseOptionalDate(record.endedAt as string | Date | null);
  }
  return picked;
}

@Injectable()
export class PropertyContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(officeId: string, propertyId: string) {
    const items = await this.prisma.propertyContact.findMany({
      where: { officeId, propertyId },
      include: {
        contact: { include: { phones: contactPhonesIncludeOrdered } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return items.map(withPrimaryContactPhone);
  }

  async findByContact(officeId: string, contactId: string) {
    return this.prisma.propertyContact.findMany({
      where: { officeId, contactId },
      include: { property: { include: { site: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const pc = await this.prisma.propertyContact.findFirst({
      where: { id, officeId },
      include: {
        contact: { include: { phones: contactPhonesIncludeOrdered } },
        property: { include: { site: true } },
      },
    });
    if (!pc) throw new NotFoundException('매물의 관련인을 찾을 수 없습니다.');
    return withPrimaryContactPhone(pc);
  }

  async create(
    officeId: string,
    dto: {
      contactId: string;
      propertyId: string;
      role: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
      startedAt?: string | Date | null;
      endedAt?: string | Date | null;
      sourceDealId?: string | null;
      memo?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPropertyExists(tx, officeId, dto.propertyId);
      await this.assertContactExists(tx, officeId, dto.contactId);
      if (dto.sourceDealId) {
        await this.assertDealExists(tx, officeId, dto.sourceDealId);
      }

      // 같은 사람을 같은 역할로 두 번 붙이지 않는다(등록 폼에서 이미 있는 매물에 소유자를 다시 고른 경우 등)
      const duplicate = await this.findActiveSameRole(tx, officeId, dto.propertyId, dto.contactId, dto.role);
      if (duplicate) return duplicate;

      if (dto.isPrimary) {
        await this.lockPropertyPrimary(tx, officeId, dto.propertyId);
        await this.demoteOtherActivePrimaries(tx, officeId, dto.propertyId);
      }

      const fields = pickPropertyContactFields(dto);
      const created = await tx.propertyContact.create({
        data: {
          officeId,
          propertyId: dto.propertyId,
          contactId: dto.contactId,
          ...fields,
          role: dto.role,
        },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      return withPrimaryContactPhone(created);
    });
  }

  async createWithNewContact(
    officeId: string,
    dto: {
      propertyId: string;
      role: string;
      name: string;
      phone?: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
      startedAt?: string | Date | null;
      endedAt?: string | Date | null;
      sourceDealId?: string | null;
      memo?: string;
    },
  ) {
    const { name, phone } = dto;
    const pcData = { propertyId: dto.propertyId, role: dto.role, ...pickPropertyContactFields(dto) };
    return this.prisma.$transaction(async (tx) => {
      await this.assertPropertyExists(tx, officeId, dto.propertyId);
      if (dto.sourceDealId) {
        await this.assertDealExists(tx, officeId, dto.sourceDealId);
      }

      const canonicalPhone = phone ? normalizePhone(phone) : null;
      // 같은 사무소 내 동일 전화번호 Contact 검색
      let contact = canonicalPhone
        ? await tx.contact.findFirst({
            where: {
              officeId,
              phones: { some: { phone: canonicalPhone } },
            },
          })
        : null;

      if (!contact) {
        contact = await tx.contact.create({
          data: {
            officeId,
            name,
            phones: canonicalPhone
              ? {
                  create: [
                    {
                      phone: canonicalPhone,
                      label: 'mobile',
                      isPrimary: true,
                      office: { connect: { id: officeId } },
                    },
                  ],
                }
              : undefined,
          },
        });
      }

      const duplicate = await this.findActiveSameRole(tx, officeId, pcData.propertyId, contact.id, pcData.role);
      if (duplicate) return duplicate;

      if (pcData.isPrimary) {
        await this.lockPropertyPrimary(tx, officeId, pcData.propertyId);
        await this.demoteOtherActivePrimaries(tx, officeId, pcData.propertyId);
      }

      const created = await tx.propertyContact.create({
        data: { officeId, contactId: contact.id, ...pcData, role: dto.role },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      return withPrimaryContactPhone(created);
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      role?: string;
      shareRatio?: number;
      isResident?: boolean;
      isPrimary?: boolean;
      status?: string;
      startedAt?: string | Date | null;
      endedAt?: string | Date | null;
      sourceDealId?: string | null;
      memo?: string;
    },
  ) {
    if (dto.status !== undefined) {
      this.assertValidStatus(dto.status);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.sourceDealId) {
        await this.assertDealExists(tx, officeId, dto.sourceDealId);
      }
      const existing = await tx.propertyContact.findFirst({
        where: { id, officeId },
        select: {
          id: true,
          propertyId: true,
          isPrimary: true,
          status: true,
        },
      });
      if (!existing) {
        throw new NotFoundException('매물의 관련인을 찾을 수 없습니다.');
      }

      const nextStatus = dto.status ?? existing.status;
      const nextIsPrimary =
        nextStatus === ACTIVE_PROPERTY_CONTACT_STATUS &&
        (dto.isPrimary ?? existing.isPrimary);

      if (nextIsPrimary) {
        await this.lockPropertyPrimary(tx, officeId, existing.propertyId);
        await this.demoteOtherActivePrimaries(
          tx,
          officeId,
          existing.propertyId,
          existing.id,
        );
      }

      const updated = await tx.propertyContact.update({
        where: { id },
        data: {
          // 매물·연락처·사무소는 고치지 않는다(바꾸려면 관계를 지우고 새로 붙인다)
          ...pickPropertyContactFields(dto, ['status']),
          // transferred/archived 관계는 현재 주 연락처로 남을 수 없다.
          isPrimary: nextIsPrimary,
        },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      return withPrimaryContactPhone(updated);
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.delete({ where: { id } });
  }

  private async findActiveSameRole(
    tx: Prisma.TransactionClient,
    officeId: string,
    propertyId: string,
    contactId: string,
    role: string,
  ) {
    const existing = await tx.propertyContact.findFirst({
      where: {
        officeId,
        propertyId,
        contactId,
        role,
        status: ACTIVE_PROPERTY_CONTACT_STATUS,
      },
      include: {
        contact: { include: { phones: contactPhonesIncludeOrdered } },
      },
    });
    return existing ? withPrimaryContactPhone(existing) : null;
  }

  private assertValidStatus(status: string) {
    if (!PROPERTY_CONTACT_STATUSES.has(status)) {
      throw new BadRequestException('알 수 없는 관련인 상태입니다.');
    }
  }

  private async assertPropertyExists(
    tx: Prisma.TransactionClient,
    officeId: string,
    propertyId: string,
  ) {
    const property = await tx.property.findFirst({
      where: { id: propertyId, officeId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException('매물을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
  }

  private async assertContactExists(
    tx: Prisma.TransactionClient,
    officeId: string,
    contactId: string,
  ) {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, officeId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');
  }

  private async assertDealExists(
    tx: Prisma.TransactionClient,
    officeId: string,
    dealId: string,
  ) {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, officeId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');
  }

  private async lockPropertyPrimary(
    tx: Prisma.TransactionClient,
    officeId: string,
    propertyId: string,
  ) {
    const lockKey = `property-contact-primary:${officeId}:${propertyId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
  }

  private async demoteOtherActivePrimaries(
    tx: Prisma.TransactionClient,
    officeId: string,
    propertyId: string,
    exceptId?: string,
  ) {
    const existingPrimaries = await tx.propertyContact.findMany({
      where: {
        officeId,
        propertyId,
        status: ACTIVE_PROPERTY_CONTACT_STATUS,
        isPrimary: true,
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { id: true },
    });

    // 개별 update를 사용해 기존 대표의 변경도 ActivityLog에 남긴다.
    for (const primary of existingPrimaries) {
      await tx.propertyContact.update({
        where: { id: primary.id },
        data: { isPrimary: false },
      });
    }
  }
}
