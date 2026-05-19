import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingAdvertisementChannel,
  ListingAdvertisementSource,
  ListingAdvertisementStatus,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_STATUSES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementStatus),
);
const VALID_SOURCES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementSource),
);
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);

interface CreateDto {
  listingId: string;
  channel: string;
  status?: string;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  lastCheckedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
}

interface UpdateDto {
  channel?: string;
  status?: string;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  lastCheckedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
}

interface FindAllQuery {
  listingId?: string;
  channel?: string;
  status?: string;
  source?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'startedAt' | 'lastCheckedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ListingAdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(officeId: string, query: FindAllQuery = {}) {
    if (query.status) {
      this.assertValidStatus(query.status);
    }
    if (query.source) {
      this.assertValidSource(query.source);
    }
    if (query.channel) {
      this.assertKnownChannelShape(query.channel);
    }

    const filters: Prisma.ListingAdvertisementWhereInput[] = [{ officeId }];

    if (query.listingId) {
      filters.push({ listingId: query.listingId });
    }
    if (query.channel) {
      filters.push({ channel: query.channel });
    }
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.source) {
      filters.push({ source: query.source });
    }
    if (query.search) {
      filters.push({
        OR: [
          { channel: { contains: query.search, mode: 'insensitive' } },
          { status: { contains: query.search, mode: 'insensitive' } },
          { source: { contains: query.search, mode: 'insensitive' } },
          { memo: { contains: query.search, mode: 'insensitive' } },
          { externalAdId: { contains: query.search, mode: 'insensitive' } },
          { url: { contains: query.search, mode: 'insensitive' } },
          {
            listing: {
              property: {
                site: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            listing: {
              property: {
                site: {
                  roadAddress: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            listing: {
              property: {
                site: {
                  jibunAddress: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            listing: {
              property: {
                unit: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    const where =
      filters.length === 1 ? filters[0] : ({ AND: filters } as Prisma.ListingAdvertisementWhereInput);
    const sortBy = this.resolveSortField(query.sortBy);
    const sortOrder = this.resolveSortOrder(query.sortOrder);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.listingAdvertisement.findMany({
        where,
        include: {
          listing: {
            include: {
              property: {
                include: {
                  site: true,
                  unit: {
                    include: {
                      dong: true,
                      siteUnitType: true,
                    },
                  },
                },
              },
              jointBrokeragePartner: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.listingAdvertisement.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(officeId: string, dto: CreateDto) {
    if (!dto.listingId) {
      throw new BadRequestException('listingId is required');
    }
    if (!dto.channel || !dto.channel.trim()) {
      throw new BadRequestException('channel is required');
    }

    const status = dto.status ?? ListingAdvertisementStatus.ACTIVE;
    const source = dto.source ?? ListingAdvertisementSource.MANUAL;
    this.assertValidStatus(status);
    this.assertValidSource(source);
    this.assertKnownChannelShape(dto.channel);

    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, officeId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (status === ListingAdvertisementStatus.ACTIVE) {
      await this.assertNoActiveDuplicate(officeId, dto.listingId, dto.channel);
    }

    return this.prisma.listingAdvertisement.create({
      data: {
        officeId,
        listingId: dto.listingId,
        channel: dto.channel,
        status,
        source,
        advertisedPrice: dto.advertisedPrice ?? null,
        advertisedDeposit: dto.advertisedDeposit ?? null,
        advertisedMonthlyRent: dto.advertisedMonthlyRent ?? null,
        startedAt: dto.startedAt ?? null,
        endedAt: dto.endedAt ?? null,
        url: dto.url ?? null,
        memo: dto.memo ?? null,
        externalAdId: dto.externalAdId ?? null,
        lastCheckedAt: dto.lastCheckedAt ?? null,
        lastSyncedAt: dto.lastSyncedAt ?? null,
      },
    });
  }

  async update(id: string, officeId: string, dto: UpdateDto) {
    const existing = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
    });
    if (!existing) {
      throw new NotFoundException('ListingAdvertisement not found');
    }

    if (dto.status !== undefined) {
      this.assertValidStatus(dto.status);
    }
    if (dto.source !== undefined) {
      this.assertValidSource(dto.source);
    }
    if (dto.channel !== undefined) {
      if (!dto.channel.trim()) {
        throw new BadRequestException('channel cannot be empty');
      }
      this.assertKnownChannelShape(dto.channel);
    }

    const nextStatus = dto.status ?? existing.status;
    const nextChannel = dto.channel ?? existing.channel;
    const becomesActive =
      nextStatus === ListingAdvertisementStatus.ACTIVE &&
      (existing.status !== ListingAdvertisementStatus.ACTIVE ||
        nextChannel !== existing.channel);

    if (becomesActive) {
      await this.assertNoActiveDuplicate(
        officeId,
        existing.listingId,
        nextChannel,
        id,
      );
    }

    const transitioningToEnded =
      dto.status === ListingAdvertisementStatus.ENDED &&
      existing.status !== ListingAdvertisementStatus.ENDED;
    const endedAt = dto.endedAt;
    const resolvedEndedAt =
      endedAt !== undefined
        ? endedAt
        : transitioningToEnded
          ? new Date()
          : undefined;

    return this.prisma.listingAdvertisement.update({
      where: { id },
      data: {
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.advertisedPrice !== undefined && {
          advertisedPrice: dto.advertisedPrice,
        }),
        ...(dto.advertisedDeposit !== undefined && {
          advertisedDeposit: dto.advertisedDeposit,
        }),
        ...(dto.advertisedMonthlyRent !== undefined && {
          advertisedMonthlyRent: dto.advertisedMonthlyRent,
        }),
        ...(dto.startedAt !== undefined && { startedAt: dto.startedAt }),
        ...(resolvedEndedAt !== undefined && { endedAt: resolvedEndedAt }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.memo !== undefined && { memo: dto.memo }),
        ...(dto.externalAdId !== undefined && {
          externalAdId: dto.externalAdId,
        }),
        ...(dto.lastCheckedAt !== undefined && {
          lastCheckedAt: dto.lastCheckedAt,
        }),
        ...(dto.lastSyncedAt !== undefined && {
          lastSyncedAt: dto.lastSyncedAt,
        }),
      },
    });
  }

  async remove(id: string, officeId: string) {
    const existing = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('ListingAdvertisement not found');
    }
    return this.prisma.listingAdvertisement.delete({ where: { id } });
  }

  private assertValidStatus(status: string) {
    if (!VALID_STATUSES.has(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
  }

  private assertValidSource(source: string) {
    if (!VALID_SOURCES.has(source)) {
      throw new BadRequestException(`Invalid source: ${source}`);
    }
  }

  /** 채널은 자유텍스트지만, 알려지지 않은 값이면 KNOWN_CHANNELS와 비슷한 형태인지만 가볍게 확인. */
  private assertKnownChannelShape(channel: string) {
    if (KNOWN_CHANNELS.has(channel)) return;
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(channel)) {
      throw new BadRequestException(
        'channel must be lowercase slug (a-z, 0-9, _, -)',
      );
    }
  }

  private resolveSortField(sortBy?: FindAllQuery['sortBy']) {
    return sortBy && ['createdAt', 'updatedAt', 'startedAt', 'lastCheckedAt'].includes(sortBy)
      ? sortBy
      : 'updatedAt';
  }

  private resolveSortOrder(sortOrder?: FindAllQuery['sortOrder']) {
    return sortOrder === 'asc' ? 'asc' : 'desc';
  }

  /** 같은 (officeId, listingId, channel) 위에 또 다른 active 광고가 있으면 409. */
  private async assertNoActiveDuplicate(
    officeId: string,
    listingId: string,
    channel: string,
    excludeId?: string,
  ) {
    const conflict = await this.prisma.listingAdvertisement.findFirst({
      where: {
        officeId,
        listingId,
        channel,
        status: ListingAdvertisementStatus.ACTIVE,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException(
        '같은 매물·같은 채널에 이미 게재 중인 광고가 있습니다. 기존 광고를 먼저 종료하세요.',
      );
    }
  }
}
