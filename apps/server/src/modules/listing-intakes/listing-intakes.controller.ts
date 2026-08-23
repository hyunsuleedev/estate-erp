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
  ListingIntakesService,
  type ListingIntakeSortField,
} from './listing-intakes.service';

@ApiTags('매물 의뢰')
@ApiBearerAuth()
@Controller('listing-intakes')
@UseGuards(JwtAuthGuard)
export class ListingIntakesController {
  constructor(private readonly listingIntakes: ListingIntakesService) {}

  @Get()
  findAll(
    @Query('lifecycleStatus') lifecycleStatus: string,
    @Query('confirmationState') confirmationState: string,
    @Query('availability') availability: string,
    @Query('availabilities') availabilities: string,
    @Query('nextConfirmFrom') nextConfirmFrom: string,
    @Query('nextConfirmTo') nextConfirmTo: string,
    @Query('includeClosed') includeClosed: string,
    @Query('propertyId') propertyId: string,
    @Query('transactionType') transactionType: string,
    @Query('siteType') siteType: string,
    @Query('siteTypes') siteTypes: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Query('depositMin') depositMin: string,
    @Query('depositMax') depositMax: string,
    @Query('monthlyRentMin') monthlyRentMin: string,
    @Query('monthlyRentMax') monthlyRentMax: string,
    @Query('areaMin') areaMin: string,
    @Query('areaMax') areaMax: string,
    @Query('roomCount') roomCount: string,
    @Query('roomCountMin') roomCountMin: string,
    @Query('bathRoomCount') bathRoomCount: string,
    @Query('bathRoomCountMin') bathRoomCountMin: string,
    @Query('hasAdvertisement') hasAdvertisement: string,
    @Query('isJointBrokerage') isJointBrokerage: string,
    @Query('provinceCode') provinceCode: string,
    @Query('districtCode') districtCode: string,
    @Query('wardCode') wardCode: string,
    @Query('siteId') siteId: string,
    @Query('siteIds') siteIds: string,
    @Query('search') search: string,
    @Query('dong') dong: string,
    @Query('unit') unit: string,
    @Query('moveInFrom') moveInFrom: string,
    @Query('moveInTo') moveInTo: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.findAll(user.officeId, {
      lifecycleStatus: lifecycleStatus || undefined,
      confirmationState: confirmationState || undefined,
      availability: availability || undefined,
      availabilities: parseCsvQuery(availabilities),
      nextConfirmFrom: nextConfirmFrom || undefined,
      nextConfirmTo: nextConfirmTo || undefined,
      includeClosed: includeClosed === 'true',
      propertyId: propertyId || undefined,
      transactionType: transactionType || undefined,
      siteType: siteType || undefined,
      siteTypes: parseCsvQuery(siteTypes),
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      depositMin: depositMin ? Number(depositMin) : undefined,
      depositMax: depositMax ? Number(depositMax) : undefined,
      monthlyRentMin: monthlyRentMin ? Number(monthlyRentMin) : undefined,
      monthlyRentMax: monthlyRentMax ? Number(monthlyRentMax) : undefined,
      areaMin: areaMin ? Number(areaMin) : undefined,
      areaMax: areaMax ? Number(areaMax) : undefined,
      roomCount: roomCount ? Number(roomCount) : undefined,
      roomCountMin: roomCountMin ? Number(roomCountMin) : undefined,
      bathRoomCount: bathRoomCount ? Number(bathRoomCount) : undefined,
      bathRoomCountMin: bathRoomCountMin ? Number(bathRoomCountMin) : undefined,
      hasAdvertisement: parseBooleanQuery(hasAdvertisement),
      isJointBrokerage: parseBooleanQuery(isJointBrokerage),
      provinceCode: provinceCode || undefined,
      districtCode: districtCode || undefined,
      wardCode: wardCode || undefined,
      siteId: siteId || undefined,
      siteIds: parseCsvQuery(siteIds),
      search: search || undefined,
      dong: dong || undefined,
      unit: unit || undefined,
      moveInFrom: moveInFrom || undefined,
      moveInTo: moveInTo || undefined,
      sortBy: (sortBy as ListingIntakeSortField) || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('map')
  findMap(@Query() query: Record<string, string>, @CurrentUser() user: CurrentUserPayload) {
    return this.listingIntakes.findMapIntakes(user.officeId, parseListingIntakeQuery(query));
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
      brokerageCaseId?: string;
      lifecycleStatus?: string;
      closedReason?: string | null;
      receivedAt?: string | null;
      lastCheckedAt?: string | null;
      lastVerifiedAt?: string | null;
      lastCheckResult?: string | null;
      nextConfirmAt?: string | null;
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
      lifecycleStatus?: string;
      closedReason?: string | null;
      receivedAt?: string | null;
      lastCheckedAt?: string | null;
      lastVerifiedAt?: string | null;
      lastCheckResult?: string | null;
      nextConfirmAt?: string | null;
      isJointBrokerageRequired?: boolean;
      jointBrokeragePartnerId?: string | null;
      memo?: string | null;
      expectedUpdatedAt?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.update(id, user.officeId, dto);
  }

  @Patch(':id/lifecycle')
  updateLifecycleStatus(
    @Param('id') id: string,
    @Body()
    dto: {
      lifecycleStatus: string;
      closedReason?: string | null;
      expectedUpdatedAt?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.update(id, user.officeId, {
      lifecycleStatus: dto.lifecycleStatus,
      closedReason: dto.closedReason,
      expectedUpdatedAt: dto.expectedUpdatedAt,
    });
  }

  @Patch(':id/close-with-active-deals')
  closeWithActiveDeals(
    @Param('id') id: string,
    @Body()
    dto: {
      closedReason?: string | null;
      expectedUpdatedAt?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listingIntakes.closeWithActiveDeals(
      id,
      user.officeId,
      dto.closedReason,
      dto.expectedUpdatedAt,
    );
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body()
    dto: {
      result: string;
      closedReason?: string | null;
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

function parseBooleanQuery(value?: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseListingIntakeQuery(query: Record<string, string>) {
  return {
    lifecycleStatus: query.lifecycleStatus || undefined,
    confirmationState: query.confirmationState || undefined,
    availability: query.availability || undefined,
    availabilities: parseCsvQuery(query.availabilities),
    nextConfirmFrom: query.nextConfirmFrom || undefined,
    nextConfirmTo: query.nextConfirmTo || undefined,
    includeClosed: query.includeClosed === 'true',
    propertyId: query.propertyId || undefined,
    transactionType: query.transactionType || undefined,
    siteType: query.siteType || undefined,
    siteTypes: parseCsvQuery(query.siteTypes),
    priceMin: query.priceMin ? Number(query.priceMin) : undefined,
    priceMax: query.priceMax ? Number(query.priceMax) : undefined,
    depositMin: query.depositMin ? Number(query.depositMin) : undefined,
    depositMax: query.depositMax ? Number(query.depositMax) : undefined,
    monthlyRentMin: query.monthlyRentMin ? Number(query.monthlyRentMin) : undefined,
    monthlyRentMax: query.monthlyRentMax ? Number(query.monthlyRentMax) : undefined,
    areaMin: query.areaMin ? Number(query.areaMin) : undefined,
    areaMax: query.areaMax ? Number(query.areaMax) : undefined,
    roomCount: query.roomCount ? Number(query.roomCount) : undefined,
    roomCountMin: query.roomCountMin ? Number(query.roomCountMin) : undefined,
    bathRoomCount: query.bathRoomCount ? Number(query.bathRoomCount) : undefined,
    bathRoomCountMin: query.bathRoomCountMin
      ? Number(query.bathRoomCountMin)
      : undefined,
    hasAdvertisement: parseBooleanQuery(query.hasAdvertisement),
    isJointBrokerage: parseBooleanQuery(query.isJointBrokerage),
    provinceCode: query.provinceCode || undefined,
    districtCode: query.districtCode || undefined,
    wardCode: query.wardCode || undefined,
    siteId: query.siteId || undefined,
    siteIds: parseCsvQuery(query.siteIds),
    search: query.search || undefined,
    dong: query.dong || undefined,
    unit: query.unit || undefined,
    moveInFrom: query.moveInFrom || undefined,
    moveInTo: query.moveInTo || undefined,
    sortBy: (query.sortBy as ListingIntakeSortField) || undefined,
    sortOrder: (query.sortOrder as 'asc' | 'desc') || undefined,
  };
}

function parseCsvQuery(value: string | undefined) {
  if (!value) return undefined;

  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  return values.length > 0 ? values : undefined;
}
