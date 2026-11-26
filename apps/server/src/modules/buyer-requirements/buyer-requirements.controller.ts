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
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  BuyerRequirementsService,
  type BuyerRequirementSearchQuery,
} from './buyer-requirements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 정렬할 수 있는 칸. 그 밖의 값은 무시한다 (칸 이름을 그대로 DB 정렬에 넘기지 않는다) */
const SORTABLE = new Set(['createdAt', 'nextContactDate', 'urgency', 'name']);

/** 주소의 id가 uuid 꼴이 아니면(잘못된 링크) DB 오류(500) 대신 "찾을 수 없습니다"로 답한다 */
const requirementIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('희망 조건을 찾을 수 없습니다.'),
});

@ApiTags('구매 희망조건')
@ApiBearerAuth()
@Controller('buyer-requirements')
@UseGuards(JwtAuthGuard)
export class BuyerRequirementsController {
  constructor(private readonly service: BuyerRequirementsService) {}

  @Get('due-contacts')
  findDueContacts(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findDueContacts(user.officeId);
  }

  /** 희망매물 필터의 선택지 (지금 조건들에 있는 지역 · 단지 · 담당자) */
  @Get('filter-options')
  findFilterOptions(@Query('status') status: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findFilterOptions(user.officeId, status || undefined);
  }

  @Get()
  findAll(
    @Query('status') status: string,
    @Query('urgency') urgency: string,
    @Query('transactionType') transactionType: string,
    @Query('siteTypes') siteTypes: string,
    @Query('buyerIntakeId') buyerIntakeId: string,
    @Query('contactId') contactId: string,
    @Query('assignedToId') assignedToId: string,
    @Query('preferredSiteIds') preferredSiteIds: string,
    @Query('provinceCodes') provinceCodes: string,
    @Query('districtCodes') districtCodes: string,
    @Query('wardCodes') wardCodes: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Query('depositMin') depositMin: string,
    @Query('depositMax') depositMax: string,
    @Query('monthlyRentMin') monthlyRentMin: string,
    @Query('monthlyRentMax') monthlyRentMax: string,
    @Query('areaMin') areaMin: string,
    @Query('areaMax') areaMax: string,
    @Query('nextContactAfter') nextContactAfter: string,
    @Query('nextContactBefore') nextContactBefore: string,
    @Query('moveInAfter') moveInAfter: string,
    @Query('moveInBefore') moveInBefore: string,
    @Query('search') search: string,
    @Query('searchMatches') searchMatches: string,
    @Query('ids') ids: string,
    @Query('locations') locations: string,
    @Query('budgetMin') budgetMin: string,
    @Query('budgetMax') budgetMax: string,
    @Query('matchStages') matchStages: string,
    @Query('expand') expand: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const num = (v: string) => (v ? Number(v) : undefined);
    return this.service.findAll(user.officeId, {
      status: status || undefined,
      urgency: urgency || undefined,
      transactionType: transactionType || undefined,
      siteTypes: siteTypes || undefined,
      buyerIntakeId: buyerIntakeId || undefined,
      contactId: contactId || undefined,
      assignedToId: assignedToId || undefined,
      preferredSiteIds: preferredSiteIds || undefined,
      provinceCodes: provinceCodes || undefined,
      districtCodes: districtCodes || undefined,
      wardCodes: wardCodes || undefined,
      priceMin: num(priceMin),
      priceMax: num(priceMax),
      depositMin: num(depositMin),
      depositMax: num(depositMax),
      monthlyRentMin: num(monthlyRentMin),
      monthlyRentMax: num(monthlyRentMax),
      areaMin: num(areaMin),
      areaMax: num(areaMax),
      nextContactAfter: nextContactAfter || undefined,
      nextContactBefore: nextContactBefore || undefined,
      moveInAfter: moveInAfter || undefined,
      moveInBefore: moveInBefore || undefined,
      search: search || undefined,
      searchMatches: searchMatches === 'true',
      ids: ids || undefined,
      locations: locations || undefined,
      budgetMin: num(budgetMin),
      budgetMax: num(budgetMax),
      matchStages: matchStages || undefined,
      expand: expand || undefined,
      sortBy: SORTABLE.has(sortBy) ? (sortBy as BuyerRequirementSearchQuery['sortBy']) : undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', requirementIdPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      buyerIntakeId?: string;
      contactId?: string;
      createNewIntake?: boolean;
      priorityRank?: number;
      transactionType?: string;
      siteTypes?: string[];
      priceMin?: number;
      priceMax?: number;
      depositMin?: number;
      depositMax?: number;
      monthlyRentMin?: number;
      monthlyRentMax?: number;
      areaMin?: number;
      areaMax?: number;
      moveInDate?: string;
      urgency?: string;
      assignedToId?: string;
      memo?: string;
      preferredSites?: { siteId: string; priority?: number; memo?: string }[];
      preferredRegions?: {
        provinceCode?: string;
        districtCode?: string;
        wardCode?: string;
      }[];
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  @Patch(':id/priority')
  reorder(
    @Param('id', requirementIdPipe) id: string,
    @Body() dto: { priorityRank: number },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reorder(id, user.officeId, dto.priorityRank);
  }

  @Patch(':id')
  update(
    @Param('id', requirementIdPipe) id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto as any);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', requirementIdPipe) id: string,
    @Body() dto: { status: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, user.officeId, dto.status);
  }

  @Delete(':id')
  remove(@Param('id', requirementIdPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.officeId);
  }
}
