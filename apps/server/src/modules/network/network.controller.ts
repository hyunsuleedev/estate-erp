import {
  Body,
  Controller,
  Delete,
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
import { NetworkRoomsService, RoomsScope } from './network-rooms.service';
import {
  NetworkSharedPropertiesService,
  ShareListingDto,
  UpdateSharedPropertyDto,
} from './network-shared-properties.service';
import {
  InquiriesScope,
  NetworkInquiriesService,
} from './network-inquiries.service';
import { NetworkMessagesService } from './network-messages.service';

@ApiTags('공동중개 네트워크')
@ApiBearerAuth()
@Controller('network')
@UseGuards(JwtAuthGuard)
export class NetworkController {
  constructor(
    private readonly roomsService: NetworkRoomsService,
    private readonly sharedPropertiesService: NetworkSharedPropertiesService,
    private readonly inquiriesService: NetworkInquiriesService,
    private readonly messagesService: NetworkMessagesService,
  ) {}

  // ── 중개방 ──────────────────────────────────────────────────

  @Get('rooms')
  listRooms(
    @CurrentUser() user: CurrentUserPayload,
    @Query('scope') scope?: RoomsScope,
    @Query('region') region?: string,
    @Query('search') search?: string,
  ) {
    return this.roomsService.listRooms(user.officeId, {
      scope,
      region,
      search,
    });
  }

  @Post('rooms')
  createRoom(
    @Body()
    dto: {
      name: string;
      description?: string;
      type?: string;
      region?: string;
      maxMembers?: number;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roomsService.createRoom(user.officeId, dto);
  }

  @Get('rooms/:id')
  getRoom(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.roomsService.getRoom(id, user.officeId);
  }

  @Post('rooms/:id/join')
  joinRoom(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.roomsService.requestJoin(id, user.officeId);
  }

  @Patch('rooms/:id/members/:memberId')
  updateMember(
    @Param('id') roomId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { status: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.roomsService.updateMember(
      roomId,
      memberId,
      user.officeId,
      dto,
    );
  }

  @Delete('rooms/:id/members/me')
  leaveRoom(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.roomsService.leaveRoom(id, user.officeId);
  }

  // ── 공유 매물 ───────────────────────────────────────────────

  @Post('rooms/:id/shared-properties')
  shareListing(
    @Param('id') roomId: string,
    @Body() dto: ShareListingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sharedPropertiesService.share(
      roomId,
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Get('rooms/:id/shared-properties')
  listSharedProperties(
    @Param('id') roomId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sharedPropertiesService.listByRoom(roomId, user.officeId);
  }

  @Patch('shared-properties/:id')
  updateSharedProperty(
    @Param('id') id: string,
    @Body() dto: UpdateSharedPropertyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sharedPropertiesService.update(id, user.officeId, dto);
  }

  @Delete('shared-properties/:id')
  removeSharedProperty(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sharedPropertiesService.deactivate(id, user.officeId);
  }

  // ── 문의 ───────────────────────────────────────────────────

  @Post('shared-properties/:id/inquiries')
  createInquiry(
    @Param('id') sharedPropertyId: string,
    @Body() dto: { message?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.inquiriesService.create(
      sharedPropertyId,
      user.officeId,
      user.userId,
      dto,
    );
  }

  @Get('inquiries')
  listInquiries(
    @CurrentUser() user: CurrentUserPayload,
    @Query('scope') scope?: InquiriesScope,
    @Query('status') status?: string,
  ) {
    return this.inquiriesService.list(user.officeId, { scope, status });
  }

  @Patch('inquiries/:id')
  respondInquiry(
    @Param('id') id: string,
    @Body() dto: { status: string; response?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.inquiriesService.respond(id, user.officeId, dto);
  }

  // ── 채팅 ───────────────────────────────────────────────────

  @Get('rooms/:id/messages')
  listMessages(
    @Param('id') roomId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.list(roomId, user.officeId, {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('rooms/:id/messages')
  sendMessage(
    @Param('id') roomId: string,
    @Body() dto: { content: string; sharedPropertyId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.create(
      roomId,
      user.officeId,
      user.userId,
      dto,
    );
  }
}
