import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_GROUP_STATUSES = new Set([
  'needs_unit_confirmation',
  'linked',
  'ignored',
]);

export interface OfficeAdvertisementGroupsQuery {
  source?: string;
  status?: string;
  search?: string;
  onlyUnlinked?: boolean;
  page?: number;
  limit?: number;
}

export interface OfficeAdvertisementBatchItemDto {
  articleNo: string;
  sourceUrl?: string | null;
  cpPcArticleUrl?: string | null;
  isMine?: boolean;
  isMain?: boolean;
  isActive?: boolean;
  articleName?: string | null;
  realtorName?: string | null;
  realtorId?: string | null;
  representativeTelNo?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  ranking?: number | null;
  sameAddrCnt?: number | null;
  articleConfirmYmd?: string | null;
  seango?: boolean | null;
  epju?: boolean | null;
  raw?: unknown;
}

export interface OfficeAdvertisementBatchGroupDto {
  source?: string;
  siteName?: string | null;
  buildingName?: string | null;
  dongHint?: string | null;
  hoHint?: string | null;
  floorInfo?: string | null;
  areaName?: string | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  transactionType?: string | null;
  memo?: string | null;
  advertisements: OfficeAdvertisementBatchItemDto[];
}

export interface OfficeAdvertisementBatchUpsertDto {
  source?: string;
  groups: OfficeAdvertisementBatchGroupDto[];
}

export interface UpdateOfficeAdvertisementGroupDto {
  status?: string;
  memo?: string | null;
  hoHint?: string | null;
  dongHint?: string | null;
}

export interface LinkOfficeAdvertisementGroupDto {
  listingAdvertisementId: string;
  hoHint?: string | null;
  memo?: string | null;
}

