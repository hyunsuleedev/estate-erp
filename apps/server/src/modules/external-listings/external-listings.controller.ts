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
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AddSnapshotListingDto,
  BatchUpsertDto,
  CompleteSessionOptions,
  CreateSessionDto,
  ExternalListingsService,
  KeepSnapshotListingsDto,
  SnapshotListingPatch,
  UpdateGroupDto,
} from './external-listings.service';

@ApiTags('외부 매물 (광고노트)')
@ApiBearerAuth()
@Controller('external-listings')
@UseGuards(JwtAuthGuard)
export class ExternalListingsController {
  constructor(private readonly service: ExternalListingsService) {}

  @Get('groups')
  findAllGroups(
    @Query('transactionType') transactionType: string | undefined,
    @Query('siteIds') siteIds: string | undefined,
    @Query('siteId') siteId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('bucket') bucket: string | undefined,
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAllGroups(user.officeId, {
      transactionType,
      siteIds,
      siteId,
      status,
      search,
      bucket:
        bucket === 'new' || bucket === 'old' || bucket === 'all'
          ? bucket
          : undefined,
      includeInactive: includeInactive === 'true',
    });
  }

  // ─── 스냅샷 세션 ────────────────────────────────────────────────

  @Get('sessions/active')
  getActiveSession(
    @Query('siteId') siteId: string,
    @Query('transactionType') transactionType: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getActiveSession(
      user.officeId,
      siteId,
      transactionType,
    );
  }

  @Post('sessions')
  createSession(
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createSession(user.officeId, user.userId, dto);
  }

  @Post('sessions/:id/complete')
  completeSession(
    @Param('id') id: string,
    @Body() options: CompleteSessionOptions | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.completeSession(
      user.officeId,
      user.userId,
      user.role,
      id,
      { expectedListingCount: options?.expectedListingCount },
    );
  }

  @Post('sessions/:id/cancel')
  cancelSession(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.cancelSession(
      user.officeId,
      user.userId,
      user.role,
      id,
    );
  }

  /** 열린 스냅샷에서 미입력 매물을 다시 입력하지 않고 유지. */
  @Post('sessions/:id/keep')
  keepSnapshotListings(
    @Param('id') id: string,
    @Body() dto: KeepSnapshotListingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.keepSnapshotListings(user.officeId, id, dto);
  }

  /** 열린 스냅샷에서 매물에 동일 광고 한 건 추가. */
  @Post('sessions/:id/groups/:groupId/listings')
  addSnapshotListing(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: AddSnapshotListingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addSnapshotListing(user.officeId, id, groupId, dto);
  }

  /** 열린 스냅샷에서 광고 수정. */
  @Patch('sessions/:id/listings/:listingId')
  updateSnapshotListing(
    @Param('id') id: string,
    @Param('listingId') listingId: string,
    @Body() patch: SnapshotListingPatch,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateSnapshotListing(
      user.officeId,
      id,
      listingId,
      patch,
    );
  }

  /** 열린 스냅샷에서 광고 삭제. */
  @Delete('sessions/:id/listings/:listingId')
  removeSnapshotListing(
    @Param('id') id: string,
    @Param('listingId') listingId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeSnapshotListing(user.officeId, id, listingId);
  }

  @Get('groups/:id')
  findGroupById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findGroupById(id, user.officeId);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateGroup(id, user.officeId, dto);
  }

  /**
   * 열린 스냅샷에 묶음 입력 — 화면 입력과 외부 agent의 단일 진입점.
   * 최대 100건/요청, 요청 하나는 전부 저장되거나 전부 거부된다.
   */
  @Post('batch')
  batchUpsert(
    @Body() dto: BatchUpsertDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.batchUpsert(user.officeId, dto);
  }
}
