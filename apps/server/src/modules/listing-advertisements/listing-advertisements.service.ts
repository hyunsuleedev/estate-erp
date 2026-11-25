import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  AdvertisementSyncState,
  ListingAdvertisementChannel,
  ListingAdvertisementStatus,
} from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { OCCUPYING_DEALS_SELECT } from "../listings/listing-state";
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
import { OfficeCpAccountsService } from "./office-cp-accounts.service";
import { toComparisonSet } from "../office-advertisements/office-advertisements.service";

const VALID_STATUSES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementStatus),
);
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);

const OPEN_REQUEST_STATUSES = ["requested", "in_progress", "executed"];
const FAILED_RECENT_DAYS = 7;

export function computeAdvertisementSyncState(advertisement: {
  lastSyncedAt?: Date | string | null;
  manualEditedAt?: Date | string | null;
}): AdvertisementSyncState {
  if (!advertisement.lastSyncedAt) {
    return AdvertisementSyncState.MANUAL;
  }
  if (
    advertisement.manualEditedAt &&
    new Date(advertisement.manualEditedAt).getTime() >
      new Date(advertisement.lastSyncedAt).getTime()
  ) {
    return AdvertisementSyncState.MANUAL_OVERRIDE;
  }
  return AdvertisementSyncState.SYNCED;
}

