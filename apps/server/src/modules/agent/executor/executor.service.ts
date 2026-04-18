import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { AssignmentService, AssignmentContext } from './assignment.service';

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
      include: { actions: true },
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

    const actions = proposal.actions.filter((a) => a.status === 'pending');
    if (actions.length === 0) {
      await this.prisma.proposal.update({
        where: { id: proposalId },
        data: { status: 'executed', executedAt: new Date() },
      });
      return;
    }

    let allSucceeded = true;
    for (const action of actions) {
      try {
        const result = await this.executeAction(
          action.tool,
          proposal.officeId,
          (action.args as Record<string, unknown>) ?? {},
          proposal,
        );
        await this.prisma.proposalAction.update({
          where: { id: action.id },
          data: { status: 'executed', result: (result as any) ?? undefined },
        });
      } catch (err) {
        allSucceeded = false;
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.proposalAction.update({
          where: { id: action.id },
          data: { status: 'failed', error: message.slice(0, 2000) },
        });
        this.logger.error(
          `Failed action ${action.id} (${action.tool}) for proposal ${proposalId}: ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: allSucceeded ? 'executed' : 'failed',
        executedAt: new Date(),
        executionError: allSucceeded ? null : 'One or more actions failed',
      },
    });
    this.logger.log(
      `Executed proposal ${proposalId} (${proposal.type}): ${allSucceeded ? 'success' : 'partial failure'}`,
    );
  }

  private async executeAction(
    tool: string,
    officeId: string,
    args: Record<string, unknown>,
    proposal: { listingId: string | null; propertyId: string | null; contactId: string | null; dealId: string | null },
  ): Promise<object | null> {
    switch (tool) {
      case 'create_task':
        await this.handleCreateTask(officeId, args, proposal);
        return null;

      case 'mark_ad_takedown':
        this.logger.warn(
          `mark_ad_takedown action not yet implemented (office=${officeId})`,
        );
        return null;

      default:
        throw new BadRequestException(`Unknown action tool: ${tool}`);
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
