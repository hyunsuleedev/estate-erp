import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CallSuggestionsService } from './call-suggestions.service';

export class AcceptCallSuggestionDto {
  /** 사람이 고친 제안 내용. 없으면 제안 그대로 반영한다. */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

@ApiTags('통화 분석 제안')
@ApiBearerAuth()
@Controller('call-suggestions')
@UseGuards(JwtAuthGuard)
export class CallSuggestionsController {
  constructor(private readonly service: CallSuggestionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('recordingId') recordingId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(user.officeId, {
      recordingId: recordingId || undefined,
      status: status || undefined,
    });
  }

  @Post(':id/accept')
  accept(
    @Param('id') id: string,
    @Body() dto: AcceptCallSuggestionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.accept(id, user.officeId, user.userId, dto.payload);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.dismiss(id, user.officeId, user.userId);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.restore(id, user.officeId);
  }
}
