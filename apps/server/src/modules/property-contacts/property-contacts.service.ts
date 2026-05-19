import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryContactPhone,
} from '../contacts/contact-phone.utils';

@Injectable()
export class PropertyContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(officeId: string, propertyId: string) {
    const items = await this.prisma.propertyContact.findMany({
      where: { officeId, propertyId },
      include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
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
      include: { contact: { include: { phones: contactPhonesIncludeOrdered } }, property: { include: { site: true } } },
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
    return this.prisma.propertyContact.create({
      data: { officeId, ...dto },
      include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
    }).then(withPrimaryContactPhone);
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
      const normalizedPhone = phone ? normalizePhone(phone) : null;
      // 같은 사무소 내 동일 전화번호 Contact 검색
      let contact = normalizedPhone
        ? await tx.contact.findFirst({
            where: { officeId, phones: { some: { normalizedPhone, isActive: true } } },
          })
        : null;

      if (!contact) {
        contact = await tx.contact.create({
          data: {
            officeId,
            name,
            phones: normalizedPhone
              ? {
                  create: [{
                    phone: phone as string,
                    normalizedPhone,
                    label: 'mobile',
                    isPrimary: true,
                    isActive: true,
                    office: { connect: { id: officeId } },
                  }],
                }
              : undefined,
          },
        });
      }

      return tx.propertyContact.create({
        data: { officeId, contactId: contact.id, ...pcData },
        include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
      }).then(withPrimaryContactPhone);
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
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.update({
      where: { id },
      data: dto,
      include: { contact: { include: { phones: contactPhonesIncludeOrdered } } },
    }).then(withPrimaryContactPhone);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.delete({ where: { id } });
  }
}