@Injectable()
export class OfficeAdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllGroups(officeId: string, query: OfficeAdvertisementGroupsQuery = {}) {
    if (query.status && !VALID_GROUP_STATUSES.has(query.status)) {
      throw new BadRequestException('Invalid office advertisement group status');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const filters: Prisma.OfficeAdvertisementGroupWhereInput[] = [{ officeId }];

    if (query.source) filters.push({ source: query.source });
    if (query.status) filters.push({ status: query.status });
    if (query.onlyUnlinked) {
      filters.push({ listingAdvertisementId: null });
      filters.push({ status: { not: 'ignored' } });
    }
    if (query.search) {
      filters.push({
        OR: [
          { siteName: { contains: query.search, mode: 'insensitive' } },
          { buildingName: { contains: query.search, mode: 'insensitive' } },
          { dongHint: { contains: query.search, mode: 'insensitive' } },
          { hoHint: { contains: query.search, mode: 'insensitive' } },
          { memo: { contains: query.search, mode: 'insensitive' } },
          {
            advertisements: {
              some: {
                OR: [
                  { articleNo: { contains: query.search, mode: 'insensitive' } },
                  { articleName: { contains: query.search, mode: 'insensitive' } },
                  { realtorName: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }

    const where =
      filters.length === 1
        ? filters[0]
        : ({ AND: filters } as Prisma.OfficeAdvertisementGroupWhereInput);

    const [items, total] = await Promise.all([
      this.prisma.officeAdvertisementGroup.findMany({
        where,
        include: this.groupInclude(),
        orderBy: { lastSeenAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.officeAdvertisementGroup.count({ where }),
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

  async updateGroup(
    id: string,
    officeId: string,
    dto: UpdateOfficeAdvertisementGroupDto,
  ) {
    if (dto.status && !VALID_GROUP_STATUSES.has(dto.status)) {
      throw new BadRequestException('Invalid office advertisement group status');
    }

    const existing = await this.prisma.officeAdvertisementGroup.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('OfficeAdvertisementGroup not found');

    return this.prisma.officeAdvertisementGroup.update({
      where: { id },
      data: {
        status: dto.status,
        memo: dto.memo,
        hoHint: dto.hoHint,
        dongHint: dto.dongHint,
      },
      include: this.groupInclude(),
    });
  }

  async batchUpsert(officeId: string, dto: OfficeAdvertisementBatchUpsertDto) {
    if (!dto.groups || dto.groups.length === 0) {
      throw new BadRequestException('groups is required');
    }
    if (dto.groups.length > 100) {
      throw new BadRequestException('groups must be 100 or fewer');
    }

    let groupsCreated = 0;
    let groupsReused = 0;
    let advertisementsCreated = 0;
    let advertisementsUpdated = 0;
    const errors: Array<{ articleNo: string; message: string }> = [];

    for (const groupDto of dto.groups) {
      const source = groupDto.source || dto.source || 'naver';
      const main = this.resolveMainAdvertisement(groupDto.advertisements);
      if (!main) {
        errors.push({ articleNo: '-', message: 'group requires at least one advertisement' });
        continue;
      }

      try {
        const existingMain = await this.prisma.officeAdvertisement.findUnique({
          where: {
            officeId_source_articleNo: {
              officeId,
              source,
              articleNo: main.articleNo,
            },
          },
          select: { groupId: true },
        });

        let groupId = existingMain?.groupId;
        if (groupId) {
          groupsReused += 1;
          await this.prisma.officeAdvertisementGroup.update({
            where: { id: groupId },
            data: this.groupUpdateData(groupDto, source),
          });
        } else {
          const created = await this.prisma.officeAdvertisementGroup.create({
            data: this.groupCreateData(officeId, groupDto, source),
            select: { id: true },
          });
          groupId = created.id;
          groupsCreated += 1;
        }

        for (const ad of groupDto.advertisements) {
          const existed = await this.prisma.officeAdvertisement.findUnique({
            where: {
              officeId_source_articleNo: {
                officeId,
                source,
                articleNo: ad.articleNo,
              },
            },
            select: { id: true },
          });

          const saved = await this.prisma.officeAdvertisement.upsert({
            where: {
              officeId_source_articleNo: {
                officeId,
                source,
                articleNo: ad.articleNo,
              },
            },
            create: this.advertisementCreateData(officeId, groupId, source, ad),
            update: this.advertisementUpdateData(groupId, ad),
            select: { id: true, isMine: true, price: true, deposit: true, monthlyRent: true },
          });

          if (existed) advertisementsUpdated += 1;
          else advertisementsCreated += 1;

          if (ad === main || ad.isMain) {
            await this.prisma.officeAdvertisementGroup.update({
              where: { id: groupId },
              data: { mainAdvertisementId: saved.id },
            });
          }
        }

        await this.refreshGroupAggregates(groupId);
      } catch (error) {
        errors.push({
          articleNo: main.articleNo,
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    return {
      groupsReceived: dto.groups.length,
      groupsCreated,
      groupsReused,
      advertisementsCreated,
      advertisementsUpdated,
      errors,
    };
  }

  async linkGroupToListingAdvertisement(
    id: string,
    officeId: string,
    dto: LinkOfficeAdvertisementGroupDto,
  ) {
    if (!dto.listingAdvertisementId) {
      throw new BadRequestException('listingAdvertisementId is required');
    }

    const [group, listingAdvertisement] = await Promise.all([
      this.prisma.officeAdvertisementGroup.findFirst({
        where: { id, officeId },
        include: { mainAdvertisement: true },
      }),
      this.prisma.listingAdvertisement.findFirst({
        where: { id: dto.listingAdvertisementId, officeId },
        select: {
          id: true,
          listingId: true,
          officeId: true,
        },
      }),
    ]);

    if (!group) throw new NotFoundException('OfficeAdvertisementGroup not found');
    if (!listingAdvertisement) {
      throw new NotFoundException('ListingAdvertisement not found');
    }

    return this.prisma.officeAdvertisementGroup.update({
      where: { id },
      data: {
        listingAdvertisementId: listingAdvertisement.id,
        hoHint: dto.hoHint ?? group.hoHint,
        memo: dto.memo ?? group.memo,
        status: 'linked',
      },
      include: this.groupInclude(),
    });
  }

  private groupInclude() {
    return {
      mainAdvertisement: true,
      advertisements: {
        orderBy: [{ isMine: 'desc' as const }, { ranking: 'asc' as const }],
      },
      listingAdvertisement: {
        include: {
          listing: {
            include: {
              property: {
                include: {
                  site: true,
                  unit: { include: { dong: true, siteUnitType: true } },
                },
              },
            },
          },
        },
      },
    };
  }

  private resolveMainAdvertisement(advertisements: OfficeAdvertisementBatchItemDto[]) {
    return (
      advertisements.find((ad) => ad.isMain && ad.isMine) ??
      advertisements.find((ad) => ad.isMine) ??
      advertisements.find((ad) => ad.isMain) ??
      advertisements[0]
    );
  }

  private groupCreateData(
    officeId: string,
    dto: OfficeAdvertisementBatchGroupDto,
    source: string,
  ): Prisma.OfficeAdvertisementGroupUncheckedCreateInput {
    return {
      officeId,
      source,
      status: 'needs_unit_confirmation',
      siteName: dto.siteName ?? null,
      buildingName: dto.buildingName ?? null,
      dongHint: dto.dongHint ?? null,
      hoHint: dto.hoHint ?? null,
      floorInfo: dto.floorInfo ?? null,
      areaName: dto.areaName ?? null,
      exclusiveAreaM2: dto.exclusiveAreaM2 ?? null,
      supplyAreaM2: dto.supplyAreaM2 ?? null,
      transactionType: dto.transactionType ?? null,
      memo: dto.memo ?? null,
      lastSeenAt: new Date(),
      lastSyncedAt: new Date(),
    };
  }

  private groupUpdateData(
    dto: OfficeAdvertisementBatchGroupDto,
    source: string,
  ): Prisma.OfficeAdvertisementGroupUncheckedUpdateInput {
    return {
      source,
      siteName: dto.siteName ?? undefined,
      buildingName: dto.buildingName ?? undefined,
      dongHint: dto.dongHint ?? undefined,
      floorInfo: dto.floorInfo ?? undefined,
      areaName: dto.areaName ?? undefined,
      exclusiveAreaM2: dto.exclusiveAreaM2 ?? undefined,
      supplyAreaM2: dto.supplyAreaM2 ?? undefined,
      transactionType: dto.transactionType ?? undefined,
      memo: dto.memo ?? undefined,
      lastSeenAt: new Date(),
      lastSyncedAt: new Date(),
    };
  }

  private advertisementCreateData(
    officeId: string,
    groupId: string,
    source: string,
    dto: OfficeAdvertisementBatchItemDto,
  ): Prisma.OfficeAdvertisementUncheckedCreateInput {
    return {
      officeId,
      groupId,
      source,
      articleNo: dto.articleNo,
      sourceUrl: dto.sourceUrl ?? null,
      cpPcArticleUrl: dto.cpPcArticleUrl ?? null,
      isMine: dto.isMine ?? false,
      isMain: dto.isMain ?? false,
      isActive: dto.isActive ?? true,
      articleName: dto.articleName ?? null,
      realtorName: dto.realtorName ?? null,
      realtorId: dto.realtorId ?? null,
      representativeTelNo: dto.representativeTelNo ?? null,
      price: dto.price ?? null,
      deposit: dto.deposit ?? null,
      monthlyRent: dto.monthlyRent ?? null,
      ranking: dto.ranking ?? null,
      sameAddrCnt: dto.sameAddrCnt ?? null,
      articleConfirmYmd: dto.articleConfirmYmd ?? null,
      seango: dto.seango ?? false,
      epju: dto.epju ?? false,
      raw: dto.raw === undefined ? undefined : (dto.raw as Prisma.InputJsonValue),
      lastSeenAt: new Date(),
    };
  }

  private advertisementUpdateData(
    groupId: string,
    dto: OfficeAdvertisementBatchItemDto,
  ): Prisma.OfficeAdvertisementUncheckedUpdateInput {
    return {
      groupId,
      sourceUrl: dto.sourceUrl ?? undefined,
      cpPcArticleUrl: dto.cpPcArticleUrl ?? undefined,
      isMine: dto.isMine,
      isMain: dto.isMain,
      isActive: dto.isActive ?? true,
      articleName: dto.articleName ?? undefined,
      realtorName: dto.realtorName ?? undefined,
      realtorId: dto.realtorId ?? undefined,
      representativeTelNo: dto.representativeTelNo ?? undefined,
      price: dto.price ?? undefined,
      deposit: dto.deposit ?? undefined,
      monthlyRent: dto.monthlyRent ?? undefined,
      ranking: dto.ranking ?? undefined,
      sameAddrCnt: dto.sameAddrCnt ?? undefined,
      articleConfirmYmd: dto.articleConfirmYmd ?? undefined,
      seango: dto.seango ?? undefined,
      epju: dto.epju ?? undefined,
      raw: dto.raw === undefined ? undefined : (dto.raw as Prisma.InputJsonValue),
      lastSeenAt: new Date(),
    };
  }

  private async refreshGroupAggregates(groupId: string) {
    const advertisements = await this.prisma.officeAdvertisement.findMany({
      where: { groupId },
      select: {
        id: true,
        isMine: true,
        price: true,
        deposit: true,
        monthlyRent: true,
      },
    });
    const own = advertisements.find((ad) => ad.isMine);
    const relatedAmounts = advertisements
      .filter((ad) => !ad.isMine)
      .map((ad) => ad.price ?? ad.deposit)
      .filter((amount): amount is number => typeof amount === 'number');

    await this.prisma.officeAdvertisementGroup.update({
      where: { id: groupId },
      data: {
        ownPrice: own?.price ?? null,
        ownDeposit: own?.deposit ?? null,
        ownMonthlyRent: own?.monthlyRent ?? null,
        relatedCount: Math.max(0, advertisements.length - (own ? 1 : 0)),
        relatedPriceMin: relatedAmounts.length > 0 ? Math.min(...relatedAmounts) : null,
        relatedPriceMax: relatedAmounts.length > 0 ? Math.max(...relatedAmounts) : null,
      },
    });
  }
}
