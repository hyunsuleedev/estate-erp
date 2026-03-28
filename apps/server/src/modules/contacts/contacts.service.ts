import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ContactSearchQuery {
  search?: string;
  tags?: string[];
  hasPropertyContact?: boolean;
  hasBuyerReq?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: ContactSearchQuery = {}) {
    const where: Prisma.ContactWhereInput = { officeId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { phone2: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = { hasEvery: query.tags };
    }

    if (query.hasPropertyContact) {
      where.propertyContacts = { some: {} };
    }

    if (query.hasBuyerReq) {
      where.buyerRequirements = { some: {} };
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
          _count: { select: { propertyContacts: true, buyerRequirements: true, consultations: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, officeId },
      include: {
        propertyContacts: { include: { property: { include: { site: true } } } },
        buyerRequirements: { where: { status: 'active' } },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10, include: { createdBy: { select: { id: true, name: true } } } },
        relationsAsMain: { include: { relatedContact: true } },
        relationsAsRelated: { include: { contact: true } },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(
    officeId: string,
    dto: {
      name: string;
      phone?: string;
      phone2?: string;
      email?: string;
      tags?: string[];
      memo?: string;
    },
  ) {
    return this.prisma.contact.create({ data: { officeId, ...dto } });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      name?: string;
      phone?: string;
      phone2?: string;
      email?: string;
      tags?: string[];
      memo?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.contact.update({ where: { id }, data: dto });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.contact.delete({ where: { id } });
  }

  async findByPhone(officeId: string, phone: string) {
    return this.prisma.contact.findMany({
      where: {
        officeId,
        OR: [
          { phone: { contains: phone } },
          { phone2: { contains: phone } },
        ],
      },
      include: {
        propertyContacts: { include: { property: { include: { site: true } } } },
        buyerRequirements: { where: { status: 'active' } },
        relationsAsMain: { include: { relatedContact: true } },
      },
    });
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
    return this.prisma.buyerRequirement.findMany({
      where: { contactId: id, officeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConsultations(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.findMany({
      where: { contactId: id, officeId },
      include: {
        property: { select: { id: true, transactionType: true, price: true, site: { select: { name: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
