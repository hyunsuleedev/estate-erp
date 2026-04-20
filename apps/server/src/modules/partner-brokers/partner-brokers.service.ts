import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PartnerBrokersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: string, includeInactive = false) {
    return this.prisma.partnerBroker.findMany({
      where: { officeId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ dealCount: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const broker = await this.prisma.partnerBroker.findFirst({
      where: { id, officeId },
    });
    if (!broker) throw new NotFoundException('PartnerBroker not found');
    return broker;
  }

  async create(
    officeId: string,
    dto: {
      name: string;
      phone?: string;
      ceoName?: string;
      licenseNo?: string;
      email?: string;
      address?: string;
      memo?: string;
      linkedOfficeId?: string;
    },
  ) {
    return this.prisma.partnerBroker.create({
      data: {
        officeId,
        name: dto.name,
        phone: dto.phone,
        ceoName: dto.ceoName,
        licenseNo: dto.licenseNo,
        email: dto.email,
        address: dto.address,
        memo: dto.memo,
        linkedOfficeId: dto.linkedOfficeId,
      },
    });
  }

  async update(
    id: string,
    officeId: string,
    dto: Partial<{
      name: string;
      phone: string | null;
      ceoName: string | null;
      licenseNo: string | null;
      email: string | null;
      address: string | null;
      memo: string | null;
      isActive: boolean;
    }>,
  ) {
    await this.findOne(id, officeId);
    return this.prisma.partnerBroker.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    // 실제 삭제 대신 소프트 비활성화 (Deal FK 있을 수 있음)
    return this.prisma.partnerBroker.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
