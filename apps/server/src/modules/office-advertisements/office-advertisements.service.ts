import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  analyzeAdvertisementComparison,
  inferOfficeAdvertisementFloorExposureMode,
  type AdvertisementComparisonAnalysis,
} from '@estate-erp/shared';
import { Prisma, type AdvertisementComparison } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * 내 광고의 네이버 비교.
 *
 * 사용자의 에이전트가 내 광고 한 건의 비교 목록(네이버에서 같은 집으로 보이는 광고 전체)을 통째로 넣는다.
 * 서버는 스스로 묶지 않는다. 묶음의 열쇠는 내 광고 ID이고, 확인하는 것은 목록 안에 내 광고의
 * 네이버 매물번호가 있는지뿐이다.
 *
 * 한 건의 저장은 전부 되거나 전부 안 된다(한 트랜잭션): 비교 줄 갱신 · 목록에 없는 줄 지우기 ·
 * 그때의 요약 한 줄(AdvertisementComparisonRecord) 쌓기. 도중에 끊기면 그 광고는 직전 상태 그대로다.
 */

export interface OfficeAdvertisementGroupsQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdvertisementComparisonRowInput {
  articleNo: string;
  sourceUrl?: string | null;
  isMine?: boolean;
  /** 받기만 하고 쓰지 않는다. "바로 이 내 광고"는 네이버 매물번호로 가른다 */
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

export interface AdvertisementComparisonInput {
  listingAdvertisementId: string;
  /** 받기만 하고 저장하지 않는다 (묶음 표가 없어졌다). 적을 말은 광고의 memo에 둔다 */
  memo?: string | null;
  /**
   * 네이버가 알려 준 같은 집 광고 수. 주면 목록이 그보다 적을 때 거절한다 —
   * 절반만 읽은 목록을 온전한 것으로 받으면 안 들어온 경쟁 광고가 내려간 것으로 기록된다.
   */
  totalCount?: number | null;
  advertisements: AdvertisementComparisonRowInput[];
}

export interface SaveAdvertisementComparisonsDto {
  /** 내 광고 한 건마다 하나: 그 광고의 비교 목록 전체 */
  comparisons: AdvertisementComparisonInput[];
}

/** 직전 기록에서 달라진 것 */
export type AdvertisementComparisonChange =
  | 'cheaper_appeared'
  | 'cheaper_gone'
  | 'own_hidden'
  | 'own_restored'
  | 'floor_disadvantage'
  | 'rank_changed';

/** 알림으로 보내는 변화. 순위 변동 등 나머지는 기록에만 남긴다 */
const ALERT_CHANGES: AdvertisementComparisonChange[] = [
  'cheaper_appeared',
  'own_hidden',
  'floor_disadvantage',
];

const ALERT_LABELS: Record<string, string> = {
  cheaper_appeared: '더 싼 광고가 생김',
  own_hidden: '내 광고가 네이버에서 안 보임',
  floor_disadvantage: '경쟁 광고가 정확한 층을 공개',
};

/** 비교 기록에서 변화 판단에 쓰는 칸 */
export interface ComparisonRecordState {
  ownVisible: boolean;
  ownRanking: number | null;
  lowerPricedCount: number;
  ownFloorExposure: string;
  exactFloorCompetitorCount: number;
}

/**
 * 직전 기록과 지금 기록을 견줘 달라진 것을 고른다. 첫 기록은 견줄 것이 없어 빈 목록이다
 * (처음부터 더 싼 광고가 있었다면 그것은 "변화"가 아니라 화면에 보이는 지금 상태다).
 */
export function diffComparisonChanges(
  previous: ComparisonRecordState | null,
  current: ComparisonRecordState,
): AdvertisementComparisonChange[] {
  if (!previous) return [];
  const changes: AdvertisementComparisonChange[] = [];
  if (previous.ownVisible && !current.ownVisible) changes.push('own_hidden');
  if (!previous.ownVisible && current.ownVisible) changes.push('own_restored');
  if (previous.lowerPricedCount === 0 && current.lowerPricedCount > 0) {
    changes.push('cheaper_appeared');
  }
  if (previous.lowerPricedCount > 0 && current.lowerPricedCount === 0) {
    changes.push('cheaper_gone');
  }
  const floorDisadvantage = (state: ComparisonRecordState) =>
    state.ownFloorExposure === 'band' && state.exactFloorCompetitorCount > 0;
  if (floorDisadvantage(current) && !floorDisadvantage(previous)) {
    changes.push('floor_disadvantage');
  }
  if (
    previous.ownRanking != null &&
    current.ownRanking != null &&
    previous.ownRanking !== current.ownRanking
  ) {
    changes.push('rank_changed');
  }
  return changes;
}

/**
 * 비교 줄에 "바로 이 내 광고" 및 같은 사무소의 다른 계정 광고를 반영한다.
 *
 * - articleNo === naverArticleNo → 바로 이 내 광고(ownAdvertisement)
 * - officeOwnArticleNos에 포함 → 우리 사무소의 다른 계정·다른 채널 광고도 isMine = true
 */
export function withOwnRow<Row extends { articleNo: string; isMine: boolean }>(
  rows: Row[],
  naverArticleNo: string | null,
  officeOwnArticleNos?: ReadonlySet<string>,
): Row[] {
  if (!naverArticleNo && (!officeOwnArticleNos || officeOwnArticleNos.size === 0)) {
    return rows;
  }
  return rows.map((row) => {
    const mine =
      (naverArticleNo != null && row.articleNo === naverArticleNo) ||
      Boolean(officeOwnArticleNos?.has(row.articleNo));
    return mine && !row.isMine ? { ...row, isMine: true } : row;
  });
}

/** 화면 · MCP에 내보내는 비교 한 벌: 읽은 시각, 내 줄, 전체 줄 */
export function toComparisonSet<
  Row extends { articleNo: string; isMine: boolean; ranking: number | null },
>(
  naverArticleNo: string | null,
  rows: Row[],
  observedAt: Date | null,
  officeOwnArticleNos?: ReadonlySet<string>,
) {
  if (rows.length === 0 && !observedAt) return null;
  const advertisements = withOwnRow(rows, naverArticleNo, officeOwnArticleNos).sort(
    (left, right) =>
      Number(right.isMine) - Number(left.isMine) ||
      (left.ranking ?? Number.MAX_SAFE_INTEGER) -
        (right.ranking ?? Number.MAX_SAFE_INTEGER),
  );
  return {
    observedAt,
    ownAdvertisement:
      (naverArticleNo &&
        advertisements.find((row) => row.articleNo === naverArticleNo)) ||
      null,
    advertisements,
  };
}

@Injectable()
export class OfficeAdvertisementsService {
  private readonly logger = new Logger(OfficeAdvertisementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 비교가 있는 내 광고와 그 비교 목록 */
  async findComparisons(
    officeId: string,
    query: OfficeAdvertisementGroupsQuery = {},
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
    });
    const where: Prisma.ListingAdvertisementWhereInput = {
      officeId,
      comparisons: { some: {} },
      ...(query.search && {
        OR: [
          { channel: contains(query.search) },
          { externalAdId: contains(query.search) },
          { naverArticleNo: contains(query.search) },
          { rawSiteName: contains(query.search) },
          { listing: { property: { site: { name: contains(query.search) } } } },
          { property: { site: { name: contains(query.search) } } },
          { site: { name: contains(query.search) } },
          {
            comparisons: {
              some: {
                OR: [
                  { articleNo: contains(query.search) },
                  { articleName: contains(query.search) },
                  { realtorName: contains(query.search) },
                ],
              },
            },
          },
        ],
      }),
    };

