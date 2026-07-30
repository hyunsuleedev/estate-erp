import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AdvertisementTakedownReason,
  ESILJANG_AD_MANAGER_SKILL_KEY,
  NAVER_READER_SKILL_KEY,
  AgentActionBlockerReason,
  AgentActionCapability,
  AgentActionExecutionMode,
  AgentActionExecutionStatus,
  AgentActionReviewStatus,
  AgentActionVerificationResult,
  AgentActionVerificationStatus,
  type AdvertisementTakedownPayload,
  type AdvertisementTermsSetPayload,
  type AgentActionPayload,
} from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { hashCanonicalJson, toJsonValue } from "./agent-action-hash.util";
import type {
  CreateAgentActionRequestInput,
  DecideAgentActionRequestInput,
  ListAgentActionRequestsOptions,
  RecordAgentActionExecutionInput,
  ReportAgentActionBlockerInput,
  RejectAgentActionRequestInput,
  WithdrawAgentActionRequestInput,
  AgentActionActor,
} from "./agent-action-requests.types";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_RATIONALE_LENGTH = 2_000;
const MAX_INPUT_PAYLOAD_BYTES = 16_384;
const MAX_RECEIPT_BYTES = 16_384;
const MAX_BLOCKER_EVIDENCE_BYTES = 16_384;
const MAX_KEY_LENGTH = 200;
const OBSERVATION_TTL_MS = 2 * 60 * 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const EXECUTION_RECORDED_STATUSES = new Set<string>([
  AgentActionExecutionStatus.SUCCEEDED,
  AgentActionExecutionStatus.FAILED,
]);

