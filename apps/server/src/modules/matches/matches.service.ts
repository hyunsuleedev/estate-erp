import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MATCH_STAGES } from './dto/match.dto';

const matchInclude = {
  listing: {
    include: {
      property: {
        include: {
          site: true,
          unit: { include: { dong: true } },
          propertyContacts: {
            where: { status: 'active' },
            include: { contact: true },
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
    },
  },
  buyerRequirement: {
    include: {
      contact: true,
      preferredRegions: {
        include: { province: true, district: true, ward: true },
      },
    },
  },
  calendarEvents: {
    where: { type: 'viewing' },
    orderBy: { start: 'asc' },
  },
  deals: {
    select: { id: true, stage: true, isCancelled: true },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.MatchInclude;

type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export interface MatchesFilter {
  propertyId?: string;
  listingId?: string;
  buyerReqId?: string;
  /** 콤마 구분 다중 stage 허용 (예: "suggested,viewing") */
  stage?: string;
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly matchInclude = matchInclude;

  async findAll(officeId: string, filters: MatchesFilter = {}) {
    const where: Prisma.MatchWhereInput = { officeId };

    if (filters.listingId) {
      where.listingId = filters.listingId;
    }
    if (filters.buyerReqId) {
      where.buyerReqId = filters.buyerReqId;
    }
    if (filters.propertyId) {
      where.listing = { propertyId: filters.propertyId };
    }
    if (filters.stage) {
      const stages = filters.stage
        .split(',')
        .map((stage) => stage.trim())
        .filter(Boolean);
      if (stages.length === 1) {
        where.stage = stages[0];
      } else if (stages.length > 1) {
        where.stage = { in: stages };
      }
    }

    const matches = await this.prisma.match.findMany({
      where,
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
    // 동일 매물 + 동일 구매조건 조합 중복 방지 (종료된 매칭은 재생성 허용)
    const duplicate = await this.prisma.match.findFirst({
      where: {
        officeId,
        listingId: dto.listingId,
        buyerReqId: dto.buyerReqId,
        stage: { not: 'closed' },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        '이미 같은 매물과 구매조건으로 진행 중인 매칭이 있습니다',
      );
    }

    const match = await this.prisma.match.create({
      data: { officeId, ...dto },
      include: this.matchInclude,
    });

    return this.withPropertyContext(match);
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; memo?: string | null },
  ) {
    if (!(MATCH_STAGES as readonly string[]).includes(dto.stage)) {
      throw new BadRequestException('유효하지 않은 매칭 단계입니다');
    }
    await this.findOne(id, officeId);
    const match = await this.prisma.match.update({
      where: { id },
      data: {
        stage: dto.stage,
        // null = 메모 비우기, undefined = 변경 없음
        memo: dto.memo === undefined ? undefined : dto.memo,
      },
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
