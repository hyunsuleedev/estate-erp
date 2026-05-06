import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const matchInclude = {
  listing: {
    include: {
      property: {
        include: {
          site: true,
          unit: { include: { dong: true } },
        },
      },
    },
  },
  buyerRequirement: { include: { contact: true } },
  calendarEvents: {
    where: { type: 'viewing' },
    orderBy: { start: 'asc' },
  },
} satisfies Prisma.MatchInclude;

type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly matchInclude = matchInclude;

  async findAll(officeId: string) {
    const matches = await this.prisma.match.findMany({
      where: { officeId },
      include: this.matchInclude,
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => this.withPropertyContext(match));
  }

  async findOne(id: string, officeId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id, officeId },
      include: this.matchInclude,
    });
    if (!match) throw new NotFoundException('Match not found');
    return this.withPropertyContext(match);
  }

  async create(
    officeId: string,
    dto: {
      listingId: string;
      buyerReqId: string;
      memo?: string;
    },
  ) {
    const match = await this.prisma.match.create({
      data: { officeId, ...dto },
      include: this.matchInclude,
    });

    return this.withPropertyContext(match);
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; memo?: string },
  ) {
    await this.findOne(id, officeId);
    const match = await this.prisma.match.update({
      where: { id },
      data: dto,
      include: this.matchInclude,
    });

    return this.withPropertyContext(match);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.match.delete({ where: { id } });
  }

  private withPropertyContext(match: MatchWithRelations) {
    const property = match.listing.property;

    return {
      ...match,
      propertyId: property.id,
      property,
    };
  }
}
