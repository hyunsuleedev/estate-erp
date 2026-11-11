import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_TRANSACTION_TYPES = new Set(['sale', 'jeonse', 'monthly']);
const VALID_STATUSES = new Set(['unmatched', 'verified', 'on_hold']);

const MAX_BATCH_SIZE = 100;
const SNAPSHOT_TRANSACTION_TIMEOUT_MS = 30_000;
/** 열린 스냅샷에서 수정할 수 있는 광고 항목. 번호와 그룹 정보는 바꾸지 않는다. */
const SNAPSHOT_EDITABLE_FIELDS = [
  'price',
  'deposit',
  'monthlyRent',
  'articleName',
  'articleFeatureDesc',
  'detailDescription',
  'articleConfirmYmd',
  'floorInfo',
  'direction',
  'realtorName',
  'representativeTelNo',
  'ranking',
  'sourceUrl',
] as const;

type DiscoveryStatus = 'new' | 'added' | 'existing';

export interface FindGroupsQuery {
  transactionType?: string;
  siteIds?: string;
  status?: string;
  search?: string;
  /** 단일 단지 스코프 (bucket 지정 시 필수) */
  siteId?: string;
  /** 스냅샷 세션 모드에서 신규/구 탭 지정 */
  bucket?: 'new' | 'old' | 'all';
  /** 기본은 isActive=true인 listing이 있는 그룹만. admin/debug용 */
  includeInactive?: boolean;
}

export interface CreateSessionDto {
  siteId: string;
  transactionType: string;
}

export interface UpdateGroupDto {
  ho?: string | null;
  memo?: string | null;
  status?: string;
  favorite?: boolean;
}

export interface BatchListingItem {
  articleNo: string;
  sourceUrl?: string | null;
  cpName?: string | null;
  cpid?: string | null;
  cpPcArticleUrl?: string | null;
  sameAddrCnt?: number | null;
  sameAddrDirectCnt?: number | null;
  sameAddrMaxPrc?: string | null;
  sameAddrMinPrc?: string | null;
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  articleName?: string | null;
  articleFeatureDesc?: string | null;
  detailDescription?: string | null;
  articleConfirmYmd?: string | null;
  floorInfo?: string | null;
  exclusiveAreaM2?: number | null;
  supplyAreaM2?: number | null;
  direction?: string | null;
  tagList?: unknown;
  verificationTypeCode?: string | null;
  realtorId?: string | null;
  realtorName?: string | null;
  originalRealtorName?: string | null;
  representativeTelNo?: string | null;
  ranking?: number | null;
  isSharedRank?: boolean | null;
  sharedRank?: number | null;
  sameRankNum?: number | null;
  seango?: boolean | null;
  epju?: boolean | null;
  exposeStartYmd?: number | null;
  exposeEndYmd?: number | null;
  priceChangeState?: string | null;
  isPriceModification?: boolean | null;
  // 그룹 생성 힌트 (새 그룹 생성 시에만 사용, 기존 그룹의 사용자 입력은 덮어쓰지 않음)
  buildingName?: string | null;
  areaName?: string | null;
  ho?: string | null;
}

/** 동일 매물의 광고 묶음. 대표는 항상 지정하며 listings 안에 있어야 한다. */
export interface ListingGroupInput {
  representativeArticleNo: string;
  listings: BatchListingItem[];
}

export interface BatchUpsertDto {
  /** 열린 스냅샷. 단지와 거래유형은 세션에서 결정된다. */
  sessionId: string;
  source: string;
  batchId?: string; // 로그용 (DB 저장 안 함)
  groups: ListingGroupInput[];
}

export interface AddSnapshotListingDto {
  source: string;
  listing: BatchListingItem;
}

export type SnapshotListingPatch = Partial<
  Pick<BatchListingItem, (typeof SNAPSHOT_EDITABLE_FIELDS)[number]>
>;

export interface BatchUpsertResult {
  batchId?: string;
  received: number;
  created: number;
  updated: number;
  groupsCreated: number;
  groupsReused: number;
}

export interface CompleteSessionOptions {
  /** 입력한 광고 수. 실제 입력 건수와 다르면 스냅샷을 닫지 않는다. */
  expectedListingCount?: number;
}

export interface KeepSnapshotListingsDto {
  groupIds: string[];
}

