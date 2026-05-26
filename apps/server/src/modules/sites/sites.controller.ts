import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('사이트')
@ApiBearerAuth()
@Controller('sites')
@UseGuards(JwtAuthGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.sitesService.findAll(user.officeId);
  }

  @Get(':id/overview')
  overview(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.overview(id, user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('includeUnits') includeUnits: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.findOne(id, user.officeId, includeUnits !== 'false');
  }

  @Post()
  create(
    @Body()
    dto: {
      type: string;
      name: string;
      wardCode: string;
      roadName?: string | null;
      roadBuildingMain?: number | null;
      roadBuildingSub?: number | null;
      roadAddress?: string | null;
      jibunMain?: string | null;
      jibunSub?: string | null;
      jibunAddress?: string | null;
      lat?: number | null;
      lng?: number | null;
      kaptComplexCode?: string | null;
      naverComplexCode?: string | null;
      kbComplexCode?: string | null;
      zipCode?: string | null;
      builtYear?: number | null;
      totalUnits?: number | null;
      totalDongs?: number | null;
      metadata?: Record<string, unknown> | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      type?: string;
      name?: string;
      wardCode?: string;
      roadName?: string | null;
      roadBuildingMain?: number | null;
      roadBuildingSub?: number | null;
      roadAddress?: string | null;
      jibunMain?: string | null;
      jibunSub?: string | null;
      jibunAddress?: string | null;
      lat?: number | null;
      lng?: number | null;
      kaptComplexCode?: string | null;
      naverComplexCode?: string | null;
      kbComplexCode?: string | null;
      zipCode?: string | null;
      builtYear?: number | null;
      totalUnits?: number | null;
      totalDongs?: number | null;
      metadata?: Record<string, unknown> | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.remove(id, user.officeId);
  }
}
