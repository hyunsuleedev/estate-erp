import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../contacts/contact-phone.utils';
import type {
  CreatePartnerBrokerContactDto,
  CreatePartnerBrokerDto,
  UpdatePartnerBrokerContactDto,
  UpdatePartnerBrokerDto,
} from './partner-brokers.dto';

const PARTNER_BROKER_INCLUDE = {
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

@Injectable()
export class PartnerBrokersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: string, includeInactive = false) {
    return this.prisma.partnerBroker.findMany({
      where: { officeId, ...(includeInactive ? {} : { isActive: true }) },
      include: PARTNER_BROKER_INCLUDE,
      orderBy: [{ dealCount: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const broker = await this.prisma.partnerBroker.findFirst({
      where: { id, officeId },
      include: PARTNER_BROKER_INCLUDE,
    });
    if (!broker) throw new NotFoundException('파트너 사무소를 찾을 수 없습니다.');
    return broker;
  }

  async create(officeId: string, dto: CreatePartnerBrokerDto) {
    if (dto.linkedOfficeId) {
      const linked = await this.prisma.office.findUnique({
        where: { id: dto.linkedOfficeId },
        select: { id: true },
      });
      if (!linked) throw new BadRequestException('연결할 사무소를 찾을 수 없습니다.');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.partnerBroker.create({
        data: {
          officeId,
          name: dto.name,
          phone: dto.phone ?? null,
          ceoName: dto.ceoName ?? null,
          ceoPhone: dto.ceoPhone ?? null,
          licenseNo: dto.licenseNo ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          memo: dto.memo ?? null,
          linkedOfficeId: dto.linkedOfficeId ?? null,
        },
      });
      const initialPhone = dto.ceoPhone || dto.phone || '';
      if (dto.ceoName && initialPhone) {
        const normalized = normalizePhone(initialPhone);
        await tx.partnerBrokerContact.create({
          data: {
            officeId,
            partnerBrokerId: created.id,
            name: dto.ceoName,
            phone: initialPhone,
            normalizedPhone: normalized || initialPhone,
            role: '대표',
            isPrimary: true,
          },
        });
      }
      return tx.partnerBroker.findFirstOrThrow({
        where: { id: created.id, officeId },
        include: PARTNER_BROKER_INCLUDE,
      });
    });
  }

  /**
   * 고칠 수 있는 칸만 옮겨 담는다. 요청에 사무소·거래 수·만든 때 같은 다른 칸이 와도 저장하지 않는다
   * (컨트롤러의 DTO 검증이 먼저 막지만, 서비스도 받은 값을 그대로 넘기지 않는다).
   */
  async update(id: string, officeId: string, dto: UpdatePartnerBrokerDto) {
    await this.findOne(id, officeId);
    return this.prisma.partnerBroker.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        ceoName: dto.ceoName,
        ceoPhone: dto.ceoPhone,
        licenseNo: dto.licenseNo,
        email: dto.email,
        address: dto.address,
        memo: dto.memo,
        isActive: dto.isActive,
      },
      include: PARTNER_BROKER_INCLUDE,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    // 실제 삭제 대신 소프트 비활성화 (Deal FK 있을 수 있음)
    return this.prisma.partnerBroker.update({
      where: { id },
      data: { isActive: false },
      include: PARTNER_BROKER_INCLUDE,
    });
  }

  async addContact(
    partnerBrokerId: string,
    officeId: string,
    dto: CreatePartnerBrokerContactDto,
  ) {
    await this.findOne(partnerBrokerId, officeId);
    const normalizedPhone = normalizePhone(dto.phone) || dto.phone;
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.partnerBrokerContact.count({
        where: { partnerBrokerId, officeId },
      });
      const isPrimary = dto.isPrimary ?? existingCount === 0;
      if (isPrimary) {
        await tx.partnerBrokerContact.updateMany({
          where: { partnerBrokerId, officeId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.partnerBrokerContact.create({
        data: {
          officeId,
          partnerBrokerId,
          name: dto.name,
          phone: dto.phone,
          normalizedPhone,
          role: dto.role ?? null,
          isPrimary,
          memo: dto.memo ?? null,
        },
      });
    });
  }

  async updateContact(
    partnerBrokerId: string,
    contactId: string,
    officeId: string,
    dto: UpdatePartnerBrokerContactDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.partnerBrokerContact.findFirst({
        where: { id: contactId, partnerBrokerId, officeId },
      });
      if (!existing) {
        throw new NotFoundException('파트너 사무소 담당자를 찾을 수 없습니다.');
      }
      if (dto.isPrimary) {
        await tx.partnerBrokerContact.updateMany({
          where: { partnerBrokerId, officeId, id: { not: contactId }, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.partnerBrokerContact.update({
        where: { id: contactId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.phone !== undefined && {
            phone: dto.phone,
            normalizedPhone: normalizePhone(dto.phone) || dto.phone,
          }),
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
          ...(dto.memo !== undefined && { memo: dto.memo }),
        },
      });
    });
  }

  async removeContact(partnerBrokerId: string, contactId: string, officeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.partnerBrokerContact.findFirst({
        where: { id: contactId, partnerBrokerId, officeId },
      });
      if (!existing) {
        throw new NotFoundException('파트너 사무소 담당자를 찾을 수 없습니다.');
      }
      await tx.partnerBrokerContact.delete({ where: { id: contactId } });
      if (existing.isPrimary) {
        const nextPrimary = await tx.partnerBrokerContact.findFirst({
          where: { partnerBrokerId, officeId },
          orderBy: { createdAt: 'asc' },
        });
        if (nextPrimary) {
          await tx.partnerBrokerContact.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }
    });
  }
}
