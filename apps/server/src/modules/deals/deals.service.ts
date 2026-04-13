import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const dealInclude = {
  listing: { include: { property: { include: { site: true, unit: true } } } },
  buyerContact: true,
  sellerContact: true,
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly dealInclude = dealInclude;

  async findAll(officeId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { officeId },
      include: this.dealInclude,
      orderBy: { createdAt: 'desc' },
    });

    return deals.map((deal) => this.withPropertyContext(deal));
  }

  async findOne(id: string, officeId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, officeId },
      include: this.dealInclude,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.withPropertyContext(deal);
  }

  async create(
    officeId: string,
    dto: {
      propertyId?: string;
      listingId?: string;
      price?: number;
      memo?: string;
    },
  ) {
    const listingId = await this.resolveListingId(officeId, dto);

    const deal = await this.prisma.deal.create({
      data: {
        officeId,
        listingId,
        price: dto.price,
        memo: dto.memo,
      },
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; price?: number; memo?: string },
  ) {
    await this.findOne(id, officeId);
    const deal = await this.prisma.deal.update({
      where: { id },
      data: dto,
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.deal.delete({ where: { id } });
  }

  private withPropertyContext(deal: DealWithRelations) {
    const property = deal.listing.property;

    return {
      ...deal,
      propertyId: property.id,
      property,
    };
  }

  private async resolveListingId(
    officeId: string,
    dto: { propertyId?: string; listingId?: string },
  ) {
    if (dto.listingId) {
      return dto.listingId;
    }

    if (!dto.propertyId) {
      throw new BadRequestException('listingId is required');
    }

    const listing = await this.prisma.listing.findFirst({
      where: { officeId, propertyId: dto.propertyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing.id;
  }
}
