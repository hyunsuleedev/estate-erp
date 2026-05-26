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
import { ListingIntakesService } from './listing-intakes.service';

@ApiTags('매물 의뢰')
@ApiBearerAuth()
@Controller('listing-intakes')
@UseGuards(JwtAuthGuard)
export class ListingIntakesController {
  constructor(private readonly listingIntakes: ListingIntakesService) {}

  @Get()
  findAll(
    @Query('status') status: string,
    @Query('confirmStatus') confirmStatus: string,
    @Query('nextConfirmFrom') nextConfirmFrom: string,
    @Query('nextConfirmTo') nextConfirmTo: string,
    @Query('includeInactive') includeInactive: string,
    @Query('includeHidden') includeHidden: string,
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
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.findAll(user.officeId, {
      status: status || undefined,
      confirmStatus: confirmStatus || undefined,
      nextConfirmFrom: nextConfirmFrom || undefined,
      nextConfirmTo: nextConfirmTo || undefined,
      includeInactive: includeInactive === 'true',
      includeHidden: includeHidden === 'true',
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
      sortBy: (sortBy as 'receivedAt' | 'updatedAt' | 'createdAt' | 'price') || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.listingIntakes.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      propertyId: string;
      status?: string;
      receivedAt?: string | null;
      confirmedAt?: string | null;
      isJointBrokerageRequired?: boolean;
      jointBrokeragePartnerId?: string | null;
      memo?: string | null;
      listings?: Array<{
        transactionType: string;
        price?: number | null;
        deposit?: number | null;
        monthlyRent?: number | null;
        moveInAvailableType?: string | null;
        moveInAvailableFrom?: string | null;
        moveInAvailableTo?: string | null;
        memo?: string | null;
      }>;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.create(user.officeId, dto);
  }

  @Post(':id/listings')
  addListing(
    @Param('id') id: string,
    @Body()
    dto: {
      transactionType: string;
      price?: number | null;
      deposit?: number | null;
      monthlyRent?: number | null;
      moveInAvailableType?: string | null;
      moveInAvailableFrom?: string | null;
      moveInAvailableTo?: string | null;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.addListing(id, user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      status?: string;
      receivedAt?: string | null;
      confirmedAt?: string | null;
      isJointBrokerageRequired?: boolean;
      jointBrokeragePartnerId?: string | null;
      memo?: string | null;
      expectedUpdatedAt?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.update(id, user.officeId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; expectedUpdatedAt?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.update(id, user.officeId, {
      status: dto.status,
      expectedUpdatedAt: dto.expectedUpdatedAt,
    });
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body()
    dto: {
      result: string;
      channel?: string;
      memo?: string | null;
      checkedAt?: string | null;
      nextConfirmAt?: string | null;
      contactId?: string | null;
      expectedUpdatedAt?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.confirm(id, user.officeId, user.userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.listingIntakes.remove(id, user.officeId);
  }
}