interface PriceTerms {
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

function isSamePrice(a: PriceTerms, b: PriceTerms): boolean {
  return (
    a.price === b.price &&
    a.deposit === b.deposit &&
    a.monthlyRent === b.monthlyRent
  );
}

/** 스냅샷을 닫을 때 직전 완료 스냅샷과 비교한 결과. */
export interface SnapshotComparison {
  /** 비교할 이전 스냅샷이 없어 모든 입력이 신규로 잡힌 경우 true. */
  isBaseline: boolean;
  newGroups: Array<{
    groupId: string;
    representativeArticleNo: string | null;
    articleNos: string[];
  }>;
  addedListings: Array<{ groupId: string; articleNo: string }>;
  removedGroups: Array<{ groupId: string; articleNos: string[] }>;
  removedListings: Array<{ groupId: string; articleNo: string }>;
  priceChanges: Array<{
    groupId: string;
    articleNo: string;
    before: PriceTerms;
    after: PriceTerms;
  }>;
}

@Injectable()
export class ExternalListingsService {
  private readonly logger = new Logger(ExternalListingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAllGroups(officeId: string, query: FindGroupsQuery) {
    const where: Prisma.ExternalListingGroupWhereInput = { officeId };

    if (query.transactionType) {
      if (!VALID_TRANSACTION_TYPES.has(query.transactionType)) {
        throw new BadRequestException('Invalid transactionType');
      }
      where.transactionType = query.transactionType;
    }

    if (query.status) {
      if (!VALID_STATUSES.has(query.status)) {
        throw new BadRequestException('Invalid status');
      }
      where.status = query.status;
    }

    // siteId (단일) + siteIds (다중) 모두 수용. 둘 다 오면 siteId가 우선.
    if (query.siteId) {
      where.siteId = query.siteId;
    } else if (query.siteIds) {
      const ids = query.siteIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) {
        where.siteId = { in: ids };
      }
    }

    if (query.search) {
      const q = query.search.trim();
      if (q) {
        where.OR = [
          { ho: { contains: q, mode: 'insensitive' } },
          { buildingName: { contains: q, mode: 'insensitive' } },
          { areaName: { contains: q, mode: 'insensitive' } },
          { memo: { contains: q, mode: 'insensitive' } },
          { site: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }

    // 버킷 필터 — 스냅샷 세션 모드
    let bucketSession: { startedAt: Date; transactionType: string } | null =
      null;
    if (query.bucket && query.bucket !== 'all') {
      if (!query.siteId || !query.transactionType) {
        throw new BadRequestException(
          'bucket requires siteId and transactionType',
        );
      }
      // 스냅샷이 방금 닫혔으면 탭 구분이 없으므로 일반 목록을 돌려준다.
      bucketSession =
        await this.prisma.externalListingSnapshotSession.findFirst({
          where: {
            officeId,
            siteId: query.siteId,
            transactionType: query.transactionType,
            status: 'active',
          },
        });
    }
    if (bucketSession) {
      // 활성 광고가 있는 그룹을 두 탭이 빠짐없이 나눈다. 이번에 입력했다가 내린 광고는
      // 어느 쪽 판단에도 쓰지 않는다.
      const enteredActive: Prisma.ExternalListingWhereInput = {
        lastSeenAt: { gte: bucketSession.startedAt },
        transactionType: bucketSession.transactionType,
        isActive: true,
      };
      if (query.bucket === 'new') {
        where.listings = { some: enteredActive };
      } else {
        // 'old' — 활성 광고가 남아 있지만 그중 이번에 입력된 것은 없는 그룹
        where.listings = { none: enteredActive, some: { isActive: true } };
      }
    } else if (!query.includeInactive) {
      // 기본: active listing이 하나라도 있는 그룹만 보여줌.
      // Group 자체에는 isActive 필드가 없으므로 listings를 통해 판단.
      where.listings = { some: { isActive: true } };
    }

    const groups = await this.prisma.externalListingGroup.findMany({
      where,
      include: {
        site: true,
        mainExternalListing: true,
        // Pull all listings so we can compute group-level aggregates
        // (price min/max, confirm-date min/max, offer ranking) without
        // extra round-trips. Groups generally have < 20 listings each.
        listings: {
          where: { isActive: true },
          select: {
            id: true,
            source: true,
            articleNo: true,
            price: true,
            deposit: true,
            monthlyRent: true,
            transactionType: true,
            articleConfirmYmd: true,
            verificationTypeCode: true,
            ranking: true,
            seango: true,
            epju: true,
            firstSeenAt: true,
          },
        },
        _count: { select: { listings: { where: { isActive: true } } } },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    // 각 단지·거래유형의 현재 세션(없으면 마지막 완료 세션)을 기준으로
    // 이번 수집에서 처음 등장한 동일주소 그룹/광고를 구분한다. cancelled 세션은
    // 비교 기준에서 제외해 취소된 작업이 다음 조회의 상태를 바꾸지 않게 한다.
    const scopePairs = [
      ...new Map(
        groups.map((group) => [
          `${group.siteId}:${group.transactionType}`,
          { siteId: group.siteId, transactionType: group.transactionType },
        ]),
      ).values(),
    ];
    const comparisonSessions =
      scopePairs.length === 0
        ? []
        : await this.prisma.externalListingSnapshotSession.findMany({
            where: {
              officeId,
              status: { in: ['active', 'completed'] },
              OR: scopePairs,
            },
            select: {
              siteId: true,
              transactionType: true,
              startedAt: true,
              completedAt: true,
            },
            orderBy: { startedAt: 'desc' },
          });
    const comparisonStartedAtByScope = new Map<string, Date>();
    // 가격 변경 표시는 스냅샷 닫기 결과와 같은 기준을 쓴다. 마지막 스냅샷 직전의 완료
    // 시각이라, 그사이 취소된 시도에서 바뀐 가격도 함께 잡힌다.
    const priceChangeSinceByScope = new Map<string, Date>();
    for (const session of comparisonSessions) {
      const scopeKey = `${session.siteId}:${session.transactionType}`;
      if (!comparisonStartedAtByScope.has(scopeKey)) {
        comparisonStartedAtByScope.set(scopeKey, session.startedAt);
      } else if (!priceChangeSinceByScope.has(scopeKey) && session.completedAt) {
        priceChangeSinceByScope.set(scopeKey, session.completedAt);
      }
    }

    const activeArticleNos = [
      ...new Set(
        groups.flatMap((group) =>
          group.listings.map((listing) => listing.articleNo),
        ),
      ),
    ];
    const ownAdvertisements =
      activeArticleNos.length === 0
        ? []
        : await this.prisma.officeAdvertisement.findMany({
            where: {
              officeId,
              isMine: true,
              isActive: true,
              articleNo: { in: activeArticleNos },
            },
            select: {
              articleNo: true,
              articleConfirmYmd: true,
              ranking: true,
            },
          });
    const ownAdvertisementByListing = new Map(
      ownAdvertisements.map((advertisement) => [
        advertisement.articleNo,
        advertisement,
      ]),
    );

    return groups.map((group) => {
      const listings = group.listings ?? [];
      const scopeKey = `${group.siteId}:${group.transactionType}`;
      const comparisonStartedAt = comparisonStartedAtByScope.get(scopeKey);
      const discoveryStatus = this.getDiscoveryStatus(
        group.firstSeenAt,
        listings,
        comparisonStartedAt,
      );
      // Pick the right price field for this group's transactionType
      const priceField: 'price' | 'deposit' =
        group.transactionType === 'sale' ? 'price' : 'deposit';
      const prices = listings
        .map((l) => l[priceField])
        .filter((v): v is number => v != null && v > 0);
      const priceMin = prices.length ? Math.min(...prices) : null;
      const priceMax = prices.length ? Math.max(...prices) : null;

      // Confirm dates (YYYYMMDD string). Max = most recent confirm.
      const ymds = listings
        .map((l) => l.articleConfirmYmd)
        .filter((v): v is string => !!v && v.length === 8);
      ymds.sort();
      const minYmd = ymds[0] ?? null;
      const maxYmd = ymds[ymds.length - 1] ?? null;
      let confirmDateDiff: number | null = null;
      if (maxYmd) {
        const y = Number(maxYmd.slice(0, 4));
        const m = Number(maxYmd.slice(4, 6));
        const d = Number(maxYmd.slice(6, 8));
        const confirmDate = new Date(y, m - 1, d);
        confirmDateDiff = Math.max(
          0,
          Math.floor(
            (Date.now() - confirmDate.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );
      }

      // Owner-verified if main listing has OWNER-family verification.
      const main = group.mainExternalListing;
      const ownerVerified =
        !!main?.verificationTypeCode &&
        main.verificationTypeCode.startsWith('OWNER');
      const ownAdvertisement = listings
        .flatMap((listing) => {
          const advertisement = ownAdvertisementByListing.get(
            listing.articleNo,
          );
          return advertisement ? [advertisement] : [];
        })
        .sort((left, right) =>
          (right.articleConfirmYmd ?? '').localeCompare(
            left.articleConfirmYmd ?? '',
          ),
        )[0];

      return {
        ...group,
        listings: undefined,
        listingCount: group._count.listings,
        _count: undefined,
        // ── Aggregates for the row ────────────────────────────────
        priceMin,
        priceMax,
        minYmd,
        maxYmd,
        confirmDateDiff,
        ownerVerified,
        discoveryStatus,
        priceChangeSince: priceChangeSinceByScope.get(scopeKey) ?? null,
        ownAdvertisementYmd: ownAdvertisement?.articleConfirmYmd ?? null,
        offerRanking: ownAdvertisement?.ranking ?? main?.ranking ?? null,
      };
    });
  }

  private getDiscoveryStatus(
    groupFirstSeenAt: Date,
    listings: Array<{ firstSeenAt: Date }>,
    comparisonStartedAt?: Date,
  ): DiscoveryStatus {
    if (!comparisonStartedAt) return 'existing';

    if (groupFirstSeenAt >= comparisonStartedAt) {
      return 'new';
    }

    if (
      listings.some((listing) => listing.firstSeenAt >= comparisonStartedAt)
    ) {
      return 'added';
    }

    return 'existing';
  }

  // ─────────────────────────────────────────────────────────────
  // 스냅샷 세션
  // ─────────────────────────────────────────────────────────────

  /**
   * 새 스냅샷 세션 생성. 같은 (office, site, transactionType) 스코프에 active
   * 세션이 이미 있으면 409. DB 부분 유니크 인덱스가 최종 경주 조건을 막는다.
   */
  async createSession(officeId: string, userId: string, dto: CreateSessionDto) {
    if (!VALID_TRANSACTION_TYPES.has(dto.transactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }

    const site = await this.prisma.site.findFirst({
      where: {
        id: dto.siteId,
        OR: [{ officeId }, { isPublic: true }],
      },
      select: { id: true },
    });
    if (!site) {
      throw new BadRequestException('siteId not accessible');
    }

    const existing = await this.prisma.externalListingSnapshotSession.findFirst(
      {
        where: {
          officeId,
          siteId: dto.siteId,
          transactionType: dto.transactionType,
          status: 'active',
        },
        include: {
          startedBy: { select: { id: true, name: true } },
        },
      },
    );
    if (existing) {
      throw new ConflictException({
        message: 'active session exists for scope',
        session: existing,
      });
    }

    try {
      return await this.prisma.externalListingSnapshotSession.create({
        data: {
          officeId,
          siteId: dto.siteId,
          transactionType: dto.transactionType,
          startedById: userId,
        },
        include: {
          startedBy: { select: { id: true, name: true } },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('active session exists for scope');
      }
      throw err;
    }
  }

  async getActiveSession(
    officeId: string,
    siteId: string,
    transactionType: string,
  ) {
    if (!VALID_TRANSACTION_TYPES.has(transactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }
    const session = await this.prisma.externalListingSnapshotSession.findFirst({
      where: { officeId, siteId, transactionType, status: 'active' },
      include: { startedBy: { select: { id: true, name: true } } },
    });
    if (!session) return null;

    // 닫기 전에 결과를 보여줄 수 있도록 남는 광고와 내려갈 광고 수를 함께 준다.
    const scope = {
      officeId,
      transactionType: session.transactionType,
      group: { siteId: session.siteId },
    };
    const [receivedListingCount, pendingRemovalCount] = await Promise.all([
      this.prisma.externalListing.count({
        where: { ...scope, lastSeenAt: { gte: session.startedAt } },
      }),
      this.prisma.externalListing.count({
        where: {
          ...scope,
          lastSeenAt: { lt: session.startedAt },
          isActive: true,
        },
      }),
    ]);
    return { ...session, receivedListingCount, pendingRemovalCount };
  }

  /**
   * 세션 완료. 입력 건수를 확인한 뒤 세션 시작 이후 입력되지 않은 external_listings
   * 행을 is_active=false로 소프트 삭제하고 직전 완료 스냅샷과의 비교 결과를 돌려준다.
   * Group은 건드리지 않는다.
   */
  async completeSession(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
    options: CompleteSessionOptions = {},
  ) {
    const { expectedListingCount } = options;
    if (
      expectedListingCount !== undefined &&
      (!Number.isInteger(expectedListingCount) || expectedListingCount < 0)
    ) {
      throw new BadRequestException(
        'expectedListingCount는 0 이상의 정수여야 합니다.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const session = await this.lockActiveSession(tx, officeId, sessionId);
        this.ensureCanManageSession(session, userId, userRole);

        const scope = {
          officeId,
          transactionType: session.transactionType,
          group: { siteId: session.siteId },
        };

        const received = await tx.externalListing.findMany({
          where: { ...scope, lastSeenAt: { gte: session.startedAt } },
          select: {
            groupId: true,
            articleNo: true,
            firstSeenAt: true,
            priceChangedAt: true,
            price: true,
            deposit: true,
            monthlyRent: true,
            previousPrice: true,
            previousDeposit: true,
            previousMonthlyRent: true,
            group: {
              select: {
                firstSeenAt: true,
                mainExternalListing: { select: { articleNo: true } },
              },
            },
          },
        });

        // 일부만 입력하고 닫으면 나머지가 사라진 매물로 처리되므로 먼저 막는다.
        if (
          expectedListingCount !== undefined &&
          expectedListingCount !== received.length
        ) {
          throw new BadRequestException(
            `입력 건수가 일치하지 않습니다. 선언 ${expectedListingCount}건, 실제 ${received.length}건. 스냅샷은 열린 상태로 유지됩니다.`,
          );
        }
        if (received.length === 0 && expectedListingCount !== 0) {
          throw new BadRequestException(
            '입력된 광고가 없습니다. 모두 내리려면 입력 건수 0건을 확인해 주세요.',
          );
        }

        const previousCompletedAt = await this.findPreviousCompletedAt(
          tx,
          officeId,
          session,
        );
        // 취소된 시도에서 먼저 저장된 변경도 놓치지 않도록 직전 완료 시각을 기준으로 삼는다.
        const since = previousCompletedAt ?? new Date(0);

        const stale = await tx.externalListing.findMany({
          where: {
            ...scope,
            lastSeenAt: { lt: session.startedAt },
            isActive: true,
          },
          select: { id: true, groupId: true, articleNo: true },
        });
        if (stale.length > 0) {
          await tx.externalListing.updateMany({
            where: { id: { in: stale.map((listing) => listing.id) } },
            data: { isActive: false },
          });
        }
        const stillActive =
          stale.length === 0
            ? []
            : await tx.externalListing.findMany({
                where: {
                  officeId,
                  groupId: { in: [...new Set(stale.map((l) => l.groupId))] },
                  isActive: true,
                },
                select: { groupId: true },
                distinct: ['groupId'],
              });

        const comparison = this.buildComparison({
          isBaseline: !previousCompletedAt,
          since,
          received,
          stale,
          activeGroupIds: new Set(stillActive.map((l) => l.groupId)),
        });

        const updated = await tx.externalListingSnapshotSession.update({
          where: { id: session.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            completedById: userId,
            staleListingsMarked: stale.length,
          },
          include: {
            startedBy: { select: { id: true, name: true } },
            completedBy: { select: { id: true, name: true } },
          },
        });

        return {
          session: updated,
          staleListingsMarked: stale.length,
          receivedListingCount: received.length,
          comparison,
        };
      },
      { timeout: SNAPSHOT_TRANSACTION_TIMEOUT_MS },
    );
  }

  private buildComparison(input: {
    isBaseline: boolean;
    since: Date;
    received: Array<
      PriceTerms & {
        groupId: string;
        articleNo: string;
        firstSeenAt: Date;
        priceChangedAt: Date | null;
        previousPrice: number | null;
        previousDeposit: number | null;
        previousMonthlyRent: number | null;
        group: {
          firstSeenAt: Date;
          mainExternalListing: { articleNo: string } | null;
        };
      }
    >;
    stale: Array<{ groupId: string; articleNo: string }>;
    activeGroupIds: Set<string>;
  }): SnapshotComparison {
    const { isBaseline, since, received, stale, activeGroupIds } = input;
    const comparison: SnapshotComparison = {
      isBaseline,
      newGroups: [],
      addedListings: [],
      removedGroups: [],
      removedListings: [],
      priceChanges: [],
    };

    const newGroups = new Map<string, SnapshotComparison['newGroups'][number]>();
    for (const listing of received) {
      const { groupId, articleNo, group } = listing;
      if (group.firstSeenAt >= since) {
        const entry = newGroups.get(groupId) ?? {
          groupId,
          representativeArticleNo: group.mainExternalListing?.articleNo ?? null,
          articleNos: [],
        };
        entry.articleNos.push(articleNo);
        newGroups.set(groupId, entry);
      } else if (listing.firstSeenAt >= since) {
        comparison.addedListings.push({ groupId, articleNo });
      }
      // 이번 비교에서 처음 등장한 광고는 신규/추가로만 보고한다.
      if (
        listing.firstSeenAt < since &&
        listing.priceChangedAt &&
        listing.priceChangedAt >= since
      ) {
        comparison.priceChanges.push({
          groupId,
          articleNo,
          before: {
            price: listing.previousPrice,
            deposit: listing.previousDeposit,
            monthlyRent: listing.previousMonthlyRent,
          },
          after: {
            price: listing.price,
            deposit: listing.deposit,
            monthlyRent: listing.monthlyRent,
          },
        });
      }
    }
    comparison.newGroups = [...newGroups.values()];

    const removedGroups = new Map<string, string[]>();
    for (const { groupId, articleNo } of stale) {
      if (activeGroupIds.has(groupId)) {
        comparison.removedListings.push({ groupId, articleNo });
      } else {
        removedGroups.set(groupId, [
          ...(removedGroups.get(groupId) ?? []),
          articleNo,
        ]);
      }
    }
    comparison.removedGroups = [...removedGroups].map(
      ([groupId, articleNos]) => ({ groupId, articleNos }),
    );

    return comparison;
  }

  /** 세션 취소. listings는 건드리지 않는다 (이번 세션 중 입력한 신규 매물은 그대로 보존). */
  async cancelSession(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockActiveSession(tx, officeId, sessionId);
      this.ensureCanManageSession(session, userId, userRole);

      return tx.externalListingSnapshotSession.update({
        where: { id: session.id },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          completedById: userId,
        },
        include: {
          startedBy: { select: { id: true, name: true } },
          completedBy: { select: { id: true, name: true } },
        },
      });
    });
  }

  /**
   * 세션 행을 잠그고 열린 세션을 돌려준다. 같은 세션의 입력·닫기·취소를 순서대로 처리해
   * 동시 요청이 서로의 결과를 보지 못한 채 묶음 검증을 통과하는 일을 막는다.
   */
  private async lockActiveSession(
    tx: Prisma.TransactionClient,
    officeId: string,
    sessionId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "external_listing_snapshot_sessions"
      WHERE "id" = ${sessionId}::uuid AND "office_id" = ${officeId}::uuid
      FOR UPDATE
    `);
    const session = await tx.externalListingSnapshotSession.findFirst({
      where: { id: sessionId, officeId, status: 'active' },
    });
    if (!session) {
      throw new NotFoundException(
        'active session not found (already completed or cancelled?)',
      );
    }
    return session;
  }

  private async findPreviousCompletedAt(
    tx: Prisma.TransactionClient,
    officeId: string,
    session: { siteId: string; transactionType: string },
  ) {
    const previous = await tx.externalListingSnapshotSession.findFirst({
      where: {
        officeId,
        siteId: session.siteId,
        transactionType: session.transactionType,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
    return previous?.completedAt ?? null;
  }

  /**
   * 세션 완료/취소 권한 검사.
   * - owner, manager: 모든 세션 조작 가능
   * - agent: 본인이 시작한 세션만
   */
  private ensureCanManageSession(
    session: { startedById: string },
    userId: string,
    userRole: string,
  ) {
    if (userRole === 'owner' || userRole === 'manager') return;
    if (session.startedById === userId) return;
    throw new ForbiddenException(
      'only the session starter (or manager/owner) can finalize this session',
    );
  }

  async findGroupById(id: string, officeId: string) {
    const group = await this.prisma.externalListingGroup.findFirst({
      where: { id, officeId },
      include: {
        site: true,
        mainExternalListing: true,
        listings: {
          orderBy: [
            { isActive: 'desc' },
            { ranking: 'asc' },
            { lastSeenAt: 'desc' },
          ],
        },
      },
    });

    if (!group) {
      throw new NotFoundException('ExternalListingGroup not found');
    }

    return group;
  }

  async updateGroup(id: string, officeId: string, dto: UpdateGroupDto) {
    const existing = await this.prisma.externalListingGroup.findFirst({
      where: { id, officeId },
    });

    if (!existing) {
      throw new NotFoundException('ExternalListingGroup not found');
    }

    if (dto.status && !VALID_STATUSES.has(dto.status)) {
      throw new BadRequestException('Invalid status');
    }

    const data: Prisma.ExternalListingGroupUpdateInput = {};
    if (dto.ho !== undefined) data.ho = dto.ho?.trim() || null;
    if (dto.memo !== undefined) data.memo = dto.memo;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.favorite !== undefined) data.favorite = dto.favorite;

    return this.prisma.externalListingGroup.update({
      where: { id },
      data,
      include: {
        site: true,
        mainExternalListing: true,
      },
    });
  }

  /**
   * 열린 스냅샷에 광고 묶음을 입력한다. 화면 입력과 외부 agent가 거치는 단일 경로.
   * 매칭 규칙:
   *   1. 묶음의 articleNo가 기존 데이터와 하나라도 겹치면 그 Group에 합류한다.
   *   2. 겹치지 않으면 새 Group을 만든다.
   *   3. Group의 대표는 항상 새 묶음의 대표로 바꾼다.
   *
   * 동일 매물은 항상 한 묶음이므로 묶음과 Group이 1:1로 대응하지 않는 입력은
   * 오류로 거부한다. 요청 하나는 전부 저장되거나 전부 거부된다.
   * Group의 memo/ho/status는 입력으로 덮어쓰지 않는다.
   */
  async batchUpsert(
    officeId: string,
    dto: BatchUpsertDto,
  ): Promise<BatchUpsertResult> {
    const source = dto.source?.trim();
    if (!source) {
      throw new BadRequestException('source는 필수입니다.');
    }
    const articleNos = this.validateGroupInputs(dto.groups);

    return this.runInputTransaction(async (tx) => {
      const session = await this.lockActiveSession(tx, officeId, dto.sessionId);
      return this.writeGroups(tx, officeId, {
        source,
        batchId: dto.batchId,
        groups: dto.groups,
        articleNos,
        session,
      });
    });
  }

  /**
   * 이번 스냅샷에 입력한 매물에 동일 광고를 한 건 붙인다. 대표는 바꾸지 않는다.
   */
  async addSnapshotListing(
    officeId: string,
    sessionId: string,
    groupId: string,
    dto: AddSnapshotListingDto,
  ) {
    const source = dto.source?.trim();
    if (!source) {
      throw new BadRequestException('source는 필수입니다.');
    }
    const item = dto.listing;
    if (!item?.articleNo) {
      throw new BadRequestException('articleNo는 필수입니다.');
    }

    return this.runInputTransaction(async (tx) => {
      const session = await this.lockActiveSession(tx, officeId, sessionId);
      const group = await tx.externalListingGroup.findFirst({
        where: { id: groupId, officeId },
        select: {
          id: true,
          siteId: true,
          transactionType: true,
          lastSeenAt: true,
          mainExternalListing: { select: { articleNo: true } },
        },
      });
      if (!group) {
        throw new NotFoundException('ExternalListingGroup not found');
      }
      this.assertInSnapshotScope(group, session);
      if (group.lastSeenAt < session.startedAt) {
        throw new BadRequestException(
          '이번 스냅샷에 입력한 매물에만 동일 광고를 추가할 수 있습니다.',
        );
      }

      const { since, now } = await this.resolveSnapshotClock(
        tx,
        officeId,
        session,
      );
      const data = this.buildListingData(
        item,
        session.transactionType,
        group.mainExternalListing?.articleNo ?? item.articleNo,
      );
      const existing = await tx.externalListing.findUnique({
        where: {
          officeId_source_articleNo: {
            officeId,
            source,
            articleNo: item.articleNo,
          },
        },
        select: {
          id: true,
          groupId: true,
          price: true,
          deposit: true,
          monthlyRent: true,
          previousPrice: true,
          previousDeposit: true,
          previousMonthlyRent: true,
          priceChangedAt: true,
        },
      });
      if (existing && existing.groupId !== group.id) {
        throw new BadRequestException(
          `광고 ${item.articleNo}는 다른 매물에 이미 있습니다.`,
        );
      }

      const listing = existing
        ? await tx.externalListing.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...this.buildPriceChange(existing, data, since, now),
              isActive: true,
              lastSeenAt: now,
            },
          })
        : await tx.externalListing.create({
            data: {
              ...data,
              officeId,
              source,
              articleNo: item.articleNo,
              groupId: group.id,
              firstSeenAt: now,
              lastSeenAt: now,
              isActive: true,
            } satisfies Prisma.ExternalListingUncheckedCreateInput,
          });
      await tx.externalListingGroup.update({
        where: { id: group.id },
        data: { lastSeenAt: now },
      });
      return listing;
    });
  }

  /**
   * 열린 스냅샷에서 광고를 수정한다. 수정한 광고는 이번 스냅샷에 입력된 것으로 친다.
   */
  async updateSnapshotListing(
    officeId: string,
    sessionId: string,
    listingId: string,
    patch: SnapshotListingPatch,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockActiveSession(tx, officeId, sessionId);
      const listing = await this.findSnapshotListing(
        tx,
        officeId,
        session,
        listingId,
      );
      if (!listing.isActive) {
        throw new BadRequestException('내려간 광고는 수정할 수 없습니다.');
      }

      const data: Record<string, unknown> = {};
      for (const field of SNAPSHOT_EDITABLE_FIELDS) {
        if (patch?.[field] !== undefined) data[field] = patch[field];
      }
      const { since, now } = await this.resolveSnapshotClock(
        tx,
        officeId,
        session,
      );
      const nextPrice: PriceTerms = {
        price: patch?.price !== undefined ? patch.price : listing.price,
        deposit: patch?.deposit !== undefined ? patch.deposit : listing.deposit,
        monthlyRent:
          patch?.monthlyRent !== undefined
            ? patch.monthlyRent
            : listing.monthlyRent,
      };
      const updated = await tx.externalListing.update({
        where: { id: listing.id },
        data: {
          ...data,
          ...this.buildPriceChange(listing, nextPrice, since, now),
          lastSeenAt: now,
        },
      });

      // 대표가 이번에 입력되지 않았으면 닫을 때 내려가므로 입력된 광고로 옮긴다.
      const main = listing.group.mainExternalListing;
      await tx.externalListingGroup.update({
        where: { id: listing.groupId },
        data: {
          lastSeenAt: now,
          ...(main && main.lastSeenAt >= session.startedAt
            ? {}
            : { mainExternalListingId: listing.id }),
        },
      });
      return updated;
    });
  }

  /**
   * 열린 스냅샷에서 광고를 뺀다. 이번에 처음 입력한 광고는 지우고, 기존 광고는
   * 이번 입력에서 제외해 닫을 때 내려가게 한다.
   */
  async removeSnapshotListing(
    officeId: string,
    sessionId: string,
    listingId: string,
  ): Promise<{ id: string; result: 'deleted' | 'excluded' | 'unchanged' }> {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockActiveSession(tx, officeId, sessionId);
      const listing = await this.findSnapshotListing(
        tx,
        officeId,
        session,
        listingId,
      );

      const beforeSnapshot = new Date(session.startedAt.getTime() - 1);
      const isNewInSnapshot = listing.firstSeenAt >= session.startedAt;
      if (!isNewInSnapshot && listing.lastSeenAt < session.startedAt) {
        return { id: listing.id, result: 'unchanged' };
      }

      if (isNewInSnapshot) {
        await tx.externalListing.delete({ where: { id: listing.id } });
      } else {
        await tx.externalListing.update({
          where: { id: listing.id },
          data: { lastSeenAt: beforeSnapshot },
        });
      }

      const others = await tx.externalListing.findMany({
        where: {
          officeId,
          groupId: listing.groupId,
          id: { not: listing.id },
        },
        orderBy: [
          { ranking: { sort: 'asc', nulls: 'last' } },
          { lastSeenAt: 'desc' },
        ],
        select: { id: true, lastSeenAt: true, isActive: true },
      });
      const entered = others.filter(
        (other) => other.lastSeenAt >= session.startedAt,
      );

      if (isNewInSnapshot && others.length === 0) {
        await tx.externalListingGroup.delete({
          where: { id: listing.groupId },
        });
      } else {
        const wasMain = listing.group.mainExternalListing?.id === listing.id;
        const nextMain = entered[0] ?? others.find((other) => other.isActive);
        await tx.externalListingGroup.update({
          where: { id: listing.groupId },
          data: {
            ...(entered.length === 0 ? { lastSeenAt: beforeSnapshot } : {}),
            ...(wasMain && nextMain
              ? { mainExternalListingId: nextMain.id }
              : {}),
          },
        });
      }

      return {
        id: listing.id,
        result: isNewInSnapshot ? 'deleted' : 'excluded',
      };
    });
  }

  /**
   * 미입력 매물의 광고를 다시 입력하지 않고 이번 스냅샷에 남긴다. 일부가 이미 입력된
   * 매물은 건너뛰어, 사용자가 이번 스냅샷에서 뺀 광고가 되살아나지 않게 한다.
   */
  async keepSnapshotListings(
    officeId: string,
    sessionId: string,
    dto: KeepSnapshotListingsDto,
  ) {
    const groupIds = dto?.groupIds;
    if (
      !Array.isArray(groupIds) ||
      groupIds.length === 0 ||
      groupIds.some((id) => typeof id !== 'string')
    ) {
      throw new BadRequestException('유지할 매물을 선택해 주세요.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const session = await this.lockActiveSession(tx, officeId, sessionId);
        const { now } = await this.resolveSnapshotClock(tx, officeId, session);
        const targets = await tx.externalListing.findMany({
          where: {
            officeId,
            groupId: { in: groupIds },
            transactionType: session.transactionType,
            isActive: true,
            lastSeenAt: { lt: session.startedAt },
            group: {
              siteId: session.siteId,
              listings: {
                none: {
                  isActive: true,
                  lastSeenAt: { gte: session.startedAt },
                },
              },
            },
          },
          select: { id: true, groupId: true },
        });
        if (targets.length === 0) {
          return { keptGroupCount: 0, keptListingCount: 0 };
        }

        const keptGroupIds = [...new Set(targets.map((l) => l.groupId))];
        await tx.externalListing.updateMany({
          where: { id: { in: targets.map((l) => l.id) } },
          data: { lastSeenAt: now },
        });
        await tx.externalListingGroup.updateMany({
          where: { id: { in: keptGroupIds } },
          data: { lastSeenAt: now },
        });
        return {
          keptGroupCount: keptGroupIds.length,
          keptListingCount: targets.length,
        };
      },
      { timeout: SNAPSHOT_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async findSnapshotListing(
    tx: Prisma.TransactionClient,
    officeId: string,
    session: { siteId: string; transactionType: string },
    listingId: string,
  ) {
    const listing = await tx.externalListing.findFirst({
      where: { id: listingId, officeId },
      select: {
        id: true,
        groupId: true,
        isActive: true,
        firstSeenAt: true,
        lastSeenAt: true,
        price: true,
        deposit: true,
        monthlyRent: true,
        previousPrice: true,
        previousDeposit: true,
        previousMonthlyRent: true,
        priceChangedAt: true,
        group: {
          select: {
            siteId: true,
            transactionType: true,
            mainExternalListing: { select: { id: true, lastSeenAt: true } },
          },
        },
      },
    });
    if (!listing) {
      throw new NotFoundException('ExternalListing not found');
    }
    this.assertInSnapshotScope(listing.group, session);
    return listing;
  }

  private assertInSnapshotScope(
    group: { siteId: string; transactionType: string },
    session: { siteId: string; transactionType: string },
  ) {
    if (
      group.siteId !== session.siteId ||
      group.transactionType !== session.transactionType
    ) {
      throw new BadRequestException(
        '이 스냅샷의 단지·거래유형에 속한 광고가 아닙니다.',
      );
    }
  }

  /** 비교가 시각에 의존하므로 서버와 DB의 시계 차이로 기준 시각보다 앞서지 않게 한다. */
  private async resolveSnapshotClock(
    tx: Prisma.TransactionClient,
    officeId: string,
    session: { siteId: string; transactionType: string; startedAt: Date },
  ) {
    const since =
      (await this.findPreviousCompletedAt(tx, officeId, session)) ??
      new Date(0);
    const now = new Date(
      Math.max(Date.now(), session.startedAt.getTime(), since.getTime()),
    );
    return { since, now };
  }

  private async runInputTransaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(run, {
        timeout: SNAPSHOT_TRANSACTION_TIMEOUT_MS,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          '같은 광고가 동시에 입력되었습니다. 다시 시도하세요.',
        );
      }
      throw err;
    }
  }

  private async writeGroups(
    tx: Prisma.TransactionClient,
    officeId: string,
    input: {
      source: string;
      batchId?: string;
      groups: ListingGroupInput[];
      articleNos: string[];
      session: { siteId: string; transactionType: string; startedAt: Date };
    },
  ): Promise<BatchUpsertResult> {
    const { source, groups, articleNos, session } = input;
    const { since, now } = await this.resolveSnapshotClock(
      tx,
      officeId,
      session,
    );

    const existingListings = await tx.externalListing.findMany({
      where: { officeId, source, articleNo: { in: articleNos } },
      select: {
        id: true,
        articleNo: true,
        groupId: true,
        price: true,
        deposit: true,
        monthlyRent: true,
        previousPrice: true,
        previousDeposit: true,
        previousMonthlyRent: true,
        priceChangedAt: true,
        group: {
          select: {
            siteId: true,
            transactionType: true,
            lastSeenAt: true,
            mainExternalListing: { select: { articleNo: true } },
          },
        },
      },
    });
    const existingByArticleNo = new Map(
      existingListings.map((listing) => [listing.articleNo, listing]),
    );

    const targetGroupIds = this.resolveTargetGroups(
      groups,
      existingByArticleNo,
      session,
    );

    const result: BatchUpsertResult = {
      batchId: input.batchId,
      received: articleNos.length,
      created: 0,
      updated: 0,
      groupsCreated: 0,
      groupsReused: 0,
    };

    for (const [index, bundle] of groups.entries()) {
      const representative = bundle.listings.find(
        (item) => item.articleNo === bundle.representativeArticleNo,
      )!;
      let groupId = targetGroupIds[index];
      if (groupId) {
        result.groupsReused++;
      } else {
        const ho = representative.ho?.trim() || null;
        const created = await tx.externalListingGroup.create({
          data: {
            officeId,
            siteId: session.siteId,
            buildingName: representative.buildingName ?? null,
            ho,
            areaName: representative.areaName ?? null,
            exclusiveAreaM2: representative.exclusiveAreaM2 ?? null,
            transactionType: session.transactionType,
            status: ho ? 'verified' : 'unmatched',
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });
        groupId = created.id;
        result.groupsCreated++;
      }

      let representativeListingId: string | null = null;
      for (const item of bundle.listings) {
        const data = this.buildListingData(
          item,
          session.transactionType,
          bundle.representativeArticleNo,
        );
        const existing = existingByArticleNo.get(item.articleNo);
        let listingId: string;
        if (existing) {
          await tx.externalListing.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...this.buildPriceChange(existing, data, since, now),
              isActive: true,
              lastSeenAt: now,
            },
          });
          listingId = existing.id;
          result.updated++;
        } else {
          const created = await tx.externalListing.create({
            data: {
              ...data,
              officeId,
              source,
              articleNo: item.articleNo,
              groupId,
              firstSeenAt: now,
              lastSeenAt: now,
              isActive: true,
            } satisfies Prisma.ExternalListingUncheckedCreateInput,
          });
          listingId = created.id;
          result.created++;
        }
        if (item.articleNo === bundle.representativeArticleNo) {
          representativeListingId = listingId;
        }
      }

      await tx.externalListingGroup.update({
        where: { id: groupId },
        data: {
          lastSeenAt: now,
          mainExternalListingId: representativeListingId,
        },
      });
    }

    return result;
  }

  /** DB 조회 없이 판단할 수 있는 입력 오류를 거르고 전체 articleNo를 돌려준다. */
  private validateGroupInputs(groups: ListingGroupInput[]): string[] {
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new BadRequestException('groups는 비어 있을 수 없습니다.');
    }

    const seen = new Set<string>();
    for (const bundle of groups) {
      if (!Array.isArray(bundle.listings) || bundle.listings.length === 0) {
        throw new BadRequestException('묶음의 listings는 비어 있을 수 없습니다.');
      }
      if (!bundle.representativeArticleNo) {
        throw new BadRequestException(
          '모든 묶음에 representativeArticleNo가 필요합니다.',
        );
      }
      let hasRepresentative = false;
      for (const { articleNo } of bundle.listings) {
        if (!articleNo) {
          throw new BadRequestException('articleNo는 필수입니다.');
        }
        if (seen.has(articleNo)) {
          throw new BadRequestException(
            `같은 번호가 두 번 입력되었습니다: ${articleNo}`,
          );
        }
        seen.add(articleNo);
        if (articleNo === bundle.representativeArticleNo) {
          hasRepresentative = true;
        }
      }
      if (!hasRepresentative) {
        throw new BadRequestException(
          `대표 ${bundle.representativeArticleNo}가 묶음의 listings에 없습니다.`,
        );
      }
    }

    if (seen.size > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `batch size exceeds limit of ${MAX_BATCH_SIZE}`,
      );
    }
    return [...seen];
  }

  /**
   * 묶음별로 합류할 기존 Group을 정한다. 새 Group이면 null.
   * 동일 매물이 항상 한 묶음이라는 전제와 어긋나는 입력은 저장 전에 거부한다.
   */
  private resolveTargetGroups(
    groups: ListingGroupInput[],
    existingByArticleNo: Map<
      string,
      {
        groupId: string;
        group: {
          siteId: string;
          transactionType: string;
          lastSeenAt: Date;
          mainExternalListing: { articleNo: string } | null;
        };
      }
    >,
    session: { siteId: string; transactionType: string; startedAt: Date },
  ): Array<string | null> {
    const claimedBy = new Map<string, string>();

    return groups.map((bundle) => {
      const matches = bundle.listings.flatMap(
        ({ articleNo }) => existingByArticleNo.get(articleNo) ?? [],
      );
      const groupIds = new Set(matches.map((match) => match.groupId));
      const representativeNo = bundle.representativeArticleNo;

      if (groupIds.size > 1) {
        throw new BadRequestException(
          `묶음(대표 ${representativeNo})이 기존 그룹 둘 이상과 겹칩니다.`,
        );
      }
      const match = matches[0];
      if (!match) return null;

      if (
        match.group.siteId !== session.siteId ||
        match.group.transactionType !== session.transactionType
      ) {
        throw new BadRequestException(
          `묶음(대표 ${representativeNo})의 광고가 다른 단지 또는 거래유형에 이미 있습니다.`,
        );
      }

      const claimedRepresentative = claimedBy.get(match.groupId);
      if (claimedRepresentative) {
        throw new BadRequestException(
          `묶음(대표 ${claimedRepresentative}, ${representativeNo})이 기존 그룹 하나와 겹칩니다.`,
        );
      }
      claimedBy.set(match.groupId, representativeNo);

      // 같은 스냅샷에서 다른 대표로 이미 입력된 그룹이면 묶음이 나뉜 것이다.
      // 같은 대표면 재시도이므로 그대로 받는다.
      const currentRepresentative =
        match.group.mainExternalListing?.articleNo;
      if (
        match.group.lastSeenAt >= session.startedAt &&
        currentRepresentative !== representativeNo
      ) {
        throw new BadRequestException(
          `묶음(대표 ${currentRepresentative}, ${representativeNo})이 기존 그룹 하나와 겹칩니다.`,
        );
      }
      return match.groupId;
    });
  }

  /**
   * 직전 완료 스냅샷의 가격을 previous*에 보존한다. 취소된 입력이나 재시도로 가격이
   * 여러 번 바뀌어도 기준값은 그대로이고, 기준값으로 돌아오면 변경 기록을 지운다.
   */
  private buildPriceChange(
    existing: PriceTerms & {
      previousPrice: number | null;
      previousDeposit: number | null;
      previousMonthlyRent: number | null;
      priceChangedAt: Date | null;
    },
    next: PriceTerms,
    since: Date,
    now: Date,
  ) {
    const changedSinceBaseline =
      existing.priceChangedAt != null && existing.priceChangedAt >= since;
    const baseline: PriceTerms = changedSinceBaseline
      ? {
          price: existing.previousPrice,
          deposit: existing.previousDeposit,
          monthlyRent: existing.previousMonthlyRent,
        }
      : existing;

    if (isSamePrice(baseline, next)) {
      return changedSinceBaseline
        ? {
            previousPrice: null,
            previousDeposit: null,
            previousMonthlyRent: null,
            priceChangedAt: null,
          }
        : {};
    }
    if (isSamePrice(existing, next)) return {};
    return {
      previousPrice: baseline.price,
      previousDeposit: baseline.deposit,
      previousMonthlyRent: baseline.monthlyRent,
      priceChangedAt: now,
    };
  }

  /**
   * BatchListingItem의 필드들을 Prisma가 받을 수 있는 형태로 변환.
   * create/update에서 공통으로 쓰는 컬럼 값 (officeId/groupId/articleNo/시간 필드 제외).
   * JSON 필드는 null → Prisma.JsonNull로 변환.
   */
  private buildListingData(
    item: BatchListingItem,
    transactionType: string,
    representativeArticleNo: string,
  ) {
    const tagList: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      item.tagList == null
        ? Prisma.JsonNull
        : (item.tagList as Prisma.InputJsonValue);

    return {
      transactionType,
      sourceUrl: item.sourceUrl ?? null,
      cpName: item.cpName ?? null,
      cpid: item.cpid ?? null,
      cpPcArticleUrl: item.cpPcArticleUrl ?? null,
      representativeArticleNo,
      sameAddrCnt: item.sameAddrCnt ?? null,
      sameAddrDirectCnt: item.sameAddrDirectCnt ?? null,
      sameAddrMaxPrc: item.sameAddrMaxPrc ?? null,
      sameAddrMinPrc: item.sameAddrMinPrc ?? null,
      price: item.price ?? null,
      deposit: item.deposit ?? null,
      monthlyRent: item.monthlyRent ?? null,
      articleName: item.articleName ?? null,
      articleFeatureDesc: item.articleFeatureDesc ?? null,
      detailDescription: item.detailDescription ?? null,
      articleConfirmYmd: item.articleConfirmYmd ?? null,
      floorInfo: item.floorInfo ?? null,
      exclusiveAreaM2: item.exclusiveAreaM2 ?? null,
      supplyAreaM2: item.supplyAreaM2 ?? null,
      direction: item.direction ?? null,
      tagList,
      verificationTypeCode: item.verificationTypeCode ?? null,
      realtorId: item.realtorId ?? null,
      realtorName: item.realtorName ?? null,
      originalRealtorName: item.originalRealtorName ?? null,
      representativeTelNo: item.representativeTelNo ?? null,
      ranking: item.ranking ?? null,
      isSharedRank: item.isSharedRank ?? false,
      sharedRank: item.sharedRank ?? null,
      sameRankNum: item.sameRankNum ?? null,
      seango: item.seango ?? false,
      epju: item.epju ?? false,
      exposeStartYmd: item.exposeStartYmd ?? null,
      exposeEndYmd: item.exposeEndYmd ?? null,
      priceChangeState: item.priceChangeState ?? null,
      isPriceModification: item.isPriceModification ?? false,
    } satisfies Partial<Prisma.ExternalListingUncheckedCreateInput>;
  }
}
