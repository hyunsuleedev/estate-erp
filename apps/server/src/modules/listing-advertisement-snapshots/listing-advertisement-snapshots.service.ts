import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  inferOfficeAdvertisementFloorExposureMode,
  OfficeAdvertisementFloorExposureMode,
} from "@estate-erp/shared";
import { Prisma, type ListingAdvertisement } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  assertValidAdvertisementRawFields,
  getAdvertisementLinkLevel,
  resolveAdvertisementLink,
} from "../listing-advertisements/advertisement-link";
import {
  advertisementStateChanged,
  findSameAdvertisement,
  mergeAdvertisements,
  recordAdvertisementHistory,
} from "../listing-advertisements/advertisement-identity";
import { OfficeCpAccountsService } from "../listing-advertisements/office-cp-accounts.service";

const ACTIVE_SESSION_STATUS = "processing";
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

type JsonRecord = Record<string, unknown>;

export interface BeginListingAdvertisementSnapshotDto {
  channel: string;
  provider: string;
  accountKey: string;
  scope: string;
  observedAt: string;
  expectedTotal: number | null;
  manifestHash: string;
  fileSha256?: string | null;
  activeFilter: JsonRecord;
  paginationComplete: boolean;
  visitedPages: number[];
}

export interface SubmitListingAdvertisementSnapshotItemDto {
  sessionId: string;
  raw: JsonRecord;
  /**
   * 이 광고가 우리 데이터의 어디까지 연결되는지. 아는 가장 깊은 단계 하나만 보낸다
   * (매물 > 관리 공간 > 건물). 아무것도 못 찾았으면 셋 다 비운다 — 광고는 매물 없이도 저장된다.
   */
  listingId?: string | null;
  propertyId?: string | null;
  siteId?: string | null;
  /** 어떻게 그 연결을 정했는지. 매물에 연결할 때는 꼭 적는다. */
  resolution?: JsonRecord | null;
  /** 광고 자체를 읽지 못했을 때만. 연결을 못 찾은 것은 오류가 아니다. */
  error?: string | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function rawText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

const TRANSACTION_TYPE_BY_TEXT: Record<string, string> = {
  sale: "sale",
  매매: "sale",
  jeonse: "jeonse",
  전세: "jeonse",
  monthly: "monthly",
  월세: "monthly",
  반전세: "monthly",
  단기임대: "monthly",
};

function normalizeTransactionType(value: unknown): string | null {
  const text = rawText(value);
  return text ? (TRANSACTION_TYPE_BY_TEXT[text.toLowerCase()] ?? null) : null;
}

function deriveFloorExposure(floorText: string | null): string | null {
  const mode = inferOfficeAdvertisementFloorExposureMode(floorText);
  return mode === OfficeAdvertisementFloorExposureMode.UNKNOWN ? null : mode;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ListingAdvertisementSnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cpAccounts?: OfficeCpAccountsService,
  ) {}

