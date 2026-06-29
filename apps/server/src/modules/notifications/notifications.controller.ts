import {
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
import { NotificationsService } from './notifications.service';

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
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.notificationsService.markRead(id, user.officeId, user.userId);
  }
}
