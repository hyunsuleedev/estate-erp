import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { AssignmentService, AssignmentContext } from './assignment.service';

/**
 * ExecutorService
 *
 * 승인된 Proposal 의 actionPayload 를 실제 도메인 서비스 호출로 번역한다.
 * ProposalService.approve() 가 성공적으로 상태를 approved 로 바꾼 직후,
 * 그리고 Rule 이 auto tier 로 바로 approved 상태로 만든 경우에도 이 함수가 호출된다.
 *
 * Phase 1 지원 actionType:
 *   - create_task: AssignmentService 로 담당자 결정 후 Task 생성
 *   - mark_ad_takedown: 다음 단계 구현 (현재 TODO)
 *
 * 실행 결과를 다시 Proposal 에 기록:
 *   - 성공: status = 'executed', executedAt 설정
 *   - 실패: status = 'failed', executionError 기록
 *
 * 새 actionType 을 Phase 2 이후에 추가하려면 executeAction() 의 switch 에 한 줄 추가.
 */
@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly assignmentService: AssignmentService,
  ) {}

  async execute(proposalId: string): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) {
      this.logger.warn(`Execute called on missing proposal: ${proposalId}`);
      return;
    }
    if (proposal.status !== 'approved') {
      this.logger.warn(
        `Execute called on proposal in non-approved state: status=${proposal.status} id=${proposalId}`,
      );
      return;
    }
    if (!proposal.actionType) {
      // inform_only 제안은 actionType 이 없다. 실행할 것이 없음.
      await this.prisma.proposal.update({
        where: { id: proposalId },
        data: { status: 'executed', executedAt: new Date() },
      });
      return;
    }

    try {
      await this.executeAction(
        proposal.actionType,
        proposal.officeId,
        (proposal.actionPayload as Record<string, unknown>) ?? {},
        proposal,
      );
      await this.prisma.proposal.update({
        where: { id: proposalId },
        data: { status: 'executed', executedAt: new Date() },
      });
      this.logger.log(
        `Executed proposal ${proposalId} (${proposal.type} / ${proposal.actionType})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to execute proposal ${proposalId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.prisma.proposal.update({
        where: { id: proposalId },
        data: {
          status: 'failed',
          executionError: message.slice(0, 2000),
        },
      });
    }
  }

  private async executeAction(
    actionType: string,
    officeId: string,
    payload: Record<string, unknown>,
    proposal: { listingId: string | null; propertyId: string | null; contactId: string | null; dealId: string | null },
  ): Promise<void> {
    switch (actionType) {
      case 'create_task':
        return this.handleCreateTask(officeId, payload, proposal);

      case 'mark_ad_takedown':
        // TODO(Phase 1 다음 단계): AdTakedownRule 이 실제 구현되면 함께 구현.
        this.logger.warn(
          `mark_ad_takedown action not yet implemented (office=${officeId})`,
        );
        return;

      default:
        throw new BadRequestException(`Unknown actionType: ${actionType}`);
    }
  }

  private async handleCreateTask(
    officeId: string,
    payload: Record<string, unknown>,
    proposal: { listingId: string | null; propertyId: string | null; contactId: string | null; dealId: string | null },
  ): Promise<void> {
    const title = stringField(payload, 'title');
    if (!title) {
      throw new BadRequestException('create_task payload missing title');
    }

    const context: AssignmentContext = {
      suggestedAssigneeId: stringField(payload, 'suggestedAssigneeId'),
      assignmentHint: stringField(payload, 'assignmentHint') ?? undefined,
      listingId: proposal.listingId ?? stringField(payload, 'listingId'),
      propertyId: proposal.propertyId ?? stringField(payload, 'propertyId'),
      contactId: proposal.contactId ?? stringField(payload, 'contactId'),
      buyerReqId: stringField(payload, 'buyerReqId'),
      dealId: proposal.dealId ?? stringField(payload, 'dealId'),
    };

    const assignedToId = await this.assignmentService.pickAssignee(officeId, context);

    await this.tasksService.create(officeId, {
      title,
      content: stringField(payload, 'content') ?? undefined,
      source: 'ai',
      status: 'pending',
      priority: stringField(payload, 'priority') ?? 'medium',
      category: stringField(payload, 'category') ?? 'other',
      dueDate: stringField(payload, 'dueDate') ?? undefined,
      assignedToId: assignedToId ?? undefined,
      contactId: context.contactId ?? undefined,
      propertyId: context.propertyId ?? undefined,
      listingId: context.listingId ?? undefined,
    });

    this.logger.log(
      `Created task for office=${officeId} assignee=${assignedToId ?? 'unassigned'}: "${title}"`,
    );
  }
}

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
