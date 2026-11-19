import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsBoolean } from 'class-validator';
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

  /** 제안한 뒤 대상의 값이 바뀌었다는 안내를 보고도 반영할 때 true */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
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
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
  ) {
    return this.service.findAll(user.officeId, {
      recordingId: recordingId || undefined,
      status: status || undefined,
      targetType: targetType || undefined,
      targetId: targetId || undefined,
    });
  }

  @Post(':id/accept')
  accept(
    @Param('id') id: string,
    @Body() dto: AcceptCallSuggestionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.accept(id, user.officeId, user.userId, dto.payload, { force: dto.force === true });
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
