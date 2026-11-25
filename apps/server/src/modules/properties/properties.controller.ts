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
import { PropertiesService } from './properties.service';
import { assertCanDeleteListing } from '../listings/listing-input';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('관리 호실')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  findAll(
    @Query('siteType') siteType: string,
    @Query('wardCode') wardCode: string,
    @Query('siteId') siteId: string,
    @Query('unitId') unitId: string,
    @Query('search') search: string,
    @Query('hasListing') hasListing: string,
    @Query('withoutUnit') withoutUnit: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.findAll(user.officeId, {
      siteType: siteType || undefined,
      wardCode: wardCode || undefined,
      siteId: siteId || undefined,
      unitId: unitId || undefined,
      withoutUnit: withoutUnit === 'true',
      search: search || undefined,
      hasListing: hasListing === 'true' ? true : undefined,
      sortBy: (sortBy as 'createdAt' | 'updatedAt') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.findOne(id, user.officeId);
  }

  /**
   * 그 자리(건물 + 호 · 층)의 관리 공간을 돌려주고 없으면 만든다.
   * 매물 없이 광고를 넣을 때 쓴다: 광고는 공공 호실에 직접 걸지 않고 우리 사무소의 관리 공간에 건다.
   */
  @Post('ensure')
  ensure(
    @Body() dto: { siteId: string; unitId?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.ensure(user.officeId, {
      siteId: dto?.siteId,
      unitId: dto?.unitId ?? null,
    });
  }

  @Post()
  create(
    @Body()
    dto: {
      siteId: string;
      unitId?: string | null;
      ownerName?: string;
      ownerPhone?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      siteId?: string;
      unitId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    assertCanDeleteListing(user.role ?? null);
    return this.propertiesService.remove(id, user.officeId);
  }
}
