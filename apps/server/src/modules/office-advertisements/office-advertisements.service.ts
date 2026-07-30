import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { inferOfficeAdvertisementFloorExposureMode } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface OfficeAdvertisementGroupsQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export interface OfficeAdvertisementBatchItemDto {
  articleNo: string;
  sourceUrl?: string | null;
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
  floorInfo?: string | null;
  verificationTypeCode?: string | null;
  seango?: boolean | null;
  epju?: boolean | null;
  raw?: unknown;
}

export interface OfficeAdvertisementBatchGroupDto {
  listingAdvertisementId: string;
  memo?: string | null;
  advertisements: OfficeAdvertisementBatchItemDto[];
}

export interface OfficeAdvertisementBatchUpsertDto {
  groups: OfficeAdvertisementBatchGroupDto[];
}

@Injectable()
export class OfficeAdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllGroups(
    officeId: string,
    query: OfficeAdvertisementGroupsQuery = {},
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const filters: Prisma.OfficeAdvertisementGroupWhereInput[] = [{ officeId }];

    if (query.search) {
      filters.push({
        OR: [
          { memo: { contains: query.search, mode: 'insensitive' } },
          {
            listingAdvertisement: {
              channel: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            listingAdvertisement: {
              externalAdId: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            listingAdvertisement: {
              naverArticleNo: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          },
          {
            listingAdvertisement: {
              listing: {
                property: {
                  site: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            },
          },
          {
            listingAdvertisement: {
              listing: {
                property: {
                  unit: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            },
          },
          {
            advertisements: {
              some: {
                OR: [
                  {
                    articleNo: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    articleName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    realtorName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
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
      try {
        if (!groupDto.listingAdvertisementId) {
          throw new BadRequestException(
            'listingAdvertisementId is required for every comparison group',
          );
        }
        if (!groupDto.advertisements?.length) {
          throw new BadRequestException(
            'comparison group requires at least one advertisement',
          );
        }

        const listingAdvertisement =
          await this.prisma.listingAdvertisement.findFirst({
            where: {
              id: groupDto.listingAdvertisementId,
              officeId,
            },
            select: {
              id: true,
              naverArticleNo: true,
              listing: {
                select: {
                  transactionType: true,
                },
              },
            },
          });
        if (!listingAdvertisement) {
          throw new NotFoundException('ListingAdvertisement not found');
        }
        if (!listingAdvertisement.naverArticleNo) {
          throw new BadRequestException(
            'ListingAdvertisement.naverArticleNo is required before Naver comparison',
          );
        }

        const main = groupDto.advertisements.find(
          (advertisement) =>
            advertisement.articleNo === listingAdvertisement.naverArticleNo,
        );
        if (!main) {
          throw new BadRequestException(
            'comparison data must contain the exact naverArticleNo of ListingAdvertisement',
          );
        }

        const existingGroup =
          await this.prisma.officeAdvertisementGroup.findUnique({
            where: {
              listingAdvertisementId: listingAdvertisement.id,
            },
            select: { id: true },
          });

        let groupId: string;
        const observedAt = new Date();
        if (existingGroup) {
          groupId = existingGroup.id;
          groupsReused += 1;
          await this.prisma.officeAdvertisementGroup.update({
            where: { id: groupId },
            data: {
              memo: groupDto.memo ?? undefined,
              lastSeenAt: observedAt,
              lastSyncedAt: observedAt,
            },
          });
        } else {
          const created = await this.prisma.officeAdvertisementGroup.create({
            data: {
              officeId,
              listingAdvertisementId: listingAdvertisement.id,
              memo: groupDto.memo ?? null,
              lastSeenAt: observedAt,
              lastSyncedAt: observedAt,
            },
            select: { id: true },
          });
          groupId = created.id;
          groupsCreated += 1;
        }

        let mainAdvertisementId: string | null = null;
        for (const advertisement of groupDto.advertisements) {
          const existed = await this.prisma.officeAdvertisement.findUnique({
            where: {
              officeId_articleNo: {
                officeId,
                articleNo: advertisement.articleNo,
              },
            },
            select: { id: true },
          });
          const isMain = advertisement.articleNo === main.articleNo;
          const normalizedAdvertisement = {
            ...advertisement,
            isMine: isMain ? true : advertisement.isMine,
            isMain: isMain ? true : advertisement.isMain,
          };
          const saved = await this.prisma.officeAdvertisement.upsert({
            where: {
              officeId_articleNo: {
                officeId,
                articleNo: advertisement.articleNo,
              },
            },
            create: this.advertisementCreateData(
              officeId,
              groupId,
              normalizedAdvertisement,
              observedAt,
            ),
            update: this.advertisementUpdateData(
              groupId,
              normalizedAdvertisement,
              observedAt,
            ),
            select: { id: true },
          });

          if (existed) advertisementsUpdated += 1;
          else advertisementsCreated += 1;
          if (isMain) mainAdvertisementId = saved.id;
        }

        await this.prisma.officeAdvertisement.deleteMany({
          where: {
            groupId,
            articleNo: {
              notIn: groupDto.advertisements.map(
                (advertisement) => advertisement.articleNo,
              ),
            },
          },
        });

        await this.prisma.officeAdvertisementGroup.update({
          where: { id: groupId },
          data: { mainAdvertisementId },
        });
        await this.refreshGroupAggregates(
          groupId,
          listingAdvertisement.listing.transactionType,
        );
        await this.prisma.listingAdvertisement.update({
          where: { id: listingAdvertisement.id },
          data: { lastCheckedAt: observedAt },
        });
      } catch (error) {
        errors.push({
          articleNo:
            groupDto.advertisements?.[0]?.articleNo ??
            groupDto.listingAdvertisementId ??
            '-',
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

  private groupInclude() {
    return {
      mainAdvertisement: true,
      advertisements: {
        orderBy: [{ isMine: 'desc' as const }, { ranking: 'asc' as const }],
      },
    };
  }

  private advertisementCreateData(
    officeId: string,
    groupId: string,
    dto: OfficeAdvertisementBatchItemDto,
    observedAt: Date,
  ): Prisma.OfficeAdvertisementUncheckedCreateInput {
    return {
      officeId,
      groupId,
      articleNo: dto.articleNo,
      sourceUrl: dto.sourceUrl ?? null,
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
      floorInfo: normalizeNullableText(dto.floorInfo),
      floorExposureMode: inferOfficeAdvertisementFloorExposureMode(
        dto.floorInfo,
      ),
      verificationTypeCode: normalizeNullableText(dto.verificationTypeCode),
      seango: dto.seango ?? false,
      epju: dto.epju ?? false,
      raw:
        dto.raw === undefined ? undefined : (dto.raw as Prisma.InputJsonValue),
      lastSeenAt: observedAt,
    };
  }

  private advertisementUpdateData(
    groupId: string,
    dto: OfficeAdvertisementBatchItemDto,
    observedAt: Date,
  ): Prisma.OfficeAdvertisementUncheckedUpdateInput {
    return {
      groupId,
      sourceUrl: dto.sourceUrl ?? undefined,
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
      floorInfo:
        dto.floorInfo === undefined
          ? undefined
          : normalizeNullableText(dto.floorInfo),
      floorExposureMode:
        dto.floorInfo === undefined
          ? undefined
          : inferOfficeAdvertisementFloorExposureMode(dto.floorInfo),
      verificationTypeCode:
        dto.verificationTypeCode === undefined
          ? undefined
          : normalizeNullableText(dto.verificationTypeCode),
      seango: dto.seango ?? undefined,
      epju: dto.epju ?? undefined,
      raw:
        dto.raw === undefined ? undefined : (dto.raw as Prisma.InputJsonValue),
      lastSeenAt: observedAt,
    };
  }

  private async refreshGroupAggregates(
    groupId: string,
    transactionType: string,
  ) {
    const advertisements = await this.prisma.officeAdvertisement.findMany({
      where: { groupId, isActive: true },
      select: {
        isMine: true,
        price: true,
        deposit: true,
        monthlyRent: true,
      },
    });
    const own = advertisements.find((advertisement) => advertisement.isMine);
    // 월세는 보증금 하나로 최저/최고를 축약하면 보증금·월세 trade-off를
    // "더 싸다"로 오인할 수 있으므로 scalar 가격 범위를 만들지 않는다.
    const relatedAmounts =
      transactionType === 'monthly'
        ? []
        : advertisements
            .filter((advertisement) => !advertisement.isMine)
            .map((advertisement) =>
              transactionType === 'jeonse'
                ? (advertisement.deposit ?? advertisement.price)
                : advertisement.price,
            )
            .filter((amount): amount is number => typeof amount === 'number');

    await this.prisma.officeAdvertisementGroup.update({
      where: { id: groupId },
      data: {
        ownPrice: own?.price ?? null,
        ownDeposit: own?.deposit ?? null,
        ownMonthlyRent: own?.monthlyRent ?? null,
        relatedCount: Math.max(0, advertisements.length - (own ? 1 : 0)),
        relatedPriceMin:
          relatedAmounts.length > 0 ? Math.min(...relatedAmounts) : null,
        relatedPriceMax:
          relatedAmounts.length > 0 ? Math.max(...relatedAmounts) : null,
      },
    });
  }
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
