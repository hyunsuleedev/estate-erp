import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PropertyLeaseTenantRole } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';

const VALID_TENANT_ROLES = new Set<string>([
  'tenant',
  'co_tenant',
  'resident',
]);

export const propertyLeaseInclude = {
  tenants: {
    include: {
      contact: { include: { phones: contactPhonesIncludeOrdered } },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

export function presentPropertyLease<
  T extends {
    tenants?: Array<{
      id: string;
      contactId: string;
      isPrimary: boolean;
      contact?: {
        id: string;
        kind?: string;
        name: string;
        phones?: Array<{ phone: string; isPrimary: boolean }>;
      } | null;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  },
>(lease: T) {
  const presentedTenants = (lease.tenants ?? []).map((member) => ({
    ...member,
    contact: member.contact ? withPrimaryPhone(member.contact) : member.contact,
  }));
  const primary =
    presentedTenants.find((member) => member.isPrimary) ?? presentedTenants[0] ?? null;
  return {
    ...lease,
    tenants: presentedTenants,
    contactId: primary?.contactId ?? '',
    contact: primary?.contact ?? undefined,
  };
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProperty(officeId: string, propertyId: string) {
    const leases = await this.prisma.propertyLease.findMany({
      where: { officeId, propertyId },
      include: propertyLeaseInclude,
      orderBy: { createdAt: 'desc' },
    });
    return leases.map(presentPropertyLease);
  }

  async findOne(id: string, officeId: string) {
    const lease = await this.prisma.propertyLease.findFirst({
      where: { id, officeId },
      include: {
        ...propertyLeaseInclude,
        property: { include: { site: true, unit: true } },
      },
    });
    if (!lease) throw new NotFoundException('임대차 기록을 찾을 수 없습니다.');
    return presentPropertyLease(lease);
  }

  async create(
    officeId: string,
    dto: {
      propertyId: string;
      contactId: string;
      role?: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
  ) {
    const role = this.resolveRole(dto.role);
    await this.assertPropertyExists(officeId, dto.propertyId);
    await this.assertContactExists(officeId, dto.contactId);

    const { contractStart, contractEnd, moveOutDate, propertyId, contactId, role: _role, ...rest } = dto;
    const lease = await this.prisma.propertyLease.create({
      data: {
        officeId,
        propertyId,
        ...rest,
        contractStart: contractStart ? new Date(contractStart) : undefined,
        contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
        tenants: {
          create: {
            contactId,
            role,
            isPrimary: true,
          },
        },
      },
      include: propertyLeaseInclude,
    });
    return presentPropertyLease(lease);
  }

  async createWithNewContact(
    officeId: string,
    dto: {
      propertyId: string;
      name: string;
      phone?: string;
      role?: string;
      deposit?: number;
      monthlyRent?: number;
      contractStart?: string;
      contractEnd?: string;
      moveOutDate?: string;
      memo?: string;
    },
  ) {
    const role = this.resolveRole(dto.role);
    await this.assertPropertyExists(officeId, dto.propertyId);

    const { name, phone, contractStart, contractEnd, moveOutDate, propertyId, role: _role, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const canonicalPhone = phone ? normalizePhone(phone) : null;
      let contact = canonicalPhone
        ? await tx.contact.findFirst({
            where: { officeId, phones: { some: { phone: canonicalPhone } } },
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

      const lease = await tx.propertyLease.create({
        data: {
          officeId,
          propertyId,
          ...rest,
          contractStart: contractStart ? new Date(contractStart) : undefined,
          contractEnd: contractEnd ? new Date(contractEnd) : undefined,
          moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
          tenants: {
            create: {
              contactId: contact.id,
              role,
              isPrimary: true,
            },
          },
        },
        include: propertyLeaseInclude,
      });
      return presentPropertyLease(lease);
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
    const lease = await this.prisma.propertyLease.update({
      where: { id },
      data: {
        ...rest,
        contractStart: contractStart ? new Date(contractStart) : undefined,
        contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        moveOutDate: moveOutDate ? new Date(moveOutDate) : undefined,
      },
      include: propertyLeaseInclude,
    });
    return presentPropertyLease(lease);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.propertyLease.delete({ where: { id } });
  }

  async addMember(
    leaseId: string,
    officeId: string,
    dto: {
      contactId: string;
      role?: string;
      isPrimary?: boolean;
      memo?: string;
    },
  ) {
    const role = this.resolveRole(dto.role);
    await this.findOne(leaseId, officeId);
    await this.assertContactExists(officeId, dto.contactId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.propertyLeaseTenant.findFirst({
        where: { leaseId, contactId: dto.contactId, officeId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('이미 이 임대차에 등록된 임차인입니다.');
      }

      const memberCount = await tx.propertyLeaseTenant.count({
        where: { leaseId, officeId },
      });
      const isPrimary = dto.isPrimary ?? memberCount === 0;
      if (isPrimary) {
        await tx.propertyLeaseTenant.updateMany({
          where: { leaseId, officeId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await tx.propertyLeaseTenant.create({
        data: {
          officeId,
          leaseId,
          contactId: dto.contactId,
          role,
          isPrimary,
          memo: dto.memo ?? null,
        },
      });

      const updated = await tx.propertyLease.findFirstOrThrow({
        where: { id: leaseId, officeId },
        include: {
          ...propertyLeaseInclude,
          property: { include: { site: true, unit: true } },
        },
      });
      return presentPropertyLease(updated);
    });
  }

  async updateMember(
    leaseId: string,
    contactId: string,
    officeId: string,
    dto: {
      role?: string;
      isPrimary?: boolean;
      memo?: string | null;
    },
  ) {
    if (dto.role !== undefined) {
      this.resolveRole(dto.role);
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.propertyLeaseTenant.findFirst({
        where: {
          leaseId,
          officeId,
          OR: [{ contactId }, { id: contactId }],
        },
      });
      if (!member) {
        throw new NotFoundException('임대차 구성원을 찾을 수 없습니다.');
      }

      if (dto.isPrimary) {
        await tx.propertyLeaseTenant.updateMany({
          where: { leaseId, officeId, id: { not: member.id }, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await tx.propertyLeaseTenant.update({
        where: { id: member.id },
        data: {
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
          ...(dto.memo !== undefined && { memo: dto.memo }),
        },
      });

      const updated = await tx.propertyLease.findFirstOrThrow({
        where: { id: leaseId, officeId },
        include: {
          ...propertyLeaseInclude,
          property: { include: { site: true, unit: true } },
        },
      });
      return presentPropertyLease(updated);
    });
  }

  async removeMember(leaseId: string, contactId: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.propertyLeaseTenant.findFirst({
        where: {
          leaseId,
          officeId,
          OR: [{ contactId }, { id: contactId }],
        },
      });
      if (!member) {
        throw new NotFoundException('임대차 구성원을 찾을 수 없습니다.');
      }

      const count = await tx.propertyLeaseTenant.count({
        where: { leaseId, officeId },
      });
      if (count <= 1) {
        throw new BadRequestException(
          '임대차에는 최소 1명의 임차인이 남아 있어야 합니다. 임대차를 지우려면 임대차 삭제를 사용하세요.',
        );
      }

      await tx.propertyLeaseTenant.delete({ where: { id: member.id } });

      if (member.isPrimary) {
        const nextPrimary = await tx.propertyLeaseTenant.findFirst({
          where: { leaseId, officeId },
          orderBy: { createdAt: 'asc' },
        });
        if (nextPrimary) {
          await tx.propertyLeaseTenant.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }

      const updated = await tx.propertyLease.findFirstOrThrow({
        where: { id: leaseId, officeId },
        include: {
          ...propertyLeaseInclude,
          property: { include: { site: true, unit: true } },
        },
      });
      return presentPropertyLease(updated);
    });
  }

  async findExpiringContracts(officeId: string, withinDays: number = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    const leases = await this.prisma.propertyLease.findMany({
      where: {
        officeId,
        status: 'residing',
        contractEnd: { lte: cutoff },
      },
      include: {
        ...propertyLeaseInclude,
        property: { include: { site: true } },
      },
      orderBy: { contractEnd: 'asc' },
    });
    return leases.map(presentPropertyLease);
  }

  private resolveRole(role?: string): string {
    if (!role) return PropertyLeaseTenantRole.TENANT;
    if (!VALID_TENANT_ROLES.has(role)) {
      throw new BadRequestException('올바른 임차인 역할이 아닙니다.');
    }
    return role;
  }

  private async assertPropertyExists(officeId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, officeId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException('매물을 찾을 수 없습니다.');
    }
  }

  private async assertContactExists(officeId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, officeId },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException('연락처를 찾을 수 없습니다.');
    }
  }
}
