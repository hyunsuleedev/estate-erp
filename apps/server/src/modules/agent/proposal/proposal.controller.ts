import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProposalService } from './proposal.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { ProposalStatus } from './proposal.types';

@ApiTags('AI 직원 / Proposal')
@ApiBearerAuth()
@Controller('proposals')
@UseGuards(JwtAuthGuard)
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: ProposalStatus,
    @Query('priority') priority?: string,
    @Query('type') type?: string,
  ) {
    return this.proposals.list(user.officeId, { status, priority, type });
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.proposals.getById(id, user.officeId);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { note?: string } = {},
  ) {
    return this.proposals.approve(id, user.officeId, user.userId, body.note);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { note: string },
  ) {
    return this.proposals.reject(id, user.officeId, user.userId, body.note);
  }
}
