import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AppendAgentActivityInput,
  ClaimAgentWakeupOptions,
  CompleteAgentRunInput,
  CreateAgentRunInput,
  CreateAgentSessionInput,
  CreateAgentWakeupInput,
  ListAgentActivitiesOptions,
  ListAgentRunsOptions,
  ListAgentSessionsOptions,
  ListAgentWakeupsOptions,
  UpdateAgentSessionInput,
} from './control-plane.types';

const DEFAULT_LEASE_MS = 60_000;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 60 * 60_000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/**
 * Durable execution state for MCP-connected AI workers.
 *
 * All public methods take officeId explicitly. This is intentional: queue
 * workers do not necessarily run inside an HTTP request context, so tenant
 * isolation cannot rely on request-scoped Prisma middleware.
 */
@Injectable()
export class AgentControlPlaneService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(officeId: string, input: CreateAgentSessionInput) {
    this.assertNonBlank(officeId, 'officeId');
    this.assertNonBlank(input.agentKey, 'agentKey');
    this.assertNonBlank(input.taskKey, 'taskKey');
    const adapter = input.adapter?.trim() || 'mcp';

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.taskId, officeId },
        select: { id: true },
      });
      if (!task) {
        throw new NotFoundException('Task not found in this office');
      }
    }

    return this.prisma.agentSession.create({
      data: {
        officeId,
        agentKey: input.agentKey.trim(),
        adapter,
        taskId: input.taskId ?? null,
        taskKey: input.taskKey.trim(),
        context: input.context ?? {},
        ...(input.plan !== undefined
          ? { plan: input.plan === null ? Prisma.DbNull : input.plan }
          : {}),
      },
    });
  }

  /**
   * Paperclip-style persistent task session. Concurrent creators converge on
   * the same (office, agent, adapter, taskKey) row.
   */
  async getOrCreateSession(
    officeId: string,
    input: CreateAgentSessionInput,
  ) {
    this.assertNonBlank(officeId, 'officeId');
    this.assertNonBlank(input.agentKey, 'agentKey');
    this.assertNonBlank(input.taskKey, 'taskKey');
    const adapter = input.adapter?.trim() || 'mcp';
    const identity = {
      officeId,
      agentKey: input.agentKey.trim(),
      adapter,
      taskKey: input.taskKey.trim(),
    };

    const existing = await this.prisma.agentSession.findFirst({
      where: identity,
    });
    if (existing) return existing;

    try {
      return await this.createSession(officeId, { ...input, adapter });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const raced = await this.prisma.agentSession.findFirst({
        where: identity,
      });
      if (raced) return raced;
      throw error;
    }
  }

  async getSession(officeId: string, sessionId: string) {
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, officeId },
    });
    if (!session) throw new NotFoundException('Agent session not found');
    return session;
  }

  listSessions(
    officeId: string,
    options: ListAgentSessionsOptions = {},
  ) {
    return this.prisma.agentSession.findMany({
      where: {
        officeId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.agentKey ? { agentKey: options.agentKey } : {}),
        ...(options.taskId ? { taskId: options.taskId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: this.normalizeLimit(options.limit),
    });
  }

  async updateSession(
    officeId: string,
    sessionId: string,
    input: UpdateAgentSessionInput,
  ) {
    await this.getSession(officeId, sessionId);

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.taskId, officeId },
        select: { id: true },
      });
      if (!task) throw new NotFoundException('Task not found in this office');
    }

    return this.prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        ...(input.waitingReason !== undefined
          ? { waitingReason: input.waitingReason }
          : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        ...(input.plan !== undefined
          ? { plan: input.plan === null ? Prisma.DbNull : input.plan }
          : {}),
        ...(input.status === 'complete'
          ? { completedAt: new Date(), error: null, waitingReason: null }
          : {}),
      },
    });
  }

  async createWakeup(officeId: string, input: CreateAgentWakeupInput) {
    this.assertNonBlank(input.source, 'source');
    this.assertNonBlank(input.reason, 'reason');
    const maxAttempts = input.maxAttempts ?? 5;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new BadRequestException('maxAttempts must be between 1 and 20');
    }
    await this.getSession(officeId, input.sessionId);

    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await this.findActiveWakeupByKey(
        officeId,
        idempotencyKey,
      );
      if (existing) {
        return {
          created: false,
          wakeup: await this.prisma.agentWakeupRequest.update({
            where: { id: existing.id },
            data: { coalescedCount: { increment: 1 } },
          }),
        };
      }
    }

    try {
      const wakeup = await this.prisma.$transaction(async (tx) => {
        const created = await tx.agentWakeupRequest.create({
          data: {
            officeId,
            sessionId: input.sessionId,
            source: input.source.trim(),
            reason: input.reason.trim(),
            payload: input.payload ?? {},
            idempotencyKey,
            requestedBy: input.requestedBy ?? null,
            maxAttempts,
          },
        });

        // A new human answer/event re-opens a completed or waiting session.
        await tx.agentSession.updateMany({
          where: {
            id: input.sessionId,
            officeId,
            status: { not: 'active' },
          },
          data: {
            status: 'pending',
            waitingReason: null,
            completedAt: null,
            error: null,
          },
        });
        return created;
      });

      return { created: true, wakeup };
    } catch (error) {
      if (!idempotencyKey || !this.isUniqueViolation(error)) throw error;

      // The partial unique index closes the find/create race. Coalesce into the
      // winner instead of exposing a transient duplicate error to the caller.
      const raced = await this.findActiveWakeupByKey(
        officeId,
        idempotencyKey,
      );
      if (!raced) throw error;
      return {
        created: false,
        wakeup: await this.prisma.agentWakeupRequest.update({
          where: { id: raced.id },
          data: { coalescedCount: { increment: 1 } },
        }),
      };
    }
  }

  async getWakeup(officeId: string, wakeupId: string) {
    const wakeup = await this.prisma.agentWakeupRequest.findFirst({
      where: { id: wakeupId, officeId },
    });
    if (!wakeup) throw new NotFoundException('Agent wakeup not found');
    return wakeup;
  }

  listWakeups(
    officeId: string,
    options: ListAgentWakeupsOptions = {},
  ) {
    return this.prisma.agentWakeupRequest.findMany({
      where: {
        officeId,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.source ? { source: options.source } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: this.normalizeLimit(options.limit),
    });
  }

  async createRun(officeId: string, input: CreateAgentRunInput) {
    this.assertNonBlank(input.trigger, 'trigger');
    await this.getSession(officeId, input.sessionId);

    if (input.wakeupRequestId) {
      const wakeup = await this.prisma.agentWakeupRequest.findFirst({
        where: {
          id: input.wakeupRequestId,
          officeId,
          sessionId: input.sessionId,
        },
        select: { id: true },
      });
      if (!wakeup) {
        throw new NotFoundException('Agent wakeup not found for this session');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let attempt = 1;
      if (input.wakeupRequestId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${officeId}), hashtext(${input.wakeupRequestId}))`,
        );
        const previous = await tx.agentRun.aggregate({
          where: { wakeupRequestId: input.wakeupRequestId },
          _max: { attempt: true },
        });
        attempt = (previous._max.attempt ?? 0) + 1;
      }

      return tx.agentRun.create({
        data: {
          officeId,
          sessionId: input.sessionId,
          wakeupRequestId: input.wakeupRequestId ?? null,
          trigger: input.trigger.trim(),
          attempt,
        },
      });
    });
  }

  async getRun(officeId: string, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, officeId },
    });
    if (!run) throw new NotFoundException('Agent run not found');
    return run;
  }

  listRuns(officeId: string, options: ListAgentRunsOptions = {}) {
    return this.prisma.agentRun.findMany({
      where: {
        officeId,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: this.normalizeLimit(options.limit),
    });
  }

  /**
   * Atomically claims the oldest eligible wakeup and starts a run.
   *
   * FOR UPDATE SKIP LOCKED lets multiple BullMQ/MCP workers poll safely. A
   * claimed row becomes eligible again after its lease expires; the abandoned
   * run is closed as failed and a new attempt is appended.
   */
  async claimNextWakeup(
    officeId: string,
    workerId: string,
    options: ClaimAgentWakeupOptions = {},
  ) {
    this.assertNonBlank(officeId, 'officeId');
    this.assertNonBlank(workerId, 'workerId');
    const leaseMs = this.normalizeLeaseMs(options.leaseMs);
    const sourceFilter = options.source
      ? Prisma.sql`AND pending_wakeup."source" = ${options.source}`
      : Prisma.empty;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        WITH exhausted AS (
          UPDATE "agent_wakeup_requests" AS exhausted_wakeup
          SET "status" = 'failed',
              "finished_at" = NOW(),
              "claimed_by" = NULL,
              "claimed_at" = NULL,
              "lease_expires_at" = NULL,
              "error" = 'Agent retry limit reached'
          WHERE exhausted_wakeup."office_id" = ${officeId}::uuid
            AND (
              exhausted_wakeup."status" = 'queued'
              OR (
                exhausted_wakeup."status" = 'claimed'
                AND exhausted_wakeup."lease_expires_at" IS NOT NULL
                AND exhausted_wakeup."lease_expires_at" <= NOW()
              )
            )
            AND COALESCE((
              SELECT MAX(exhausted_run."attempt")
              FROM "agent_runs" AS exhausted_run
              WHERE exhausted_run."wakeup_request_id" = exhausted_wakeup."id"
            ), 0) >= exhausted_wakeup."max_attempts"
          RETURNING exhausted_wakeup."id", exhausted_wakeup."session_id"
        ), exhausted_runs AS (
          UPDATE "agent_runs" AS exhausted_run
          SET "status" = 'failed',
              "finished_at" = NOW(),
              "lease_expires_at" = NULL,
              "error" = 'Agent retry limit reached'
          WHERE exhausted_run."status" = 'running'
            AND exhausted_run."wakeup_request_id" IN (
              SELECT exhausted."id" FROM exhausted
            )
          RETURNING exhausted_run."wakeup_request_id"
        ), exhausted_sessions AS (
          UPDATE "agent_sessions" AS exhausted_session
          SET "status" = 'error',
              "waiting_reason" = NULL,
              "completed_at" = NULL,
              "error" = 'Agent retry limit reached',
              "updated_at" = NOW()
          WHERE exhausted_session."id" IN (
            SELECT exhausted."session_id" FROM exhausted
          )
          RETURNING exhausted_session."id"
        ), reopened_tasks AS (
          UPDATE "tasks" AS stalled_task
          SET "status" = 'pending',
              "updated_at" = NOW()
          WHERE stalled_task."status" NOT IN ('completed', 'cancelled')
            AND stalled_task."id" IN (
              SELECT exhausted_session."task_id"
              FROM "agent_sessions" AS exhausted_session
              WHERE exhausted_session."id" IN (
                SELECT exhausted."session_id" FROM exhausted
              )
                AND exhausted_session."task_id" IS NOT NULL
            )
          RETURNING stalled_task."id"
        ), candidate AS (
          SELECT pending_wakeup."id"
          FROM "agent_wakeup_requests" AS pending_wakeup
          WHERE pending_wakeup."office_id" = ${officeId}::uuid
            AND (
              pending_wakeup."status" = 'queued'
              OR (
                pending_wakeup."status" = 'claimed'
                AND pending_wakeup."lease_expires_at" IS NOT NULL
                AND pending_wakeup."lease_expires_at" <= NOW()
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM exhausted WHERE exhausted."id" = pending_wakeup."id"
            )
            AND NOT EXISTS (
              SELECT 1 FROM exhausted_runs
              WHERE exhausted_runs."wakeup_request_id" = pending_wakeup."id"
            )
            AND COALESCE((
              SELECT MAX(previous_run."attempt")
              FROM "agent_runs" AS previous_run
              WHERE previous_run."wakeup_request_id" = pending_wakeup."id"
            ), 0) < pending_wakeup."max_attempts"
            ${sourceFilter}
          ORDER BY pending_wakeup."requested_at" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "agent_wakeup_requests" AS wakeup
        SET "status" = 'claimed',
            "claimed_by" = ${workerId},
            "claimed_at" = NOW(),
            "lease_expires_at" = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
            "finished_at" = NULL,
            "error" = NULL
        FROM candidate
        WHERE wakeup."id" = candidate."id"
        RETURNING wakeup."id"
      `);

      const wakeupId = claimed[0]?.id;
      if (!wakeupId) return null;

      const wakeup = await tx.agentWakeupRequest.findFirstOrThrow({
        where: { id: wakeupId, officeId },
      });
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);

      await tx.agentRun.updateMany({
        where: {
          officeId,
          wakeupRequestId: wakeup.id,
          status: 'running',
        },
        data: {
          status: 'failed',
          finishedAt: now,
          leaseExpiresAt: null,
          error: 'Worker lease expired; wakeup reclaimed',
        },
      });

      const previous = await tx.agentRun.aggregate({
        where: { wakeupRequestId: wakeup.id },
        _max: { attempt: true },
      });
      const run = await tx.agentRun.create({
        data: {
          officeId,
          sessionId: wakeup.sessionId,
          wakeupRequestId: wakeup.id,
          status: 'running',
          trigger: `${wakeup.source}:${wakeup.reason}`,
          attempt: (previous._max.attempt ?? 0) + 1,
          workerId,
          leaseExpiresAt,
          startedAt: now,
        },
      });

      await tx.agentSession.updateMany({
        where: { id: wakeup.sessionId, officeId },
        data: {
          status: 'active',
          waitingReason: null,
          lastRunAt: now,
          completedAt: null,
          error: null,
        },
      });

      return { wakeup, run };
    });
  }

  async renewRunLease(
    officeId: string,
    runId: string,
    workerId: string,
    leaseMs = DEFAULT_LEASE_MS,
  ) {
    this.assertNonBlank(workerId, 'workerId');
    const normalizedLeaseMs = this.normalizeLeaseMs(leaseMs);
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + normalizedLeaseMs);

    return this.prisma.$transaction(async (tx) => {
      const renewed = await tx.agentRun.updateMany({
        where: {
          id: runId,
          officeId,
          status: 'running',
          workerId,
          leaseExpiresAt: { gt: now },
        },
        data: { leaseExpiresAt },
      });
      if (renewed.count !== 1) {
        throw new ConflictException('Run lease is not owned or has expired');
      }

      const run = await tx.agentRun.findFirstOrThrow({
        where: { id: runId, officeId },
      });
      if (run.wakeupRequestId) {
        await tx.agentWakeupRequest.updateMany({
          where: {
            id: run.wakeupRequestId,
            officeId,
            status: 'claimed',
            claimedBy: workerId,
          },
          data: { leaseExpiresAt },
        });
      }
      return { ...run, leaseExpiresAt };
    });
  }

  async completeRun(
    officeId: string,
    runId: string,
    workerId: string,
    input: CompleteAgentRunInput,
  ) {
    this.assertNonBlank(workerId, 'workerId');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: runId, officeId },
      });
      if (!run) throw new NotFoundException('Agent run not found');

      if (run.status === 'completed' || run.status === 'failed') {
        return run;
      }
      if (run.status !== 'running') {
        throw new BadRequestException(`Cannot complete run in ${run.status}`);
      }
      if (run.workerId !== workerId) {
        throw new ConflictException('Run is leased by another worker');
      }
      if (!run.leaseExpiresAt || run.leaseExpiresAt <= now) {
        throw new ConflictException('Run lease has expired');
      }
      if (input.outcome === 'failed' && !input.error?.trim()) {
        throw new BadRequestException('A failed run requires an error');
      }

      const failed = input.outcome === 'failed';
      const completedRun = await tx.agentRun.updateMany({
        where: {
          id: run.id,
          officeId,
          status: 'running',
          workerId,
          leaseExpiresAt: { gt: now },
        },
        data: {
          status: failed ? 'failed' : 'completed',
          finishedAt: now,
          leaseExpiresAt: null,
          ...(input.result !== undefined ? { result: input.result } : {}),
          ...(input.usage !== undefined ? { usage: input.usage } : {}),
          error: failed ? input.error!.trim() : null,
        },
      });
      if (completedRun.count !== 1) {
        throw new ConflictException('Run lease changed before completion');
      }
      const completed = await tx.agentRun.findFirstOrThrow({
        where: { id: run.id, officeId },
      });

      if (run.wakeupRequestId) {
        await tx.agentWakeupRequest.updateMany({
          where: {
            id: run.wakeupRequestId,
            officeId,
            status: 'claimed',
            claimedBy: workerId,
          },
          data: {
            status: failed ? 'failed' : 'completed',
            finishedAt: now,
            claimedBy: null,
            claimedAt: null,
            leaseExpiresAt: null,
            error: failed ? input.error!.trim() : null,
          },
        });
      }

      const sessionStatus = failed
        ? 'error'
        : input.outcome === 'awaiting_input'
          ? 'awaiting_input'
          : 'complete';
      await tx.agentSession.updateMany({
        where: { id: run.sessionId, officeId },
        data: {
          status: sessionStatus,
          waitingReason:
            input.outcome === 'awaiting_input'
              ? input.waitingReason?.trim() || 'Additional input required'
              : null,
          completedAt: sessionStatus === 'complete' ? now : null,
          error: failed ? input.error!.trim() : null,
        },
      });

      return completed;
    });
  }

  /**
   * Appends one immutable activity with a session-local monotonic sequence.
   * A transaction advisory lock avoids MAX(sequence)+1 races across workers.
   */
  async appendActivity(
    officeId: string,
    input: AppendAgentActivityInput,
  ) {
    if (!input.message?.trim() && input.payload === undefined) {
      throw new BadRequestException('Activity requires message or payload');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${officeId}), hashtext(${input.sessionId}))`,
      );

      const session = await tx.agentSession.findFirst({
        where: { id: input.sessionId, officeId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Agent session not found');

      if (input.runId) {
        const run = await tx.agentRun.findFirst({
          where: {
            id: input.runId,
            officeId,
            sessionId: input.sessionId,
          },
          select: { id: true },
        });
        if (!run) {
          throw new NotFoundException('Agent run not found for this session');
        }
      }

      const previous = await tx.agentActivity.aggregate({
        where: { sessionId: input.sessionId },
        _max: { sequence: true },
      });

      return tx.agentActivity.create({
        data: {
          officeId,
          sessionId: input.sessionId,
          runId: input.runId ?? null,
          sequence: (previous._max.sequence ?? 0) + 1,
          type: input.type,
          message: input.message?.trim() || null,
          ...(input.payload !== undefined ? { payload: input.payload } : {}),
          ephemeral: input.ephemeral ?? false,
        },
      });
    });
  }

  listActivities(
    officeId: string,
    sessionId: string,
    options: ListAgentActivitiesOptions = {},
  ) {
    return this.prisma.agentActivity.findMany({
      where: {
        officeId,
        sessionId,
        ...(options.runId ? { runId: options.runId } : {}),
        ...(options.afterSequence !== undefined
          ? { sequence: { gt: options.afterSequence } }
          : {}),
      },
      orderBy: { sequence: 'asc' },
      take: this.normalizeLimit(options.limit),
    });
  }

  private findActiveWakeupByKey(officeId: string, idempotencyKey: string) {
    return this.prisma.agentWakeupRequest.findFirst({
      where: {
        officeId,
        idempotencyKey,
        status: { in: ['queued', 'claimed'] },
      },
    });
  }

  private normalizeLimit(limit?: number) {
    if (limit === undefined) return DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return Math.min(limit, MAX_LIST_LIMIT);
  }

  private normalizeLeaseMs(leaseMs = DEFAULT_LEASE_MS) {
    if (
      !Number.isInteger(leaseMs) ||
      leaseMs < MIN_LEASE_MS ||
      leaseMs > MAX_LEASE_MS
    ) {
      throw new BadRequestException(
        `leaseMs must be between ${MIN_LEASE_MS} and ${MAX_LEASE_MS}`,
      );
    }
    return leaseMs;
  }

  private assertNonBlank(value: string, field: string) {
    if (!value?.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
