import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ListingAdvertisementChannel,
  ListingAdvertisementSource,
  ListingAdvertisementStatus,
} from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AdvertisementRawFields,
  assertValidAdvertisementRawFields,
  getAdvertisementLinkLevel,
  resolveAdvertisementLink,
  type AdvertisementLink,
} from "./advertisement-link";
import {
  advertisementStateChanged,
  findSameAdvertisement,
  mergeAdvertisements,
  recordAdvertisementHistory,
} from "./advertisement-identity";
import { toComparisonSet } from "../office-advertisements/office-advertisements.service";

const VALID_STATUSES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementStatus),
);
const VALID_SOURCES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementSource),
);
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);
interface CreateDto extends AdvertisementRawFields {
  /** 광고는 매물 없이도 만들 수 있다. 아는 만큼만 준다(매물 > 관리 공간 > 건물). */
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
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
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
}

/** 화면이 보고 있던 광고 가격. 주면 지금 값과 같을 때만 고친다 */
export interface ExpectedAdvertisedAmounts {
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
}

interface UpdateDto extends AdvertisementRawFields {
  /**
   * 고치기 전에 보고 있던 가격. 그 사이 수집이나 다른 사람이 값을 바꿨으면 409로 거절한다
   * (오래된 화면의 값으로 새 값을 덮지 않는다). 안 주면 확인하지 않는다.
   */
  expected?: ExpectedAdvertisedAmounts | null;
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
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
}

/** 연결 필터: 매물까지 / 매물 없음(관리 공간이나 건물은 있음 포함) / 관리 공간 없음 / 건물도 없음 */
export type AdvertisementLinkFilter =
  | "listing"
  | "no_listing"
  | "no_property"
  | "no_site";

const LINK_FILTERS: Record<AdvertisementLinkFilter, Prisma.ListingAdvertisementWhereInput> = {
  listing: { listingId: { not: null } },
  no_listing: { listingId: null },
  no_property: { propertyId: null },
  no_site: { siteId: null },
};

/** 매물이 있으면 매물의 것을, 없으면 광고에 직접 걸린 관리 공간 · 건물을 읽는다 */
const PLACE_INCLUDE = {
  site: true,
  unit: { include: { dong: true, siteUnitType: true } },
} satisfies Prisma.PropertyInclude;