const requestInclude = {
  reviewer: {
    select: { id: true, name: true, role: true },
  },
  escalationTask: {
    select: {
      id: true,
      title: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  },
  listingAdvertisement: {
    select: {
      id: true,
      listingId: true,
      channel: true,
      status: true,
      advertisedPrice: true,
      advertisedDeposit: true,
      advertisedMonthlyRent: true,
      externalAdId: true,
      naverArticleNo: true,
      naverUrl: true,
      url: true,
      lastCheckedAt: true,
      lastSyncedAt: true,
    },
  },
  createdByUser: { select: { id: true, name: true, role: true } },
  decidedBy: { select: { id: true, name: true, role: true } },
  executedBy: { select: { id: true, name: true, role: true } },
  verifications: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.AgentActionRequestInclude;

type AgentActionRequestWithRelations = Prisma.AgentActionRequestGetPayload<{
  include: typeof requestInclude;
}>;

const officeAdvertisementEvidenceSelect = {
  id: true,
  articleNo: true,
  sourceUrl: true,
  isMine: true,
  isMain: true,
  isActive: true,
  articleName: true,
  realtorName: true,
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
  lastSeenAt: true,
} satisfies Prisma.OfficeAdvertisementSelect;

const actionSourceSelect = {
  id: true,
  listingId: true,
  channel: true,
  status: true,
  advertisedPrice: true,
  advertisedDeposit: true,
  advertisedMonthlyRent: true,
  externalAdId: true,
  naverArticleNo: true,
  lastSyncedAt: true,
  listing: {
    select: {
      property: {
        select: {
          site: { select: { name: true } },
          unit: {
            select: {
              name: true,
              floor: true,
              dong: { select: { name: true } },
              siteUnitType: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  officeAdvertisementGroup: {
    select: {
      id: true,
      mainAdvertisementId: true,
      ownPrice: true,
      ownDeposit: true,
      ownMonthlyRent: true,
      relatedPriceMin: true,
      relatedPriceMax: true,
      relatedCount: true,
      lastSeenAt: true,
      lastSyncedAt: true,
      mainAdvertisement: { select: officeAdvertisementEvidenceSelect },
      advertisements: {
        select: officeAdvertisementEvidenceSelect,
        orderBy: [{ isMine: "desc" as const }, { ranking: "asc" as const }],
      },
    },
  },
} satisfies Prisma.ListingAdvertisementSelect;

type ActionSourceRecord = Prisma.ListingAdvertisementGetPayload<{
  select: typeof actionSourceSelect;
}>;

type AdvertisementState = {
  schemaVersion: 1;
  listingAdvertisementId: string;
  channel: string;
  externalAdId: string | null;
  articleNo: string;
  isActive: boolean;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  lastSyncedAt: string | null;
};

type AdvertisementComparisonState = {
  schemaVersion: 1;
  officeAdvertisementGroupId: string;
  mainAdvertisementId: string;
  observedAt: string;
  ownPrice: number | null;
  ownDeposit: number | null;
  ownMonthlyRent: number | null;
  relatedPriceMin: number | null;
  relatedPriceMax: number | null;
  relatedCount: number;
  mainAdvertisement: Record<string, unknown>;
  advertisements: Array<Record<string, unknown>>;
};

type AdvertisementRequestBaseState = {
  schemaVersion: 1;
  target: AdvertisementState;
  comparison: AdvertisementComparisonState;
};

type ComputerUseExecutionReceipt = {
  schemaVersion: 1;
  provider: "esiljang";
  operationKey: string;
  articleNo: string;
  observedAt: string;
  observedAfter: {
    isActive: boolean;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
    republished: boolean;
  };
  providerUrl: string | null;
  screenshotArtifactId: string | null;
  confirmationText: string | null;
};

type ApprovalResult =
  | { kind: "ok"; request: unknown }
  | { kind: "expired" }
  | { kind: "stale" };

@Injectable()
export class AgentActionRequestsService {
  private readonly logger = new Logger(AgentActionRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    officeId: string,
    input: CreateAgentActionRequestInput,
    actor: AgentActionActor,
  ): Promise<AgentActionRequestWithRelations> {
    this.assertNonBlank(officeId, "officeId");
    this.assertNonBlank(input.reviewerId, "reviewerId");
    this.assertNonBlank(input.listingAdvertisementId, "listingAdvertisementId");
    const rationale = this.normalizeText(
      input.rationale,
      "rationale",
      MAX_RATIONALE_LENGTH,
    );
    this.assertJsonSize(input.payload, "payload", MAX_INPUT_PAYLOAD_BYTES);

    const executionMode =
      input.executionMode ?? AgentActionExecutionMode.MANUAL;
    if (executionMode !== AgentActionExecutionMode.MANUAL) {
      throw new BadRequestException(
        "Remote connector mode is not enabled. Use manual executionMode with the attended computer-use-v1 skill.",
      );
    }

    const [reviewer, listingAdvertisement] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: input.reviewerId, officeId, isActive: true },
        select: {
          id: true,
          name: true,
          role: true,
        },
      }),
      this.prisma.listingAdvertisement.findFirst({
        where: { id: input.listingAdvertisementId, officeId },
        select: actionSourceSelect,
      }),
    ]);

    if (!reviewer) throw new NotFoundException("Active reviewer not found");
    if (!listingAdvertisement) {
      throw new NotFoundException("ListingAdvertisement not found");
    }
    const state = this.buildAdvertisementState(listingAdvertisement);
    const comparison = this.buildAdvertisementComparison(listingAdvertisement);
    const baseState = this.buildRequestBaseState(state, comparison);
    const baseStateHash = hashCanonicalJson(baseState);
    const payload = this.buildPayload(
      input.capability,
      input.payload,
      listingAdvertisement,
      state,
    );
    const { title, summary } = this.buildHumanCopy(
      input.capability,
      payload,
      state,
      listingAdvertisement,
    );
    const observedAt = new Date(comparison.observedAt);
    this.assertFreshObservation(observedAt);
    const expiresAt = new Date(observedAt.getTime() + OBSERVATION_TTL_MS);
    const sourceSkillKey = this.normalizeOptionalKey(
      input.sourceSkillKey ??
        (actor.source === "mcp" ? NAVER_READER_SKILL_KEY : null),
      "sourceSkillKey",
    );
    const sourceSkillVersion = this.normalizeOptionalKey(
      input.sourceSkillVersion ?? (sourceSkillKey ? "unversioned" : null),
      "sourceSkillVersion",
    );
    const executorSkillVersion =
      this.normalizeOptionalKey(
        input.executorSkillVersion ?? "computer-use-v1",
        "executorSkillVersion",
      ) ?? "computer-use-v1";
    const evidence = [
      {
        schemaVersion: 1,
        kind: "listing_advertisement_state",
        listingAdvertisementId: listingAdvertisement.id,
        capturedAt: observedAt.toISOString(),
        state,
      },
      {
        schemaVersion: 1,
        kind: "office_advertisement_comparison",
        officeAdvertisementGroupId:
          comparison.officeAdvertisementGroupId,
        capturedAt: observedAt.toISOString(),
        location: this.buildLocationEvidence(listingAdvertisement),
        state: comparison,
      },
    ];
    const preconditions = {
      schemaVersion: 1,
      listingAdvertisementId: listingAdvertisement.id,
      officeAdvertisementGroupId: comparison.officeAdvertisementGroupId,
      expectedStateHash: baseStateHash,
      observedAt: observedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const riskLevel = "high";
    const contentEnvelope = {
      schemaVersion: 1,
      reviewerId: reviewer.id,
      listingAdvertisementId: listingAdvertisement.id,
      capability: input.capability,
      sourceSkillKey,
      sourceSkillVersion,
      executorSkillKey: ESILJANG_AD_MANAGER_SKILL_KEY,
      executorSkillVersion,
      title,
      summary,
      rationale,
      riskLevel,
      executionMode,
      payload,
      preconditions,
      evidence,
      observedAt: observedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const contentHash = hashCanonicalJson(contentEnvelope);
    const dedupeKey =
      this.normalizeOptionalKey(input.dedupeKey, "dedupeKey") ??
      hashCanonicalJson({
        capability: input.capability,
        listingAdvertisementId: listingAdvertisement.id,
        baseStateHash,
        payload,
      });

    let created: AgentActionRequestWithRelations;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Close the small read/create race: either the CP target or its
        // dedicated My Ads comparison projection may have changed.
        const [currentReviewer, currentListingAdvertisement] =
          await Promise.all([
            tx.user.findFirst({
              where: { id: reviewer.id, officeId, isActive: true },
              select: { id: true },
            }),
            tx.listingAdvertisement.findFirst({
              where: { id: listingAdvertisement.id, officeId },
              select: actionSourceSelect,
            }),
          ]);
        if (!currentReviewer) {
          throw new ConflictException(
            "The assigned reviewer is no longer active in this office.",
          );
        }
        if (!currentListingAdvertisement) {
          throw new ConflictException(
            "The CP advertisement changed while the request was being prepared.",
          );
        }
        const currentBaseState = this.tryBuildRequestBaseState(
          currentListingAdvertisement,
        );
        if (
          !currentBaseState ||
          hashCanonicalJson(currentBaseState) !== baseStateHash
        ) {
          throw new ConflictException(
            "The CP advertisement or My Ads comparison changed while the request was being prepared.",
          );
        }

        if (input.supersedesId) {
          const superseded = await tx.agentActionRequest.findFirst({
            where: {
              id: input.supersedesId,
              officeId,
              listingAdvertisementId: listingAdvertisement.id,
            },
            select: {
              id: true,
              reviewStatus: true,
              capability: true,
            },
          });
          if (!superseded) {
            throw new NotFoundException(
              "Superseded agent action request not found",
            );
          }
          if (
            superseded.reviewStatus !== AgentActionReviewStatus.PENDING ||
            superseded.capability !== input.capability
          ) {
            throw new ConflictException(
              "Only a pending request for the same capability can be superseded",
            );
          }
          await tx.agentActionRequest.update({
            where: { id: superseded.id },
            data: {
              reviewStatus: AgentActionReviewStatus.SUPERSEDED,
              executionStatus: AgentActionExecutionStatus.CANCELLED,
              verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
              version: { increment: 1 },
            },
          });
        }

        const row = await tx.agentActionRequest.create({
          data: {
            officeId,
            reviewerId: reviewer.id,
            listingAdvertisementId: listingAdvertisement.id,
            supersedesId: input.supersedesId ?? null,
            capability: input.capability,
            schemaVersion: 1,
            sourceSkillKey,
            sourceSkillVersion,
            executorSkillKey: ESILJANG_AD_MANAGER_SKILL_KEY,
            executorSkillVersion,
            title,
            summary,
            rationale,
            riskLevel,
            executionMode,
            payload: toJsonValue(payload) as unknown as Prisma.InputJsonValue,
            preconditions: toJsonValue(preconditions) as Prisma.InputJsonValue,
            evidence: toJsonValue(evidence) as Prisma.InputJsonValue,
            baseStateHash,
            contentHash,
            dedupeKey,
            observedAt,
            expiresAt,
            createdBy: actor.actor,
            createdByUserId: actor.userId ?? null,
          },
          include: requestInclude,
        });

        await this.writeAudit(tx, actor, {
          action: "create",
          requestId: row.id,
          reason: rationale,
          changes: {
            capability: { after: input.capability },
            reviewerId: { after: reviewer.id },
            listingAdvertisementId: {
              after: listingAdvertisement.id,
            },
            officeAdvertisementGroupId: {
              after: comparison.officeAdvertisementGroupId,
            },
            contentHash: { after: contentHash },
            reviewStatus: { after: AgentActionReviewStatus.PENDING },
          },
        });

        return row;
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;

      const existing = await this.prisma.agentActionRequest.findFirst({
        where: {
          officeId,
          dedupeKey,
          reviewStatus: {
            in: [
              AgentActionReviewStatus.PENDING,
              AgentActionReviewStatus.APPROVED,
            ],
          },
          executionStatus: {
            in: [
              AgentActionExecutionStatus.NOT_STARTED,
              AgentActionExecutionStatus.AWAITING_MANUAL,
              AgentActionExecutionStatus.QUEUED,
              AgentActionExecutionStatus.RUNNING,
            ],
          },
        },
        include: requestInclude,
      });
      if (
        existing &&
        existing.capability === input.capability &&
        existing.listingAdvertisementId === listingAdvertisement.id &&
        existing.baseStateHash === baseStateHash &&
        hashCanonicalJson(existing.payload) === hashCanonicalJson(payload)
      ) {
        if (
          existing.reviewStatus !== AgentActionReviewStatus.PENDING ||
          existing.expiresAt > new Date()
        ) {
          return existing;
        }

        await this.prisma.$transaction(async (tx) => {
          await this.lockRequest(tx, officeId, existing.id);
          const expired = await tx.agentActionRequest.updateMany({
            where: {
              id: existing.id,
              officeId,
              reviewStatus: AgentActionReviewStatus.PENDING,
              expiresAt: { lte: new Date() },
            },
            data: {
              reviewStatus: AgentActionReviewStatus.EXPIRED,
              executionStatus: AgentActionExecutionStatus.CANCELLED,
              verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
              lastError: "Observation expired before review",
              version: { increment: 1 },
            },
          });
          if (expired.count === 1) {
            await this.writeAudit(tx, actor, {
              action: "expire",
              requestId: existing.id,
              reason: "A fresh observation replaced an expired pending request",
              changes: {
                reviewStatus: {
                  before: AgentActionReviewStatus.PENDING,
                  after: AgentActionReviewStatus.EXPIRED,
                },
              },
            });
          }
        });
        return this.create(officeId, { ...input, supersedesId: null }, actor);
      }
      throw new ConflictException(
        "dedupeKey is already used by a different active agent action request",
      );
    }

    try {
      await this.notifications.notify({
        officeId,
        userIds: [created.reviewerId],
        type: "agent_action_review_requested",
        title: "AI 광고 변경안 확인이 필요합니다",
        content: summary,
        linkType: "agentActionRequest",
        linkId: created.id,
      });
    } catch (error) {
      this.logger.warn(
        `Agent action request ${created.id} was created but notification delivery failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return created;
  }

  list(officeId: string, options: ListAgentActionRequestsOptions = {}) {
    return this.prisma.agentActionRequest.findMany({
      where: {
        officeId,
        ...(options.reviewerId ? { reviewerId: options.reviewerId } : {}),
        ...(options.escalationTaskId
          ? { escalationTaskId: options.escalationTaskId }
          : {}),
        ...(options.listingAdvertisementId
          ? { listingAdvertisementId: options.listingAdvertisementId }
          : {}),
        ...(options.capability ? { capability: options.capability } : {}),
        ...(options.reviewStatus ? { reviewStatus: options.reviewStatus } : {}),
        ...(options.executionStatus
          ? { executionStatus: options.executionStatus }
          : {}),
        ...(options.verificationStatus
          ? { verificationStatus: options.verificationStatus }
          : {}),
      },
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: this.normalizeLimit(options.limit),
    });
  }

  async get(officeId: string, id: string) {
    const request = await this.prisma.agentActionRequest.findFirst({
      where: { id, officeId },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException("Agent action request not found");
    return request;
  }

  async approve(
    officeId: string,
    id: string,
    input: DecideAgentActionRequestInput,
    actor: AgentActionActor,
  ) {
    this.assertDecisionInput(input);
    const result = await this.prisma.$transaction(
      async (tx): Promise<ApprovalResult> => {
        await this.lockRequest(tx, officeId, id);
        const request = await tx.agentActionRequest.findFirst({
          where: { id, officeId },
          include: { reviewer: { select: { id: true } } },
        });
        if (!request)
          throw new NotFoundException("Agent action request not found");

        this.assertReviewAuthority(request.reviewerId, actor);
        this.assertContentHash(request.contentHash, input.contentHash);
        if (
          request.reviewStatus === AgentActionReviewStatus.APPROVED &&
          request.approvedContentHash === input.contentHash
        ) {
          return {
            kind: "ok",
            request: await tx.agentActionRequest.findFirstOrThrow({
              where: { id, officeId },
              include: requestInclude,
            }),
          };
        }
        this.assertPendingVersion(request, input.version);

        const now = new Date();
        if (request.expiresAt <= now) {
          await tx.agentActionRequest.update({
            where: { id },
            data: {
              reviewStatus: AgentActionReviewStatus.EXPIRED,
              executionStatus: AgentActionExecutionStatus.CANCELLED,
              verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
              lastError: "Approval evidence expired",
              version: { increment: 1 },
            },
          });
          await this.writeAudit(tx, actor, {
            action: "expire",
            requestId: id,
            changes: {
              reviewStatus: {
                before: request.reviewStatus,
                after: AgentActionReviewStatus.EXPIRED,
              },
            },
          });
          return { kind: "expired" };
        }

        const listingAdvertisement =
          await tx.listingAdvertisement.findFirst({
            where: { id: request.listingAdvertisementId, officeId },
            select: actionSourceSelect,
          });
        const currentBaseState = listingAdvertisement
          ? this.tryBuildRequestBaseState(listingAdvertisement)
          : null;
        if (
          !currentBaseState ||
          hashCanonicalJson(currentBaseState) !== request.baseStateHash
        ) {
          await tx.agentActionRequest.update({
            where: { id },
            data: {
              reviewStatus: AgentActionReviewStatus.STALE,
              executionStatus: AgentActionExecutionStatus.CANCELLED,
              verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
              lastError:
                "CP advertisement or My Ads comparison changed before approval",
              version: { increment: 1 },
            },
          });
          await this.writeAudit(tx, actor, {
            action: "stale",
            requestId: id,
            changes: {
              reviewStatus: {
                before: request.reviewStatus,
                after: AgentActionReviewStatus.STALE,
              },
            },
          });
          return { kind: "stale" };
        }

        const updated = await tx.agentActionRequest.updateMany({
          where: {
            id,
            officeId,
            version: input.version,
            reviewStatus: AgentActionReviewStatus.PENDING,
            contentHash: input.contentHash,
          },
          data: {
            reviewStatus: AgentActionReviewStatus.APPROVED,
            executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
            verificationStatus: AgentActionVerificationStatus.PENDING,
            approvedContentHash: request.contentHash,
            decidedById: actor.userId,
            decidedAt: now,
            decisionNote: this.normalizeOptionalText(input.note, 2_000),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            "Agent action request changed before approval",
          );
        }

        await this.writeAudit(tx, actor, {
          action: "approve",
          requestId: id,
          reason: input.note ?? null,
          changes: {
            reviewStatus: {
              before: AgentActionReviewStatus.PENDING,
              after: AgentActionReviewStatus.APPROVED,
            },
            executionStatus: {
              before: AgentActionExecutionStatus.NOT_STARTED,
              after: AgentActionExecutionStatus.AWAITING_MANUAL,
            },
            approvedContentHash: { after: request.contentHash },
          },
        });

        return {
          kind: "ok",
          request: await tx.agentActionRequest.findFirstOrThrow({
            where: { id, officeId },
            include: requestInclude,
          }),
        };
      },
    );

    if (result.kind === "expired") {
      throw new ConflictException(
        "The evidence expired. Read the advertisement again and create a new request.",
      );
    }
    if (result.kind === "stale") {
      throw new ConflictException(
        "The advertisement changed after this request was created. Review a new proposal.",
      );
    }
    return result.request;
  }

  async reject(
    officeId: string,
    id: string,
    input: RejectAgentActionRequestInput,
    actor: AgentActionActor,
  ) {
    this.assertDecisionInput(input);
    const reason = this.normalizeText(input.reason, "reason", 2_000);

    return this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, officeId, id);
      const request = await tx.agentActionRequest.findFirst({
        where: { id, officeId },
        include: { reviewer: { select: { id: true } } },
      });
      if (!request)
        throw new NotFoundException("Agent action request not found");

      this.assertReviewAuthority(request.reviewerId, actor);
      this.assertContentHash(request.contentHash, input.contentHash);
      if (request.reviewStatus === AgentActionReviewStatus.REJECTED) {
        return tx.agentActionRequest.findFirstOrThrow({
          where: { id, officeId },
          include: requestInclude,
        });
      }
      this.assertPendingVersion(request, input.version);

      const updated = await tx.agentActionRequest.updateMany({
        where: {
          id,
          officeId,
          version: input.version,
          reviewStatus: AgentActionReviewStatus.PENDING,
          contentHash: input.contentHash,
        },
        data: {
          reviewStatus: AgentActionReviewStatus.REJECTED,
          executionStatus: AgentActionExecutionStatus.CANCELLED,
          verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
          decidedById: actor.userId,
          decidedAt: new Date(),
          decisionNote: reason,
          lastError: reason,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Agent action request changed before rejection",
        );
      }

      await this.writeAudit(tx, actor, {
        action: "reject",
        requestId: id,
        reason,
        changes: {
          reviewStatus: {
            before: AgentActionReviewStatus.PENDING,
            after: AgentActionReviewStatus.REJECTED,
          },
          executionStatus: {
            before: AgentActionExecutionStatus.NOT_STARTED,
            after: AgentActionExecutionStatus.CANCELLED,
          },
        },
      });

      return tx.agentActionRequest.findFirstOrThrow({
        where: { id, officeId },
        include: requestInclude,
      });
    });
  }

  async withdraw(
    officeId: string,
    id: string,
    input: WithdrawAgentActionRequestInput,
    actor: AgentActionActor,
  ) {
    this.assertDecisionInput(input);
    const reason = this.normalizeText(input.reason, "reason", 2_000);

    return this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, officeId, id);
      const request = await tx.agentActionRequest.findFirst({
        where: { id, officeId },
      });
      if (!request)
        throw new NotFoundException("Agent action request not found");

      this.assertWithdrawAuthority(request.createdByUserId, actor);
      this.assertContentHash(request.contentHash, input.contentHash);
      if (request.reviewStatus === AgentActionReviewStatus.WITHDRAWN) {
        return tx.agentActionRequest.findFirstOrThrow({
          where: { id, officeId },
          include: requestInclude,
        });
      }
      this.assertPendingVersion(request, input.version);

      const now = new Date();
      const updated = await tx.agentActionRequest.updateMany({
        where: {
          id,
          officeId,
          version: input.version,
          reviewStatus: AgentActionReviewStatus.PENDING,
          contentHash: input.contentHash,
        },
        data: {
          reviewStatus: AgentActionReviewStatus.WITHDRAWN,
          executionStatus: AgentActionExecutionStatus.CANCELLED,
          verificationStatus: AgentActionVerificationStatus.NOT_REQUIRED,
          decidedById: actor.userId ?? null,
          decidedAt: now,
          decisionNote: reason,
          lastError: reason,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Agent action request changed before withdrawal",
        );
      }

      await this.writeAudit(tx, actor, {
        action: "withdraw",
        requestId: id,
        reason,
        changes: {
          reviewStatus: {
            before: AgentActionReviewStatus.PENDING,
            after: AgentActionReviewStatus.WITHDRAWN,
          },
          executionStatus: {
            before: AgentActionExecutionStatus.NOT_STARTED,
            after: AgentActionExecutionStatus.CANCELLED,
          },
        },
      });

      return tx.agentActionRequest.findFirstOrThrow({
        where: { id, officeId },
        include: requestInclude,
      });
    });
  }

  async recordExecution(
    officeId: string,
    id: string,
    input: RecordAgentActionExecutionInput,
    actor: AgentActionActor,
  ) {
    this.assertDecisionInput(input);
    this.assertJsonSize(input.receipt, "receipt", MAX_RECEIPT_BYTES);
    const receipt = this.normalizeExecutionReceipt(input.receipt);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, officeId, id);
      const request = await tx.agentActionRequest.findFirst({
        where: { id, officeId },
        include: {
          reviewer: { select: { id: true } },
          listingAdvertisement: { select: { listingId: true } },
        },
      });
      if (!request)
        throw new NotFoundException("Agent action request not found");

      this.assertExecutionAuthority(request.reviewerId, actor);
      this.assertContentHash(request.contentHash, input.contentHash);
      if (
        request.executedAt &&
        EXECUTION_RECORDED_STATUSES.has(request.executionStatus)
      ) {
        return {
          matched:
            request.verificationStatus ===
            AgentActionVerificationStatus.MATCHED,
          shouldNotify: false,
          request: await tx.agentActionRequest.findFirstOrThrow({
            where: { id, officeId },
            include: requestInclude,
          }),
        };
      }
      if (
        request.reviewStatus !== AgentActionReviewStatus.APPROVED ||
        request.executionMode !== AgentActionExecutionMode.MANUAL ||
        request.executionStatus !== AgentActionExecutionStatus.AWAITING_MANUAL
      ) {
        throw new ConflictException(
          "Only an approved request awaiting attended local execution can be recorded",
        );
      }
      this.assertVersion(request.version, input.version);
      if (
        !request.decidedAt ||
        new Date(receipt.observedAt).getTime() + MAX_FUTURE_CLOCK_SKEW_MS <
          request.decidedAt.getTime()
      ) {
        throw new BadRequestException(
          "receipt.observedAt must be after the human approval",
        );
      }

      const expectedPayload = this.asRecord(request.payload);
      if (receipt.articleNo !== expectedPayload.articleNo) {
        throw new BadRequestException(
          "receipt.articleNo does not match the approved target",
        );
      }

      const observedAt = new Date(receipt.observedAt);
      const state: AdvertisementState = {
        schemaVersion: 1,
        listingAdvertisementId: request.listingAdvertisementId,
        channel: "esiljang",
        externalAdId: null,
        articleNo: receipt.articleNo,
        isActive: receipt.observedAfter.isActive,
        price: receipt.observedAfter.price,
        deposit: receipt.observedAfter.deposit,
        monthlyRent: receipt.observedAfter.monthlyRent,
        lastSyncedAt: receipt.observedAt,
      };
      const stateHash = hashCanonicalJson(state);
      const matched = this.matchesDesiredState(
        request.capability,
        request.payload,
        state,
        receipt,
      );
      const verificationResult = matched
        ? AgentActionVerificationResult.MATCHED
        : AgentActionVerificationResult.MISMATCH;
      const captureKey = hashCanonicalJson({
        provider: receipt.provider,
        operationKey: receipt.operationKey,
        contentHash: request.contentHash,
        observedAt: receipt.observedAt,
        stateHash,
      });
      const verification = await tx.agentActionVerification.create({
        data: {
          officeId,
          requestId: request.id,
          provider: receipt.provider,
          captureKind: "computer_use_postcondition",
          result: verificationResult,
          state: toJsonValue(state) as Prisma.InputJsonValue,
          stateHash,
          captureKey,
          observedAt,
          verifiedBy: actor.actor,
        },
      });

      const executionStatus = matched
        ? AgentActionExecutionStatus.SUCCEEDED
        : AgentActionExecutionStatus.FAILED;
      const verificationStatus = matched
        ? AgentActionVerificationStatus.MATCHED
        : AgentActionVerificationStatus.MISMATCH;
      const executionResult = {
        schemaVersion: 1,
        mode: "computer_use",
        note: this.normalizeOptionalText(input.note, 2_000),
        receipt,
        verificationId: verification.id,
        observedStateHash: stateHash,
      };
      const escalationTaskId = matched
        ? request.escalationTaskId
        : await this.ensureEscalationTask(tx, {
            officeId,
            requestId: request.id,
            existingTaskId: request.escalationTaskId,
            reviewerId: request.reviewerId,
            listingId: request.listingAdvertisement.listingId,
            title: request.title,
            summary:
              "이실장 저장 후 값이 승인된 변경안과 일치하지 않습니다. 실제 광고 상태를 확인해 주세요.",
            reasonCode: "verification_mismatch",
            actorUserId: actor.userId,
          });
      const updated = await tx.agentActionRequest.updateMany({
        where: {
          id,
          officeId,
          version: input.version,
          reviewStatus: AgentActionReviewStatus.APPROVED,
          executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
          contentHash: input.contentHash,
        },
        data: {
          executionStatus,
          verificationStatus,
          executedById: actor.userId,
          executedAt: observedAt,
          executionResult: toJsonValue(
            executionResult,
          ) as Prisma.InputJsonValue,
          verifiedAt: observedAt,
          lastError: matched
            ? null
            : "The persisted Esiljang values do not match the approved desired state",
          ...(escalationTaskId ? { escalationTaskId } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Agent action request changed before execution was recorded",
        );
      }

      if (matched) {
        await this.reconcileListingAdvertisement(
          tx,
          request.listingAdvertisementId,
          officeId,
          request.capability,
          request.payload,
          observedAt,
        );
      }

      await this.writeAudit(tx, actor, {
        action: "execute_and_verify",
        requestId: id,
        reason: matched
          ? (input.note ?? "Esiljang postcondition matched")
          : "Esiljang postcondition mismatch",
        changes: {
          executionStatus: {
            before: AgentActionExecutionStatus.AWAITING_MANUAL,
            after: executionStatus,
          },
          verificationStatus: {
            before: request.verificationStatus,
            after: verificationStatus,
          },
          executedAt: { after: observedAt.toISOString() },
          verificationId: { after: verification.id },
          observedStateHash: { after: stateHash },
          ...(escalationTaskId
            ? { escalationTaskId: { after: escalationTaskId } }
            : {}),
        },
      });

      return {
        matched,
        shouldNotify: !matched,
        request: await tx.agentActionRequest.findFirstOrThrow({
          where: { id, officeId },
          include: requestInclude,
        }),
      };
    });

    if (!outcome.matched && outcome.shouldNotify) {
      const mismatchRequest = outcome.request as {
        reviewerId?: string | null;
        escalationTaskId?: string | null;
      };
      const reviewerId = mismatchRequest.reviewerId;
      if (reviewerId) {
        try {
          await this.notifications.notify({
            officeId,
            userIds: [reviewerId],
            type: "agent_action_verification_mismatch",
            title: "이실장 저장 결과를 다시 확인해 주세요",
            content: "저장 후 이실장 값이 승인한 변경안과 일치하지 않습니다.",
            linkType: mismatchRequest.escalationTaskId
              ? "task"
              : "agentActionRequest",
            linkId: mismatchRequest.escalationTaskId ?? id,
          });
        } catch (error) {
          this.logger.warn(
            `Agent action execution mismatch ${id} could not notify its reviewer: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return outcome.request;
  }

  async reportBlocker(
    officeId: string,
    id: string,
    input: ReportAgentActionBlockerInput,
    actor: AgentActionActor,
  ) {
    this.assertDecisionInput(input);
    const summary = this.normalizeText(input.summary, "summary", 2_000);
    if (!Object.values(AgentActionBlockerReason).includes(input.reasonCode)) {
      throw new BadRequestException(
        `reasonCode must be one of: ${Object.values(
          AgentActionBlockerReason,
        ).join(", ")}`,
      );
    }
    if (input.evidence !== undefined) {
      this.assertJsonSize(
        input.evidence,
        "evidence",
        MAX_BLOCKER_EVIDENCE_BYTES,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, officeId, id);
      const request = await tx.agentActionRequest.findFirst({
        where: { id, officeId },
        include: {
          reviewer: { select: { id: true } },
          listingAdvertisement: { select: { listingId: true } },
        },
      });
      if (!request)
        throw new NotFoundException("Agent action request not found");

      this.assertExecutionAuthority(request.reviewerId, actor);
      this.assertContentHash(request.contentHash, input.contentHash);
      if (
        request.executionStatus === AgentActionExecutionStatus.NEEDS_INPUT &&
        request.escalationTaskId
      ) {
        return {
          taskId: request.escalationTaskId,
          shouldNotify: false,
          request: await tx.agentActionRequest.findFirstOrThrow({
            where: { id, officeId },
            include: requestInclude,
          }),
        };
      }
      if (
        request.reviewStatus !== AgentActionReviewStatus.APPROVED ||
        request.executionStatus !== AgentActionExecutionStatus.AWAITING_MANUAL
      ) {
        throw new ConflictException(
          "Only an approved request awaiting local execution can be blocked",
        );
      }
      this.assertVersion(request.version, input.version);

      const taskId = await this.ensureEscalationTask(tx, {
        officeId,
        requestId: request.id,
        existingTaskId: request.escalationTaskId,
        reviewerId: request.reviewerId,
        listingId: request.listingAdvertisement.listingId,
        title: request.title,
        summary,
        reasonCode: input.reasonCode,
        actorUserId: actor.userId,
      });
      const verificationStatus =
        input.reasonCode === AgentActionBlockerReason.TARGET_NOT_FOUND
          ? AgentActionVerificationStatus.NOT_FOUND
          : AgentActionVerificationStatus.BLOCKED;
      const executionResult = {
        schemaVersion: 1,
        mode: "computer_use",
        outcome: "needs_input",
        reasonCode: input.reasonCode,
        summary,
        evidence:
          input.evidence === undefined ? null : toJsonValue(input.evidence),
      };
      const updated = await tx.agentActionRequest.updateMany({
        where: {
          id,
          officeId,
          version: input.version,
          reviewStatus: AgentActionReviewStatus.APPROVED,
          executionStatus: AgentActionExecutionStatus.AWAITING_MANUAL,
          contentHash: input.contentHash,
        },
        data: {
          executionStatus: AgentActionExecutionStatus.NEEDS_INPUT,
          verificationStatus,
          executionResult: toJsonValue(
            executionResult,
          ) as Prisma.InputJsonValue,
          escalationTaskId: taskId,
          lastError: summary,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Agent action request changed before the blocker was recorded",
        );
      }

      await this.writeAudit(tx, actor, {
        action: "needs_input",
        requestId: id,
        reason: summary,
        changes: {
          executionStatus: {
            before: AgentActionExecutionStatus.AWAITING_MANUAL,
            after: AgentActionExecutionStatus.NEEDS_INPUT,
          },
          verificationStatus: {
            before: request.verificationStatus,
            after: verificationStatus,
          },
          escalationTaskId: { after: taskId },
          blockerReason: { after: input.reasonCode },
        },
      });

      return {
        taskId,
        shouldNotify: true,
        request: await tx.agentActionRequest.findFirstOrThrow({
          where: { id, officeId },
          include: requestInclude,
        }),
      };
    });

    if (result.shouldNotify) {
      try {
        await this.notifications.notify({
          officeId,
          userIds: [result.request.reviewerId],
          type: "agent_action_needs_input",
          title: "AI 광고 업무에 직원 확인이 필요합니다",
          content: summary,
          linkType: "task",
          linkId: result.taskId,
        });
      } catch (error) {
        this.logger.warn(
          `Agent action blocker ${id} created Task ${result.taskId} but notification delivery failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return result.request;
  }

  private buildPayload(
    capability: CreateAgentActionRequestInput["capability"],
    input: Record<string, unknown>,
    listingAdvertisement: ActionSourceRecord,
    state: AdvertisementState,
  ): AgentActionPayload {
    if (listingAdvertisement.channel !== "esiljang") {
      throw new BadRequestException(
        `The ${listingAdvertisement.channel} execution skill is not connected yet`,
      );
    }
    if (capability === AgentActionCapability.ADVERTISEMENT_TAKEDOWN) {
      if (!state.isActive) {
        throw new BadRequestException("The advertisement is already inactive");
      }
      const reasonCode = input.reasonCode;
      if (
        typeof reasonCode !== "string" ||
        !Object.values(AdvertisementTakedownReason).includes(
          reasonCode as AdvertisementTakedownReason,
        )
      ) {
        throw new BadRequestException(
          `reasonCode must be one of: ${Object.values(
            AdvertisementTakedownReason,
          ).join(", ")}`,
        );
      }
      return {
        schemaVersion: 1,
        listingAdvertisementId: listingAdvertisement.id,
        channel: listingAdvertisement.channel,
        articleNo: state.articleNo,
        desiredStatus: "ended",
        reasonCode: reasonCode as AdvertisementTakedownPayload["reasonCode"],
      };
    }

    if (capability === AgentActionCapability.ADVERTISEMENT_TERMS_SET) {
      const advertisedPrice = this.readDesiredMoney(
        input,
        "advertisedPrice",
        state.price,
      );
      const advertisedDeposit = this.readDesiredMoney(
        input,
        "advertisedDeposit",
        state.deposit,
      );
      const advertisedMonthlyRent = this.readDesiredMoney(
        input,
        "advertisedMonthlyRent",
        state.monthlyRent,
      );
      if (
        input.republishAfterSave !== undefined &&
        typeof input.republishAfterSave !== "boolean"
      ) {
        throw new BadRequestException(
          "republishAfterSave must be a boolean when provided",
        );
      }
      const republishAfterSave = input.republishAfterSave === true;
      if (
        advertisedPrice === state.price &&
        advertisedDeposit === state.deposit &&
        advertisedMonthlyRent === state.monthlyRent &&
        !republishAfterSave
      ) {
        throw new BadRequestException(
          "The desired advertisement terms already match the observed terms",
        );
      }
      return {
        schemaVersion: 1,
        listingAdvertisementId: listingAdvertisement.id,
        channel: listingAdvertisement.channel,
        articleNo: state.articleNo,
        advertisedPrice,
        advertisedDeposit,
        advertisedMonthlyRent,
        republishAfterSave,
      };
    }

    throw new BadRequestException(`Unsupported capability: ${capability}`);
  }

  private buildHumanCopy(
    capability: CreateAgentActionRequestInput["capability"],
    payload: AgentActionPayload,
    state: AdvertisementState,
    listingAdvertisement: ActionSourceRecord,
  ) {
    const location = Object.values(
      this.buildLocationEvidence(listingAdvertisement),
    )
      .filter(Boolean)
      .join(" ");
    const suffix = location ? ` · ${location}` : "";

    if (capability === AgentActionCapability.ADVERTISEMENT_TAKEDOWN) {
      return {
        title: `CP 광고 내림${suffix}`,
        summary: `CP 광고를 활성 상태에서 종료 상태로 변경합니다. 네이버 광고번호 ${state.articleNo}`,
      };
    }

    const terms = payload as AdvertisementTermsSetPayload;
    const operation = terms.republishAfterSave
      ? "가격 조건 저장 후 바로 재광고"
      : "가격 조건 변경";
    return {
      title: `CP 광고 ${operation}${suffix}`,
      summary: `${this.formatTerms(state)} → ${this.formatTerms(terms)}${
        terms.republishAfterSave ? " · 저장 후 바로 재광고" : ""
      }`,
    };
  }

  private buildAdvertisementState(
    listingAdvertisement: ActionSourceRecord,
  ): AdvertisementState {
    const articleNo =
      listingAdvertisement.naverArticleNo ??
      listingAdvertisement.officeAdvertisementGroup?.mainAdvertisement
        ?.articleNo;
    if (!articleNo) {
      throw new BadRequestException(
        "ListingAdvertisement has no Naver article number for the CP execution target",
      );
    }
    return {
      schemaVersion: 1,
      listingAdvertisementId: listingAdvertisement.id,
      channel: listingAdvertisement.channel,
      externalAdId: listingAdvertisement.externalAdId,
      articleNo,
      isActive: listingAdvertisement.status === "active",
      price: listingAdvertisement.advertisedPrice,
      deposit: listingAdvertisement.advertisedDeposit,
      monthlyRent: listingAdvertisement.advertisedMonthlyRent,
      lastSyncedAt: listingAdvertisement.lastSyncedAt?.toISOString() ?? null,
    };
  }

  private buildAdvertisementComparison(
    listingAdvertisement: ActionSourceRecord,
  ): AdvertisementComparisonState {
    const group = listingAdvertisement.officeAdvertisementGroup;
    const main = group?.mainAdvertisement;
    if (!group || !main) {
      throw new BadRequestException(
        "A completed My Ads Naver comparison is required before creating an AI request",
      );
    }
    if (
      listingAdvertisement.naverArticleNo &&
      main.articleNo !== listingAdvertisement.naverArticleNo
    ) {
      throw new ConflictException(
        "The main OfficeAdvertisement does not match the CP-provided Naver article number",
      );
    }
    const observedAt = group.lastSyncedAt ?? group.lastSeenAt;
    return {
      schemaVersion: 1,
      officeAdvertisementGroupId: group.id,
      mainAdvertisementId: main.id,
      observedAt: observedAt.toISOString(),
      ownPrice: group.ownPrice,
      ownDeposit: group.ownDeposit,
      ownMonthlyRent: group.ownMonthlyRent,
      relatedPriceMin: group.relatedPriceMin,
      relatedPriceMax: group.relatedPriceMax,
      relatedCount: group.relatedCount,
      mainAdvertisement: this.buildOfficeAdvertisementEvidence(main),
      advertisements: group.advertisements.map((advertisement) =>
        this.buildOfficeAdvertisementEvidence(advertisement),
      ),
    };
  }

  private buildOfficeAdvertisementEvidence(
    advertisement: NonNullable<
      ActionSourceRecord["officeAdvertisementGroup"]
    >["advertisements"][number],
  ): Record<string, unknown> {
    return {
      id: advertisement.id,
      articleNo: advertisement.articleNo,
      sourceUrl: advertisement.sourceUrl,
      isMine: advertisement.isMine,
      isMain: advertisement.isMain,
      isActive: advertisement.isActive,
      articleName: advertisement.articleName,
      realtorName: advertisement.realtorName,
      price: advertisement.price,
      deposit: advertisement.deposit,
      monthlyRent: advertisement.monthlyRent,
      ranking: advertisement.ranking,
      sameAddrCnt: advertisement.sameAddrCnt,
      articleConfirmYmd: advertisement.articleConfirmYmd,
      floorInfo: advertisement.floorInfo,
      floorExposureMode: advertisement.floorExposureMode,
      verificationTypeCode: advertisement.verificationTypeCode,
      seango: advertisement.seango,
      epju: advertisement.epju,
      lastSeenAt: advertisement.lastSeenAt.toISOString(),
    };
  }

  private buildRequestBaseState(
    target: AdvertisementState,
    comparison: AdvertisementComparisonState,
  ): AdvertisementRequestBaseState {
    return {
      schemaVersion: 1,
      target,
      comparison,
    };
  }

  private tryBuildRequestBaseState(
    listingAdvertisement: ActionSourceRecord,
  ): AdvertisementRequestBaseState | null {
    try {
      return this.buildRequestBaseState(
        this.buildAdvertisementState(listingAdvertisement),
        this.buildAdvertisementComparison(listingAdvertisement),
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        return null;
      }
      throw error;
    }
  }

  private buildLocationEvidence(listingAdvertisement: ActionSourceRecord) {
    const property = listingAdvertisement.listing.property;
    const unit = property.unit;
    return {
      site: property.site.name,
      dong: unit?.dong.name ?? null,
      floor: unit?.floor == null ? null : `${unit.floor}층`,
      ho: unit?.name ?? null,
      type: unit?.siteUnitType?.name ?? null,
    };
  }

  private matchesDesiredState(
    capability: string,
    rawPayload: Prisma.JsonValue,
    state: AdvertisementState,
    receipt?: ComputerUseExecutionReceipt,
  ) {
    const payload = this.asRecord(rawPayload);
    if (capability === AgentActionCapability.ADVERTISEMENT_TAKEDOWN) {
      return state.isActive === false;
    }
    if (capability === AgentActionCapability.ADVERTISEMENT_TERMS_SET) {
      const termsMatch =
        state.price === this.readJsonNullableNumber(payload.advertisedPrice) &&
        state.deposit ===
          this.readJsonNullableNumber(payload.advertisedDeposit) &&
        state.monthlyRent ===
          this.readJsonNullableNumber(payload.advertisedMonthlyRent);
      const republishMatched =
        payload.republishAfterSave !== true ||
        receipt?.observedAfter.republished === true;
      return termsMatch && republishMatched;
    }
    return false;
  }

  private async reconcileListingAdvertisement(
    tx: Prisma.TransactionClient,
    listingAdvertisementId: string,
    officeId: string,
    capability: string,
    rawPayload: Prisma.JsonValue,
    observedAt: Date,
  ) {
    const payload = this.asRecord(rawPayload);
    if (capability === AgentActionCapability.ADVERTISEMENT_TAKEDOWN) {
      await tx.listingAdvertisement.updateMany({
        where: { id: listingAdvertisementId, officeId },
        data: {
          status: "ended",
          endedAt: observedAt,
          lastSyncedAt: observedAt,
        },
      });
      return;
    }

    const republishAfterSave = payload.republishAfterSave === true;
    await tx.listingAdvertisement.updateMany({
      where: { id: listingAdvertisementId, officeId },
      data: {
        advertisedPrice: this.readJsonNullableNumber(payload.advertisedPrice),
        advertisedDeposit: this.readJsonNullableNumber(
          payload.advertisedDeposit,
        ),
        advertisedMonthlyRent: this.readJsonNullableNumber(
          payload.advertisedMonthlyRent,
        ),
        ...(republishAfterSave
          ? {
              status: "active",
              startedAt: observedAt,
              endedAt: null,
            }
          : {}),
        lastSyncedAt: observedAt,
      },
    });
  }

  private async ensureEscalationTask(
    tx: Prisma.TransactionClient,
    input: {
      officeId: string;
      requestId: string;
      existingTaskId: string | null;
      reviewerId: string;
      listingId: string;
      title: string;
      summary: string;
      reasonCode: string;
      actorUserId?: string;
    },
  ) {
    if (input.existingTaskId) return input.existingTaskId;

    const task = await tx.task.create({
      data: {
        officeId: input.officeId,
        title: `[AI 예외] ${input.title}`,
        content: [
          input.summary,
          `예외 코드: ${input.reasonCode}`,
          `AI 실행요청 ID: ${input.requestId}`,
        ].join("\n\n"),
        source: "ai",
        status: "pending",
        priority: "high",
        category: "advertisement",
        assignedToId: input.reviewerId,
        createdById: input.actorUserId ?? null,
        assignedById: input.actorUserId ?? null,
        assignedAt: new Date(),
        listingId: input.listingId,
      },
      select: { id: true },
    });
    return task.id;
  }

  private assertFreshObservation(observedAt: Date) {
    const now = Date.now();
    if (observedAt.getTime() > now + MAX_FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException(
        "Advertisement observation time is in the future",
      );
    }
    if (observedAt.getTime() + OBSERVATION_TTL_MS <= now) {
      throw new ConflictException(
        "The My Ads comparison is older than two hours. Run the comparison workflow again first.",
      );
    }
  }

  private assertReviewAuthority(reviewerId: string, actor: AgentActionActor) {
    if (!actor.userId) {
      throw new ForbiddenException(
        "Human review requires an interactive authenticated user",
      );
    }
    if (
      actor.role === "owner" ||
      actor.role === "manager" ||
      actor.userId === reviewerId
    ) {
      return;
    }
    throw new ForbiddenException(
      "Only the assigned reviewer, owner, or manager can decide this request",
    );
  }

  private assertWithdrawAuthority(
    createdByUserId: string | null,
    actor: AgentActionActor,
  ) {
    if (!actor.userId) {
      throw new ForbiddenException(
        "Withdrawal requires an authenticated office user",
      );
    }
    if (
      actor.role === "owner" ||
      actor.role === "manager" ||
      actor.userId === createdByUserId
    ) {
      return;
    }
    throw new ForbiddenException(
      "Only the request creator, owner, or manager can withdraw this request",
    );
  }

  private assertExecutionAuthority(
    reviewerId: string,
    actor: AgentActionActor,
  ) {
    if (!actor.userId) {
      throw new ForbiddenException(
        "Execution requires an authenticated office actor",
      );
    }
    if (actor.source === "mcp") {
      // McpToolsService has already enforced advertisements:execute.
      return;
    }
    this.assertReviewAuthority(reviewerId, actor);
  }

  private assertDecisionInput(input: { contentHash: string; version: number }) {
    if (!/^[0-9a-f]{64}$/.test(input.contentHash ?? "")) {
      throw new BadRequestException("contentHash must be a SHA-256 hex digest");
    }
    if (!Number.isInteger(input.version) || input.version < 1) {
      throw new BadRequestException("version must be a positive integer");
    }
  }

  private assertPendingVersion(
    request: { reviewStatus: string; version: number },
    expectedVersion: number,
  ) {
    if (request.reviewStatus !== AgentActionReviewStatus.PENDING) {
      throw new ConflictException(
        `Cannot decide a request in ${request.reviewStatus}`,
      );
    }
    this.assertVersion(request.version, expectedVersion);
  }

  private assertVersion(actual: number, expected: number) {
    if (actual !== expected) {
      throw new ConflictException(
        `Request version changed (expected ${expected}, current ${actual})`,
      );
    }
  }

  private assertContentHash(actual: string, expected: string) {
    if (actual !== expected) {
      throw new ConflictException(
        "The reviewed content hash does not match this request",
      );
    }
  }

  private async lockRequest(
    tx: Prisma.TransactionClient,
    officeId: string,
    id: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${officeId}), hashtext(${id}))`,
    );
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AgentActionActor,
    input: {
      action: string;
      requestId: string;
      changes: Record<string, unknown>;
      reason?: string | null;
    },
  ) {
    await tx.activityLog.create({
      data: {
        officeId: (
          await tx.agentActionRequest.findUniqueOrThrow({
            where: { id: input.requestId },
            select: { officeId: true },
          })
        ).officeId,
        userId: actor.userId ?? null,
        actor: actor.actor,
        source: actor.source,
        action: input.action,
        entityType: "agentActionRequest",
        entityId: input.requestId,
        changes: toJsonValue(input.changes) as Prisma.InputJsonValue,
        reason: input.reason?.trim() || null,
      },
    });
  }

  private normalizeExecutionReceipt(
    value: Prisma.InputJsonValue,
  ): ComputerUseExecutionReceipt {
    const receipt = this.asRecord(value);
    const observedAfter = this.asRecord(receipt.observedAfter);
    const operationKey = this.normalizeText(
      receipt.operationKey,
      "receipt.operationKey",
      MAX_KEY_LENGTH,
    );
    const articleNo = this.normalizeText(
      receipt.articleNo,
      "receipt.articleNo",
      MAX_KEY_LENGTH,
    );
    if (typeof receipt.observedAt !== "string") {
      throw new BadRequestException("receipt.observedAt must be an ISO date");
    }
    const observedAt = new Date(receipt.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new BadRequestException("receipt.observedAt must be an ISO date");
    }
    if (observedAt.getTime() > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException("receipt.observedAt is in the future");
    }
    if (typeof observedAfter.isActive !== "boolean") {
      throw new BadRequestException(
        "receipt.observedAfter.isActive must be boolean",
      );
    }

    return {
      schemaVersion: 1,
      provider: "esiljang",
      operationKey,
      articleNo,
      observedAt: observedAt.toISOString(),
      observedAfter: {
        isActive: observedAfter.isActive,
        price: this.readReceiptMoney(observedAfter, "price"),
        deposit: this.readReceiptMoney(observedAfter, "deposit"),
        monthlyRent: this.readReceiptMoney(observedAfter, "monthlyRent"),
        republished: observedAfter.republished === true,
      },
      providerUrl: this.normalizeOptionalText(receipt.providerUrl, 2_048),
      screenshotArtifactId: this.normalizeOptionalKey(
        receipt.screenshotArtifactId,
        "receipt.screenshotArtifactId",
      ),
      confirmationText: this.normalizeOptionalText(
        receipt.confirmationText,
        1_000,
      ),
    };
  }

  private readReceiptMoney(
    input: Record<string, unknown>,
    key: string,
  ): number | null {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      throw new BadRequestException(`receipt.observedAfter.${key} is required`);
    }
    const value = input[key];
    if (value === null) return null;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 2_147_483_647
    ) {
      throw new BadRequestException(
        `receipt.observedAfter.${key} must be null or a non-negative integer in 만원`,
      );
    }
    return value;
  }

  private readDesiredMoney(
    input: Record<string, unknown>,
    key: string,
    current: number | null,
  ) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return current;
    const value = input[key];
    if (value === null) return null;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 2_147_483_647
    ) {
      throw new BadRequestException(
        `${key} must be null or a non-negative integer in 만원`,
      );
    }
    return value;
  }

  private readJsonNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new BadRequestException("Stored agent action payload is invalid");
    }
    return value;
  }

  private formatTerms(value: {
    price?: number | null;
    deposit?: number | null;
    monthlyRent?: number | null;
    advertisedPrice?: number | null;
    advertisedDeposit?: number | null;
    advertisedMonthlyRent?: number | null;
  }) {
    const price = value.advertisedPrice ?? value.price ?? null;
    const deposit = value.advertisedDeposit ?? value.deposit ?? null;
    const monthlyRent =
      value.advertisedMonthlyRent ?? value.monthlyRent ?? null;
    return [
      `가격 ${this.formatMoney(price)}`,
      `보증금 ${this.formatMoney(deposit)}`,
      `월세 ${this.formatMoney(monthlyRent)}`,
    ].join(" / ");
  }

  private formatMoney(value: number | null) {
    return value === null ? "-" : `${value.toLocaleString("ko-KR")}만원`;
  }

  private normalizeLimit(limit?: number) {
    if (limit === undefined) return DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException("limit must be a positive integer");
    }
    return Math.min(limit, MAX_LIST_LIMIT);
  }

  private normalizeText(value: unknown, field: string, maxLength: number) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    const normalized = value.trim();
    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `${field} must be ${maxLength} characters or fewer`,
      );
    }
    return normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number) {
    if (value === null || value === undefined || value === "") return null;
    return this.normalizeText(value, "text", maxLength);
  }

  private normalizeOptionalKey(value: unknown, field: string) {
    if (value === null || value === undefined || value === "") return null;
    return this.normalizeText(value, field, MAX_KEY_LENGTH);
  }

  private assertNonBlank(value: string, field: string) {
    if (!value?.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private assertJsonSize(value: unknown, field: string, maxBytes: number) {
    const bytes = Buffer.byteLength(JSON.stringify(toJsonValue(value)), "utf8");
    if (bytes > maxBytes) {
      throw new BadRequestException(
        `${field} must be ${maxBytes} bytes or fewer`,
      );
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("Stored agent action payload is invalid");
    }
    return value as Record<string, unknown>;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
