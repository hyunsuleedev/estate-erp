import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string) {
    return this.prisma.match.findMany({
      where: { officeId },
      include: {
        property: { include: { site: true } },
        buyerRequirement: { include: { contact: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id, officeId },
      include: {
        property: { include: { site: true, unit: true } },
        buyerRequirement: { include: { contact: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async create(
    officeId: string,
    dto: {
      propertyId: string;
      buyerReqId: string;
      memo?: string;
    },
  ) {
    return this.prisma.match.create({
      data: { officeId, ...dto },
      include: {
        property: { include: { site: true } },
        buyerRequirement: { include: { contact: true } },
      },
    });
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; memo?: string },
  ) {
    await this.findOne(id, officeId);
    return this.prisma.match.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.match.delete({ where: { id } });
  }
}
