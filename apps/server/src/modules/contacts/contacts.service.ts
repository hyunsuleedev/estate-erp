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
    const data = {
      officeId,
      ...dto,
      phone: dto.phone ? this.normalizePhone(dto.phone) : undefined,
      phone2: dto.phone2 ? this.normalizePhone(dto.phone2) : undefined,
    };
    return this.prisma.contact.create({ data });
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
    const data = {
      ...dto,
      ...(dto.phone !== undefined && { phone: dto.phone ? this.normalizePhone(dto.phone) : null }),
      ...(dto.phone2 !== undefined && { phone2: dto.phone2 ? this.normalizePhone(dto.phone2) : null }),
    };
    return this.prisma.contact.update({ where: { id }, data });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.contact.delete({ where: { id } });
  }

  async getPhoneIndex(officeId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        OR: [
          { phone: { not: null } },
          { phone2: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        phone2: true,
        tags: true,
        propertyContacts: {
          where: { role: 'owner', status: 'active' },
          take: 3,
          select: {
            role: true,
            property: {
              select: {
                site: { select: { name: true } },
                unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
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
      phone: c.phone,
      phone2: c.phone2,
      tags: c.tags,
      ownedProperties: c.propertyContacts.map((pc) => {
        const site = pc.property.site;
        const unit = pc.property.unit;
        const dong = unit?.dong;
        const unitLabel = unit
          ? `${dong && !dong.isPlaceholder ? dong.name + ' ' : ''}${unit.name}호`
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

  async findByPhone(officeId: string, phone: string) {
    const normalized = this.normalizePhone(phone);
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        OR: [
          { phone: { contains: normalized } },
          { phone2: { contains: normalized } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        phone2: true,
        tags: true,
        propertyContacts: {
          where: { role: 'owner', status: 'active' },
          take: 3,
          select: {
            role: true,
            property: {
              select: {
                site: { select: { name: true } },
                unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
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
      phone: c.phone,
      phone2: c.phone2,
      tags: c.tags,
      ownedProperties: c.propertyContacts.map((pc) => {
        const site = pc.property.site;
        const unit = pc.property.unit;
        const dong = unit?.dong;
        const unitLabel = unit
          ? `${dong && !dong.isPlaceholder ? dong.name + ' ' : ''}${unit.name}호`
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
        property: { select: { id: true, memo: true, site: { select: { name: true } } } },
        listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 전화번호 정규화 — 하이픈/공백/괄호 제거, +82 → 0 변환 */
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+82')) cleaned = '0' + cleaned.substring(3);
    if (cleaned.startsWith('82') && cleaned.length > 10) cleaned = '0' + cleaned.substring(2);
    return cleaned;
  }
}
