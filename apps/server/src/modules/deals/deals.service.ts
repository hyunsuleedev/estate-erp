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
  payments: { orderBy: [{ kind: 'asc' }, { sequence: 'asc' }] },
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
      matchId?: string;
      transactionType?: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      agreedMoveInDate?: string;
      specialTerms?: string;
      buyerContactId?: string;
      sellerContactId?: string;
      memo?: string;
    },
  ) {
    const { listingId, transactionType } = await this.resolveListing(
      officeId,
      dto,
    );

    const deal = await this.prisma.deal.create({
      data: {
        officeId,
        listingId,
        matchId: dto.matchId,
        transactionType,
        agreedPrice: dto.agreedPrice,
        agreedDeposit: dto.agreedDeposit,
        agreedMonthlyRent: dto.agreedMonthlyRent,
        agreedMoveInDate: dto.agreedMoveInDate
          ? new Date(dto.agreedMoveInDate)
          : undefined,
        specialTerms: dto.specialTerms,
        buyerContactId: dto.buyerContactId,
        sellerContactId: dto.sellerContactId,
        memo: dto.memo,
      },
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: {
      stage: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      memo?: string;
    },
  ) {
    const existing = await this.findOne(id, officeId);

    // stage 가 contracted 이상이면 Contract 필수
    const contractRequiredStages = new Set([
      'contracted',
      'settling',
      'completed',
      'closed',
    ]);
    if (contractRequiredStages.has(dto.stage)) {
      const contract = await this.prisma.contract.findUnique({
        where: { dealId: id },
        select: { id: true },
      });
      if (!contract) {
        throw new BadRequestException(
          `Contract 가 존재해야 stage='${dto.stage}' 로 전이할 수 있습니다.`,
        );
      }
    }

    const stageChanged = dto.stage !== existing.stage;

    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        stage: dto.stage,
        stageChangedAt: stageChanged ? new Date() : undefined,
        agreedPrice: dto.agreedPrice,
        agreedDeposit: dto.agreedDeposit,
        agreedMonthlyRent: dto.agreedMonthlyRent,
        memo: dto.memo,
      },
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async cancel(
    id: string,
    officeId: string,
    dto: { cancelReason?: string; cancelledBy?: string },
  ) {
    await this.findOne(id, officeId);

    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason,
        cancelledBy: dto.cancelledBy,
      },
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.deal.delete({ where: { id } });
  }

  private withPropertyContext(deal: DealWithRelations) {
    const property = deal.listing?.property ?? null;

    return {
      ...deal,
      propertyId: property?.id ?? null,
      property,
    };
  }

  private async resolveListing(
    officeId: string,
    dto: { propertyId?: string; listingId?: string; transactionType?: string },
  ): Promise<{ listingId: string | undefined; transactionType: string }> {
    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: { id: true, transactionType: true },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
      };
    }

    if (dto.propertyId) {
      const listing = await this.prisma.listing.findFirst({
        where: { officeId, propertyId: dto.propertyId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, transactionType: true },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
      };
    }

    if (!dto.transactionType) {
      throw new BadRequestException(
        'listingId, propertyId, 또는 transactionType 중 하나는 필요합니다.',
      );
    }

    return { listingId: undefined, transactionType: dto.transactionType };
  }
}