  async begin(
    officeId: string,
    userId: string,
    dto: BeginListingAdvertisementSnapshotDto,
  ) {
    const normalized = this.validateBeginDto(dto);
    const cpAccount = this.cpAccounts
      ? await this.cpAccounts.ensureAccount(
          this.prisma,
          officeId,
          normalized.channel,
          normalized.accountKey,
        )
      : await this.prisma.officeCpAccount.upsert({
          where: {
            officeId_channel_accountKey: {
              officeId,
              channel: normalized.channel,
              accountKey: normalized.accountKey,
            },
          },
          create: {
            officeId,
            channel: normalized.channel,
            accountKey: normalized.accountKey,
            isActive: true,
          },
          update: { isActive: true },
        });
    const cpAccountId = cpAccount.id;

    const existing =
      await this.prisma.listingAdvertisementSnapshotSession.findFirst({
        where: {
          officeId,
          channel: normalized.channel,
          cpAccountId,
          manifestHash: normalized.manifestHash,
        },
      });
    if (existing) {
      return { session: existing, reused: true };
    }

    const active =
      await this.prisma.listingAdvertisementSnapshotSession.findFirst({
        where: {
          officeId,
          channel: normalized.channel,
          cpAccountId,
          status: ACTIVE_SESSION_STATUS,
        },
        select: { id: true, status: true, manifestHash: true, createdAt: true },
      });
    if (active) {
      throw new ConflictException({
        message: `active advertisement snapshot session ${active.id} exists for account`,
        session: active,
      });
    }

    try {
      const session =
        await this.prisma.listingAdvertisementSnapshotSession.create({
          data: {
            officeId,
            cpAccountId,
            channel: normalized.channel,
            scope: normalized.scope,
            status: ACTIVE_SESSION_STATUS,
            observedAt: normalized.observedAt,
            expectedTotal: normalized.expectedTotal,
            manifestHash: normalized.manifestHash,
            fileSha256: normalized.fileSha256,
            activeFilter: asInputJson(normalized.activeFilter),
            paginationComplete: normalized.paginationComplete,
            visitedPages: normalized.visitedPages,
            startedById: userId,
          },
        });
      return { session, reused: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced =
          await this.prisma.listingAdvertisementSnapshotSession.findFirst({
            where: {
              officeId,
              channel: normalized.channel,
              cpAccountId,
              manifestHash: normalized.manifestHash,
            },
          });
        if (raced) return { session: raced, reused: true };

        const blocking =
          await this.prisma.listingAdvertisementSnapshotSession.findFirst({
            where: {
              officeId,
              channel: normalized.channel,
              cpAccountId,
              status: ACTIVE_SESSION_STATUS,
            },
            select: { id: true },
          });
        throw new ConflictException(
          blocking
            ? `active advertisement snapshot session ${blocking.id} exists for account`
            : "active advertisement snapshot session exists for account",
        );
      }
      throw error;
    }
  }

