import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NoticesService, type NoticeInput } from './notices.service';

/**
 * 공지사항. 직원은 보고 읽음 표시만 한다. /notices/admin 아래는 운영자만 쓸 수 있고
 * (서비스가 요청마다 DB에서 확인한다) 데스크톱 앱은 부르지 않는다.
 */
@ApiTags('공지사항')
@ApiBearerAuth()
@Controller('notices')
@UseGuards(JwtAuthGuard)
export class NoticesController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForUser(user.userId);
  }

  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markRead(id, user.userId);
  }

  @Get('admin')
  adminList(@CurrentUser() user: CurrentUserPayload) {
    return this.service.adminList(user.userId);
  }

  @Post('admin')
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: NoticeInput) {
    return this.service.create(user.userId, body ?? {});
  }

  @Patch('admin/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: NoticeInput,
  ) {
    return this.service.update(id, user.userId, body ?? {});
  }

  @Delete('admin/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.userId);
  }
}
