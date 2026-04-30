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
import { ListingsService } from './listings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('매물')
@ApiBearerAuth()
@Controller('listings')
@UseGuards(JwtAuthGuard)
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(
    @Query('propertyId') propertyId: string,
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
    @Query('wardCode') wardCode: string,
    @Query('siteId') siteId: string,
    @Query('search') search: string,
    @Query('includeHidden') includeHidden: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingsService.findAll(user.officeId, {
      propertyId: propertyId || undefined,
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
      wardCode: wardCode || undefined,
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
    return this.listingsService.findOne(id, user.officeId);
  }

  @Patch(':id/check-status')
  transitionCheckStatus(
    @Param('id') id: string,
    @Body() dto: { checkStatus: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingsService.transitionCheckStatus(
      id,
      user.officeId,
      dto.checkStatus,
    );
  }

  @Post()
  create(
    @Body()
    dto: {
      propertyId: string;
      transactionType: string;
      price?: number | null;
      deposit?: number | null;
      monthlyRent?: number | null;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingsService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      transactionType?: string;
      price?: number | null;
      deposit?: number | null;
      monthlyRent?: number | null;
      checkStatus?: string;
      isHidden?: boolean;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingsService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingsService.remove(id, user.officeId);
  }
}
