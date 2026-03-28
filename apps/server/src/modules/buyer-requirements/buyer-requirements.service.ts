import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface BuyerRequirementSearchQuery {
  status?: string;
  urgency?: string;
  transactionType?: string;
  contactId?: string;
  assignedToId?: string;
  nextContactBefore?: string;
  sortBy?: 'createdAt' | 'nextContactDate' | 'urgency';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class BuyerRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: BuyerRequirementSearchQuery = {}) {
    const where: Prisma.BuyerRequirementWhereInput = { officeId };

    if (query.status) where.status = query.status;
    if (query.urgency) where.urgency = query.urgency;
    if (query.transactionType) where.transactionType = query.transactionType;
    if (query.contactId) where.contactId = query.contactId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.nextContactBefore) {
      where.nextContactDate = { lte: new Date(query.nextContactBefore) };
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.buyerRequirement.findMany({
        where,
        include: {
          contact: true,
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { matches: true, consultations: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.buyerRequirement.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, officeId: string) {
    const req = await this.prisma.buyerRequirement.findFirst({
      where: { id, officeId },
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true } },
        matches: { include: { property: { include: { site: true } } } },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!req) throw new NotFoundException('BuyerRequirement not found');
    return req;
  }

  async create(
    officeId: string,
    dto: {
      contactId: string;
      transactionType?: string;
      siteTypes?: string[];
      regions?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      mustConditions?: string[];
      preferConditions?: string[];
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      nextContactDate?: string;
      memo?: string;
    },
  ) {
    const { moveInDate, nextContactDate, ...rest } = dto;
    return this.prisma.buyerRequirement.create({
      data: {
        officeId,
        ...rest,
        moveInDate: moveInDate ? new Date(moveInDate) : undefined,
        nextContactDate: nextContactDate ? new Date(nextContactDate) : undefined,
      },
      include: { contact: true },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      transactionType?: string;
      siteTypes?: string[];
      regions?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      mustConditions?: string[];
      preferConditions?: string[];
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      lastContactDate?: string;
      nextContactDate?: string;
      memo?: string;
    },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.buyerRequirement.update({
      where: { id },
      data: {
        ...dto,
        moveInDate: dto.moveInDate ? new Date(dto.moveInDate) : undefined,
        lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : undefined,
        nextContactDate: dto.nextContactDate ? new Date(dto.nextContactDate) : undefined,
      },
      include: { contact: true },
    });
  }

  async updateStatus(id: string, officeId: string, status: string) {
    await this.findOne(id, officeId);
    return this.prisma.buyerRequirement.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.buyerRequirement.delete({ where: { id } });
  }

  async findDueContacts(officeId: string) {
    const now = new Date();
    return this.prisma.buyerRequirement.findMany({
      where: {
        officeId,
        status: 'active',
        nextContactDate: { lte: now },
      },
      include: { contact: true, assignedTo: { select: { id: true, name: true } } },
      orderBy: { nextContactDate: 'asc' },
    });
  }
}
