import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NoticesService } from './notices.service';

/**
 * 공지사항(직원용). 게시 중인 공지를 보고 읽음 표시한다.
 * 운영자용 CRUD(/notices/admin)는 NoticesAdminController에 분리돼 있다.
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
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.markRead(id, user.userId);
  }
}
