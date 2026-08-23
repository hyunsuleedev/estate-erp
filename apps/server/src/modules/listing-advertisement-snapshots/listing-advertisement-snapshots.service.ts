import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const ACTIVE_SESSION_STATUS = "processing";
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

type JsonRecord = Record<string, unknown>;

export interface BeginListingAdvertisementSnapshotDto {
  channel: string;
  provider: string;
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
  listingId?: string | null;
  resolution?: JsonRecord | null;
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

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ListingAdvertisementSnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(
    officeId: string,
    userId: string,
    dto: BeginListingAdvertisementSnapshotDto,
  ) {
    const normalized = this.validateBeginDto(dto);
    const existing =
      await this.prisma.listingAdvertisementSnapshotSession.findFirst({
        where: {
          officeId,
          channel: normalized.channel,
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
          status: ACTIVE_SESSION_STATUS,
        },
        select: { id: true, status: true, manifestHash: true, createdAt: true },
      });
    if (active) {
      throw new ConflictException({
        message: `active advertisement snapshot session ${active.id} exists for channel`,
        session: active,
      });
    }

    try {
      const session =
        await this.prisma.listingAdvertisementSnapshotSession.create({
          data: {
            officeId,
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
              manifestHash: normalized.manifestHash,
            },
          });
        if (raced) return { session: raced, reused: true };

        const blocking =
          await this.prisma.listingAdvertisementSnapshotSession.findFirst({
            where: {
              officeId,
              channel: normalized.channel,
              status: ACTIVE_SESSION_STATUS,
            },
            select: { id: true },
          });
        throw new ConflictException(
          blocking
            ? `active advertisement snapshot session ${blocking.id} exists for channel`
            : "active advertisement snapshot session exists for channel",
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
    if ((listingId === null) === (errorMessage === null)) {
      throw new BadRequestException(
        "submit exactly one outcome: listingId with resolution, or error",
      );
    }
    if (listingId && !isRecord(dto.resolution)) {
      throw new BadRequestException(
        "resolution must be an object when listingId is submitted",
      );
    }
    if (errorMessage && dto.resolution != null) {
      throw new BadRequestException(
        "resolution must be omitted when an error is submitted",
      );
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

      const listing = listingId
        ? await tx.listing.findFirst({
            where: { id: listingId, officeId },
            select: {
              id: true,
              propertyId: true,
              intakeId: true,
              transactionType: true,
            },
          })
        : null;
      if (listingId && !listing) {
        throw new NotFoundException("listing not found");
      }

      const status = listing ? "resolved" : "failed";
      const resolution = listing
        ? asInputJson({
            ...(dto.resolution as JsonRecord),
            listingId: listing.id,
            propertyId: listing.propertyId,
            intakeId: listing.intakeId,
            transactionType: listing.transactionType,
          })
        : null;
      const submittedAt = new Date();

      const item = existing
        ? await tx.listingAdvertisementSnapshotItem.update({
            where: { id: existing.id },
            data: {
              status,
              listingId: listing?.id ?? null,
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
              listingId: listing?.id ?? null,
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
          message: "all snapshot items must be resolved before completion",
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

      if (items.some((item) => !item.listingId)) {
        throw new ConflictException(
          "a resolved snapshot item no longer has a listing",
        );
      }
      const listingIds = items.map((item) => item.listingId as string);
      if (new Set(listingIds).size !== listingIds.length) {
        throw new ConflictException(
          "multiple current CP advertisements resolved to the same listing",
        );
      }
      const externalAdIds = items.map((item) => item.externalAdId);

      const staleResult = await tx.listingAdvertisement.updateMany({
        where: {
          officeId,
          channel: session.channel,
          source: "cp_sync",
          status: "active",
          ...(externalAdIds.length > 0
            ? {
                OR: [
                  { externalAdId: null },
                  { externalAdId: { notIn: externalAdIds } },
                ],
              }
            : {}),
        },
        data: { status: "ended", endedAt: session.observedAt },
      });

      const existingAdvertisements =
        externalAdIds.length === 0
          ? []
          : await tx.listingAdvertisement.findMany({
              where: {
                officeId,
                channel: session.channel,
                status: "active",
                externalAdId: { in: externalAdIds },
              },
            });
      const existingByExternalAdId = new Map(
        existingAdvertisements.map((advertisement) => [
          advertisement.externalAdId,
          advertisement,
        ]),
      );

      let createdAdvertisements = 0;
      let updatedAdvertisements = 0;
      for (const item of items) {
        const raw = this.requireRecord(item.raw, item.externalAdId);
        const data = this.toAdvertisementData(
          item.listingId as string,
          item.externalAdId,
          session.observedAt,
          raw,
        );
        const existing = existingByExternalAdId.get(item.externalAdId);
        if (existing) {
          const priceChanged = this.advertisedPriceChanged(existing, data);
          await tx.listingAdvertisement.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(priceChanged && {
                priceHistories: {
                  create: {
                    officeId,
                    snapshotSessionId: session.id,
                    advertisedPrice: data.advertisedPrice,
                    advertisedDeposit: data.advertisedDeposit,
                    advertisedMonthlyRent: data.advertisedMonthlyRent,
                    observedAt: session.observedAt,
                    source: "cp_sync",
                  },
                },
              }),
            },
          });
          updatedAdvertisements += 1;
        } else {
          await tx.listingAdvertisement.create({
            data: {
              officeId,
              channel: session.channel,
              firstSeenAt: session.observedAt,
              ...data,
              priceHistories: {
                create: {
                  officeId,
                  snapshotSessionId: session.id,
                  advertisedPrice: data.advertisedPrice,
                  advertisedDeposit: data.advertisedDeposit,
                  advertisedMonthlyRent: data.advertisedMonthlyRent,
                  observedAt: session.observedAt,
                  source: "cp_sync",
                },
              },
            },
          });
          createdAdvertisements += 1;
        }
      }

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
    if (!channel || !CHANNEL_PATTERN.test(channel)) {
      throw new BadRequestException("channel must be a provider slug");
    }
    if (provider !== channel) {
      throw new BadRequestException("provider must match channel");
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
    listingId: string,
    externalAdId: string,
    observedAt: Date,
    raw: JsonRecord,
  ) {
    return {
      listingId,
      status: "active",
      source: "cp_sync",
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

  private advertisedPriceChanged(
    existing: {
      advertisedPrice: number | null;
      advertisedDeposit: number | null;
      advertisedMonthlyRent: number | null;
    },
    next: {
      advertisedPrice: number | null;
      advertisedDeposit: number | null;
      advertisedMonthlyRent: number | null;
    },
  ) {
    return (
      existing.advertisedPrice !== next.advertisedPrice ||
      existing.advertisedDeposit !== next.advertisedDeposit ||
      existing.advertisedMonthlyRent !== next.advertisedMonthlyRent
    );
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
