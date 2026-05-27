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
  LinkOfficeAdvertisementGroupDto,
  OfficeAdvertisementBatchUpsertDto,
  OfficeAdvertisementsService,
  UpdateOfficeAdvertisementGroupDto,
} from './office-advertisements.service';

@ApiTags('내 광고 인벤토리')
@ApiBearerAuth()
@Controller('office-advertisements')
@UseGuards(JwtAuthGuard)
export class OfficeAdvertisementsController {
  constructor(private readonly service: OfficeAdvertisementsService) {}

  @Get('groups')
  findAllGroups(
    @CurrentUser() user: CurrentUserPayload,
    @Query('source') source: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('onlyUnlinked') onlyUnlinked: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.service.findAllGroups(user.officeId, {
      source,
      status,
      search,
      onlyUnlinked: onlyUnlinked === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateOfficeAdvertisementGroupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateGroup(id, user.officeId, dto);
  }

  @Post('groups/:id/link-listing-advertisement')
  linkGroupToListingAdvertisement(
    @Param('id') id: string,
    @Body() dto: LinkOfficeAdvertisementGroupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.linkGroupToListingAdvertisement(id, user.officeId, dto);
  }

  @Post('batch')
  batchUpsert(
    @Body() dto: OfficeAdvertisementBatchUpsertDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.batchUpsert(user.officeId, dto);
  }
}
