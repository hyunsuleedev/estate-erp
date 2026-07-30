import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  ExternalListingSourcesService,
  type CreateSourceDto,
  type ImportFromOfficeSitesDto,
  type UpdateSourceDto,
} from './external-listing-sources.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('외부-수집대상')
@ApiBearerAuth()
@Controller('external-listing-sources')
@UseGuards(JwtAuthGuard)
export class ExternalListingSourcesController {
  constructor(private readonly service: ExternalListingSourcesService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('provider') provider?: string,
    @Query('isEnabled') isEnabled?: string,
  ) {
    return this.service.findAll(user.officeId, {
      provider,
      isEnabled:
        isEnabled === undefined ? undefined : isEnabled !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.officeId);
  }

  // 수집 대상은 사무소 단위 운영 설정이라 조회는 전 직원, 변경은 owner/manager로 제한한다.
  @Post()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  create(
    @Body() dto: CreateSourceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  /** 관리단지 → 수집 대상 일괄 가져오기. 코드 없는 단지는 skipped로 리포트된다. */
  @Post('import-from-office-sites')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  importFromOfficeSites(
    @Body() dto: ImportFromOfficeSitesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.importFromOfficeSites(user.officeId, dto ?? {});
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSourceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto);
  }

  @Delete(':id')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.officeId);
  }
}
