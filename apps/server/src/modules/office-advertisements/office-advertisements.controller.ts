import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  OfficeAdvertisementBatchUpsertDto,
  OfficeAdvertisementsService,
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
    @Query('search') search: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.service.findAllGroups(user.officeId, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('batch')
  batchUpsert(
    @Body() dto: OfficeAdvertisementBatchUpsertDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.batchUpsert(user.officeId, dto);
  }
}
