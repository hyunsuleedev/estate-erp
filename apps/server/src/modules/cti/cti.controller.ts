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
import { CtiService } from './cti.service';
import { CallEventDto, UpdateCallLogDto } from './dto/cti.dto';

@ApiTags('CTI')
@ApiBearerAuth()
@Controller('cti')
@UseGuards(JwtAuthGuard)
export class CtiController {
  constructor(private readonly service: CtiService) {}

  /** 발신번호 → 통화 팝업용 고객 카드 (고객/상담/매물/구하는조건/업무/최근통화) */
  @Get('lookup')
  lookup(@Query('phone') phone: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.lookup(user.officeId, phone);
  }

  /** CTI Bridge → Electron 경유 통화 이벤트 수집 (ring/terminate → CallLog) */
  @Post('call-events')
  ingest(@Body() dto: CallEventDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.ingestCallEvent(user.officeId, user.userId, dto);
  }

  @Get('call-logs')
  list(
    @Query('direction') direction: string,
    @Query('status') status: string,
    @Query('phone') phone: string,
    @Query('contactId') contactId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.listCallLogs(user.officeId, {
      direction: direction || undefined,
      status: status || undefined,
      phone: phone || undefined,
      contactId: contactId || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** 상담 전환 연결, 연락처 수동 매칭, 메모 */
  @Patch('call-logs/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCallLogDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateCallLog(user.officeId, id, dto);
  }
}
