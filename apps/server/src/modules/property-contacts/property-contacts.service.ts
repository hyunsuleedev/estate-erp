import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PropertyContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(officeId: string, propertyId: string) {
    return this.prisma.propertyContact.findMany({
      where: { officeId, propertyId },
      include: { contact: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
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
      include: { contact: true, property: { include: { site: true } } },
    });
    if (!pc) throw new NotFoundException('PropertyContact not found');
    return pc;
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
      include: { contact: true },
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
      // 같은 사무소 내 동일 전화번호 Contact 검색
      let contact = phone
        ? await tx.contact.findFirst({ where: { officeId, phone } })
        : null;

      if (!contact) {
        contact = await tx.contact.create({
          data: { officeId, name, phone },
        });
      }

      return tx.propertyContact.create({
        data: { officeId, contactId: contact.id, ...pcData },
        include: { contact: true },
      });
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
      include: { contact: true },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyContact.delete({ where: { id } });
  }
}
