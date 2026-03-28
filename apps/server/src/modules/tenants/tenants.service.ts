import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(officeId: string, propertyId: string) {
    return this.prisma.tenant.findMany({
      where: { officeId, propertyId },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, officeId },
      include: {
        contact: true,
        property: { include: { site: true, unit: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(
    officeId: string,
    dto: {
      propertyId: string;
      contactId: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
  ) {
    const { contractStart, contractEnd, moveOutDate, ...rest } = dto;
    return this.prisma.tenant.create({
      data: {
        officeId,
        ...rest,
        contractStart: contractStart ? new Date(contractStart) : undefined,
        contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
      },
      include: { contact: true },
    });
  }

  async createWithNewContact(
    officeId: string,
    dto: {
      propertyId: string;
      name: string;
      phone?: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
  ) {
    const { name, phone, contractStart, contractEnd, moveOutDate, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      let contact = phone
        ? await tx.contact.findFirst({ where: { officeId, phone } })
        : null;

      if (!contact) {
        contact = await tx.contact.create({
          data: { officeId, name, phone },
        });
      }

      return tx.tenant.create({
        data: {
          officeId,
          contactId: contact.id,
          ...rest,
          contractStart: contractStart ? new Date(contractStart) : undefined,
          contractEnd: contractEnd ? new Date(contractEnd) : undefined,
          moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
        },
        include: { contact: true },
      });
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      status?: string;
      memo?: string;
    },
  ) {
    await this.findOne(id, officeId);
    const { contractStart, contractEnd, moveOutDate, ...rest } = dto;
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...rest,
        contractStart: contractStart ? new Date(contractStart) : undefined,
        contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
      },
      include: { contact: true },
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.tenant.delete({ where: { id } });
  }

  async findExpiringContracts(officeId: string, withinDays: number = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    return this.prisma.tenant.findMany({
      where: {
        officeId,
        status: 'residing',
        contractEnd: { lte: cutoff },
      },
      include: {
        contact: true,
        property: { include: { site: true } },
      },
      orderBy: { contractEnd: 'asc' },
    });
  }
}
