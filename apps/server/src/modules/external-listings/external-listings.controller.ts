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
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  BatchUpsertDto,
  CompleteSessionOptions,
  CreateSessionDto,
  ExternalListingsService,
  ManualListingsDto,
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

  /** 수동 입력. 스냅샷 없이 저장하며 다른 광고를 비활성화하지 않는다. */
  @Post('manual')
  createManualListings(
    @Body() dto: ManualListingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createManualListings(user.officeId, dto);
  }

  /** 수동 입력 광고 내리기. */
  @Post('listings/:id/end')
  endManualListing(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.endManualListing(user.officeId, id);
  }

  /**
   * 열린 스냅샷에 묶음 입력.
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
