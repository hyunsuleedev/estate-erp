import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConsultationSearchQuery {
  contactId?: string;
  propertyId?: string;
  matchId?: string;
  buyerReqId?: string;
  type?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly defaultInclude = {
    contact: { select: { id: true, name: true, phone: true } },
    property: { select: { id: true, transactionType: true, price: true, site: { select: { name: true } } } },
    match: { select: { id: true, stage: true } },
    buyerRequirement: { select: { id: true, status: true, transactionType: true } },
    createdBy: { select: { id: true, name: true } },
  };

  async findAll(officeId: string, query: ConsultationSearchQuery = {}) {
    const where: Prisma.ConsultationWhereInput = { officeId };

    if (query.contactId) where.contactId = query.contactId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.matchId) where.matchId = query.matchId;
    if (query.buyerReqId) where.buyerReqId = query.buyerReqId;
    if (query.type) where.type = query.type;
    if (query.createdById) where.createdById = query.createdById;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        include: this.defaultInclude,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id, officeId },
      include: this.defaultInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return consultation;
  }

  async create(
    officeId: string,
    userId: string,
    dto: {
      contactId: string;
      type: string;
      content: string;
      propertyId?: string;
      matchId?: string;
      buyerReqId?: string;
    },
  ) {
    const { propertyId, matchId, buyerReqId, ...rest } = dto;
    return this.prisma.consultation.create({
      data: {
        officeId,
        createdById: userId,
        ...rest,
        propertyId: propertyId || undefined,
        matchId: matchId || undefined,
        buyerReqId: buyerReqId || undefined,
      },
      include: this.defaultInclude,
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      type?: string;
      content?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.update({
      where: { id },
      data: dto,
      include: this.defaultInclude,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.consultation.delete({ where: { id } });
  }

  async getRecent(officeId: string, limit = 10) {
    return this.prisma.consultation.findMany({
      where: { officeId },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