    const [advertisements, total, officeArticleRows] = await Promise.all([
      this.prisma.listingAdvertisement.findMany({
        where,
        select: {
          id: true,
          channel: true,
          status: true,
          naverArticleNo: true,
          lastCheckedAt: true,
          comparisons: {
            select: {
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
            },
          },
          comparisonRecords: {
            orderBy: { observedAt: 'desc' },
            take: 1,
            select: { observedAt: true },
          },
        },
        orderBy: { lastCheckedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.listingAdvertisement.count({ where }),
      this.prisma.listingAdvertisement.findMany({
        where: { officeId, status: 'active', naverArticleNo: { not: null } },
        select: { naverArticleNo: true },
      }),
    ]);
    const officeOwnArticleNos = new Set(
      officeArticleRows
        .map((row) => row.naverArticleNo)
        .filter((no): no is string => Boolean(no)),
    );

    return {
      items: advertisements.map((advertisement) => ({
        listingAdvertisementId: advertisement.id,
        channel: advertisement.channel,
        status: advertisement.status,
        naverArticleNo: advertisement.naverArticleNo,
        ...toComparisonSet(
          advertisement.naverArticleNo,
          advertisement.comparisons,
          advertisement.comparisonRecords[0]?.observedAt ?? null,
          officeOwnArticleNos,
        ),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** 비교를 읽을 때마다 쌓인 요약. 한 광고의 흐름, 또는 달라진 것만 */
  async findRecords(
    officeId: string,
    query: {
      listingAdvertisementId?: string;
      changedOnly?: boolean;
      limit?: number;
    } = {},
  ) {
    return this.prisma.advertisementComparisonRecord.findMany({
      where: {
        officeId,
        ...(query.listingAdvertisementId && {
          advertisementId: query.listingAdvertisementId,
        }),
        ...(query.changedOnly && { NOT: { changes: { isEmpty: true } } }),
      },
      orderBy: { observedAt: 'desc' },
      take: Math.min(200, Math.max(1, query.limit || 50)),
    });
  }

  async saveComparisons(officeId: string, dto: SaveAdvertisementComparisonsDto) {
    if (!dto.comparisons || dto.comparisons.length === 0) {
      throw new BadRequestException('comparisons is required');
    }
    if (dto.comparisons.length > 100) {
      throw new BadRequestException('comparisons must be 100 or fewer');
    }

    let comparisonsCreated = 0;
    let comparisonsUpdated = 0;
    let rowsCreated = 0;
    let rowsUpdated = 0;
    const errors: Array<{ articleNo: string; message: string }> = [];

    // 내 광고 한 건씩 따로 저장한다. 한 건이 틀려도 나머지는 들어가고, 틀린 건은 직전 상태로 남는다.
    for (const groupDto of dto.comparisons) {
      try {
        const saved = await this.saveComparison(officeId, groupDto);
        if (saved.hadComparison) comparisonsUpdated += 1;
        else comparisonsCreated += 1;
        rowsCreated += saved.created;
        rowsUpdated += saved.updated;
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

    // 알림은 건마다가 아니라 이번 올리기가 끝난 뒤 한 번에 묶어 보낸다.
    // 지난번에 보내지 못한 변화가 남아 있으면 이번에 함께 나간다.
    // 비교는 이미 저장됐으므로, 알림을 못 보냈다고 올리기를 실패로 돌리지 않는다.
    const notified = await this.notifyChanges(officeId).catch((error) => {
      this.logger.warn(
        `advertisement comparison notification failed, will retry on next upload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    });

    return {
      // 받은 내 광고 수, 그중 처음 비교한 것 / 다시 비교한 것, 비교 줄을 새로 넣은 수 / 고친 수
      comparisonsReceived: dto.comparisons.length,
      comparisonsCreated,
      comparisonsUpdated,
      rowsCreated,
      rowsUpdated,
      changesNotified: notified,
      errors,
    };
  }

  private saveComparison(
    officeId: string,
    dto: AdvertisementComparisonInput,
  ) {
    if (!dto.listingAdvertisementId) {
      throw new BadRequestException(
        'listingAdvertisementId is required for every comparison',
      );
    }
    if (!dto.advertisements?.length) {
      throw new BadRequestException(
        'comparison requires at least one advertisement',
      );
    }
    const articleNos = dto.advertisements.map((row) => row.articleNo);
    if (articleNos.some((articleNo) => !articleNo?.trim())) {
      throw new BadRequestException('articleNo is required for every row');
    }
    if (new Set(articleNos).size !== articleNos.length) {
      throw new BadRequestException(
        'comparison contains the same articleNo more than once',
      );
    }
    if (
      dto.totalCount != null &&
      (!Number.isInteger(dto.totalCount) || dto.totalCount < 1)
    ) {
      throw new BadRequestException('totalCount must be a positive integer');
    }
    if (dto.totalCount != null && dto.advertisements.length < dto.totalCount) {
      throw new BadRequestException(
        `comparison list is incomplete: ${dto.advertisements.length} rows for totalCount ${dto.totalCount}. 목록 전체를 읽은 뒤 다시 넣어 주세요.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 같은 광고의 비교가 동시에 두 번 들어오면 기록이 뒤섞인다. 광고 한 줄에 줄을 세운다.
      await tx.$queryRaw`
        SELECT id FROM listing_advertisements
        WHERE id::text = ${dto.listingAdvertisementId} AND office_id::text = ${officeId}
        FOR NO KEY UPDATE
      `;
      const advertisement = await tx.listingAdvertisement.findFirst({
        where: { id: dto.listingAdvertisementId, officeId },
        select: {
          id: true,
          naverArticleNo: true,
          // 매물이 없는 광고는 광고에 적힌 거래유형을 쓴다
          transactionType: true,
          advertisedPrice: true,
          advertisedDeposit: true,
          advertisedMonthlyRent: true,
          listing: { select: { transactionType: true } },
        },
      });
      if (!advertisement) {
        throw new NotFoundException('ListingAdvertisement not found');
      }
      if (!advertisement.naverArticleNo) {
        throw new BadRequestException(
          'ListingAdvertisement.naverArticleNo is required before Naver comparison',
        );
      }
      if (!articleNos.includes(advertisement.naverArticleNo)) {
        throw new BadRequestException(
          'comparison data must contain the exact naverArticleNo of ListingAdvertisement',
        );
      }

      const observedAt = new Date();
      const [existing, officeArticleRows] = await Promise.all([
        tx.advertisementComparison.findMany({
          where: { advertisementId: advertisement.id },
          select: { articleNo: true },
        }),
        tx.listingAdvertisement.findMany({
          where: { officeId, status: 'active', naverArticleNo: { not: null } },
          select: { naverArticleNo: true },
        }),
      ]);
      const officeOwnArticleNos = new Set(
        officeArticleRows
          .map((row) => row.naverArticleNo)
          .filter((no): no is string => Boolean(no)),
      );
      if (advertisement.naverArticleNo) {
        officeOwnArticleNos.add(advertisement.naverArticleNo);
      }
      const existingArticleNos = new Set(existing.map((row) => row.articleNo));
      let created = 0;
      let updated = 0;

      for (const row of dto.advertisements) {
        // 같은 사무소의 다른 CP 계정이 올린 활성 광고 번호도 자동으로 우리 사무소 광고(isMine=true)로 잡는다.
        const isSisterMine =
          row.articleNo !== advertisement.naverArticleNo &&
          officeOwnArticleNos.has(row.articleNo);
        const normalizedRow: AdvertisementComparisonRowInput = isSisterMine
          ? { ...row, isMine: true }
          : row;
        await tx.advertisementComparison.upsert({
          where: {
            advertisementId_articleNo: {
              advertisementId: advertisement.id,
              articleNo: row.articleNo,
            },
          },
          create: this.rowCreateData(officeId, advertisement.id, normalizedRow, observedAt),
          update: this.rowUpdateData(normalizedRow, observedAt),
        });
        if (existingArticleNos.has(row.articleNo)) updated += 1;
        else created += 1;
      }

      // 이번 목록에 없는 줄은 네이버에서 내려간 것이다
      await tx.advertisementComparison.deleteMany({
        where: {
          advertisementId: advertisement.id,
          articleNo: { notIn: articleNos },
        },
      });

      const rows = withOwnRow(
        await tx.advertisementComparison.findMany({
          where: { advertisementId: advertisement.id },
        }),
        advertisement.naverArticleNo,
        officeOwnArticleNos,
      );
      const transactionType =
        advertisement.listing?.transactionType ??
        advertisement.transactionType ??
        'sale';
      const ownAdvertisement =
        rows.find((row) => row.articleNo === advertisement.naverArticleNo) ??
        null;
      const analysis = analyzeAdvertisementComparison({
        transactionType,
        advertisedPrice: advertisement.advertisedPrice,
        advertisedDeposit: advertisement.advertisedDeposit,
        advertisedMonthlyRent: advertisement.advertisedMonthlyRent,
        hasComparison: true,
        ownAdvertisement,
        rows,
      });
      const state = this.toRecordState(analysis, ownAdvertisement);
      const previous = await tx.advertisementComparisonRecord.findFirst({
        where: { advertisementId: advertisement.id },
        orderBy: { observedAt: 'desc' },
      });

      await tx.advertisementComparisonRecord.create({
        data: {
          officeId,
          advertisementId: advertisement.id,
          observedAt,
          ...state,
          totalCount:
            analysis.totalCount ?? rows.filter((row) => row.isActive).length,
          ownPrice: ownAdvertisement?.price ?? null,
          ownDeposit: ownAdvertisement?.deposit ?? null,
          ownMonthlyRent: ownAdvertisement?.monthlyRent ?? null,
          lowestCompetitorAmount: lowestCompetitorAmount(transactionType, rows),
          signal: analysis.primarySignal,
          changes: diffComparisonChanges(previous, state),
        },
      });
      await tx.listingAdvertisement.update({
        where: { id: advertisement.id },
        data: { lastCheckedAt: observedAt },
      });

      return { hadComparison: existing.length > 0 || !!previous, created, updated };
    });
  }

  private toRecordState(
    analysis: AdvertisementComparisonAnalysis<AdvertisementComparison>,
    main: AdvertisementComparison | null,
  ): ComparisonRecordState {
    return {
      ownVisible: main?.isActive ?? false,
      ownRanking: analysis.ownRanking,
      lowerPricedCount: analysis.lowerPricedCompetitorCount,
      ownFloorExposure: analysis.ownFloorExposureMode,
      exactFloorCompetitorCount: analysis.exactFloorCompetitorCount,
    };
  }

  /**
   * 아직 알리지 않은 변화를 한 알림으로 묶어 보낸다. 보낸 수(달라진 광고 수)를 돌려준다.
   *
   * 보낸 뒤에 "알렸음"으로 표시한다. 먼저 표시하면 그 뒤의 어느 단계가 실패하든(목록 읽기, 보내기,
   * 서버가 꺼짐) 그 변화는 다시 나가지 않는다. 보내기와 표시는 한 트랜잭션이라, 실패하면 표시가 남지 않고
   * 다음 올리기가 끝날 때 다시 묶여 나간다. 같은 사무소의 올리기 둘이 동시에 끝나도 같은 변화를
   * 두 번 알리지 않도록 사무소 단위로 줄을 세운다.
   */
  private notifyChanges(officeId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('advertisement-comparison-notify'), hashtext(${officeId}))`;
      const records = await tx.advertisementComparisonRecord.findMany({
        where: {
          officeId,
          notifiedAt: null,
          changes: { hasSome: ALERT_CHANGES },
        },
        select: { id: true, advertisementId: true, changes: true },
      });
      if (records.length === 0) return 0;

      const advertisementCount = new Set(
        records.map((record) => record.advertisementId),
      ).size;
      const summary = ALERT_CHANGES.map((change) => {
        const count = records.filter((record) =>
          record.changes.includes(change),
        ).length;
        return count > 0 ? `${ALERT_LABELS[change]} ${count}건` : null;
      }).filter((line): line is string => line !== null);

      await this.notifications.notify({
        officeId,
        roles: ['owner', 'manager', 'agent'],
        type: 'advertisement_comparison_changed',
        title: `네이버 비교에서 달라진 광고 ${advertisementCount}건`,
        content: summary.join(' · '),
        linkType: 'my_ads',
      });
      await tx.advertisementComparisonRecord.updateMany({
        where: { id: { in: records.map((record) => record.id) } },
        data: { notifiedAt: new Date() },
      });
      return advertisementCount;
    });
  }

  private rowCreateData(
    officeId: string,
    advertisementId: string,
    dto: AdvertisementComparisonRowInput,
    observedAt: Date,
  ): Prisma.AdvertisementComparisonUncheckedCreateInput {
    return {
      officeId,
      advertisementId,
      articleNo: dto.articleNo,
      sourceUrl: dto.sourceUrl ?? null,
      isMine: dto.isMine ?? false,
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

  private rowUpdateData(
    dto: AdvertisementComparisonRowInput,
    observedAt: Date,
  ): Prisma.AdvertisementComparisonUncheckedUpdateInput {
    return {
      sourceUrl: dto.sourceUrl ?? undefined,
      // 안 보냈으면 내 광고가 아닌 것으로 본다 (예전에 잘못 남은 표시를 이어 가지 않는다)
      isMine: dto.isMine ?? false,
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
}

/**
 * 게재 중인 경쟁 광고의 최저 주 금액(매매가 또는 전세 보증금).
 * 월세는 보증금 하나로 줄이면 보증금 · 월세의 맞바꿈을 "더 싸다"로 잘못 읽게 되어 만들지 않는다.
 */
function lowestCompetitorAmount(
  transactionType: string,
  rows: AdvertisementComparison[],
): number | null {
  if (transactionType === 'monthly') return null;
  const amounts = rows
    .filter((row) => row.isActive && !row.isMine)
    .map((row) =>
      transactionType === 'jeonse' ? (row.deposit ?? row.price) : row.price,
    )
    .filter((amount): amount is number => typeof amount === 'number');
  return amounts.length > 0 ? Math.min(...amounts) : null;
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
