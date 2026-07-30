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
import { AgentControlPlaneService } from "../agent/control-plane/control-plane.service";

const VALID_STATUSES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementStatus),
);
const VALID_SOURCES: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementSource),
);
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);
const MY_ADVERTISEMENTS_SYNC_AGENT_KEY = "my-advertisements-sync";
const MY_ADVERTISEMENTS_SYNC_WORKFLOW_KEY = "full-cp-and-naver-refresh";
const MY_ADVERTISEMENTS_SYNC_VERSION = 1;
const ESILJANG_AD_READER_SKILL_KEY = "esiljang-ad-reader";
const BUDONGSANBANK_AD_READER_SKILL_KEY = "budongsanbank-ad-reader";
const ACTIVE_SYNC_RUN_STATUSES = ["queued", "running"] as const;
const ACTIVE_SYNC_STEP_STATUSES = new Set([
  "ready",
  "queued",
  "running",
]);
const TERMINAL_SYNC_STEP_STATUSES = new Set([
  "succeeded",
  "failed",
  "needs_input",
  "skipped",
  "cancelled",
]);

interface AdvertisementSyncStepDefinition {
  stepKey: string;
  position: number;
  kind: string;
  title: string;
  status: "ready" | "blocked";
  channel?: string;
  skillKey: string;
  skillVersion: string;
  dependsOnKeys: string[];
  input: Prisma.InputJsonObject;
}

type FullSyncRunWithSteps = Prisma.AdvertisementSyncRunGetPayload<{
  include: {
    steps: {
      include: {
        sessions: {
          include: {
            wakeups: true;
          };
        };
      };
    };
  };
}>;