interface CreateDto extends AdvertisementRawFields {
  /** 광고는 매물 없이도 만들 수 있다. 아는 만큼만 준다(매물 > 관리 공간 > 건물). */
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
  cpAccountId?: string | null;
  accountKey?: string | null;
  channel: string;
  status?: string;
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
  cpAccountId?: string | null;
  accountKey?: string | null;
  channel?: string;
  status?: string;
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

const COMPARISON_ROW_SELECT = {
  id: true,
  officeId: true,
  advertisementId: true,
  articleNo: true,
  sourceUrl: true,
  isMine: true,
  isActive: true,
  articleName: true,
  realtorName: true,
  realtorId: true,
  representativeTelNo: true,
  price: true,
  deposit: true,
  monthlyRent: true,
  ranking: true,
  sameAddrCnt: true,
  articleConfirmYmd: true,
  floorInfo: true,
  floorExposureMode: true,
  verificationTypeCode: true,
  seango: true,
  epju: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdvertisementComparisonSelect;

interface FindAllQuery {
  listingId?: string;
  propertyId?: string;
  cpAccountId?: string;
  link?: AdvertisementLinkFilter;
  /** pending: 아직 끝나지 않은 변경 요청이 걸린 광고만 */
  requests?: "pending";
  channel?: string;
  status?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

@Injectable()
export class ListingAdvertisementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cpAccounts?: OfficeCpAccountsService,
  ) {}

  async findAll(officeId: string, query: FindAllQuery = {}) {
    if (query.status) {
      this.assertValidStatus(query.status);
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
    if (query.cpAccountId) {
      filters.push({ cpAccountId: query.cpAccountId });
    }
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.search) {
      filters.push({
        OR: [
          { channel: { contains: query.search, mode: "insensitive" } },
          { status: { contains: query.search, mode: "insensitive" } },
          { memo: { contains: query.search, mode: "insensitive" } },
          { externalAdId: { contains: query.search, mode: "insensitive" } },
          { providerStatus: { contains: query.search, mode: "insensitive" } },
          { naverArticleNo: { contains: query.search, mode: "insensitive" } },
          { url: { contains: query.search, mode: "insensitive" } },
          { naverUrl: { contains: query.search, mode: "insensitive" } },
          { cpAccount: { accountKey: { contains: query.search, mode: "insensitive" } } },
          { cpAccount: { accountName: { contains: query.search, mode: "insensitive" } } },
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
          "연결 단계 값이 올바르지 않습니다.",
        );
      }
      filters.push(linkFilter);
    }
    if (query.requests === "pending") {
      filters.push({
        changeRequests: {
          some: { status: { in: OPEN_REQUEST_STATUSES } },
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
    const recentFailedSince = new Date(
      Date.now() - FAILED_RECENT_DAYS * 86_400_000,
    );

    const [items, total, officeOwnRows] = await Promise.all([
      this.prisma.listingAdvertisement.findMany({
        where,
        include: {
          cpAccount: {
            select: {
              id: true,
              channel: true,
              accountKey: true,
              accountName: true,
            },
          },
          listing: {
            include: {
              property: { include: PLACE_INCLUDE },
              // 끝난 의뢰 · 거래 중 · 옵션 중단 광고를 알아보기 위한 최소 상태
              intake: { select: { id: true, lifecycleStatus: true, closedReason: true } },
              deals: OCCUPYING_DEALS_SELECT,
            },
          },
          property: { include: PLACE_INCLUDE },
          site: true,
          changeRequests: {
            where: {
              OR: [
                { status: { in: OPEN_REQUEST_STATUSES } },
                { status: "failed", updatedAt: { gte: recentFailedSince } },
              ],
            },
            include: {
              cpAccount: {
                select: { id: true, accountKey: true, accountName: true },
              },
              assignedTo: { select: { id: true, name: true } },
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  assignedToId: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: "desc" as const },
          },
          comparisons: {
            select: COMPARISON_ROW_SELECT,
          },
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
      this.prisma.listingAdvertisement.findMany({
        where: {
          officeId,
          status: ListingAdvertisementStatus.ACTIVE,
          naverArticleNo: { not: null },
        },
        select: { naverArticleNo: true },
      }),
    ]);

    const officeOwnArticleNos = new Set(
      (officeOwnRows ?? [])
        .map((row) => row.naverArticleNo)
        .filter((no): no is string => Boolean(no)),
    );

    return {
      items: items.map(({ comparisons, comparisonRecords, ...item }) => {
        // 네이버 비교 한 벌: 읽은 시각, 내 줄, 전체 줄. 비교한 적이 없으면 null
        const comparison = toComparisonSet(
          item.naverArticleNo,
          comparisons,
          comparisonRecords[0]?.observedAt ?? null,
          officeOwnArticleNos,
        );
        const own = comparison?.ownAdvertisement ?? null;
        return {
          ...item,
          syncState: computeAdvertisementSyncState(item),
          comparison,
          // 화면의 "매물 연결됨 / 매물 없음 / 호실 못 찾음 / 건물 못 찾음". 저장하지 않고 세 칸에서 계산한다.
          linkLevel: getAdvertisementLinkLevel(item),
          changeRequests: item.changeRequests.map((request) => ({
            ...request,
            fulfilled: isChangeRequestFulfilled(request, item),
          })),
          actionContext: {
            ownAdvertisementId: own?.id ?? null,
            observedAt: comparison?.observedAt ?? own?.lastSeenAt ?? null,
            isActive: own?.isActive ?? null,
            price: own?.price ?? null,
            deposit: own?.deposit ?? null,
            monthlyRent: own?.monthlyRent ?? null,
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
   * 광고 한 건의 흐름: 내 광고가 어떻게 바뀌었는지(이력)와 그때그때 시장에서 어디 있었는지(비교 기록),
   * 그리고 걸렸던 변경 요청 이력. 화면이 시간순으로 함께 놓아 보여 준다.
   */
  async findTimeline(id: string, officeId: string) {
    const advertisement = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!advertisement) {
      throw new NotFoundException("광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    }
    const [histories, comparisonRecords, changeRequests] = await Promise.all([
      this.prisma.listingAdvertisementHistory.findMany({
        where: { officeId, listingAdvertisementId: id },
        select: {
          id: true,
          status: true,
          naverArticleNo: true,
          externalAdId: true,
          floorExposure: true,
          advertisedPrice: true,
          advertisedDeposit: true,
          advertisedMonthlyRent: true,
          observedAt: true,
          source: true,
          createdAt: true,
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
        orderBy: [{ observedAt: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.advertisementChangeRequest.findMany({
        where: { officeId, advertisementId: id },
        select: {
          id: true,
          action: true,
          status: true,
          targetValue: true,
          baseSnapshot: true,
          failureReason: true,
          memo: true,
          assignedToId: true,
          executedAt: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
          cpAccount: {
            select: { id: true, accountKey: true, accountName: true },
          },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { histories, comparisonRecords, changeRequests };
  }

  async findPriceHistory(officeId: string, listingId: string) {
    if (!listingId) {
      throw new BadRequestException("매물을 선택해 주세요.");
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, officeId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException("선택한 매물을 찾을 수 없습니다. 매물이 삭제되었는지 확인해 주세요.");
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
        externalAdId: true,
        floorExposure: true,
        advertisedPrice: true,
        advertisedDeposit: true,
        advertisedMonthlyRent: true,
        observedAt: true,
        source: true,
        createdAt: true,
        advertisement: {
          select: {
            channel: true,
            cpAccountId: true,
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
      throw new BadRequestException("광고 채널을 선택해 주세요.");
    }
    const channel = dto.channel.trim();
    const status = dto.status ?? ListingAdvertisementStatus.ACTIVE;
    this.assertValidStatus(status);
    this.assertKnownChannelShape(channel);
    assertValidAdvertisementRawFields(dto);

    if (status === ListingAdvertisementStatus.ACTIVE && dto.endedAt != null) {
      throw new BadRequestException("광고 중인 광고에는 종료일을 넣을 수 없습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      // 매물 없이도 만든다. 준 연결을 확인하고 위 단계(관리 공간 · 건물)를 채운다.
      const link = await resolveAdvertisementLink(tx, officeId, dto);
      const cpAccountId = this.cpAccounts
        ? await this.cpAccounts.resolveAccountForChannel(tx, officeId, channel, dto)
        : (dto.cpAccountId?.trim() || null);
      const transactionType = link.transactionType ?? dto.transactionType ?? null;

      // 같은 광고가 이미 있으면 새 줄을 만들지 않는다 (재광고 · 다시 게재는 같은 줄의 변화다)
      const same = await findSameAdvertisement(tx, officeId, {
        channel,
        cpAccountId,
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
        same.byKey = await mergeAdvertisements(tx, same.byExternalAdId, same.byKey);
      }
      const existing = same.byKey ?? same.byExternalAdId;
      if (existing) {
        // 이미 게재 중인 광고가 있으면 status='ended'를 포함한 수동 등록으로 덮어쓰지 않는다.
        // 외부 sync(lastSyncedAt 제공)가 종료된 광고를 되살릴 때만 동일 row를 갱신한다.
        if (
          existing.status === ListingAdvertisementStatus.ACTIVE &&
          !dto.lastSyncedAt
        ) {
          throw new ConflictException(
            status === ListingAdvertisementStatus.ACTIVE
              ? "같은 매물·같은 채널(계정)에 이미 게재 중인 광고가 있습니다. 기존 광고를 수정해 주세요."
              : "같은 매물·같은 채널(계정)에 게재 중인 광고가 있습니다. 그 광고가 끝났다면 기존 광고를 종료로 바꿔 주세요.",
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
          { ...dto, channel, cpAccountId, status, transactionType: undefined },
          link,
        );
      }

      const observedAt = dto.lastSyncedAt ?? new Date();
      const historySource = dto.lastSyncedAt ? "cp_sync" : "manual";
      const endedAt =
        status === ListingAdvertisementStatus.ENDED
          ? dto.endedAt ?? new Date()
          : null;
      let created;
      try {
        created = await tx.listingAdvertisement.create({
          data: {
            officeId,
            cpAccountId,
            listingId: link.listingId,
            propertyId: link.propertyId,
            siteId: link.siteId,
            transactionType,
            rawJibunAddress: dto.rawJibunAddress ?? null,
            rawRoadAddress: dto.rawRoadAddress ?? null,
            rawSiteName: dto.rawSiteName ?? null,
            rawDong: dto.rawDong ?? null,
            rawHo: dto.rawHo ?? null,
            rawFloorText: dto.rawFloorText ?? null,
            rawAreaM2: dto.rawAreaM2 ?? null,
            floorExposure: dto.floorExposure ?? null,
            channel,
            status,
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
            manualEditedAt: dto.lastSyncedAt ? null : null,
          },
        });
      } catch (error) {
        this.rethrowUniqueConflict(error);
      }
      await recordAdvertisementHistory(tx, created, {
        observedAt: new Date(observedAt),
        source: historySource,
      });
      return created;
    });
  }

  /**
   * 광고 한 줄을 잠그고 고친다.
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
      throw new NotFoundException("광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
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
    const normalizedChannel = dto.channel?.trim();
    if (dto.channel !== undefined) {
      if (!normalizedChannel) {
        throw new BadRequestException("광고 채널을 선택해 주세요.");
      }
      this.assertKnownChannelShape(normalizedChannel);
      if (
        normalizedChannel !== existing.channel &&
        (existing.lastSyncedAt ||
          existing.externalAdId ||
          existing.naverArticleNo ||
          existing.naverUrl)
      ) {
        throw new ConflictException(
          "외부 광고와 연결된 채널은 변경할 수 없습니다.",
        );
      }
    }
    const effectiveChannel = normalizedChannel ?? existing.channel;
    let nextCpAccountId: string | null | undefined;
    if (dto.cpAccountId !== undefined || dto.accountKey !== undefined) {
      if (dto.cpAccountId === null && !dto.accountKey) {
        nextCpAccountId = null;
      } else if (this.cpAccounts) {
        nextCpAccountId = await this.cpAccounts.resolveAccountForChannel(
          tx,
          officeId,
          effectiveChannel,
          dto,
        );
      } else {
        nextCpAccountId = dto.cpAccountId?.trim() || null;
      }
    }

    const nextStatus = dto.status ?? existing.status;
    const reactivating =
      existing.status === ListingAdvertisementStatus.ENDED &&
      nextStatus === ListingAdvertisementStatus.ACTIVE;

    const transitioningToEnded =
      dto.status === ListingAdvertisementStatus.ENDED &&
      existing.status !== ListingAdvertisementStatus.ENDED;
    if (nextStatus === ListingAdvertisementStatus.ACTIVE && dto.endedAt != null) {
      throw new BadRequestException("광고 중인 광고에는 종료일을 넣을 수 없습니다.");
    }
    if (
      nextStatus === ListingAdvertisementStatus.ENDED &&
      dto.endedAt === null
    ) {
      throw new BadRequestException("광고 종료일을 입력해 주세요.");
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
    const observedAt = dto.lastSyncedAt ?? new Date();

    // 메모·연결이 아닌 CP 동기화 대상 필드(가격 · 상태 · 층노출 · 날짜 · 식별자 · 계정)를
    // 사람이 직접 고친 경우 manualEditedAt을 찍어 오래된 스냅샷이 덮지 않게 한다.
    const isCpSyncedFieldEdited =
      !dto.lastSyncedAt &&
      ((normalizedChannel !== undefined && normalizedChannel !== existing.channel) ||
        (dto.status !== undefined && dto.status !== existing.status) ||
        (dto.advertisedPrice !== undefined && dto.advertisedPrice !== existing.advertisedPrice) ||
        (dto.advertisedDeposit !== undefined && dto.advertisedDeposit !== existing.advertisedDeposit) ||
        (dto.advertisedMonthlyRent !== undefined && dto.advertisedMonthlyRent !== existing.advertisedMonthlyRent) ||
        (dto.floorExposure !== undefined && dto.floorExposure !== existing.floorExposure) ||
        (dto.startedAt !== undefined && String(dto.startedAt ?? "") !== String(existing.startedAt ?? "")) ||
        (resolvedEndedAt !== undefined && String(resolvedEndedAt ?? "") !== String(existing.endedAt ?? "")) ||
        (dto.url !== undefined && dto.url !== existing.url) ||
        (dto.externalAdId !== undefined && dto.externalAdId !== existing.externalAdId) ||
        (dto.naverArticleNo !== undefined && dto.naverArticleNo !== existing.naverArticleNo) ||
        (dto.naverUrl !== undefined && dto.naverUrl !== existing.naverUrl) ||
        (nextCpAccountId !== undefined && nextCpAccountId !== existing.cpAccountId));

    let updated;
    try {
      updated = await tx.listingAdvertisement.update({
        where: { id },
        data: {
          ...(normalizedChannel !== undefined && { channel: normalizedChannel }),
          ...(nextCpAccountId !== undefined && { cpAccountId: nextCpAccountId }),
          ...(dto.status !== undefined && { status: dto.status }),
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
          ...(isCpSyncedFieldEdited && {
            manualEditedAt: new Date(),
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
          ...(priceChanged && { lastSeenAt: observedAt }),
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
      this.rethrowUniqueConflict(error);
    }

    // 게재 상태 · 네이버 번호 · CP번호 · 층노출 · 가격이 달라졌으면 바뀐 뒤의 상태를 이력에 남긴다
    if (advertisementStateChanged(existing, updated)) {
      await recordAdvertisementHistory(tx, updated, {
        observedAt: new Date(observedAt),
        source: dto.lastSyncedAt ? "cp_sync" : "manual",
      });
    }
    return updated;
  }

  /**
   * 광고를 우리 데이터에 연결하거나 연결을 푼다. 아는 가장 깊은 단계 하나만 주면 위 단계는 서버가 채운다.
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
      throw new NotFoundException("광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    }
    const link = await resolveAdvertisementLink(tx, officeId, dto);

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

    // 이으려는 자리에 같은 채널·계정의 광고가 이미 있으면 같은 광고다 — 그 줄의 이력을 이 줄로 합친다.
    const same = await findSameAdvertisement(
      tx,
      officeId,
      {
        channel: existing.channel,
        cpAccountId: existing.cpAccountId,
        listingId: link.listingId,
        propertyId: link.propertyId,
        transactionType: link.transactionType ?? existing.transactionType,
      },
      id,
    );
    if (same.byKey) {
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
      throw new NotFoundException("광고를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.");
    }
    return this.prisma.listingAdvertisement.delete({ where: { id } });
  }

  private assertValidStatus(status: string) {
    if (!VALID_STATUSES.has(status)) {
      throw new BadRequestException(`광고 상태를 확인해 주세요. (${status})`);
    }
  }

  private assertKnownChannelShape(channel: string) {
    if (KNOWN_CHANNELS.has(channel)) return;
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(channel)) {
      throw new BadRequestException("광고 채널을 선택해 주세요.");
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

  private rethrowUniqueConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = JSON.stringify(error.meta?.target ?? "") + error.message;
      if (target.includes("external_ad_id")) {
        throw new ConflictException(
          "같은 CP 광고번호로 게재 중인 광고가 이미 있습니다. 광고번호를 확인해 주세요.",
        );
      }
      throw new ConflictException(
        "같은 매물·같은 채널(계정)의 광고가 이미 있습니다. 그 광고를 수정해 주세요.",
      );
    }
    throw error;
  }
}

/**
 * 요청한 변경이 광고에 반영됐는지. 서버가 "성공했다"고 추정하지 않고 지금 광고의 값과 견준다.
 */
export function isChangeRequestFulfilled(
  request: {
    action: string;
    targetValue?: Prisma.JsonValue | null;
    baseSnapshot?: Prisma.JsonValue | null;
  },
  advertisement: {
    status: string;
    advertisedPrice: number | null;
    advertisedDeposit: number | null;
    advertisedMonthlyRent: number | null;
    floorExposure: string | null;
    naverArticleNo?: string | null;
  },
): boolean | null {
  const target =
    request.targetValue &&
    typeof request.targetValue === "object" &&
    !Array.isArray(request.targetValue)
      ? (request.targetValue as Record<string, unknown>)
      : {};
  const base =
    request.baseSnapshot &&
    typeof request.baseSnapshot === "object" &&
    !Array.isArray(request.baseSnapshot)
      ? (request.baseSnapshot as Record<string, unknown>)
      : {};
  switch (request.action) {
    case "publish":
      return advertisement.status === ListingAdvertisementStatus.ACTIVE;
    case "update": {
      const checks: boolean[] = [];
      for (const [key, current] of [
        ["price", advertisement.advertisedPrice],
        ["deposit", advertisement.advertisedDeposit],
        ["monthlyRent", advertisement.advertisedMonthlyRent],
        ["floorExposure", advertisement.floorExposure],
      ] as const) {
        if (target[key] !== undefined) {
          checks.push(target[key] === current);
        }
      }
      if (checks.length === 0) return null;
      return checks.every(Boolean);
    }
    case "takedown":
      return advertisement.status === ListingAdvertisementStatus.ENDED;
    case "readvertise":
      if (
        typeof base.naverArticleNo === "string" &&
        advertisement.naverArticleNo &&
        advertisement.naverArticleNo !== base.naverArticleNo
      ) {
        return true;
      }
      if (
        base.status === ListingAdvertisementStatus.ENDED &&
        advertisement.status === ListingAdvertisementStatus.ACTIVE
      ) {
        return true;
      }
      return null;
    default:
      return null;
  }
}
