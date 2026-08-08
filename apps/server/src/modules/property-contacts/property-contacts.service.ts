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
import { mergePropertyListingCaseParticipants } from '../brokerage-cases/brokerage-case.resolver';

const ACTIVE_PROPERTY_CONTACT_STATUS = 'active';
const PROPERTY_CONTACT_STATUSES = new Set([
  ACTIVE_PROPERTY_CONTACT_STATUS,
  'transferred',
  'archived',
]);

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
    if (!pc) throw new NotFoundException('PropertyContact not found');
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
      memo?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPropertyExists(tx, officeId, dto.propertyId);
      await this.assertContactExists(tx, officeId, dto.contactId);

      if (dto.isPrimary) {
        await this.lockPropertyPrimary(tx, officeId, dto.propertyId);
        await this.demoteOtherActivePrimaries(tx, officeId, dto.propertyId);
      }

      const created = await tx.propertyContact.create({
        data: { officeId, ...dto },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      await mergePropertyListingCaseParticipants(
        tx,
        officeId,
        dto.propertyId,
      );
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
      memo?: string;
    },
  ) {
    const { name, phone, ...pcData } = dto;
    return this.prisma.$transaction(async (tx) => {
      await this.assertPropertyExists(tx, officeId, dto.propertyId);

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

      if (pcData.isPrimary) {
        await this.lockPropertyPrimary(tx, officeId, pcData.propertyId);
        await this.demoteOtherActivePrimaries(tx, officeId, pcData.propertyId);
      }

      const created = await tx.propertyContact.create({
        data: { officeId, contactId: contact.id, ...pcData },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      await mergePropertyListingCaseParticipants(
        tx,
        officeId,
        pcData.propertyId,
      );
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
      memo?: string;
    },
  ) {
    if (dto.status !== undefined) {
      this.assertValidStatus(dto.status);
    }

    return this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException('PropertyContact not found');
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
          ...dto,
          // transferred/archived 관계는 현재 주 연락처로 남을 수 없다.
          isPrimary: nextIsPrimary,
        },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
      });
      await mergePropertyListingCaseParticipants(
        tx,
        officeId,
        existing.propertyId,
      );
      return withPrimaryContactPhone(updated);
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.delete({ where: { id } });
  }

  private assertValidStatus(status: string) {
    if (!PROPERTY_CONTACT_STATUSES.has(status)) {
      throw new BadRequestException('Invalid PropertyContact status');
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
    if (!property) throw new NotFoundException('Property not found');
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
    if (!contact) throw new NotFoundException('Contact not found');
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
