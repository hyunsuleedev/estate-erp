import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { NotificationsService } from './notifications.service';

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 uuid 변환 오류로 500이 난다). */
const NotificationIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 알림 주소입니다.'),
});

@ApiTags('알림')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    // 형식이 틀린 목록 위치(cursor)는 400으로 (그대로 두면 uuid 변환 오류로 500이 난다)
    if (cursor && !UUID_PATTERN.test(cursor)) {
      throw new BadRequestException('잘못된 알림 목록 위치입니다.');
    }
    return this.notificationsService.list(user.officeId, user.userId, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.unreadCount(user.officeId, user.userId);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllRead(user.officeId, user.userId);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', NotificationIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notificationsService.markRead(id, user.officeId, user.userId);
  }
}