  async submitItem(
    officeId: string,
    userId: string,
    userRole: string,
    dto: SubmitListingAdvertisementSnapshotItemDto,
  ) {
    if (!dto.sessionId) {
      throw new BadRequestException("sessionId is required");
    }
    if (!isRecord(dto.raw)) {
      throw new BadRequestException("raw must be an object");
    }

    const listingId = dto.listingId?.trim() || null;
    const errorMessage = dto.error?.trim() || null;
    const hasLink = Boolean(
      listingId || dto.propertyId?.trim() || dto.siteId?.trim(),
    );
    // 결과는 둘 중 하나다: 읽었다(연결은 찾은 만큼, 못 찾았어도 된다) / 광고를 읽지 못했다(error).
    if (errorMessage && (hasLink || dto.resolution != null)) {
      throw new BadRequestException(
        "an item with an error cannot carry a link or resolution",
      );
    }
    if (listingId && !isRecord(dto.resolution)) {
      throw new BadRequestException(
        "resolution must be an object when listingId is submitted",
      );
    }
    if (dto.resolution != null && !isRecord(dto.resolution)) {
      throw new BadRequestException("resolution must be an object");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, officeId, dto.sessionId);
      const session = await tx.listingAdvertisementSnapshotSession.findFirst({
        where: {
          id: dto.sessionId,
          officeId,
          status: ACTIVE_SESSION_STATUS,
        },
      });
      if (!session) {
        throw new NotFoundException("active advertisement snapshot not found");
      }
      this.ensureCanManageSession(session, userId, userRole);

      const prepared = this.prepareRawItem(dto.raw, session);
      const existing = await tx.listingAdvertisementSnapshotItem.findFirst({
        where: {
          officeId,
          sessionId: session.id,
          externalAdId: prepared.externalAdId,
        },
      });
      if (existing && existing.itemHash !== prepared.itemHash) {
        throw new ConflictException(
          `externalAdId ${prepared.externalAdId} was already submitted with different raw data`,
        );
      }

      const link = errorMessage
        ? { listingId: null, propertyId: null, siteId: null, transactionType: null }
        : await resolveAdvertisementLink(tx, officeId, dto);
      const listing = link.listingId
        ? await tx.listing.findFirst({
            where: { id: link.listingId, officeId },
            select: { id: true, intakeId: true },
          })
        : null;

      const status = errorMessage ? "failed" : "resolved";
      const resolution = errorMessage
        ? null
        : asInputJson({
            ...((dto.resolution as JsonRecord | null | undefined) ?? {}),
            linkLevel: getAdvertisementLinkLevel(link),
            listingId: link.listingId,
            propertyId: link.propertyId,
            siteId: link.siteId,
            intakeId: listing?.intakeId ?? null,
            transactionType: link.transactionType,
          });
      const submittedAt = new Date();

      const item = existing
        ? await tx.listingAdvertisementSnapshotItem.update({
            where: { id: existing.id },
            data: {
              status,
              listingId: link.listingId,
              propertyId: link.propertyId,
              siteId: link.siteId,
              resolution: resolution ?? Prisma.DbNull,
              error: errorMessage,
              submittedById: userId,
              submittedAt,
              attemptCount: { increment: 1 },
            },
          })
        : await tx.listingAdvertisementSnapshotItem.create({
            data: {
              officeId,
              sessionId: session.id,
              externalAdId: prepared.externalAdId,
              status,
              raw: asInputJson(prepared.raw),
              itemHash: prepared.itemHash,
              listingId: link.listingId,
              propertyId: link.propertyId,
              siteId: link.siteId,
              ...(resolution ? { resolution } : {}),
              error: errorMessage,
              submittedById: userId,
              submittedAt,
            },
          });

      const submittedItems = await tx.listingAdvertisementSnapshotItem.findMany(
        {
          where: { officeId, sessionId: session.id },
          select: { status: true },
        },
      );
      const receivedCount = submittedItems.length;
      const resolvedCount = submittedItems.filter(
        (submitted) => submitted.status === "resolved",
      ).length;
      if (
        session.expectedTotal !== null &&
        receivedCount > session.expectedTotal
      ) {
        throw new ConflictException(
          "submitted item count exceeds expectedTotal",
        );
      }

      await tx.listingAdvertisementSnapshotSession.update({
        where: { id: session.id },
        data: { receivedCount, resolvedCount },
      });

      return {
        item,
        created: !existing,
        progress: {
          receivedCount,
          resolvedCount,
          failedCount: receivedCount - resolvedCount,
          expectedTotal: session.expectedTotal,
          remainingCount:
            session.expectedTotal === null
              ? null
              : session.expectedTotal - receivedCount,
        },
      };
    });
  }

  async get(officeId: string, sessionId: string) {
    const session =
      await this.prisma.listingAdvertisementSnapshotSession.findFirst({
        where: { id: sessionId, officeId },
      });
    if (!session) {
      throw new NotFoundException("advertisement snapshot not found");
    }

    if (session.status === "completed") {
      const received = session.receivedCount;
      const resolved = session.resolvedCount;
      return {
        session,
        counts: {
          received,
          resolved,
          failed: Math.max(0, received - resolved),
          remaining:
            session.expectedTotal === null
              ? null
              : Math.max(0, session.expectedTotal - received),
        },
        failedItems: [],
        submittedItems: [],
      };
    }

    const items = await this.prisma.listingAdvertisementSnapshotItem.findMany({
      where: { officeId, sessionId },
      select: {
        id: true,
        externalAdId: true,
        status: true,
        listingId: true,
        attemptCount: true,
        error: true,
        submittedAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { externalAdId: "asc" }],
    });
    const resolvedCount = items.filter(
      (item) => item.status === "resolved",
    ).length;
    const failedItems = items.filter((item) => item.status === "failed");

    return {
      session,
      counts: {
        received: items.length,
        resolved: resolvedCount,
        failed: failedItems.length,
        remaining:
          session.expectedTotal === null
            ? null
            : Math.max(0, session.expectedTotal - items.length),
      },
      failedItems,
      submittedItems: items,
    };
  }

  async complete(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, officeId, sessionId);
      const session = await tx.listingAdvertisementSnapshotSession.findFirst({
        where: { id: sessionId, officeId },
      });
      if (!session) throw new NotFoundException("snapshot session not found");
      if (session.status === "completed") {
        await tx.listingAdvertisementSnapshotItem.deleteMany({
          where: { officeId, sessionId },
        });
        return this.completedSummary(session);
      }
      if (session.status === "cancelled") {
        throw new ConflictException("snapshot session was cancelled");
      }
      this.ensureCanManageSession(session, userId, userRole);

      const items = await tx.listingAdvertisementSnapshotItem.findMany({
        where: { officeId, sessionId },
        orderBy: { externalAdId: "asc" },
      });
      if (
        session.expectedTotal !== null &&
        items.length !== session.expectedTotal
      ) {
        throw new ConflictException(
          `expected ${session.expectedTotal} items but received ${items.length}`,
        );
      }
      const unresolved = items.filter((item) => item.status !== "resolved");
      if (unresolved.length > 0) {
        throw new ConflictException({
          message: "items submitted with an error must be resubmitted before completion",
          unresolved: unresolved.map((item) => ({
            id: item.id,
            externalAdId: item.externalAdId,
            status: item.status,
            error: item.error,
          })),
        });
      }

      const manifestItems = [...items].sort((left, right) =>
        left.externalAdId.localeCompare(right.externalAdId),
      );
      const computedManifestHash = hashCanonicalJson({
        provider: session.channel,
        scope: session.scope,
        activeFilter: session.activeFilter,
        observedAt: session.observedAt.toISOString(),
        expectedTotal: session.expectedTotal,
        paginationComplete: session.paginationComplete,
        visitedPages: session.visitedPages,
        items: manifestItems.map((item) => item.raw),
      });
      if (computedManifestHash !== session.manifestHash) {
        throw new ConflictException(
          "manifestHash does not match the submitted snapshot items",
        );
      }

      // 한 계정·채널 안에서는 한 매물에 게재 중 광고가 하나다. 다른 계정끼리는 같은 매물 광고 가능.
      const listingIds = items.flatMap((item) =>
        item.listingId ? [item.listingId] : [],
      );
      if (new Set(listingIds).size !== listingIds.length) {
        throw new ConflictException(
          "multiple current CP advertisements resolved to the same listing",
        );
      }

      const links = new Map<string, Awaited<ReturnType<typeof resolveAdvertisementLink>>>();
      for (const item of items) {
        try {
          links.set(
            item.id,
            await resolveAdvertisementLink(tx, officeId, item),
          );
        } catch {
          throw new ConflictException({
            message:
              "a submitted item points at a listing, property, or site that no longer exists; resubmit it",
            externalAdId: item.externalAdId,
          });
        }
      }
      const externalAdIds = items.map((item) => item.externalAdId);

      const activeAccountCount = this.cpAccounts
        ? await this.cpAccounts.countActiveByChannel(tx, officeId, session.channel)
        : await tx.officeCpAccount.count({
            where: { officeId, channel: session.channel, isActive: true },
          });

      // 이번 스냅샷에 없는 활성 광고를 종료한다 (source 구분 없이 계정 범위 + 시간 보호 적용).
      // 단일 계정 사무소는 cpAccountId=null 수동 광고도 누락 종료 대상에 포함하고,
      // 다중 계정 사무소는 다른 계정 광고 오종료를 막기 위해 cpAccountId가 일치하는 행만 종료한다.
      const staleAdvertisements = await tx.listingAdvertisement.findMany({
        where: {
          officeId,
          channel: session.channel,
          status: "active",
          firstSeenAt: { lte: session.observedAt },
          AND: [
            {
              OR: [
                { manualEditedAt: null },
                { manualEditedAt: { lte: session.observedAt } },
              ],
            },
            ...(session.cpAccountId && activeAccountCount <= 1
              ? [
                  {
                    OR: [
                      { cpAccountId: session.cpAccountId },
                      { cpAccountId: null },
                    ],
                  },
                ]
              : session.cpAccountId
                ? [{ cpAccountId: session.cpAccountId }]
                : []),
            ...(externalAdIds.length > 0
              ? [
                  {
                    OR: [
                      { externalAdId: null },
                      { externalAdId: { notIn: externalAdIds } },
                    ],
                  },
                ]
              : []),
          ],
        },
      });
      const endedAdvertisementIds = new Set<string>();
      for (const stale of staleAdvertisements) {
        const ended = await tx.listingAdvertisement.update({
          where: { id: stale.id },
          data: { status: "ended", endedAt: session.observedAt },
        });
        endedAdvertisementIds.add(ended.id);
        await recordAdvertisementHistory(tx, ended, {
          observedAt: session.observedAt,
          source: "cp_sync",
          snapshotSessionId: session.id,
        });
      }
      const staleResult = { count: staleAdvertisements.length };

      let createdAdvertisements = 0;
      let updatedAdvertisements = 0;
      const touched = new Map<string, string>();
      const syncedAdsById = new Map<string, ListingAdvertisement>();
      const syncedAdsByListingId = new Map<string, ListingAdvertisement>();

      for (const item of items) {
        const raw = this.requireRecord(item.raw, item.externalAdId);
        const link = links.get(item.id)!;
        const data = this.toAdvertisementData(
          item.externalAdId,
          session.observedAt,
          raw,
        );
        const foundLink = getAdvertisementLinkLevel(link) !== "none";

        const same = await findSameAdvertisement(tx, officeId, {
          channel: session.channel,
          cpAccountId: session.cpAccountId ?? null,
          externalAdId: item.externalAdId,
          listingId: link.listingId,
          propertyId: link.propertyId,
          transactionType: link.transactionType ?? data.transactionType,
        });
        if (
          same.byKey &&
          same.byExternalAdId &&
          same.byKey.id !== same.byExternalAdId.id &&
          !touched.has(same.byKey.id)
        ) {
          same.byKey = await mergeAdvertisements(tx, same.byExternalAdId, same.byKey);
        }
        const existing = same.byKey ?? same.byExternalAdId;
        if (existing && touched.has(existing.id)) {
          throw new ConflictException(
            `CP 광고 ${touched.get(existing.id)}와 ${item.externalAdId}가 같은 매물 · 같은 채널(계정)에 이어져 있습니다. 연결을 확인해 주세요.`,
          );
        }
        if (existing) {
          // 스냅샷 관측 시각 이후에 사람이 직접 수정했다면 수동 입력값을 보호한다.
          const protectedByManualEdit =
            existing.manualEditedAt != null &&
            existing.manualEditedAt.getTime() > session.observedAt.getTime();
          const updated = await tx.listingAdvertisement.update({
            where: { id: existing.id },
            data: protectedByManualEdit
              ? {
                  ...(session.cpAccountId && !existing.cpAccountId
                    ? { cpAccountId: session.cpAccountId }
                    : {}),
                  ...(foundLink && {
                    listingId: link.listingId,
                    propertyId: link.propertyId,
                    siteId: link.siteId,
                  }),
                }
              : {
                  ...data,
                  ...(session.cpAccountId ? { cpAccountId: session.cpAccountId } : {}),
                  status: "active",
                  endedAt: null,
                  ...(foundLink && {
                    listingId: link.listingId,
                    propertyId: link.propertyId,
                    siteId: link.siteId,
                  }),
                  transactionType:
                    (foundLink ? link.transactionType : null) ??
                    data.transactionType ??
                    existing.transactionType,
                },
          });
          if (!protectedByManualEdit && advertisementStateChanged(existing, updated)) {
            await recordAdvertisementHistory(tx, updated, {
              observedAt: session.observedAt,
              source: "cp_sync",
              snapshotSessionId: session.id,
            });
          }
          touched.set(updated.id, item.externalAdId);
          syncedAdsById.set(updated.id, updated);
          if (updated.listingId) syncedAdsByListingId.set(updated.listingId, updated);
          updatedAdvertisements += 1;
        } else {
          const created = await tx.listingAdvertisement.create({
            data: {
              officeId,
              cpAccountId: session.cpAccountId ?? null,
              channel: session.channel,
              firstSeenAt: session.observedAt,
              ...data,
              listingId: link.listingId,
              propertyId: link.propertyId,
              siteId: link.siteId,
              transactionType: link.transactionType ?? data.transactionType,
            },
          });
          await recordAdvertisementHistory(tx, created, {
            observedAt: session.observedAt,
            source: "cp_sync",
            snapshotSessionId: session.id,
          });
          touched.set(created.id, item.externalAdId);
          syncedAdsById.set(created.id, created);
          if (created.listingId) syncedAdsByListingId.set(created.listingId, created);
          createdAdvertisements += 1;
        }
      }

      if (session.cpAccountId) {
        await tx.officeCpAccount.update({
          where: { id: session.cpAccountId },
          data: { lastSyncedAt: session.observedAt },
        });
      }

      // 열린 변경 요청이 이번 완전 스냅샷으로 충족됐으면 verified 전이 및 묶음 Task 완료
      await this.verifyChangeRequestsFromSnapshot(tx, {
        officeId,
        channel: session.channel,
        cpAccountId: session.cpAccountId ?? null,
        activeAccountCount,
        observedAt: session.observedAt,
        syncedAdsById,
        syncedAdsByListingId,
        endedAdvertisementIds,
      });

      const completed = await tx.listingAdvertisementSnapshotSession.update({
        where: { id: session.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          completedById: userId,
          receivedCount: items.length,
          resolvedCount: items.length,
          createdAdvertisements,
          updatedAdvertisements,
          staleAdvertisementsMarked: staleResult.count,
        },
      });
      await tx.listingAdvertisementSnapshotItem.deleteMany({
        where: { officeId, sessionId },
      });
      return this.completedSummary(completed);
    });
  }

  private async verifyChangeRequestsFromSnapshot(
    tx: Prisma.TransactionClient,
    params: {
      officeId: string;
      channel: string;
      cpAccountId: string | null;
      activeAccountCount: number;
      observedAt: Date;
      syncedAdsById: Map<string, ListingAdvertisement>;
      syncedAdsByListingId: Map<string, ListingAdvertisement>;
      endedAdvertisementIds: Set<string>;
    },
  ) {
    const openRequests = await tx.advertisementChangeRequest.findMany({
      where: {
        officeId: params.officeId,
        channel: params.channel,
        status: { in: ["requested", "in_progress", "executed"] },
        createdAt: { lte: params.observedAt },
        ...(params.cpAccountId && params.activeAccountCount <= 1
          ? { OR: [{ cpAccountId: params.cpAccountId }, { cpAccountId: null }] }
          : params.cpAccountId
            ? { cpAccountId: params.cpAccountId }
            : {}),
      },
    });
    if (openRequests.length === 0) return;

    const touchedTaskIds = new Set<string>();
    for (const req of openRequests) {
      let verifiedAdId: string | null | undefined;
      let verified = false;
      const target = isRecord(req.targetValue) ? req.targetValue : {};
      const base = isRecord(req.baseSnapshot) ? req.baseSnapshot : {};

      if (req.action === "publish" && req.listingId) {
        const synced = params.syncedAdsByListingId.get(req.listingId);
        if (synced && synced.status === "active") {
          verified = true;
          verifiedAdId = synced.id;
        }
      } else if (req.advertisementId) {
        if (req.action === "takedown") {
          if (params.endedAdvertisementIds.has(req.advertisementId)) {
            verified = true;
          }
        } else {
          const synced = params.syncedAdsById.get(req.advertisementId);
          if (synced && synced.status === "active") {
            if (req.action === "update") {
              const checks = [
                target.price === undefined || target.price === synced.advertisedPrice,
                target.deposit === undefined || target.deposit === synced.advertisedDeposit,
                target.monthlyRent === undefined ||
                  target.monthlyRent === synced.advertisedMonthlyRent,
                target.floorExposure === undefined ||
                  target.floorExposure === synced.floorExposure,
              ];
              verified = checks.every(Boolean);
            } else if (req.action === "readvertise") {
              const articleChanged =
                typeof base.naverArticleNo === "string" &&
                synced.naverArticleNo != null &&
                synced.naverArticleNo !== base.naverArticleNo;
              const wasEnded = base.status === "ended";
              const startedChanged =
                typeof base.startedAt === "string" &&
                synced.startedAt != null &&
                synced.startedAt.toISOString() !== base.startedAt;
              verified = articleChanged || wasEnded || startedChanged;
            }
          }
        }
      }

      if (verified) {
        await tx.advertisementChangeRequest.update({
          where: { id: req.id },
          data: {
            status: "verified",
            verifiedAt: params.observedAt,
            ...(verifiedAdId ? { advertisementId: verifiedAdId } : {}),
          },
        });
        if (req.taskId) touchedTaskIds.add(req.taskId);
      }
    }

    for (const taskId of touchedTaskIds) {
      const siblings = await tx.advertisementChangeRequest.findMany({
        where: { officeId: params.officeId, taskId },
        select: { status: true },
      });
      const allDone =
        siblings.length > 0 &&
        siblings.every(
          (row) => row.status === "verified" || row.status === "cancelled",
        );
      if (allDone) {
        await tx.task.updateMany({
          where: {
            id: taskId,
            officeId: params.officeId,
            status: { in: ["pending", "in_progress"] },
          },
          data: { status: "completed" },
        });
      }
    }
  }

  async cancel(
    officeId: string,
    userId: string,
    userRole: string,
    sessionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, officeId, sessionId);
      const session = await tx.listingAdvertisementSnapshotSession.findFirst({
        where: { id: sessionId, officeId },
      });
      if (!session) throw new NotFoundException("snapshot session not found");
      if (session.status === "completed") {
        throw new ConflictException("completed snapshot cannot be cancelled");
      }
      if (session.status === "cancelled") return session;
      this.ensureCanManageSession(session, userId, userRole);
      return tx.listingAdvertisementSnapshotSession.update({
        where: { id: session.id },
        data: {
          status: "cancelled",
          completedAt: new Date(),
          completedById: userId,
        },
      });
    });
  }

  private validateBeginDto(dto: BeginListingAdvertisementSnapshotDto) {
    const channel = dto.channel?.trim().toLowerCase();
    const provider = dto.provider?.trim().toLowerCase();
    const accountKey = dto.accountKey?.trim();
    if (!channel || !CHANNEL_PATTERN.test(channel)) {
      throw new BadRequestException("channel must be a provider slug");
    }
    if (provider !== channel) {
      throw new BadRequestException("provider must match channel");
    }
    if (!accountKey) {
      throw new BadRequestException("accountKey (CP login ID) is required");
    }
    if (dto.scope !== "active_advertisements") {
      throw new BadRequestException("scope must be active_advertisements");
    }
    const observedAt = new Date(dto.observedAt);
    if (
      !dto.observedAt ||
      Number.isNaN(observedAt.getTime()) ||
      !/[T ]\d{2}:\d{2}/.test(dto.observedAt)
    ) {
      throw new BadRequestException("observedAt must be a valid timestamp");
    }
    if (
      dto.expectedTotal !== null &&
      (!Number.isInteger(dto.expectedTotal) || dto.expectedTotal < 0)
    ) {
      throw new BadRequestException(
        "expectedTotal must be a non-negative integer or null",
      );
    }
    if (!SHA_256_PATTERN.test(dto.manifestHash ?? "")) {
      throw new BadRequestException("manifestHash must be a SHA-256 hex value");
    }
    if (dto.fileSha256 && !SHA_256_PATTERN.test(dto.fileSha256)) {
      throw new BadRequestException("fileSha256 must be a SHA-256 hex value");
    }
    if (!isRecord(dto.activeFilter)) {
      throw new BadRequestException("activeFilter must be an object");
    }
    if (dto.activeFilter.selected !== true) {
      throw new BadRequestException("activeFilter.selected must be true");
    }
    if (channel === "esiljang" && dto.activeFilter.dataValue !== "ad") {
      throw new BadRequestException(
        "Esiljang activeFilter.dataValue must be ad",
      );
    }
    if (dto.activeFilter.count !== dto.expectedTotal) {
      throw new BadRequestException(
        "activeFilter.count must match expectedTotal",
      );
    }
    if (dto.paginationComplete !== true) {
      throw new BadRequestException("paginationComplete must be true");
    }
    this.assertContiguousPages(dto.visitedPages);

    return {
      channel,
      accountKey,
      scope: dto.scope,
      observedAt,
      expectedTotal: dto.expectedTotal,
      manifestHash: dto.manifestHash,
      fileSha256: dto.fileSha256 ?? null,
      activeFilter: dto.activeFilter,
      paginationComplete: true,
      visitedPages: dto.visitedPages,
    };
  }

  private prepareRawItem(
    raw: JsonRecord,
    session: { channel: string; observedAt: Date; visitedPages: number[] },
  ) {
    const externalAdId =
      typeof raw.externalAdId === "string" ? raw.externalAdId.trim() : "";
    if (!externalAdId) {
      throw new BadRequestException("raw.externalAdId is required");
    }
    if (raw.provider !== session.channel) {
      throw new BadRequestException("raw.provider must match session channel");
    }
    if (raw.observedAt !== session.observedAt.toISOString()) {
      throw new BadRequestException(
        "raw.observedAt must match session observedAt",
      );
    }
    if (
      !Number.isInteger(raw.sourcePage) ||
      !session.visitedPages.includes(raw.sourcePage as number)
    ) {
      throw new BadRequestException(
        "raw.sourcePage must appear in visitedPages",
      );
    }
    return { raw, externalAdId, itemHash: hashCanonicalJson(raw) };
  }

  private assertContiguousPages(pages: number[]) {
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new BadRequestException(
        "visitedPages must contain positive contiguous pages",
      );
    }
    for (let index = 0; index < pages.length; index += 1) {
      if (pages[index] !== index + 1) {
        throw new BadRequestException(
          "visitedPages must be ordered and contiguous from page 1",
        );
      }
    }
  }

  private async lockSession(
    tx: Prisma.TransactionClient,
    officeId: string,
    sessionId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "listing_advertisement_snapshot_sessions"
      WHERE "id" = ${sessionId}::uuid AND "office_id" = ${officeId}::uuid
      FOR UPDATE
    `);
  }

  private ensureCanManageSession(
    session: { startedById: string },
    userId: string,
    userRole: string,
  ) {
    if (userRole === "owner" || userRole === "manager") return;
    if (session.startedById === userId) return;
    throw new ForbiddenException(
      "only the session starter (or manager/owner) can process this session",
    );
  }

  private requireRecord(value: unknown, externalAdId: string): JsonRecord {
    if (!isRecord(value)) {
      throw new ConflictException(
        `submitted raw item is invalid: ${externalAdId}`,
      );
    }
    return value;
  }

  private toAdvertisementData(
    externalAdId: string,
    observedAt: Date,
    raw: JsonRecord,
  ) {
    const floorText = rawText(raw.floorText ?? raw.floor);
    const fullAddress = rawText(raw.fullAddress);
    const fullAddressIsRoad = fullAddress ? /(로|길)\s*\d/.test(fullAddress) : false;
    const fields = {
      transactionType: normalizeTransactionType(raw.transactionType),
      rawJibunAddress:
        rawText(raw.jibunAddress) ?? (fullAddressIsRoad ? null : fullAddress),
      rawRoadAddress:
        rawText(raw.roadAddress) ?? (fullAddressIsRoad ? fullAddress : null),
      rawSiteName: rawText(raw.siteName ?? raw.complexName),
      rawDong: rawText(raw.dong),
      rawHo: rawText(raw.ho),
      rawFloorText: floorText,
      rawAreaM2:
        typeof raw.areaM2 === "number" && Number.isFinite(raw.areaM2) && raw.areaM2 > 0
          ? raw.areaM2
          : null,
      floorExposure:
        rawText(raw.floorExposure) ?? deriveFloorExposure(floorText),
    };
    try {
      assertValidAdvertisementRawFields(fields);
    } catch (error) {
      throw new ConflictException(
        `submitted advertisement ${externalAdId} is invalid: ${(error as Error).message}`,
      );
    }
    return {
      ...fields,
      status: "active",
      advertisedPrice: this.nullableInteger(raw.advertisedPrice),
      advertisedDeposit: this.nullableInteger(raw.advertisedDeposit),
      advertisedMonthlyRent: this.nullableInteger(raw.advertisedMonthlyRent),
      startedAt: this.nullableDate(raw.registeredAt),
      endedAt: null,
      url: this.nullableString(raw.providerUrl),
      memo: this.nullableString(raw.memo),
      externalAdId,
      naverArticleNo: this.nullableString(raw.naverArticleNo),
      naverUrl: this.nullableString(raw.naverUrl),
      providerStatus: this.nullableString(raw.providerStatus),
      providerStatusObservedAt: observedAt,
      lastSeenAt: observedAt,
      lastSyncedAt: observedAt,
    };
  }

  private nullableInteger(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new ConflictException("submitted advertisement price is invalid");
    }
    return value as number;
  }

  private nullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") {
      throw new ConflictException("submitted advertisement text is invalid");
    }
    return value;
  }

  private nullableDate(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") {
      throw new ConflictException("submitted advertisement date is invalid");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException("submitted advertisement date is invalid");
    }
    return parsed;
  }

  private completedSummary(session: {
    id: string;
    status: string;
    receivedCount: number;
    resolvedCount: number;
    createdAdvertisements: number | null;
    updatedAdvertisements: number | null;
    staleAdvertisementsMarked: number | null;
    completedAt: Date | null;
  }) {
    return {
      sessionId: session.id,
      status: session.status,
      receivedCount: session.receivedCount,
      resolvedCount: session.resolvedCount,
      createdAdvertisements: session.createdAdvertisements ?? 0,
      updatedAdvertisements: session.updatedAdvertisements ?? 0,
      staleAdvertisementsMarked: session.staleAdvertisementsMarked ?? 0,
      completedAt: session.completedAt,
    };
  }
}
