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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('매물')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  findAll(
    @Query('transactionType') transactionType: string,
    @Query('siteType') siteType: string,
    @Query('checkStatus') checkStatus: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Query('depositMin') depositMin: string,
    @Query('depositMax') depositMax: string,
    @Query('monthlyRentMin') monthlyRentMin: string,
    @Query('monthlyRentMax') monthlyRentMax: string,
    @Query('areaMin') areaMin: string,
    @Query('areaMax') areaMax: string,
    @Query('sido') sido: string,
    @Query('sigungu') sigungu: string,
    @Query('eupmyeondong') eupmyeondong: string,
    @Query('siteId') siteId: string,
    @Query('search') search: string,
    @Query('includeHidden') includeHidden: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.propertiesService.findAll(user.officeId, {
      transactionType: transactionType || undefined,
      siteType: siteType || undefined,
      checkStatus: checkStatus || undefined,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      depositMin: depositMin ? Number(depositMin) : undefined,
      depositMax: depositMax ? Number(depositMax) : undefined,
      monthlyRentMin: monthlyRentMin ? Number(monthlyRentMin) : undefined,
      monthlyRentMax: monthlyRentMax ? Number(monthlyRentMax) : undefined,
      areaMin: areaMin ? Number(areaMin) : undefined,
      areaMax: areaMax ? Number(areaMax) : undefined,
      sido: sido || undefined,
      sigungu: sigungu || undefined,
      eupmyeondong: eupmyeondong || undefined,
      siteId: siteId || undefined,
      search: search || undefined,
      includeHidden: includeHidden === 'true',
      sortBy: (sortBy as 'price' | 'createdAt' | 'updatedAt') || undefined,
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

  @Post()
  create(
    @Body()
    dto: {
      siteId: string;
      unitId?: string;
      transactionType: string;
      price?: number;
      deposit?: number;
      monthlyRent?: number;
      ownerName?: string;
      ownerPhone?: string;
      memo?: string;
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
      transactionType?: string;
      price?: number;
      deposit?: number;
      monthlyRent?: number;
      checkStatus?: string;
      isHidden?: boolean;
      memo?: string;
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
    return this.propertiesService.remove(id, user.officeId);
  }
}
