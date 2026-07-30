import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  AgentActionBlockerReason,
  AgentActionCapability,
  AgentActionExecutionMode,
  AgentActionExecutionStatus,
  AgentActionReviewStatus,
  AgentActionVerificationStatus,
} from '@estate-erp/shared';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AgentActionRequestsService } from './agent-action-requests.service';
import type {
  CreateAgentActionRequestInput,
  DecideAgentActionRequestInput,
  RecordAgentActionExecutionInput,
  ReportAgentActionBlockerInput,
  RejectAgentActionRequestInput,
  WithdrawAgentActionRequestInput,
} from './agent-action-requests.types';

@ApiTags('Agent Action Requests')
@ApiBearerAuth()
@Controller('agent-action-requests')
@UseGuards(JwtAuthGuard)
export class AgentActionRequestsController {
  constructor(
    private readonly agentActionRequests: AgentActionRequestsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('reviewerId') reviewerId?: string,
    @Query('escalationTaskId') escalationTaskId?: string,
    @Query('listingAdvertisementId') listingAdvertisementId?: string,
    @Query('capability') capability?: AgentActionCapability,
    @Query('reviewStatus') reviewStatus?: AgentActionReviewStatus,
    @Query('executionStatus') executionStatus?: AgentActionExecutionStatus,
    @Query('verificationStatus')
    verificationStatus?: AgentActionVerificationStatus,
    @Query('limit') limit?: string,
  ) {
    return this.agentActionRequests.list(user.officeId, {
      reviewerId,
      escalationTaskId,
      listingAdvertisementId,
      capability,
      reviewStatus,
      executionStatus,
      verificationStatus,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agentActionRequests.get(user.officeId, id);
  }

  @Post()
  create(
    @Body()
    dto: {
      reviewerId: string;
      listingAdvertisementId: string;
      capability: AgentActionCapability;
      rationale: string;
      payload: Record<string, unknown>;
      sourceSkillKey?: string | null;
      sourceSkillVersion?: string | null;
      executorSkillVersion?: string | null;
      executionMode?: AgentActionExecutionMode;
      dedupeKey?: string | null;
      supersedesId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.create(
      user.officeId,
      dto satisfies CreateAgentActionRequestInput,
      this.userActor(user),
    );
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: DecideAgentActionRequestInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.approve(
      user.officeId,
      id,
      dto,
      this.userActor(user),
    );
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectAgentActionRequestInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.reject(
      user.officeId,
      id,
      dto,
      this.userActor(user),
    );
  }

  @Post(':id/withdraw')
  withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawAgentActionRequestInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.withdraw(
      user.officeId,
      id,
      dto,
      this.userActor(user),
    );
  }

  @Post([':id/execution', ':id/manual-execution'])
  recordExecution(
    @Param('id') id: string,
    @Body() dto: RecordAgentActionExecutionInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.recordExecution(
      user.officeId,
      id,
      dto,
      this.userActor(user),
    );
  }

  @Post(':id/blocker')
  reportBlocker(
    @Param('id') id: string,
    @Body()
    dto: {
      contentHash: string;
      version: number;
      reasonCode: AgentActionBlockerReason;
      summary: string;
      evidence?: Record<string, unknown>;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentActionRequests.reportBlocker(
      user.officeId,
      id,
      dto satisfies ReportAgentActionBlockerInput,
      this.userActor(user),
    );
  }

  private userActor(user: CurrentUserPayload) {
    return {
      actor: 'user',
      source: 'web' as const,
      userId: user.userId,
      role: user.role,
    };
  }
}
