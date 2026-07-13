import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentControlPlaneService } from '../agent/control-plane/control-plane.service';
import { DraftExecutorService } from './executor.service';
import type {
  CreateDraftInput,
  DraftPriority,
  DraftStatus,
} from './inbox.types';

/**
 * InboxService — EntityDraft 의 생애주기 관리.
 *
 * 생성 → (업무함 표시) → 결정(승인/확인/거부/편집) → 실행(executor 에 위임)
 *
 * 실행 디스패치는 DraftExecutorService 에 위임.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private static readonly DEFAULT_AGENT_LEASE_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: DraftExecutorService,
    private readonly controlPlane: AgentControlPlaneService,
  ) {}

  // ── 생성 ────────────────────────────────────────────────────────────
  async create(input: CreateDraftInput) {
    await this.assertAgentLineage(input);

    // dedupe
    if (input.dedupeKey) {
      const existing = await this.prisma.entityDraft.findFirst({
        where: {
          officeId: input.officeId,
          dedupeKey: input.dedupeKey,
          status: { in: ['pending', 'approved', 'executing'] },
        },
        select: { id: true },
      });
      if (existing) {
        this.logger.log(
          `Draft dedupe skip: office=${input.officeId} key=${input.dedupeKey}`,
        );
        return null;
      }
    }

    try {
      return await this.prisma.entityDraft.create({
        data: this.toCreateData(input),
      });
    } catch (error) {
      // The partial unique index is the final defense against concurrent
      // duplicate review requests. Match the existing create() contract by
      // returning null when another request won the race.
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reuses an open human review while replacing only the immutable artifact
   * pointer. The artifact itself remains append-only in its domain revision
   * table; comments on the review request are retained as the conversation.
   */
  async upsertAgentReview(input: CreateDraftInput) {
    if (!input.agentSessionId || !input.dedupeKey) {
      throw new BadRequestException(
        'Agent review requires agentSessionId and dedupeKey',
      );
    }
    await this.assertAgentLineage(input);

    const existing = await this.prisma.entityDraft.findFirst({
      where: {
        officeId: input.officeId,
        agentSessionId: input.agentSessionId,
        dedupeKey: input.dedupeKey,
        status: { in: ['pending', 'processing', 'approved', 'executing'] },
      },
    });

    if (!existing) {
      const created = await this.create(input);
      return created ? this.getById(created.id, input.officeId) : null;
    }
    if (!['pending', 'processing'].includes(existing.status)) {
      throw new ConflictException(
        `기존 검토 요청이 ${existing.status} 상태여서 새 revision으로 교체할 수 없습니다.`,
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.entityDraft.update({
        where: { id: existing.id },
        data: {
          entityType: input.entityType,
          operation: input.operation,
          entityId: input.entityId ?? null,
          proposedChanges: input.proposedChanges as object,
          category: input.category,
          title: input.title,
          summary: input.summary,
          reasoning: input.reasoning ?? null,
          priority: input.priority ?? 'normal',
          decisionMode: input.decisionMode,
          executor: input.executor ?? 'server',
          status: 'pending',
          snoozedUntil: null,
          expiresAt: input.expiresAt ?? null,
          generatedBy: input.generatedBy,
          requestedByRunId: input.requestedByRunId ?? null,
          listingId: input.listingId ?? null,
          listingIntakeId: input.listingIntakeId ?? null,
          propertyId: input.propertyId ?? null,
          contactId: input.contactId ?? null,
          dealId: input.dealId ?? null,
          contractId: input.contractId ?? null,
          paymentId: input.paymentId ?? null,
        },
      }),
      this.prisma.entityDraftComment.updateMany({
        where: { draftId: existing.id, readAt: null },
        data: { readAt: now },
      }),
    ]);

    return this.getById(existing.id, input.officeId);
  }

  // ── 목록 조회 ───────────────────────────────────────────────────────
  async list(
    officeId: string,
    opts: {
      scope?: 'pending' | 'processing' | 'approved' | 'resolved' | 'all';
      decisionMode?: string;
      priority?: DraftPriority;
      category?: string;
      limit?: number;
    } = {},
  ) {
    const scope = opts.scope ?? 'pending';

    // 탭 ↔ 상태 매핑:
    //   pending     — 사장님 결정 필요 (pending)
    //   processing  — AI 재작성 중 (OpenClaw heartbeat 대기)
    //   approved    — 승인 완료, 실행 대기/중 (approved | executing)
    //   resolved    — 종결 (executed | failed | rejected | expired)
    const statusFilter: Prisma.EntityDraftWhereInput =
      scope === 'pending'
        ? {
            status: 'pending',
            OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
          }
        : scope === 'processing'
          ? { status: 'processing' }
          : scope === 'approved'
            ? { status: { in: ['approved', 'executing'] } }
            : scope === 'resolved'
              ? { status: { in: ['executed', 'failed', 'rejected', 'expired'] } }
              : {}; // all

    const drafts = await this.prisma.entityDraft.findMany({
      where: {
        officeId,
        ...statusFilter,
        ...(opts.decisionMode ? { decisionMode: opts.decisionMode } : {}),
        ...(opts.priority ? { priority: opts.priority } : {}),
        ...(opts.category ? { category: opts.category } : {}),
      },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
        },
        agentSession: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                assignedTo: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [
        // urgent > normal > low — 간단히 문자열 우선순위 map 으로 정렬
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
      take: opts.limit ?? 100,
    });

    // 정렬 보정 (priority 문자열 순서로는 urgent > low 가 맞지 않음)
    const priorityRank: Record<string, number> = {
      urgent: 0,
      normal: 1,
      low: 2,
    };
    drafts.sort((a, b) => {
      const pa = priorityRank[a.priority] ?? 99;
      const pb = priorityRank[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return drafts;
  }

  async getById(id: string, officeId: string) {
    const draft = await this.prisma.entityDraft.findFirst({
      where: { id, officeId },
      include: {
        comments: { orderBy: { createdAt: 'asc' } },
        agentSession: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                assignedTo: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  // ── 편집 ────────────────────────────────────────────────────────────
  async edit(
    id: string,
    officeId: string,
    patch: { proposedChanges?: Record<string, unknown>; decisionNote?: string },
  ) {
    const draft = await this.getById(id, officeId);
    if (draft.status !== 'pending') {
      throw new ConflictException(
        `Cannot edit draft in status=${draft.status}`,
      );
    }
    if (this.isVersionedArtifact(draft.proposedChanges)) {
      throw new ConflictException(
        '버전이 고정된 계약서는 직접 수정할 수 없습니다. 코멘트로 새 revision을 요청해주세요.',
      );
    }
    return this.prisma.entityDraft.update({
      where: { id },
      data: {
        ...(patch.proposedChanges
          ? { proposedChanges: patch.proposedChanges as object }
          : {}),
      },
    });
  }

  // ── 결정: 확인/승인 (confirm/approve) ───────────────────────────────
  async decide(
    id: string,
    officeId: string,
    userId: string,
    note?: string,
  ) {
    const draft = await this.getById(id, officeId);
    if (draft.status !== 'pending') {
      throw new ConflictException(
        `Cannot decide draft in status=${draft.status}`,
      );
    }
    if (this.artifactValidationErrorCount(draft.proposedChanges) > 0) {
      throw new BadRequestException(
        '검증 오류가 있는 계약서 revision은 승인할 수 없습니다. 코멘트로 수정을 요청해주세요.',
      );
    }

    // 상태 전이와 agent wakeup을 같은 DB transaction에 기록한다. HTTP 응답이
    // 끊겨도 승인 신호가 유실되지 않으며, 동시 승인/거부 중 하나만 성공한다.
    const nowApproved = await this.prisma.$transaction(async (tx) => {
      const decidedAt = new Date();
      const transitioned = await tx.entityDraft.updateMany({
        where: { id, officeId, status: 'pending' },
        data: {
          status: 'approved',
          decidedAt,
          decidedById: userId,
          decisionNote: note ?? null,
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Draft decision was already recorded');
      }

      if (draft.agentSessionId) {
        await tx.agentWakeupRequest.create({
          data: {
            officeId,
            sessionId: draft.agentSessionId,
            source: 'approval',
            reason: 'review_approved',
            payload: {
              draftId: id,
              decision: 'approved',
              note: note ?? null,
            },
            idempotencyKey: `draft:${id}:decision:approved`,
            requestedBy: `user:${userId}`,
          },
        });
        await tx.agentSession.updateMany({
          where: {
            id: draft.agentSessionId,
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
      }

      return tx.entityDraft.findFirstOrThrow({ where: { id, officeId } });
    });

    if (nowApproved.executor === 'server') {
      // 즉시 실행
      await this.executor.execute(nowApproved.id);
    } else if (nowApproved.executor === 'agent') {
      // OpenClaw 가 heartbeat 때 집어감. 여기선 approved 상태 유지.
      this.logger.log(
        `Draft ${id} approved, awaiting agent pickup (executor=agent)`,
      );
    } else if (nowApproved.executor === 'manual') {
      // 사장님이 직접 처리. 승인과 동시에 executed 로 전환.
      await this.prisma.entityDraft.update({
        where: { id },
        data: { status: 'executed', executedAt: new Date() },
      });
    }

    const resolved = await this.getById(id, officeId);
    if (resolved.agentSession?.task?.id) {
      await this.prisma.task.updateMany({
        where: { id: resolved.agentSession.task.id, officeId },
        data: {
          status: resolved.status === 'executed' ? 'completed' : 'in_progress',
        },
      });
    }

    await this.appendReviewActivity(draft.agentSessionId, officeId, {
      type: 'response',
      message: '사용자가 검토 요청을 승인했습니다.',
      payload: { draftId: id, decision: 'approved', note: note ?? null },
    });

    return this.getById(id, officeId);
  }

  // ── 거부 ────────────────────────────────────────────────────────────
  async reject(
    id: string,
    officeId: string,
    userId: string,
    note: string,
  ) {
    const draft = await this.getById(id, officeId);
    if (draft.status !== 'pending') {
      throw new ConflictException(
        `Cannot reject draft in status=${draft.status}`,
      );
    }
    const rejected = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.entityDraft.updateMany({
        where: { id, officeId, status: 'pending' },
        data: {
          status: 'rejected',
          decidedAt: new Date(),
          decidedById: userId,
          decisionNote: note,
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Draft decision was already recorded');
      }

      if (draft.agentSessionId) {
        await tx.agentWakeupRequest.create({
          data: {
            officeId,
            sessionId: draft.agentSessionId,
            source: 'approval',
            reason: 'review_rejected',
            payload: { draftId: id, decision: 'rejected', note },
            idempotencyKey: `draft:${id}:decision:rejected`,
            requestedBy: `user:${userId}`,
          },
        });
        await tx.agentSession.updateMany({
          where: {
            id: draft.agentSessionId,
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
        if (draft.agentSession?.task?.id) {
          await tx.task.updateMany({
            where: {
              id: draft.agentSession.task.id,
              officeId,
              status: { not: 'completed' },
            },
            data: { status: 'cancelled' },
          });
        }
      }

      return tx.entityDraft.findFirstOrThrow({ where: { id, officeId } });
    });

    await this.appendReviewActivity(draft.agentSessionId, officeId, {
      type: 'response',
      message: '사용자가 검토 요청을 거부했습니다.',
      payload: { draftId: id, decision: 'rejected', note },
    });
    return rejected;
  }

  // ── 보류 ────────────────────────────────────────────────────────────
  async snooze(id: string, officeId: string, until: Date) {
    await this.getById(id, officeId);
    return this.prisma.entityDraft.update({
      where: { id },
      data: { snoozedUntil: until },
    });
  }

  async unsnooze(id: string, officeId: string) {
    await this.getById(id, officeId);
    return this.prisma.entityDraft.update({
      where: { id },
      data: { snoozedUntil: null },
    });
  }

  // ── 코멘트 ──────────────────────────────────────────────────────────
  /**
   * 사장님/담당자가 AI 재작성을 요청하는 코멘트를 남긴다.
   *
   * 코멘트는 "AI 수정 지시" 의미로 쓰이므로, 아직 pending 상태의 draft 에
   * 코멘트가 달리면 draft 를 'processing' 으로 자동 전이시킨다.
   * 같은 transaction에서 durable AgentWakeupRequest를 생성하므로 MCP agent가
   * polling scheduler 없이 lease 기반으로 즉시 재개할 수 있다.
   */
  async addComment(
    draftId: string,
    officeId: string,
    authorId: string,
    body: string,
  ) {
    const draft = await this.getById(draftId, officeId);
    if (!body.trim()) throw new BadRequestException('Comment body is required');
    if (draft.status === 'processing') {
      throw new ConflictException(
        '이미 재처리 중입니다. 완료 후 추가 코멘트를 작성해주세요.',
      );
    }
    if (draft.status !== 'pending') {
      throw new ConflictException(
        `이 단계(${draft.status})에서는 코멘트로 재처리를 요청할 수 없습니다.`,
      );
    }

    // 코멘트, 상태 전이, durable wakeup을 한 transaction으로 묶는다.
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.entityDraftComment.create({
        data: {
          draftId: draft.id,
          officeId,
          authorId,
          body: body.trim(),
        },
      });
      const transitioned = await tx.entityDraft.updateMany({
        where: { id: draftId, officeId, status: 'pending' },
        data: { status: 'processing' },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Draft changed before comment was saved');
      }

      if (draft.agentSessionId) {
        await tx.agentWakeupRequest.create({
          data: {
            officeId,
            sessionId: draft.agentSessionId,
            source: 'comment',
            reason: 'revision_requested',
            payload: {
              draftId,
              commentId: created.id,
              body: created.body,
            },
            idempotencyKey: `draft:${draftId}:comment:${created.id}`,
            requestedBy: `user:${authorId}`,
          },
        });
        await tx.agentSession.updateMany({
          where: {
            id: draft.agentSessionId,
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
        if (draft.agentSession?.task?.id) {
          await tx.task.updateMany({
            where: {
              id: draft.agentSession.task.id,
              officeId,
              status: { notIn: ['completed', 'cancelled'] },
            },
            data: { status: 'in_progress' },
          });
        }
      }
      return created;
    });

    await this.appendReviewActivity(draft.agentSessionId, officeId, {
      type: 'response',
      message: '사용자가 새 revision을 요청했습니다.',
      payload: { draftId, commentId: comment.id, body: comment.body },
    });

    return comment;
  }

  // ── 레거시 일반 제안 재처리 완료 보고 ───────────────────────────────
  /**
   * 일반 제안의 재작성을 완료했을 때 호출. 불변 artifact는 도메인 revision
   * 생성 API를 거쳐 upsertAgentReview로 연결해야 한다.
   * - proposedChanges 를 새 내용으로 교체
   * - unread 코멘트들 readAt 마킹
   * - status → pending 복귀 (다시 사장님 검토)
   */
  async submitRevision(
    draftId: string,
    officeId: string,
    args: {
      proposedChanges: Record<string, unknown>;
      readCommentIds?: string[];
    },
  ) {
    const draft = await this.getById(draftId, officeId);
    if (draft.status !== 'processing') {
      throw new ConflictException(
        `재처리 중인 draft 만 revision 을 받을 수 있습니다 (현재=${draft.status}).`,
      );
    }
    if (this.isVersionedArtifact(draft.proposedChanges)) {
      throw new ConflictException(
        '버전이 고정된 계약서는 임의 payload로 교체할 수 없습니다. 계약서 revision 생성 도구를 사용해주세요.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.entityDraft.update({
        where: { id: draftId },
        data: {
          proposedChanges: args.proposedChanges as object,
          status: 'pending',
        },
      }),
      ...(args.readCommentIds && args.readCommentIds.length > 0
        ? [
            this.prisma.entityDraftComment.updateMany({
              where: {
                id: { in: args.readCommentIds },
                draftId,
              },
              data: { readAt: now },
            }),
          ]
        : [
            // 명시적 ID 안 주면 draft 의 모든 미읽음 코멘트를 읽음 처리
            this.prisma.entityDraftComment.updateMany({
              where: { draftId, readAt: null },
              data: { readAt: now },
            }),
          ]),
    ]);

    return this.getById(draftId, officeId);
  }

  // ── Agent 실행 흐름 (MCP 에서 호출) ─────────────────────────────────
  /**
   * 레거시 agent executor가 approved 작업을 가져감.
   * executor='agent' 이고 status='approved' 인 것만 반환.
   */
  async listAgentPending(officeId: string, limit = 20) {
    await this.recoverExpiredAgentClaims(officeId);
    return this.prisma.entityDraft.findMany({
      where: {
        officeId,
        executor: 'agent',
        status: 'approved',
      },
      orderBy: [{ priority: 'asc' }, { decidedAt: 'asc' }],
      take: limit,
    });
  }

  /**
   * 복구/관리용 — processing 상태 draft 조회.
   * 사장님이 코멘트로 재작성 요청한 것들.
   */
  async listProcessing(officeId: string, limit = 20) {
    return this.prisma.entityDraft.findMany({
      where: { officeId, status: 'processing' },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Agent 가 approved 작업을 집어갈 때 호출. approved → executing 으로 전이.
   * 동시성 방지: 이미 executing 이면 ConflictException.
   */
  async claimForAgent(
    draftId: string,
    officeId: string,
    claimedBy: string,
    leaseMs = InboxService.DEFAULT_AGENT_LEASE_MS,
  ) {
    const draft = await this.getById(draftId, officeId);
    if (draft.executor !== 'agent') {
      throw new ConflictException(
        `Draft executor is ${draft.executor}, not 'agent'`,
      );
    }
    if (draft.status !== 'approved') {
      throw new ConflictException(
        `Draft not in approved state (current=${draft.status})`,
      );
    }
    if (draft.attempts >= draft.maxAttempts) {
      throw new ConflictException(
        `Draft exceeded max attempts (${draft.maxAttempts})`,
      );
    }
    const now = new Date();
    const updated = await this.prisma.entityDraft.updateMany({
      where: {
        id: draftId,
        officeId,
        status: 'approved',
        executor: 'agent',
        attempts: { lt: draft.maxAttempts },
      },
      data: {
        status: 'executing',
        claimedAt: now,
        claimedBy,
        lockExpiresAt: new Date(now.getTime() + Math.max(30_000, leaseMs)),
        attempts: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Draft already claimed by another agent');
    }
    return this.getById(draftId, officeId);
  }

  /**
   * Agent 가 실행 결과를 보고. executing → executed / failed.
   */
  async reportAgentExecution(
    draftId: string,
    officeId: string,
    args: {
      status: 'executed' | 'failed';
      claimedBy: string;
      resultEntityId?: string;
      executionError?: string;
    },
  ) {
    const draft = await this.getById(draftId, officeId);
    if (draft.status !== 'executing') {
      throw new ConflictException(
        `Draft not executing (current=${draft.status})`,
      );
    }
    if (draft.executor !== 'agent') {
      throw new ConflictException(
        `Draft executor is ${draft.executor}, not 'agent'`,
      );
    }
    if (draft.claimedBy !== args.claimedBy) {
      throw new ConflictException('Draft is leased by another agent');
    }
    const updated = await this.prisma.entityDraft.updateMany({
      where: {
        id: draftId,
        officeId,
        status: 'executing',
        executor: 'agent',
        claimedBy: args.claimedBy,
        lockExpiresAt: { gt: new Date() },
      },
      data: {
        status: args.status,
        executedAt: args.status === 'executed' ? new Date() : null,
        resultEntityId: args.resultEntityId ?? null,
        executionError: args.executionError ?? null,
        lockExpiresAt: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Draft lease changed before completion');
    }
    const resolved = await this.getById(draftId, officeId);
    if (resolved.agentSession?.task?.id) {
      await this.prisma.task.updateMany({
        where: { id: resolved.agentSession.task.id, officeId },
        data: {
          status: args.status === 'executed' ? 'completed' : 'in_progress',
        },
      });
    }
    return this.getById(draftId, officeId);
  }

  /**
   * Long-running agent work renews its lease without changing business state.
   */
  async renewAgentClaim(
    draftId: string,
    officeId: string,
    claimedBy: string,
    leaseMs = InboxService.DEFAULT_AGENT_LEASE_MS,
  ) {
    const now = new Date();
    const updated = await this.prisma.entityDraft.updateMany({
      where: {
        id: draftId,
        officeId,
        status: 'executing',
        executor: 'agent',
        claimedBy,
        lockExpiresAt: { gt: now },
      },
      data: {
        lockExpiresAt: new Date(now.getTime() + Math.max(30_000, leaseMs)),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Draft lease is missing or expired');
    }
    return this.getById(draftId, officeId);
  }

  /**
   * A crashed worker must not leave work permanently in executing. Expired
   * leases are returned to the approved queue until maxAttempts is reached.
   *
   * attempts/maxAttempts 판정은 read-then-write 가 아니라 UPDATE 술어로 수행한다 —
   * READ COMMITTED 에서 술어는 행 락 획득 후 최신 버전으로 재평가되므로, 동시에
   * 재시도를 소진시키는 트랜잭션(예: 연세 폐기 마이그레이션의 max_attempts=attempts)과
   * 교차해도 낡은 값으로 approved 복귀를 쓰는 경합이 발생하지 않는다.
   */
  async recoverExpiredAgentClaims(officeId?: string): Promise<number> {
    const officeFilter = officeId ? Prisma.sql`AND office_id = ${officeId}::uuid` : Prisma.empty;

    const [failed, requeued] = await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE entity_drafts SET
          status = 'failed',
          claimed_at = NULL,
          claimed_by = NULL,
          lock_expires_at = NULL,
          execution_error = 'Agent lease expired and retry limit was reached.'
        WHERE executor = 'agent'
          AND status = 'executing'
          AND lock_expires_at < now()
          AND attempts >= max_attempts
          ${officeFilter}`,
      this.prisma.$executeRaw`
        UPDATE entity_drafts SET
          status = 'approved',
          claimed_at = NULL,
          claimed_by = NULL,
          lock_expires_at = NULL,
          execution_error = 'Agent lease expired; returned to the execution queue.'
        WHERE executor = 'agent'
          AND status = 'executing'
          AND lock_expires_at < now()
          AND attempts < max_attempts
          ${officeFilter}`,
    ]);

    const recovered = failed + requeued;
    if (recovered > 0) {
      this.logger.warn(
        `Recovered ${recovered} expired agent draft leases (requeued ${requeued}, failed ${failed})`,
      );
    }
    return recovered;
  }

  // ── 만료 처리 (cron 에서 호출) ──────────────────────────────────────
  async expireStale(): Promise<number> {
    const result = await this.prisma.entityDraft.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date(), not: null },
      },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale drafts`);
    }
    return result.count;
  }

  private toCreateData(input: CreateDraftInput) {
    return {
      officeId: input.officeId,
      entityType: input.entityType,
      operation: input.operation,
      entityId: input.entityId ?? null,
      proposedChanges: input.proposedChanges as object,
      category: input.category,
      title: input.title,
      summary: input.summary,
      reasoning: input.reasoning ?? null,
      priority: input.priority ?? 'normal',
      decisionMode: input.decisionMode,
      executor: input.executor ?? 'server',
      status: 'pending',
      expiresAt: input.expiresAt ?? null,
      generatedBy: input.generatedBy,
      dedupeKey: input.dedupeKey ?? null,
      listingId: input.listingId ?? null,
      listingIntakeId: input.listingIntakeId ?? null,
      propertyId: input.propertyId ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      contractId: input.contractId ?? null,
      paymentId: input.paymentId ?? null,
      agentSessionId: input.agentSessionId ?? null,
      requestedByRunId: input.requestedByRunId ?? null,
    };
  }

  private async assertAgentLineage(input: CreateDraftInput) {
    if (input.requestedByRunId && !input.agentSessionId) {
      throw new BadRequestException(
        'requestedByRunId requires agentSessionId',
      );
    }
    if (!input.agentSessionId) return;

    await this.controlPlane.getSession(input.officeId, input.agentSessionId);
    if (input.requestedByRunId) {
      const run = await this.controlPlane.getRun(
        input.officeId,
        input.requestedByRunId,
      );
      if (run.sessionId !== input.agentSessionId) {
        throw new BadRequestException(
          'requestedByRunId does not belong to agentSessionId',
        );
      }
    }
  }

  private isVersionedArtifact(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const marker = (value as Record<string, unknown>)._artifactRevision;
    return Boolean(marker && typeof marker === 'object' && !Array.isArray(marker));
  }

  private artifactValidationErrorCount(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const marker = (value as Record<string, unknown>)._artifactRevision;
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return 0;
    const validation = (marker as Record<string, unknown>).validation;
    if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
      return 0;
    }
    const errors = (validation as Record<string, unknown>).errors;
    return Array.isArray(errors) ? errors.length : 0;
  }

  private async appendReviewActivity(
    sessionId: string | null | undefined,
    officeId: string,
    input: {
      type: 'thought' | 'action' | 'elicitation' | 'response' | 'error' | 'system';
      message: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    if (!sessionId) return;
    try {
      await this.controlPlane.appendActivity(officeId, {
        sessionId,
        ...input,
      });
    } catch (error) {
      // The wakeup is already durable in the business transaction. A missing
      // presentation activity must not turn a successful human decision into
      // a retry-unsafe HTTP failure.
      this.logger.error(
        `Failed to append review activity for session ${sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
