import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: DraftExecutorService,
  ) {}

  // ── 생성 ────────────────────────────────────────────────────────────
  async create(input: CreateDraftInput) {
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

    return this.prisma.entityDraft.create({
      data: {
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
        propertyId: input.propertyId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        contractId: input.contractId ?? null,
        paymentId: input.paymentId ?? null,
      },
    });
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
      include: { comments: { orderBy: { createdAt: 'asc' } } },
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

    // 승인 단계 → executor 별로 흐름 분기
    const nowApproved = await this.prisma.entityDraft.update({
      where: { id },
      data: {
        status: 'approved',
        decidedAt: new Date(),
        decidedById: userId,
        decisionNote: note ?? null,
      },
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
    return this.prisma.entityDraft.update({
      where: { id },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedById: userId,
        decisionNote: note,
      },
    });
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
   * OpenClaw heartbeat (30분 주기) 가 `list_processing_drafts` 로 조회해서
   * 재작성 후 `submit_revision` 으로 반영.
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

    // 코멘트 저장 + draft 재처리 대기 상태로 전이 (같은 트랜잭션)
    const [comment] = await this.prisma.$transaction([
      this.prisma.entityDraftComment.create({
        data: {
          draftId: draft.id,
          officeId,
          authorId,
          body: body.trim(),
        },
      }),
      this.prisma.entityDraft.update({
        where: { id: draftId },
        data: { status: 'processing' },
      }),
    ]);

    return comment;
  }

  // ── 재처리 완료 보고 (OpenClaw / MCP 에서 호출) ─────────────────────
  /**
   * OpenClaw (또는 수동 테스트) 가 재작성을 완료했을 때 호출.
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
   * OpenClaw heartbeat 가 주기적으로 조회해서 자기가 실행할 approved 작업을 가져감.
   * executor='agent' 이고 status='approved' 인 것만 반환.
   */
  async listAgentPending(officeId: string, limit = 20) {
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
   * OpenClaw heartbeat 용 — processing 상태 draft 조회.
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
  async claimForAgent(draftId: string, officeId: string) {
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
    const updated = await this.prisma.entityDraft.updateMany({
      where: { id: draftId, officeId, status: 'approved', executor: 'agent' },
      data: { status: 'executing' },
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
    return this.prisma.entityDraft.update({
      where: { id: draftId },
      data: {
        status: args.status,
        executedAt: args.status === 'executed' ? new Date() : null,
        resultEntityId: args.resultEntityId ?? null,
        executionError: args.executionError ?? null,
      },
    });
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
}
