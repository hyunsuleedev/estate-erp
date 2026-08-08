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
  representativeArticleNo?: string | null;
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
  cellPhoneNo?: string | null;
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
  raw?: unknown;
  // 그룹 생성 힌트 (새 그룹 생성 시에만 사용, 기존 그룹의 사용자 입력은 덮어쓰지 않음)
  buildingName?: string | null;
  areaName?: string | null;
  ho?: string | null;
}

export interface BatchUpsertDto {
  source: string; // "naver" 등
  siteId: string;
  transactionType: string;
  batchId?: string; // 로그용 (DB 저장 안 함)
  listings: BatchListingItem[];
}

export interface BatchUpsertResult {
  batchId?: string;
  received: number;
  created: number;
  updated: number;
  groupsCreated: number;
  groupsReused: number;
  errors: Array<{ articleNo: string; message: string }>;
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
    if (query.bucket && query.bucket !== 'all') {
      if (!query.siteId || !query.transactionType) {
        throw new BadRequestException(
          'bucket requires siteId and transactionType',
        );
      }
      const session =
        await this.prisma.externalListingSnapshotSession.findFirst({
          where: {
            officeId,
            siteId: query.siteId,
            transactionType: query.transactionType,
            status: 'active',
          },
        });
      if (!session) {
        throw new BadRequestException(
          'bucket specified but no active snapshot session for scope',
        );
      }
      const listingFilter: Prisma.ExternalListingWhereInput = {
        lastSeenAt: { gte: session.startedAt },
        transactionType: session.transactionType,
      };
      if (query.bucket === 'new') {
        where.listings = { some: listingFilter };
      } else {
        // 'old' — 세션 시작 이후 touch된 적 없는 그룹
        where.listings = { none: listingFilter };
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
        _count: { select: { listings: true } },
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
            },
            orderBy: { startedAt: 'desc' },
          });
    const comparisonStartedAtByScope = new Map<string, Date>();
    for (const session of comparisonSessions) {
      const scopeKey = `${session.siteId}:${session.transactionType}`;
      if (!comparisonStartedAtByScope.has(scopeKey)) {
        comparisonStartedAtByScope.set(scopeKey, session.startedAt);
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
      const comparisonStartedAt = comparisonStartedAtByScope.get(
        `${group.siteId}:${group.transactionType}`,
      );
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
    return this.prisma.externalListingSnapshotSession.findFirst({
      where: { officeId, siteId, transactionType, status: 'active' },
      include: { startedBy: { select: { id: true, name: true } } },
    });
  }

  /**
   * 세션 완료. 세션 시작 이후 한 번도 touch되지 않은 external_listings 행을
   * is_active=false로 소프트 삭제. Group은 건드리지 않는다.
   */
  async completeSession(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
  ) {
    const session = await this.prisma.externalListingSnapshotSession.findFirst({
      where: { id: sessionId, officeId, status: 'active' },
    });
    if (!session) {
      throw new NotFoundException(
        'active session not found (already completed or cancelled?)',
      );
    }

    this.ensureCanManageSession(session, userId, userRole);

    return this.prisma.$transaction(async (tx) => {
      // 스코프 Group ID 목록 조회 — external_listings에 siteId가 없어서
      // 이렇게 우회. 한 단지+거래유형당 Group 수가 수십~수백 수준이라 문제없음.
      const groupIds = await tx.externalListingGroup.findMany({
        where: {
          officeId,
          siteId: session.siteId,
          transactionType: session.transactionType,
        },
        select: { id: true },
      });
      const ids = groupIds.map((g) => g.id);

      let staleListingsMarked = 0;
      if (ids.length > 0) {
        const result = await tx.externalListing.updateMany({
          where: {
            officeId,
            groupId: { in: ids },
            transactionType: session.transactionType,
            lastSeenAt: { lt: session.startedAt },
            isActive: true,
          },
          data: { isActive: false },
        });
        staleListingsMarked = result.count;
      }

      const updated = await tx.externalListingSnapshotSession.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          completedById: userId,
          staleListingsMarked,
        },
        include: {
          startedBy: { select: { id: true, name: true } },
          completedBy: { select: { id: true, name: true } },
        },
      });

      return { session: updated, staleListingsMarked };
    });
  }

  /** 세션 취소. listings는 건드리지 않는다 (이번 세션 중 입력한 신규 매물은 그대로 보존). */
  async cancelSession(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
  ) {
    const session = await this.prisma.externalListingSnapshotSession.findFirst({
      where: { id: sessionId, officeId, status: 'active' },
    });
    if (!session) {
      throw new NotFoundException(
        'active session not found (already completed or cancelled?)',
      );
    }

    this.ensureCanManageSession(session, userId, userRole);

    return this.prisma.externalListingSnapshotSession.update({
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
   * 배치 업서트. 크롤러/MCP/수동 입력이 모두 거치는 단일 경로.
   * 매칭 규칙 (electron-estate 방식):
   *   1. 같은 articleNo가 이미 있으면 그 Group 재사용
   *   2. 없으면 sameAddr 그룹(representativeArticleNo)의 sibling articleNo들 중
   *      DB에 있는 것을 찾아 그 Group 재사용
   *   3. 둘 다 없으면 새 Group 생성
   *
   * Group의 memo/ho/status는 크롤러가 절대 덮어쓰지 않는다.
   * lastSeenAt만 갱신한다.
   */
  async batchUpsert(
    officeId: string,
    dto: BatchUpsertDto,
  ): Promise<BatchUpsertResult> {
    if (!VALID_TRANSACTION_TYPES.has(dto.transactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }
    if (!dto.listings || dto.listings.length === 0) {
      throw new BadRequestException('listings must not be empty');
    }
    if (dto.listings.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `batch size exceeds limit of ${MAX_BATCH_SIZE}`,
      );
    }

    // siteId가 이 사무소에서 접근 가능한지 확인 (공공 또는 소유)
    const site = await this.prisma.site.findFirst({
      where: {
        id: dto.siteId,
        OR: [{ officeId }, { isPublic: true }],
      },
      select: { id: true },
    });
    if (!site) {
      throw new BadRequestException(
        'siteId does not exist or is not accessible',
      );
    }

    // 스냅샷 세션 존재 시 경고 로그. 크롤러가 세션 중 부분 결과를 push하면
    // 나머지가 stale로 분류될 수 있다는 점에 대한 operational signal.
    const activeSession =
      await this.prisma.externalListingSnapshotSession.findFirst({
        where: {
          officeId,
          siteId: dto.siteId,
          transactionType: dto.transactionType,
          status: 'active',
        },
        select: { id: true, startedById: true },
      });
    if (activeSession) {
      this.logger.warn(
        `batchUpsert into locked scope (session=${activeSession.id}) — listings will be treated as seen for this session. source=${dto.source}`,
      );
    }

    // STEP 1: articleNo와 sibling articleNo 전부 수집 (그룹 매칭용 한 번의 SELECT)
    const allArticleNos = new Set<string>();
    for (const item of dto.listings) {
      if (!item.articleNo) continue;
      allArticleNos.add(item.articleNo);
      // representativeArticleNo가 같은 형제들도 매칭 후보에 포함
      // (요청자가 제공한 정보 외의 sibling은 DB 조회로만 알 수 있으므로
      //  여기서는 먼저 DB를 조회해 기존 articleNo 기반 그룹을 찾는다)
    }

    const existingListings = await this.prisma.externalListing.findMany({
      where: {
        officeId,
        source: dto.source,
        articleNo: { in: Array.from(allArticleNos) },
      },
      select: { id: true, articleNo: true, groupId: true },
    });

    // articleNo → groupId
    const articleNoToGroupId = new Map<string, string>();
    // articleNo → listingId (upsert 판별용)
    const articleNoToListingId = new Map<string, string>();
    for (const row of existingListings) {
      articleNoToGroupId.set(row.articleNo, row.groupId);
      articleNoToListingId.set(row.articleNo, row.id);
    }

    // STEP 2: representativeArticleNo를 통한 sibling 매칭
    // 각 요청 item의 representativeArticleNo가 이미 DB에 있으면 그 그룹을 재사용
    const repArticleNos = new Set<string>();
    for (const item of dto.listings) {
      if (item.representativeArticleNo) {
        repArticleNos.add(item.representativeArticleNo);
      }
    }
    if (repArticleNos.size > 0) {
      const repListings = await this.prisma.externalListing.findMany({
        where: {
          officeId,
          source: dto.source,
          articleNo: { in: Array.from(repArticleNos) },
        },
        select: { articleNo: true, groupId: true },
      });
      for (const row of repListings) {
        if (!articleNoToGroupId.has(row.articleNo)) {
          articleNoToGroupId.set(row.articleNo, row.groupId);
        }
      }
    }

    // STEP 3: 각 item을 순차 처리 (lenient mode — 개별 try-catch)
    const result: BatchUpsertResult = {
      batchId: dto.batchId,
      received: dto.listings.length,
      created: 0,
      updated: 0,
      groupsCreated: 0,
      groupsReused: 0,
      errors: [],
    };

    const now = new Date();

    for (const item of dto.listings) {
      try {
        if (!item.articleNo) {
          throw new Error('articleNo is required');
        }

        // 그룹 결정
        let groupId = articleNoToGroupId.get(item.articleNo);

        if (!groupId && item.representativeArticleNo) {
          groupId = articleNoToGroupId.get(item.representativeArticleNo);
        }

        if (groupId) {
          result.groupsReused++;
          // 기존 그룹의 lastSeenAt만 갱신 (memo/ho는 건드리지 않음)
          await this.prisma.externalListingGroup.update({
            where: { id: groupId },
            data: { lastSeenAt: now },
          });
        } else {
          // 새 그룹 생성. 수동 입력은 일반 호수 텍스트를 함께 넘길 수 있다.
          const newGroup = await this.prisma.externalListingGroup.create({
            data: {
              officeId,
              siteId: dto.siteId,
              buildingName: item.buildingName ?? null,
              ho: item.ho?.trim() || null,
              areaName: item.areaName ?? null,
              exclusiveAreaM2: item.exclusiveAreaM2 ?? null,
              transactionType: dto.transactionType,
              status: item.ho?.trim() ? 'verified' : 'unmatched',
              firstSeenAt: now,
              lastSeenAt: now,
            },
          });
          groupId = newGroup.id;
          result.groupsCreated++;
          // 이 그룹을 같은 batch 내 다른 item이 재사용할 수 있도록 맵에 등록
          articleNoToGroupId.set(item.articleNo, groupId);
          if (item.representativeArticleNo) {
            articleNoToGroupId.set(item.representativeArticleNo, groupId);
          }
        }

        // Listing upsert
        const existingListingId = articleNoToListingId.get(item.articleNo);
        const commonData = this.buildListingData(item, dto.transactionType);

        if (existingListingId) {
          await this.prisma.externalListing.update({
            where: { id: existingListingId },
            data: { ...commonData, isActive: true, lastSeenAt: now },
          });
          result.updated++;
        } else {
          const created = await this.prisma.externalListing.create({
            data: {
              ...commonData,
              officeId,
              source: dto.source,
              articleNo: item.articleNo,
              groupId,
              firstSeenAt: now,
              lastSeenAt: now,
              isActive: true,
            } satisfies Prisma.ExternalListingUncheckedCreateInput,
          });
          articleNoToListingId.set(item.articleNo, created.id);

          // 새 그룹인 경우 첫 Listing을 대표로 지정
          const group = await this.prisma.externalListingGroup.findUnique({
            where: { id: groupId },
            select: { mainExternalListingId: true },
          });
          if (group && !group.mainExternalListingId) {
            await this.prisma.externalListingGroup.update({
              where: { id: groupId },
              data: { mainExternalListingId: created.id },
            });
          }

          result.created++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({
          articleNo: item.articleNo ?? '(missing)',
          message,
        });
      }
    }

    return result;
  }

  /**
   * BatchListingItem의 필드들을 Prisma가 받을 수 있는 형태로 변환.
   * create/update에서 공통으로 쓰는 컬럼 값 (officeId/groupId/articleNo/시간 필드 제외).
   * JSON 필드는 null → Prisma.JsonNull로 변환.
   */
  private buildListingData(item: BatchListingItem, transactionType: string) {
    const tagList: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      item.tagList == null
        ? Prisma.JsonNull
        : (item.tagList as Prisma.InputJsonValue);
    const raw: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      item.raw == null ? Prisma.JsonNull : (item.raw as Prisma.InputJsonValue);

    return {
      transactionType,
      sourceUrl: item.sourceUrl ?? null,
      cpName: item.cpName ?? null,
      cpid: item.cpid ?? null,
      cpPcArticleUrl: item.cpPcArticleUrl ?? null,
      representativeArticleNo: item.representativeArticleNo ?? null,
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
      cellPhoneNo: item.cellPhoneNo ?? null,
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
      raw,
    } satisfies Partial<Prisma.ExternalListingUncheckedCreateInput>;
  }
}
