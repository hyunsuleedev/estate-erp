import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  contactPhonesSelectOrdered,
  normalizePhone,
  withPrimaryPhone,
  withPrimaryContactPhone,
} from './contact-phone.utils';

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

export interface ContactPhoneInput {
  phone: string;
  label?: string;
  isPrimary?: boolean;
  isActive?: boolean;
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

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: ContactSearchQuery = {}) {
    const where: Prisma.ContactWhereInput = { officeId };

    if (query.search) {
      const normalizedSearch = normalizePhone(query.search);
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phones: { some: { normalizedPhone: { contains: normalizedSearch } } } },
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
          phones: this.contactPhonesInclude(),
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
      items: items.map(({ consultations, ...contact }) => ({
        ...withPrimaryPhone(contact),
        latestConsultation: this.formatLatestConsultation(consultations[0]),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, officeId },
      include: {
        phones: this.contactPhonesInclude(),
        propertyContacts: { include: { property: { include: { site: true } } } },
        buyerRequirements: { where: { status: 'active' } },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10, include: { createdBy: { select: { id: true, name: true } } } },
        relationsAsMain: { include: { relatedContact: { include: { phones: this.contactPhonesInclude() } } } },
        relationsAsRelated: { include: { contact: { include: { phones: this.contactPhonesInclude() } } } },
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return {
      ...withPrimaryPhone(contact),
      relationsAsMain: contact.relationsAsMain.map((relation) => ({
        ...relation,
        relatedContact: withPrimaryPhone(relation.relatedContact),
      })),
      relationsAsRelated: contact.relationsAsRelated.map((relation) => ({
        ...relation,
        contact: withPrimaryPhone(relation.contact),
      })),
    };
  }

  async create(
    officeId: string,
    dto: ContactWriteInput & { name: string },
  ) {
    const { phones } = this.prepareContactPhones(dto);
    return this.prisma.contact.create({
      data: {
        officeId,
        name: dto.name,
        email: dto.email ?? null,
        tags: dto.tags ?? [],
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
      include: { phones: this.contactPhonesInclude() },
    }).then(withPrimaryPhone);
  }

  async update(
    id: string,
    officeId: string,
    dto: ContactWriteInput,
  ) {
    await this.findOne(id, officeId);
    const shouldReplacePhones = dto.phones !== undefined || dto.phone !== undefined;
    const { phones } = this.prepareContactPhones(dto);

    const data: Prisma.ContactUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
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

    return this.prisma.contact.update({
      where: { id },
      data,
      include: { phones: this.contactPhonesInclude() },
    }).then(withPrimaryPhone);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.contact.delete({ where: { id } });
  }

  async getPhoneIndex(officeId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        phones: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        phones: this.contactPhonesSelect(),
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
      phone: withPrimaryPhone(c).phone,
      phones: c.phones,
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

  async findByPhone(officeId: string, phone?: string) {
    if (!phone) return [];
    const normalized = normalizePhone(phone);
    if (normalized.length < 4) return [];
    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        phones: { some: { normalizedPhone: normalized, isActive: true } },
      },
      select: {
        id: true,
        name: true,
        phones: this.contactPhonesSelect(),
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
      phone: withPrimaryPhone(c).phone,
      phones: c.phones,
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
        listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
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
        const rawPhone = item.phone.trim();
        const normalizedPhone = normalizePhone(rawPhone);
        if (!rawPhone || !normalizedPhone || seen.has(normalizedPhone)) return null;
        seen.add(normalizedPhone);
        return {
          phone: rawPhone,
          normalizedPhone,
          label: item.label?.trim() || 'mobile',
          isPrimary: item.isPrimary ?? false,
          isActive: item.isActive ?? true,
          memo: item.memo?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (phones.length > 0 && !phones.some((phone) => phone.isPrimary)) {
      const firstActive = phones.find((phone) => phone.isActive) ?? phones[0];
      firstActive.isPrimary = true;
    }

    return { phones };
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
