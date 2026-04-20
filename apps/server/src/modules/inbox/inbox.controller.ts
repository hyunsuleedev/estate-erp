import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

@ApiTags('Inbox')
@ApiBearerAuth()
@Controller('inbox')
@UseGuards(JwtAuthGuard)
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('scope') scope?: 'pending' | 'resolved' | 'all',
    @Query('decisionMode') decisionMode?: string,
    @Query('priority') priority?: 'urgent' | 'normal' | 'low',
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(user.officeId, {
      scope,
      decisionMode,
      priority,
      category,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.service.getById(id, user.officeId);
  }

  @Patch(':id')
  edit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { proposedChanges?: Record<string, unknown> },
  ) {
    return this.service.edit(id, user.officeId, body);
  }

  @Post(':id/decide')
  decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.service.decide(id, user.officeId, user.userId, body.note);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    return this.service.reject(id, user.officeId, user.userId, body.note);
  }

  @Post(':id/snooze')
  snooze(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { until: string },
  ) {
    return this.service.snooze(id, user.officeId, new Date(body.until));
  }

  @Post(':id/unsnooze')
  unsnooze(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.service.unsnooze(id, user.officeId);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.service.addComment(id, user.officeId, user.userId, body.body);
  }

  /**
   * OpenClaw (또는 수동 테스트) 가 재작성 완료를 보고.
   * 현재는 단순 POST — Phase B 에서 MCP 도구로도 노출 예정.
   */
  @Post(':id/revision')
  submitRevision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body()
    body: {
      proposedChanges: Record<string, unknown>;
      readCommentIds?: string[];
    },
  ) {
    return this.service.submitRevision(id, user.officeId, body);
  }
}
