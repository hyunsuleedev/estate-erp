import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async createForCurrentUser(
    userId: string,
    dto: {
      name: string;
      licenseNo?: string | null;
      ceoName?: string | null;
      phone?: string | null;
      address?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, officeId: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.officeId) {
      throw new ConflictException('이미 사무소에 소속된 사용자입니다.');
    }
    if (user.role !== 'owner') {
      throw new ForbiddenException('사무소 생성 권한이 없습니다.');
    }

    const office = await this.prisma.$transaction(async (tx) => {
      const created = await tx.office.create({
        data: {
          name: dto.name,
          licenseNo: dto.licenseNo ?? null,
          ceoName: dto.ceoName ?? null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
        },
        select: { id: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: { officeId: created.id, role: 'owner' },
      });

      return tx.office.findUnique({
        where: { id: created.id },
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
            },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return this.toOfficeProfile(office);
  }

  async getMe(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            licenseType: true,
            isActive: true,
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return this.toOfficeProfile(office);
  }

  async updateMe(
    officeId: string,
    dto: {
      name?: string;
      licenseNo?: string | null;
      ceoName?: string | null;
      phone?: string | null;
      address?: string | null;
      naverVerificationId?: string | null;
    },
  ) {
    await this.getMe(officeId);

    const office = await this.prisma.office.update({
      where: { id: officeId },
      data: dto,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            licenseType: true,
            isActive: true,
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return this.toOfficeProfile(office);
  }

  async updateCommissionConfig(
    officeId: string,
    dto: {
      distributionType?: string;
      defaultAgentRate?: number;
      listingAgentRate?: number;
      buyingAgentRate?: number;
      dualAgentRate?: number;
      managerRate?: number;
      closerBonus?: number;
    },
  ) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        commissionConfig: true,
      },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    const nextConfig = {
      ...(typeof office.commissionConfig === 'object' &&
      office.commissionConfig !== null
        ? office.commissionConfig
        : {}),
      ...dto,
    };

    const updated = await this.prisma.office.update({
      where: { id: officeId },
      data: {
        commissionConfig: nextConfig,
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            licenseType: true,
            isActive: true,
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return this.toOfficeProfile(updated);
  }

  private toOfficeProfile(office: {
    id: string;
    name: string;
    licenseNo: string | null;
    ceoName: string | null;
    phone: string | null;
    address: string | null;
    naverVerificationId: string | null;
    subscription: string;
    maxUsers: number;
    isActive: boolean;
    commissionConfig: unknown;
    createdAt: Date;
    updatedAt: Date;
    users: Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      role: string;
      licenseType?: string | null;
      isActive: boolean;
    }>;
  }) {
    const owner = office.users.find((user) => user.role === 'owner') ?? null;
    const activeUsers = office.users.filter((user) => user.isActive);

    return {
      id: office.id,
      name: office.name,
      licenseNo: office.licenseNo,
      ceoName: office.ceoName,
      phone: office.phone,
      address: office.address,
      naverVerificationId: office.naverVerificationId,
      subscription: office.subscription,
      maxUsers: office.maxUsers,
      isActive: office.isActive,
      commissionConfig: office.commissionConfig,
      createdAt: office.createdAt,
      updatedAt: office.updatedAt,
      counts: {
        totalUsers: office.users.length,
        activeUsers: activeUsers.length,
        managers: office.users.filter((user) => user.role === 'manager').length,
      },
      owner,
      users: office.users,
    };
  }
}