interface FindAllQuery {
  listingId?: string;
  propertyId?: string;
  link?: AdvertisementLinkFilter;
  /** pending: 아직 끝나지 않은 변경 요청이 걸린 광고만 */
  requests?: "pending";
  channel?: string;
  status?: string;
  source?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
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
          { channel: { contains: query.search, mode: "insensitive" } },
          { status: { contains: query.search, mode: "insensitive" } },
          { source: { contains: query.search, mode: "insensitive" } },
          { memo: { contains: query.search, mode: "insensitive" } },
          { externalAdId: { contains: query.search, mode: "insensitive" } },
          { providerStatus: { contains: query.search, mode: "insensitive" } },
          { naverArticleNo: { contains: query.search, mode: "insensitive" } },
          { url: { contains: query.search, mode: "insensitive" } },
          { naverUrl: { contains: query.search, mode: "insensitive" } },
          {
            listing: {
              property: {
                site: {
                  name: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          },
          {
            listing: {
              property: {
                site: {
                  roadAddress: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          },
          {
            listing: {
              property: {
                site: {
                  jibunAddress: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          },
          {
            listing: {
              property: {
                unit: {
                  name: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          },
          // 매물이 없는 광고는 광고에 직접 걸린 자리와 CP 원문으로 찾는다
          { property: { site: { name: { contains: query.search, mode: "insensitive" } } } },
          { property: { unit: { name: { contains: query.search, mode: "insensitive" } } } },
          { site: { name: { contains: query.search, mode: "insensitive" } } },
          { rawSiteName: { contains: query.search, mode: "insensitive" } },
          { rawJibunAddress: { contains: query.search, mode: "insensitive" } },
          { rawRoadAddress: { contains: query.search, mode: "insensitive" } },
          { rawDong: { contains: query.search, mode: "insensitive" } },
          { rawHo: { contains: query.search, mode: "insensitive" } },
        ],
      });
    }
    if (query.propertyId) {
      filters.push({ propertyId: query.propertyId });
    }
    if (query.link) {
      const linkFilter = LINK_FILTERS[query.link];
      if (!linkFilter) {
        throw new BadRequestException(
          "link must be listing, no_listing, no_property, or no_site",
        );
      }
      filters.push(linkFilter);
    }
    if (query.requests === "pending") {
      filters.push({
        changeRequests: {
          some: { task: { status: { in: ["pending", "in_progress"] } } },
        },
      });
    }

    const where =
      filters.length === 1
        ? filters[0]
        : ({ AND: filters } as Prisma.ListingAdvertisementWhereInput);
    const sortBy = this.resolveSortField(query.sortBy);
    const sortOrder = this.resolveSortOrder(query.sortOrder);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.listingAdvertisement.findMany({
        where,
        include: {
          listing: { include: { property: { include: PLACE_INCLUDE } } },
          property: { include: PLACE_INCLUDE },
          site: true,
          changeRequests: {
            include: {
              task: {
                select: {
                  id: true,
                  status: true,
                  assignedToId: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: "desc" as const },
          },
          comparisons: true,
          comparisonRecords: {
            orderBy: { observedAt: "desc" as const },
            take: 1,
            select: { observedAt: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.listingAdvertisement.count({ where }),
    ]);

    return {
      items: items.map(({ comparisons, comparisonRecords, ...item }) => {
        // 네이버 비교 한 벌: 읽은 시각, 내 줄, 전체 줄. 비교한 적이 없으면 null
        const comparison = toComparisonSet(
          item.naverArticleNo,
          comparisons,
          comparisonRecords[0]?.observedAt ?? null,
        );
        const source = comparison?.mainAdvertisement ?? null;
        return {
          ...item,
          comparison,
          // 화면의 "매물 연결됨 / 매물 없음 / 호실 못 찾음 / 건물 못 찾음". 저장하지 않고 세 칸에서 계산한다.
          linkLevel: getAdvertisementLinkLevel(item),
          changeRequests: item.changeRequests.map((request) => ({
            ...request,
            fulfilled: isChangeRequestFulfilled(request, item),
          })),
          actionContext: {
            mainAdvertisementId: source?.id ?? null,
            observedAt: comparison?.observedAt ?? source?.lastSeenAt ?? null,
            isActive: source?.isActive ?? null,
            price: source?.price ?? null,
            deposit: source?.deposit ?? null,
            monthlyRent: source?.monthlyRent ?? null,
          },
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 광고 한 건의 흐름: 내 광고가 어떻게 바뀌었는지(이력)와 그때그때 시장에서 어디 있었는지(비교 기록).
   * 화면이 두 가지를 시간순으로 함께 놓아 보여 준다.
   */
  async findTimeline(id: string, officeId: string) {
    const advertisement = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!advertisement) {
      throw new NotFoundException("ListingAdvertisement not found");
    }
    const [histories, comparisonRecords] = await Promise.all([
      this.prisma.listingAdvertisementHistory.findMany({
        where: { officeId, listingAdvertisementId: id },
        select: {
          id: true,
          status: true,
          naverArticleNo: true,
          advertisedPrice: true,
          advertisedDeposit: true,
          advertisedMonthlyRent: true,
          observedAt: true,
          source: true,
        },
        orderBy: [{ observedAt: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.advertisementComparisonRecord.findMany({
        where: { officeId, advertisementId: id },
        select: {
          id: true,
          observedAt: true,
          ownVisible: true,
          ownRanking: true,
          totalCount: true,
          lowestCompetitorAmount: true,
          lowerPricedCount: true,
          signal: true,
          changes: true,
        },
        orderBy: { observedAt: "asc" },
      }),
    ]);
    return { histories, comparisonRecords };
  }

  async findPriceHistory(officeId: string, listingId: string) {
    if (!listingId) {
      throw new BadRequestException("listingId is required");
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, officeId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    return this.prisma.listingAdvertisementHistory.findMany({
      where: {
        officeId,
        advertisement: { listingId },
      },
      select: {
        id: true,
        officeId: true,
        listingAdvertisementId: true,
        status: true,
        naverArticleNo: true,
        advertisedPrice: true,
        advertisedDeposit: true,
        advertisedMonthlyRent: true,
        observedAt: true,
        source: true,
        createdAt: true,
        advertisement: {
          select: {
            channel: true,
            externalAdId: true,
            startedAt: true,
            firstSeenAt: true,
            lastSeenAt: true,
            endedAt: true,
          },
        },
      },
      orderBy: [{ observedAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(officeId: string, dto: CreateDto) {
    if (!dto.channel || !dto.channel.trim()) {
      throw new BadRequestException("channel is required");
    }

    const status = dto.status ?? ListingAdvertisementStatus.ACTIVE;
    const source = dto.source ?? ListingAdvertisementSource.MANUAL;
    this.assertValidStatus(status);
    this.assertValidSource(source);
    this.assertKnownChannelShape(dto.channel);
    assertValidAdvertisementRawFields(dto);

    if (status === ListingAdvertisementStatus.ACTIVE && dto.endedAt != null) {
      throw new BadRequestException("active advertisement cannot have endedAt");
    }

    return this.prisma.$transaction(async (tx) => {
      // 매물 없이도 만든다. 준 연결을 확인하고 위 단계(관리 공간 · 건물)를 채운다.
      const link = await resolveAdvertisementLink(tx, officeId, dto);
      const transactionType = link.transactionType ?? dto.transactionType ?? null;

      // 같은 광고가 이미 있으면 새 줄을 만들지 않는다 (재광고 · 다시 게재는 같은 줄의 변화다)
      const same = await findSameAdvertisement(tx, officeId, {
        channel: dto.channel,
        externalAdId: dto.externalAdId,
        listingId: link.listingId,
        propertyId: link.propertyId,
        transactionType,
      });
      if (
        same.byKey &&
        same.byExternalAdId &&
        same.byKey.id !== same.byExternalAdId.id
      ) {
        // CP 번호로는 다른 줄에 들어와 있던 광고가 이 매물 · 채널의 광고였다
        same.byKey = await mergeAdvertisements(tx, same.byExternalAdId, same.byKey);
      }
      const existing = same.byKey ?? same.byExternalAdId;
      if (existing) {
        // 사람이 "광고 등록"으로 넣는데 그 광고가 이미 게재 중이면 덮어쓰지 않고 알린다
        if (
          source === ListingAdvertisementSource.MANUAL &&
          existing.status === ListingAdvertisementStatus.ACTIVE &&
          status === ListingAdvertisementStatus.ACTIVE
        ) {
          throw new ConflictException(
            "같은 매물·같은 채널에 이미 게재 중인 광고가 있습니다. 기존 광고를 수정해 주세요.",
          );
        }
        await tx.$queryRaw`
          SELECT id FROM listing_advertisements
          WHERE id = ${existing.id}::uuid
          FOR NO KEY UPDATE
        `;
        return this.updateLocked(
          tx,
          existing.id,
          officeId,
          { ...dto, status, source, transactionType: undefined },
          link,
        );
      }

      const observedAt = dto.lastSyncedAt ?? new Date();
      const endedAt =
        status === ListingAdvertisementStatus.ENDED
          ? dto.endedAt ?? new Date()
          : null;
      const created = await tx.listingAdvertisement.create({
        data: {
          officeId,
          listingId: link.listingId,
          propertyId: link.propertyId,
          siteId: link.siteId,
          // 매물이 있으면 매물의 거래유형이 기준이다
          transactionType,
          rawJibunAddress: dto.rawJibunAddress ?? null,
          rawRoadAddress: dto.rawRoadAddress ?? null,
          rawSiteName: dto.rawSiteName ?? null,
          rawDong: dto.rawDong ?? null,
          rawHo: dto.rawHo ?? null,
          rawFloorText: dto.rawFloorText ?? null,
          rawAreaM2: dto.rawAreaM2 ?? null,
          floorExposure: dto.floorExposure ?? null,
          channel: dto.channel,
          status,
          source,
          advertisedPrice: dto.advertisedPrice ?? null,
          advertisedDeposit: dto.advertisedDeposit ?? null,
          advertisedMonthlyRent: dto.advertisedMonthlyRent ?? null,
          startedAt: dto.startedAt ?? null,
          endedAt,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          url: dto.url ?? null,
          memo: dto.memo ?? null,
          externalAdId: dto.externalAdId ?? null,
          naverArticleNo: dto.naverArticleNo ?? null,
          naverUrl: dto.naverUrl ?? null,
          lastCheckedAt: dto.lastCheckedAt ?? null,
          lastSyncedAt: dto.lastSyncedAt ?? null,
        },
      });
      await recordAdvertisementHistory(tx, created, {
        observedAt: new Date(observedAt),
        source,
      });
      return created;
    });
  }

  /**
   * 광고 한 줄을 잠그고 고친다. 읽은 값으로 판단해 쓰는 일(가격 이력, 연결 바꾸기)이
   * 동시에 들어온 수집 · 다른 사람의 수정과 서로 덮어쓰지 않게 한다.
   * FOR NO KEY UPDATE: 이 광고를 가리키는 줄(가격 이력 등)을 트랜잭션 밖에서 넣는 일과 막히지 않는다.
   */
  private withAdvertisementLock<T>(
    id: string,
    officeId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM listing_advertisements
        WHERE id = ${id}::uuid AND office_id = ${officeId}::uuid
        FOR NO KEY UPDATE
      `;
      return work(tx);
    });
  }

  async update(id: string, officeId: string, dto: UpdateDto) {
    return this.withAdvertisementLock(id, officeId, (tx) =>
      this.updateLocked(tx, id, officeId, dto),
    );
  }

  private async updateLocked(
    tx: Prisma.TransactionClient,
    id: string,
    officeId: string,
    dto: UpdateDto,
    /** 넣기(create)가 같은 광고를 찾아 이 줄을 고칠 때, 이번에 확인한 연결 */
    link?: AdvertisementLink,
  ) {
    const existing = await tx.listingAdvertisement.findFirst({
      where: { id, officeId },
    });
    if (!existing) {
      throw new NotFoundException("ListingAdvertisement not found");
    }

    if (dto.expected) {
      const stale = (
        ["advertisedPrice", "advertisedDeposit", "advertisedMonthlyRent"] as const
      ).some(
        (key) =>
          dto.expected?.[key] !== undefined &&
          (dto.expected[key] ?? null) !== existing[key],
      );
      if (stale) {
        throw new ConflictException(
          "광고 값이 그 사이 바뀌었습니다. 목록을 새로 고친 뒤 다시 확인해 주세요.",
        );
      }
    }

    if (dto.status !== undefined) {
      this.assertValidStatus(dto.status);
    }
    if (dto.source !== undefined) {
      this.assertValidSource(dto.source);
    }
    assertValidAdvertisementRawFields(dto);
    if (
      dto.transactionType !== undefined &&
      existing.listingId &&
      dto.transactionType !== existing.transactionType
    ) {
      throw new ConflictException(
        "매물에 연결된 광고의 거래유형은 매물을 따릅니다.",
      );
    }
    if (dto.channel !== undefined) {
      if (!dto.channel.trim()) {
        throw new BadRequestException("channel cannot be empty");
      }
      this.assertKnownChannelShape(dto.channel);
      if (dto.channel !== existing.channel && (
        existing.source !== ListingAdvertisementSource.MANUAL ||
        existing.externalAdId || existing.naverArticleNo || existing.naverUrl || existing.lastSyncedAt
      )) {
        throw new ConflictException(
          "외부 광고와 연결된 채널은 변경할 수 없습니다.",
        );
      }
    }
    const nextStatus = dto.status ?? existing.status;
    const nextChannel = dto.channel ?? existing.channel;
    // 종료된 광고를 다시 게재하면 새 줄이 아니라 이 줄이 돌아온다. 종료 시각은 지운다.
    const reactivating =
      existing.status === ListingAdvertisementStatus.ENDED &&
      nextStatus === ListingAdvertisementStatus.ACTIVE;

    const transitioningToEnded =
      dto.status === ListingAdvertisementStatus.ENDED &&
      existing.status !== ListingAdvertisementStatus.ENDED;
    if (nextStatus === ListingAdvertisementStatus.ACTIVE && dto.endedAt != null) {
      throw new BadRequestException("active advertisement cannot have endedAt");
    }
    if (
      nextStatus === ListingAdvertisementStatus.ENDED &&
      dto.endedAt === null
    ) {
      throw new BadRequestException("ended advertisement requires endedAt");
    }

    const endedAt = dto.endedAt;
    const resolvedEndedAt =
      endedAt !== undefined
        ? endedAt
        : transitioningToEnded
          ? new Date()
          : reactivating
            ? null
            : undefined;

    const nextPrice =
      dto.advertisedPrice !== undefined
        ? dto.advertisedPrice
        : existing.advertisedPrice;
    const nextDeposit =
      dto.advertisedDeposit !== undefined
        ? dto.advertisedDeposit
        : existing.advertisedDeposit;
    const nextMonthlyRent =
      dto.advertisedMonthlyRent !== undefined
        ? dto.advertisedMonthlyRent
        : existing.advertisedMonthlyRent;
    const priceChanged =
      nextPrice !== existing.advertisedPrice ||
      nextDeposit !== existing.advertisedDeposit ||
      nextMonthlyRent !== existing.advertisedMonthlyRent;
    const priceObservedAt = dto.lastSyncedAt ?? new Date();

    let updated;
    try {
      updated = await tx.listingAdvertisement.update({
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
        ...(dto.naverArticleNo !== undefined && {
          naverArticleNo: dto.naverArticleNo,
        }),
        ...(dto.naverUrl !== undefined && { naverUrl: dto.naverUrl }),
        ...(dto.lastCheckedAt !== undefined && {
          lastCheckedAt: dto.lastCheckedAt,
        }),
        ...(dto.lastSyncedAt !== undefined && {
          lastSyncedAt: dto.lastSyncedAt,
        }),
        ...(dto.transactionType !== undefined && {
          transactionType: dto.transactionType,
        }),
        ...(dto.rawJibunAddress !== undefined && {
          rawJibunAddress: dto.rawJibunAddress,
        }),
        ...(dto.rawRoadAddress !== undefined && {
          rawRoadAddress: dto.rawRoadAddress,
        }),
        ...(dto.rawSiteName !== undefined && { rawSiteName: dto.rawSiteName }),
        ...(dto.rawDong !== undefined && { rawDong: dto.rawDong }),
        ...(dto.rawHo !== undefined && { rawHo: dto.rawHo }),
        ...(dto.rawFloorText !== undefined && {
          rawFloorText: dto.rawFloorText,
        }),
        ...(dto.rawAreaM2 !== undefined && { rawAreaM2: dto.rawAreaM2 }),
        ...(dto.floorExposure !== undefined && {
          floorExposure: dto.floorExposure,
        }),
        ...(priceChanged && { lastSeenAt: priceObservedAt }),
        // 넣기가 이번에 찾은 연결이 있으면 그것으로 바꾼다. 못 찾았으면 이어 둔 연결을 지우지 않는다.
        ...(link &&
          getAdvertisementLinkLevel(link) !== "none" && {
            listingId: link.listingId,
            propertyId: link.propertyId,
            siteId: link.siteId,
            ...(link.transactionType && {
              transactionType: link.transactionType,
            }),
          }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "같은 매물·같은 채널의 광고가 이미 있습니다. 그 광고를 수정해 주세요.",
        );
      }
      throw error;
    }

    // 게재 상태 · 네이버 번호 · 가격이 달라졌으면 바뀐 뒤의 상태를 이력에 남긴다
    if (advertisementStateChanged(existing, updated)) {
      await recordAdvertisementHistory(tx, updated, {
        observedAt: new Date(priceObservedAt),
        source: dto.source ?? ListingAdvertisementSource.MANUAL,
      });
    }
    return updated;
  }

  /**
   * 광고를 우리 데이터에 연결하거나 연결을 푼다. 아는 가장 깊은 단계 하나만 주면 위 단계는 서버가 채운다.
   * - { listingId }  매물까지 (관리 공간 · 건물이 따라온다)
   * - { propertyId } 관리 공간까지 (매물 연결은 풀린다)
   * - { siteId }     건물까지 (관리 공간 · 매물 연결은 풀린다)
   * - {}             모두 푼다
   * 서버는 스스로 짝을 찾아 묶지 않는다. 층과 가격이 같다는 것만으로는 같은 집이 아니다.
   */
  async link(
    id: string,
    officeId: string,
    dto: {
      listingId?: string | null;
      propertyId?: string | null;
      siteId?: string | null;
    },
  ) {
    return this.withAdvertisementLock(id, officeId, (tx) =>
      this.linkLocked(tx, id, officeId, dto),
    );
  }

  private async linkLocked(
    tx: Prisma.TransactionClient,
    id: string,
    officeId: string,
    dto: {
      listingId?: string | null;
      propertyId?: string | null;
      siteId?: string | null;
    },
  ) {
    const existing = await tx.listingAdvertisement.findFirst({
      where: { id, officeId },
    });
    if (!existing) {
      throw new NotFoundException("ListingAdvertisement not found");
    }
    const link = await resolveAdvertisementLink(tx, officeId, dto);

    // 매물(Listing)은 거래 조건 하나다. 전세 광고를 매매 매물에 이으면 광고의 거래유형이
    // 매물을 따라 바뀌어 보증금 · 매매가를 다른 칸으로 읽게 된다. 같은 집의 다른 조건이면 잇지 않는다.
    if (
      link.listingId &&
      link.transactionType &&
      existing.transactionType &&
      link.transactionType !== existing.transactionType
    ) {
      throw new ConflictException(
        "광고와 거래유형이 다른 매물입니다. 같은 거래유형의 매물에 연결해 주세요.",
      );
    }

    // 이으려는 자리에 같은 채널의 광고가 이미 있으면 같은 광고다 — 그 줄의 이력을 이 줄로 합친다.
    // 둘 다 게재 중이면 같은 집이 두 번 올라가 있는 것이라 거절한다.
    const same = await findSameAdvertisement(
      tx,
      officeId,
      {
        channel: existing.channel,
        listingId: link.listingId,
        propertyId: link.propertyId,
        transactionType: link.transactionType ?? existing.transactionType,
      },
      id,
    );
    if (same.byKey) {
      // 이미 있던 줄이 "지금의 광고"면(예: 그쪽이 게재 중) 남는 줄이 그 상태를 이어받는다
      await mergeAdvertisements(tx, same.byKey, existing);
    }

    return tx.listingAdvertisement.update({
      where: { id },
      data: {
        listingId: link.listingId,
        propertyId: link.propertyId,
        siteId: link.siteId,
        // 매물에 연결하면 매물의 거래유형을 따르고, 풀면 광고가 갖고 있던 값을 둔다
        ...(link.transactionType && { transactionType: link.transactionType }),
      },
    });
  }

  async remove(id: string, officeId: string) {
    const existing = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("ListingAdvertisement not found");
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
        "channel must be lowercase slug (a-z, 0-9, _, -)",
      );
    }
  }

  private resolveSortField(sortBy?: FindAllQuery["sortBy"]) {
    return sortBy &&
      ["createdAt", "updatedAt", "startedAt", "lastCheckedAt"].includes(sortBy)
      ? sortBy
      : "updatedAt";
  }

  private resolveSortOrder(sortOrder?: FindAllQuery["sortOrder"]) {
    return sortOrder === "asc" ? "asc" : "desc";
  }

  /** 같은 채널에 같은 CP 광고 번호로 게재 중인 광고가 있으면 409. 번호가 없으면 판단하지 않는다. */
  private async assertNoActiveExternalDuplicate(
    officeId: string,
    channel: string,
    externalAdId: string | null,
  ) {
    if (!externalAdId) return;
    const conflict = await this.prisma.listingAdvertisement.findFirst({
      where: {
        officeId,
        channel,
        externalAdId,
        status: ListingAdvertisementStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException(
        "같은 채널에 같은 광고 번호로 게재 중인 광고가 이미 있습니다.",
      );
    }
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
        "같은 매물·같은 채널에 이미 게재 중인 광고가 있습니다. 기존 광고를 먼저 종료하세요.",
      );
    }
  }
}

/**
 * 요청한 변경이 광고에 반영됐는지. 서버가 "성공했다"고 추정하지 않고 지금 광고의 값과 견준다.
 * 재광고는 새 광고 줄로 나타나므로 이 광고만 보고는 알 수 없다(null).
 */
export function isChangeRequestFulfilled(
  request: { kind: string; toValue: Prisma.JsonValue | null },
  advertisement: {
    status: string;
    advertisedPrice: number | null;
    advertisedDeposit: number | null;
    advertisedMonthlyRent: number | null;
    floorExposure: string | null;
  },
): boolean | null {
  const target =
    request.toValue && typeof request.toValue === "object" && !Array.isArray(request.toValue)
      ? (request.toValue as Record<string, unknown>)
      : {};
  switch (request.kind) {
    case "price": {
      const pairs: Array<[unknown, number | null]> = [
        [target.price, advertisement.advertisedPrice],
        [target.deposit, advertisement.advertisedDeposit],
        [target.monthlyRent, advertisement.advertisedMonthlyRent],
      ];
      const asked = pairs.filter(([wanted]) => wanted !== undefined);
      if (asked.length === 0) return null;
      return asked.every(([wanted, current]) => wanted === current);
    }
    case "floor_exposure":
      return typeof target.floorExposure === "string"
        ? target.floorExposure === advertisement.floorExposure
        : null;
    case "takedown":
      return advertisement.status === ListingAdvertisementStatus.ENDED;
    default:
      return null;
  }
}