interface CreateDto {
  listingId: string;
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

interface UpdateDto {
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

interface FindAllQuery {
  listingId?: string;
  channel?: string;
  status?: string;
  source?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface FullSyncExecutionRequest {
  executionTarget: "local";
  runnerDeviceId: string;
  credentialProviders: string[];
}

interface NormalizedFullSyncExecution {
  executionTarget: "local";
  runnerDeviceId: string;
  credentialProviders: string[];
}

@Injectable()
export class ListingAdvertisementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: AgentControlPlaneService,
  ) {}

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
        ],
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
          listing: {
            include: {
              property: {
                include: {
                  site: true,
                  unit: {
                    include: {
                      dong: true,
                      siteUnitType: true,
                    },
                  },
                },
              },
            },
          },
          officeAdvertisementGroup: {
            include: {
              mainAdvertisement: true,
              advertisements: {
                orderBy: [
                  { isMine: "desc" as const },
                  { ranking: "asc" as const },
                ],
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.listingAdvertisement.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const comparison = item.officeAdvertisementGroup;
        const source = comparison?.mainAdvertisement ?? null;
        return {
          ...item,
          actionContext: {
            comparisonGroupId: comparison?.id ?? null,
            mainAdvertisementId: source?.id ?? null,
            observedAt:
              comparison?.lastSyncedAt ??
              comparison?.lastSeenAt ??
              source?.lastSeenAt ??
              null,
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

  async getFullSyncStatus(officeId: string) {
    let run = await this.findLatestFullSyncRun(officeId);
    if (run) {
      await this.reconcileFullSyncRun(officeId, run.id);
      run = await this.findLatestFullSyncRun(officeId);
      return this.toFullSyncStatus(run);
    }

    // Migration 전 단일 세션 이력은 새 Run이 생성될 때까지 읽기 전용으로
    // 유지한다. 새 동기화부터는 모든 상태가 Run/Step에 저장된다.
    const [session] = await this.controlPlane.listSessions(officeId, {
      agentKey: MY_ADVERTISEMENTS_SYNC_AGENT_KEY,
      limit: 1,
    });
    if (!session) {
      return { run: null, session: null, wakeup: null };
    }
    const [wakeup] = await this.controlPlane.listWakeups(officeId, {
      sessionId: session.id,
      limit: 1,
    });
    return {
      run: null,
      session,
      wakeup: wakeup ?? null,
    };
  }

  async requestFullSync(
    officeId: string,
    requestedBy: string,
    executionRequest?: FullSyncExecutionRequest,
  ) {
    const execution = this.normalizeFullSyncExecution(executionRequest);
    const activeRun = await this.prisma.advertisementSyncRun.findFirst({
      where: {
        officeId,
        workflowKey: MY_ADVERTISEMENTS_SYNC_WORKFLOW_KEY,
        status: { in: [...ACTIVE_SYNC_RUN_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (activeRun) {
      await this.reconcileFullSyncRun(officeId, activeRun.id);
      const stillActive = await this.prisma.advertisementSyncRun.findFirst({
        where: {
          id: activeRun.id,
          officeId,
          status: { in: [...ACTIVE_SYNC_RUN_STATUSES] },
        },
        select: { id: true },
      });
      if (stillActive) {
        return {
          created: false,
          ...(await this.getFullSyncStatus(officeId)),
        };
      }
    }

    const channels = [
      ListingAdvertisementChannel.ESILJANG,
      ListingAdvertisementChannel.BUDONGSANBANK,
    ];
    const steps = this.buildFullSyncSteps(execution);
    const workflow = {
      schemaVersion: MY_ADVERTISEMENTS_SYNC_VERSION,
      workflow: "my_advertisements_full_refresh",
      scope: "all_cp_advertisements",
      channels,
      executionTarget: execution.executionTarget,
      runnerDeviceId: execution.runnerDeviceId,
      credentialProviders: execution.credentialProviders,
      compareEveryImportedAdvertisement: true,
      naverReaderSkillKey: "naver-real-estate-reader",
      steps: steps.map((step) => ({
        order: step.position,
        key: step.stepKey,
        kind: step.kind,
        skillKey: step.skillKey,
        dependsOn: step.dependsOnKeys,
        ...step.input,
      })),
    } satisfies Prisma.InputJsonObject;

    let createdRun: { id: string };
    try {
      createdRun = await this.prisma.advertisementSyncRun.create({
        data: {
          officeId,
          workflowKey: MY_ADVERTISEMENTS_SYNC_WORKFLOW_KEY,
          schemaVersion: MY_ADVERTISEMENTS_SYNC_VERSION,
          status: "queued",
          requestedBy,
          channels,
          context: workflow,
          steps: {
            create: steps.map((step) => ({
              officeId,
              stepKey: step.stepKey,
              position: step.position,
              kind: step.kind,
              title: step.title,
              status: step.status,
              channel: step.channel ?? null,
              skillKey: step.skillKey,
              skillVersion: step.skillVersion,
              dependsOnKeys: step.dependsOnKeys,
              input: step.input,
            })),
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      return {
        created: false,
        ...(await this.getFullSyncStatus(officeId)),
      };
    }

    await this.advanceFullSyncRun(officeId, createdRun.id, requestedBy);
    return {
      created: true,
      ...(await this.getFullSyncStatus(officeId)),
    };
  }

  async retryFullSyncStep(
    officeId: string,
    stepId: string,
    requestedBy: string,
  ) {
    const step = await this.prisma.advertisementSyncStep.findFirst({
      where: { id: stepId, officeId },
      include: { run: true },
    });
    if (!step) {
      throw new NotFoundException("Advertisement sync step not found");
    }
    if (!["failed", "needs_input"].includes(step.status)) {
      throw new ConflictException(
        "Only failed or input-waiting sync steps can be retried",
      );
    }
    if (step.run.status === "cancelled") {
      throw new ConflictException("A cancelled sync run cannot be retried");
    }

    await this.prisma.$transaction([
      this.prisma.advertisementSyncStep.update({
        where: { id: step.id },
        data: {
          status: "ready",
          output: Prisma.DbNull,
          error: null,
          waitingReason: null,
          progressTotal: 0,
          progressComplete: 0,
          progressFailed: 0,
          startedAt: null,
          finishedAt: null,
        },
      }),
      this.prisma.advertisementSyncRun.update({
        where: { id: step.runId },
        data: {
          status: "queued",
          completedAt: null,
        },
      }),
    ]);
    await this.advanceFullSyncRun(officeId, step.runId, requestedBy);
    return this.getFullSyncStatus(officeId);
  }

  /**
   * Agent control-plane의 한 Run이 끝난 직후 호출된다. 해당 세션이 광고
   * 동기화 Step에 연결되어 있으면 결과를 Step에 반영하고 다음 의존 단계의
   * Skill wakeup을 만든다. 일반 Task/AgentActionRequest Run에는 no-op이다.
   */
  async handleAgentRunCompletion(officeId: string, agentRunId: string) {
    const agentRun = await this.prisma.agentRun.findFirst({
      where: { id: agentRunId, officeId },
      include: { session: true },
    });
    const stepId = agentRun?.session.advertisementSyncStepId;
    if (!agentRun || !stepId) return null;

    const step = await this.prisma.advertisementSyncStep.findFirst({
      where: { id: stepId, officeId },
      select: { id: true, runId: true, status: true },
    });
    if (!step) return null;
    if (TERMINAL_SYNC_STEP_STATUSES.has(step.status)) {
      return this.getFullSyncStatus(officeId);
    }

    const nextStatus =
      agentRun.session.status === "awaiting_input"
        ? "needs_input"
        : agentRun.status === "failed" || agentRun.session.status === "error"
          ? "failed"
          : "succeeded";
    const progress = this.readSyncProgress(agentRun.result);
    await this.prisma.advertisementSyncStep.updateMany({
      where: {
        id: step.id,
        officeId,
        status: { in: ["ready", "queued", "running"] },
      },
      data: {
        status: nextStatus,
        ...(agentRun.result !== null
          ? { output: agentRun.result as Prisma.InputJsonValue }
          : {}),
        error: nextStatus === "failed" ? agentRun.error : null,
        waitingReason:
          nextStatus === "needs_input"
            ? agentRun.session.waitingReason
            : null,
        ...progress,
        finishedAt: new Date(),
      },
    });
    await this.advanceFullSyncRun(officeId, step.runId);
    return this.getFullSyncStatus(officeId);
  }

  async create(officeId: string, dto: CreateDto) {
    if (!dto.listingId) {
      throw new BadRequestException("listingId is required");
    }
    if (!dto.channel || !dto.channel.trim()) {
      throw new BadRequestException("channel is required");
    }

    const status = dto.status ?? ListingAdvertisementStatus.ACTIVE;
    const source = dto.source ?? ListingAdvertisementSource.MANUAL;
    this.assertValidStatus(status);
    this.assertValidSource(source);
    this.assertKnownChannelShape(dto.channel);

    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, officeId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (status === ListingAdvertisementStatus.ACTIVE) {
      await this.assertNoActiveDuplicate(officeId, dto.listingId, dto.channel);
    }

    return this.prisma.listingAdvertisement.create({
      data: {
        officeId,
        listingId: dto.listingId,
        channel: dto.channel,
        status,
        source,
        advertisedPrice: dto.advertisedPrice ?? null,
        advertisedDeposit: dto.advertisedDeposit ?? null,
        advertisedMonthlyRent: dto.advertisedMonthlyRent ?? null,
        startedAt: dto.startedAt ?? null,
        endedAt: dto.endedAt ?? null,
        url: dto.url ?? null,
        memo: dto.memo ?? null,
        externalAdId: dto.externalAdId ?? null,
        naverArticleNo: dto.naverArticleNo ?? null,
        naverUrl: dto.naverUrl ?? null,
        lastCheckedAt: dto.lastCheckedAt ?? null,
        lastSyncedAt: dto.lastSyncedAt ?? null,
      },
    });
  }

  async update(id: string, officeId: string, dto: UpdateDto) {
    const existing = await this.prisma.listingAdvertisement.findFirst({
      where: { id, officeId },
    });
    if (!existing) {
      throw new NotFoundException("ListingAdvertisement not found");
    }

    if (dto.status !== undefined) {
      this.assertValidStatus(dto.status);
    }
    if (dto.source !== undefined) {
      this.assertValidSource(dto.source);
    }
    if (dto.channel !== undefined) {
      if (!dto.channel.trim()) {
        throw new BadRequestException("channel cannot be empty");
      }
      this.assertKnownChannelShape(dto.channel);
    }

    const nextStatus = dto.status ?? existing.status;
    const nextChannel = dto.channel ?? existing.channel;
    const becomesActive =
      nextStatus === ListingAdvertisementStatus.ACTIVE &&
      (existing.status !== ListingAdvertisementStatus.ACTIVE ||
        nextChannel !== existing.channel);

    if (becomesActive) {
      await this.assertNoActiveDuplicate(
        officeId,
        existing.listingId,
        nextChannel,
        id,
      );
    }

    const transitioningToEnded =
      dto.status === ListingAdvertisementStatus.ENDED &&
      existing.status !== ListingAdvertisementStatus.ENDED;
    const endedAt = dto.endedAt;
    const resolvedEndedAt =
      endedAt !== undefined
        ? endedAt
        : transitioningToEnded
          ? new Date()
          : undefined;

    return this.prisma.listingAdvertisement.update({
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

  private buildFullSyncSteps(
    execution: NormalizedFullSyncExecution,
  ): AdvertisementSyncStepDefinition[] {
    const esiljangStepKey = "cp_import_esiljang";
    const budongsanbankStepKey = "cp_import_budongsanbank";
    const resolveStepKey = "resolve_exact_listing_and_unit";
    const compareStepKey = "naver_compare_all";

    return [
      {
        stepKey: esiljangStepKey,
        position: 1,
        kind: "cp_full_import",
        title: "이실장 광고 가져오기",
        status: "ready",
        channel: ListingAdvertisementChannel.ESILJANG,
        skillKey: ESILJANG_AD_READER_SKILL_KEY,
        skillVersion: "computer-use-v1",
        dependsOnKeys: [],
        input: {
          scope: "all_advertisements",
          channel: ListingAdvertisementChannel.ESILJANG,
          writeTarget: "listing_advertisements",
          returnedAdvertisementStatus: ListingAdvertisementStatus.ACTIVE,
          snapshotCommit: "only_after_complete_fetch",
          failurePolicy: "preserve_last_successful_snapshot",
          missingAfterCompleteFetch: ListingAdvertisementStatus.ENDED,
          executionTarget: execution.executionTarget,
          runnerDeviceId: execution.runnerDeviceId,
          credentialProvider: ListingAdvertisementChannel.ESILJANG,
          credentialSource: "electron_safe_storage",
        },
      },
      {
        stepKey: budongsanbankStepKey,
        position: 2,
        kind: "cp_full_import",
        title: "부동산뱅크 광고 가져오기",
        status: "ready",
        channel: ListingAdvertisementChannel.BUDONGSANBANK,
        skillKey: BUDONGSANBANK_AD_READER_SKILL_KEY,
        skillVersion: "computer-use-v1",
        dependsOnKeys: [],
        input: {
          scope: "all_advertisements",
          channel: ListingAdvertisementChannel.BUDONGSANBANK,
          writeTarget: "listing_advertisements",
          returnedAdvertisementStatus: ListingAdvertisementStatus.ACTIVE,
          snapshotCommit: "only_after_complete_fetch",
          failurePolicy: "preserve_last_successful_snapshot",
          missingAfterCompleteFetch: ListingAdvertisementStatus.ENDED,
          executionTarget: execution.executionTarget,
          runnerDeviceId: execution.runnerDeviceId,
          credentialProvider: ListingAdvertisementChannel.BUDONGSANBANK,
          credentialSource: "electron_safe_storage",
        },
      },
      {
        stepKey: resolveStepKey,
        position: 3,
        kind: "resolve_exact_listing_and_unit",
        title: "매물·호실 확정",
        status: "blocked",
        skillKey: MY_ADVERTISEMENTS_SYNC_AGENT_KEY,
        skillVersion: "1",
        dependsOnKeys: [esiljangStepKey, budongsanbankStepKey],
        input: {
          scope: "every_imported_advertisement",
          useCpDetailedAddress: true,
          requireExactListing: true,
          requireExactUnit: true,
        },
      },
      {
        stepKey: compareStepKey,
        position: 4,
        kind: "naver_compare",
        title: "전체 네이버 비교",
        status: "blocked",
        skillKey: "naver-real-estate-reader",
        skillVersion: "0.3.0",
        dependsOnKeys: [resolveStepKey],
        input: {
          scope: "every_imported_advertisement",
          compareEveryImportedAdvertisement: true,
          persistDuplicatesAndCurrentRanking: true,
        },
      },
    ];
  }

  private findLatestFullSyncRun(officeId: string) {
    return this.prisma.advertisementSyncRun.findFirst({
      where: {
        officeId,
        workflowKey: MY_ADVERTISEMENTS_SYNC_WORKFLOW_KEY,
      },
      orderBy: { createdAt: "desc" },
      include: {
        steps: {
          orderBy: { position: "asc" },
          include: {
            sessions: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              include: {
                wakeups: {
                  orderBy: { requestedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  }

  private toFullSyncStatus(run: FullSyncRunWithSteps | null) {
    if (!run) {
      return { run: null, session: null, wakeup: null };
    }
    const currentStep =
      run.steps.find((step) => ACTIVE_SYNC_STEP_STATUSES.has(step.status)) ??
      run.steps.find((step) =>
        ["needs_input", "failed"].includes(step.status),
      ) ??
      run.steps.at(-1) ??
      null;
    const currentSession = currentStep?.sessions[0] ?? null;
    const currentWakeup = currentSession?.wakeups[0] ?? null;
    const { steps, ...runFields } = run;
    const publicSteps = steps.map(({ sessions, ...step }) => step);
    const session = currentSession
      ? (({ wakeups, ...value }) => value)(currentSession)
      : null;

    return {
      run: {
        ...runFields,
        currentStepId: currentStep?.id ?? null,
        currentStepKey: currentStep?.stepKey ?? null,
        steps: publicSteps,
      },
      session,
      wakeup: currentWakeup,
    };
  }

  private async reconcileFullSyncRun(officeId: string, runId: string) {
    const steps = await this.prisma.advertisementSyncStep.findMany({
      where: {
        officeId,
        runId,
        status: { in: ["ready", "queued", "running"] },
      },
      include: {
        sessions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            runs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    for (const step of steps) {
      const session = step.sessions[0];
      if (!session) continue;
      const latestAgentRun = session.runs[0];
      const nextStatus =
        session.status === "active"
          ? "running"
          : session.status === "pending"
            ? "queued"
            : session.status === "awaiting_input"
              ? "needs_input"
              : session.status === "complete"
                ? "succeeded"
                : session.status === "error"
                  ? "failed"
                  : null;
      if (!nextStatus || nextStatus === step.status) continue;

      const isFinished = ["succeeded", "failed", "needs_input"].includes(
        nextStatus,
      );
      await this.prisma.advertisementSyncStep.updateMany({
        where: { id: step.id, officeId, status: step.status },
        data: {
          status: nextStatus,
          ...(nextStatus === "running" && !step.startedAt
            ? { startedAt: new Date() }
            : {}),
          ...(latestAgentRun?.result !== null &&
          latestAgentRun?.result !== undefined
            ? {
                output:
                  latestAgentRun.result as Prisma.InputJsonValue,
                ...this.readSyncProgress(latestAgentRun.result),
              }
            : {}),
          error: nextStatus === "failed" ? session.error : null,
          waitingReason:
            nextStatus === "needs_input" ? session.waitingReason : null,
          ...(isFinished ? { finishedAt: new Date() } : {}),
        },
      });
    }

    await this.advanceFullSyncRun(officeId, runId);
  }

  private async advanceFullSyncRun(
    officeId: string,
    runId: string,
    requestedBy?: string,
  ) {
    for (let pass = 0; pass < 8; pass += 1) {
      const run = await this.prisma.advertisementSyncRun.findFirst({
        where: { id: runId, officeId },
        include: { steps: { orderBy: { position: "asc" } } },
      });
      if (!run || ["completed", "cancelled"].includes(run.status)) return;

      const succeededKeys = new Set(
        run.steps
          .filter((step) =>
            ["succeeded", "skipped"].includes(step.status),
          )
          .map((step) => step.stepKey),
      );
      const unlockable = run.steps.filter(
        (step) =>
          step.status === "blocked" &&
          step.dependsOnKeys.every((dependency) =>
            succeededKeys.has(dependency),
          ),
      );
      if (unlockable.length > 0) {
        await this.prisma.advertisementSyncStep.updateMany({
          where: {
            id: { in: unlockable.map((step) => step.id) },
            officeId,
            status: "blocked",
          },
          data: { status: "ready" },
        });
        continue;
      }

      const readySteps = run.steps.filter((step) => step.status === "ready");
      if (readySteps.length > 0) {
        for (const step of readySteps) {
          await this.queueFullSyncStep(
            officeId,
            run,
            step.id,
            requestedBy ?? run.requestedBy,
          );
        }
        continue;
      }
      break;
    }

    await this.updateFullSyncRunStatus(officeId, runId);
  }

  private async queueFullSyncStep(
    officeId: string,
    run: {
      id: string;
      schemaVersion: number;
      requestedBy: string;
      steps: Array<{
        id: string;
        stepKey: string;
        position: number;
        kind: string;
        title: string;
        status: string;
        skillKey: string | null;
      }>;
    },
    stepId: string,
    requestedBy: string,
  ) {
    const claimed = await this.prisma.advertisementSyncStep.updateMany({
      where: { id: stepId, officeId, status: "ready" },
      data: {
        status: "queued",
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        finishedAt: null,
        error: null,
        waitingReason: null,
      },
    });
    if (claimed.count !== 1) return;

    const step = await this.prisma.advertisementSyncStep.findFirstOrThrow({
      where: { id: stepId, officeId },
    });
    if (!step.skillKey) {
      await this.prisma.advertisementSyncStep.update({
        where: { id: step.id },
        data: { status: "succeeded", finishedAt: new Date() },
      });
      return;
    }

    const plan = run.steps.map((runStep) => ({
      order: runStep.position,
      key: runStep.stepKey,
      kind: runStep.kind,
      title: runStep.title,
      status: runStep.status,
      skillKey: runStep.skillKey,
    })) satisfies Prisma.InputJsonArray;
    const stepInput = step.input as Prisma.InputJsonObject;
    const localRunnerDeviceId =
      step.kind === "cp_full_import" &&
      stepInput.executionTarget === "local" &&
      typeof stepInput.runnerDeviceId === "string"
        ? stepInput.runnerDeviceId
        : null;
    const context = {
      schemaVersion: run.schemaVersion,
      workflow: "my_advertisements_full_refresh",
      workflowRunId: run.id,
      workflowStepId: step.id,
      stepKey: step.stepKey,
      kind: step.kind,
      input: stepInput,
    } satisfies Prisma.InputJsonObject;

    try {
      const session = await this.controlPlane.getOrCreateSession(officeId, {
        agentKey: step.skillKey,
        adapter: localRunnerDeviceId ? "local_mcp" : "mcp",
        taskKey: `advertisement-sync:${run.id}:${step.stepKey}`,
        advertisementSyncStepId: step.id,
        context,
        plan,
      });
      await this.controlPlane.updateSession(officeId, session.id, {
        context,
        plan,
      });
      await this.controlPlane.createWakeup(officeId, {
        sessionId: session.id,
        source: step.skillKey,
        reason: `advertisement_sync:${step.stepKey}`,
        payload: {
          ...context,
          skillKey: step.skillKey,
          skillVersion: step.skillVersion,
          compareEveryImportedAdvertisement: true,
          ...(localRunnerDeviceId
            ? { runnerDeviceId: localRunnerDeviceId }
            : {}),
        },
        idempotencyKey: `advertisement-sync:${run.id}:${step.stepKey}:attempt:${step.attemptCount}`,
        requestedBy,
        maxAttempts: 5,
      });
      await this.prisma.advertisementSyncRun.updateMany({
        where: { id: run.id, officeId },
        data: {
          status: "running",
          startedAt: new Date(),
          completedAt: null,
        },
      });
    } catch (error) {
      await this.prisma.advertisementSyncStep.updateMany({
        where: { id: step.id, officeId, status: "queued" },
        data: {
          status: "failed",
          error: this.errorMessage(error),
          finishedAt: new Date(),
        },
      });
    }
  }

  private async updateFullSyncRunStatus(officeId: string, runId: string) {
    const run = await this.prisma.advertisementSyncRun.findFirst({
      where: { id: runId, officeId },
      include: { steps: true },
    });
    if (!run || run.status === "cancelled") return;

    const statuses = run.steps.map((step) => step.status);
    const allFinished =
      statuses.length > 0 &&
      statuses.every((status) => ["succeeded", "skipped"].includes(status));
    const hasActive = statuses.some((status) =>
      ACTIVE_SYNC_STEP_STATUSES.has(status),
    );
    const hasWaiting = statuses.includes("needs_input");
    const hasFailed = statuses.includes("failed");
    const nextStatus = allFinished
      ? "completed"
      : hasActive
        ? "running"
        : hasWaiting
          ? "awaiting_input"
          : hasFailed
            ? "failed"
            : "queued";
    const finished = ["completed", "failed"].includes(nextStatus);

    await this.prisma.advertisementSyncRun.update({
      where: { id: run.id },
      data: {
        status: nextStatus,
        startedAt:
          nextStatus === "queued" ? run.startedAt : run.startedAt ?? new Date(),
        completedAt: finished ? new Date() : null,
      },
    });
  }

  private readSyncProgress(result: Prisma.JsonValue | null): {
    progressTotal?: number;
    progressComplete?: number;
    progressFailed?: number;
  } {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return {};
    }
    const value = result as Record<string, Prisma.JsonValue>;
    const readNumber = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = value[key];
        if (
          typeof candidate === "number" &&
          Number.isFinite(candidate) &&
          candidate >= 0
        ) {
          return Math.floor(candidate);
        }
      }
      return undefined;
    };
    const progressTotal = readNumber("totalCount", "targetCount", "total");
    const progressComplete = readNumber(
      "completedCount",
      "processedCount",
      "importedCount",
      "succeededCount",
    );
    const progressFailed = readNumber("failedCount", "errorCount");
    return {
      ...(progressTotal !== undefined ? { progressTotal } : {}),
      ...(progressComplete !== undefined ? { progressComplete } : {}),
      ...(progressFailed !== undefined ? { progressFailed } : {}),
    };
  }

  private normalizeFullSyncExecution(
    input?: FullSyncExecutionRequest,
  ): NormalizedFullSyncExecution {
    if (input?.executionTarget !== "local") {
      throw new BadRequestException(
        "CP 광고 동기화는 계정이 저장된 데스크톱 로컬 실행기에서 시작해야 합니다.",
      );
    }
    const runnerDeviceId = input.runnerDeviceId?.trim();
    if (!runnerDeviceId || runnerDeviceId.length > 128) {
      throw new BadRequestException(
        "로컬 실행기 deviceId를 확인할 수 없습니다.",
      );
    }
    const requiredProviders = [
      ListingAdvertisementChannel.ESILJANG,
      ListingAdvertisementChannel.BUDONGSANBANK,
    ];
    const credentialProviders = Array.from(
      new Set(input.credentialProviders ?? []),
    ).filter((provider) => requiredProviders.includes(provider as never));
    const missingProviders = requiredProviders.filter(
      (provider) => !credentialProviders.includes(provider),
    );
    if (missingProviders.length > 0) {
      throw new BadRequestException(
        `이 PC에 저장되지 않은 CP 계정이 있습니다: ${missingProviders.join(", ")}`,
      );
    }
    return {
      executionTarget: "local",
      runnerDeviceId,
      credentialProviders,
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown workflow error";
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
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
