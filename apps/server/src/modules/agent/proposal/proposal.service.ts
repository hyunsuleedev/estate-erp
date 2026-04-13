import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExecutorService } from '../executor/executor.service';
import {
  CreateProposalsResult,
  ProposalDraft,
  ProposalStatus,
  TrustTier,
} from './proposal.types';

/**
 * ProposalService
 *
 * 단일 승인 큐(Proposal 테이블)의 CRUD + dedupe + 만료 처리.
 *
 * Phase 1 범위:
 * - createMany: Rule/MCP/Event 가 제안 초안을 넘기면 저장.
 *               dedupe, trustTier 해석, auto tier 자동 실행까지 한 번에.
 * - list / getById / approve / reject: inbox UI 및 REST
 * - expireStale: 만료 cron
 *
 * 승인 흐름:
 *   pending → approve() → approved → ExecutorService.execute() → executed | failed
 *
 * Auto tier 흐름:
 *   createMany() 내부에서 바로 approved → ExecutorService.execute() → executed | failed
 *
 * 의존 방향: ProposalService → ExecutorService.
 * ExecutorService 는 proposal 을 직접 prisma 로 조회/업데이트할 뿐 ProposalService 를 호출하지 않음 → 순환 없음.
 */
@Injectable()
export class ProposalService {
  private readonly logger = new Logger(ProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executorService: ExecutorService,
  ) {}

  /**
   * Rule 실행 결과(ProposalDraft[])를 저장.
   * @param officeId 대상 사무소
   * @param drafts Rule이 반환한 초안
   * @param generatedBy "rule:ad_takedown:v1" | "mcp:update_listing_price" | "event:listing.price.changed"
   */
  async createMany(
    officeId: string,
    drafts: ProposalDraft[],
    generatedBy: string,
  ): Promise<CreateProposalsResult> {
    if (drafts.length === 0) {
      return { created: 0, skipped: 0, autoExecuted: 0 };
    }

    let created = 0;
    let skipped = 0;
    let autoExecuted = 0;

    for (const draft of drafts) {
      // 1. dedupe 체크
      if (draft.dedupeKey) {
        const existing = await this.prisma.proposal.findFirst({
          where: {
            officeId,
            dedupeKey: draft.dedupeKey,
            status: { in: ['pending', 'approved'] },
          },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
      }

      // 2. auto tier면 바로 approved로 생성 → Executor가 후속 실행
      const initialStatus: ProposalStatus =
        draft.trustTier === 'auto' ? 'approved' : 'pending';

      const expiresAt = draft.expiresInHours
        ? new Date(Date.now() + draft.expiresInHours * 3_600_000)
        : null;

      const proposal = await this.prisma.proposal.create({
        data: {
          officeId,
          type: draft.type,
          title: draft.title,
          description: draft.description,
          reasoning: draft.reasoning ?? null,
          status: initialStatus,
          priority: draft.priority,
          trustTier: draft.trustTier,
          actionType: draft.actionType ?? null,
          actionPayload: (draft.actionPayload as object | undefined) ?? undefined,
          generatedBy,
          dedupeKey: draft.dedupeKey ?? null,
          listingId: draft.listingId ?? null,
          propertyId: draft.propertyId ?? null,
          contactId: draft.contactId ?? null,
          dealId: draft.dealId ?? null,
          contractId: draft.contractId ?? null,
          tenantId: draft.tenantId ?? null,
          expiresAt,
        },
      });

      created += 1;

      if (initialStatus === 'approved') {
        autoExecuted += 1;
        // Auto tier: 즉시 실행.
        // 여기서 await 하지 않고 fire-and-forget 로 두면 create 호출자가 빨리 반환되지만
        // 테스트 및 에러 가시성을 위해 await 한다. 대량 생성 시 병목이면 Phase 2 에 큐 전환.
        await this.executorService.execute(proposal.id);
      }
    }

    this.logger.log(
      `Proposals created for office=${officeId} by ${generatedBy}: created=${created}, skipped=${skipped}, autoExecuted=${autoExecuted}`,
    );

    return { created, skipped, autoExecuted };
  }

  list(
    officeId: string,
    opts: { status?: ProposalStatus; priority?: string; type?: string } = {},
  ) {
    return this.prisma.proposal.findMany({
      where: {
        officeId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.priority ? { priority: opts.priority } : {}),
        ...(opts.type ? { type: opts.type } : {}),
      },
      orderBy: [
        { priority: 'asc' }, // urgent -> normal -> low (string order로는 정확하진 않지만 Phase 1 단순 버전)
        { proposedAt: 'desc' },
      ],
    });
  }

  async getById(id: string, officeId: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, officeId },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async approve(id: string, officeId: string, userId: string, note?: string) {
    const proposal = await this.getById(id, officeId);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(
        `Cannot approve proposal in status: ${proposal.status}`,
      );
    }
    const updated = await this.prisma.proposal.update({
      where: { id },
      data: {
        status: 'approved',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionNote: note ?? null,
      },
    });
    // Executor 실행. 실패해도 proposal 은 이미 decided 상태라 UX 상 일관성 유지.
    // Executor 내부에서 proposal.status 를 executed | failed 로 최종 전이.
    await this.executorService.execute(id);
    return updated;
  }

  async reject(id: string, officeId: string, userId: string, note: string) {
    const proposal = await this.getById(id, officeId);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(
        `Cannot reject proposal in status: ${proposal.status}`,
      );
    }
    return this.prisma.proposal.update({
      where: { id },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionNote: note,
      },
    });
  }

  /**
   * 만료된 pending 제안을 expired 처리. 크론에서 주기적으로 호출.
   */
  async expireStale(): Promise<number> {
    const result = await this.prisma.proposal.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date(), not: null },
      },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} stale proposals`);
    }
    return result.count;
  }

  /**
   * Trust tier 해석기.
   * 우선순위: Office.agentTrustConfig[type] > Rule이 넘긴 fallback.
   * Rule의 evaluate() 내부에서 ctx.trustTierFor() 를 통해 호출된다.
   */
  async resolveTrustTier(
    officeId: string,
    proposalType: string,
    fallback: TrustTier,
  ): Promise<TrustTier> {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { agentTrustConfig: true },
    });
    const config = (office?.agentTrustConfig as Record<string, unknown> | null) ?? null;
    const configured = config?.[proposalType];
    if (
      configured === 'auto' ||
      configured === 'approval_required' ||
      configured === 'inform_only'
    ) {
      return configured;
    }
    return fallback;
  }
}
