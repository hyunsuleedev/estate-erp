import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { NoticesService, type NoticeInput } from './notices.service';

/**
 * 공지사항 운영자 API. 서비스 운영자(User.isPlatformAdmin)만 호출할 수 있고,
 * 데스크톱 앱이나 일반 API 문서에는 노출하지 않는다.
 */
@ApiExcludeController()
@Controller('notices/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class NoticesAdminController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  adminList(@CurrentUser() user: CurrentUserPayload) {
    return this.service.adminList(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: NoticeInput,
  ) {
    return this.service.create(user.userId, body ?? {});
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: NoticeInput,
  ) {
    return this.service.update(id, user.userId, body ?? {});
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.userId);
  }
}
