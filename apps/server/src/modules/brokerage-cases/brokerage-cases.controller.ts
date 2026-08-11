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
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  BrokerageCasesService,
  type BrokerageCaseLedgerMode,
  type BrokerageCaseLedgerSortField,
} from './brokerage-cases.service';

@ApiTags('고객 원장')
@ApiBearerAuth()
@Controller('brokerage-cases')
@UseGuards(JwtAuthGuard)
export class BrokerageCasesController {
  constructor(private readonly brokerageCases: BrokerageCasesService) {}

  @Get('ledger')
  findLedger(
    @Query('search') search: string,
    @Query('mode') mode: string,
    @Query('status') status: string,
    @Query('urgency') urgency: string,
    @Query('transactionType') transactionType: string,
    @Query('assignedToId') assignedToId: string,
    @Query('preferredSiteIds') preferredSiteIds: string,
    @Query('provinceCodes') provinceCodes: string,
    @Query('districtCodes') districtCodes: string,
    @Query('wardCodes') wardCodes: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Query('depositMin') depositMin: string,
    @Query('depositMax') depositMax: string,
    @Query('budgetMin') budgetMin: string,
    @Query('budgetMax') budgetMax: string,
    @Query('monthlyRentMin') monthlyRentMin: string,
    @Query('monthlyRentMax') monthlyRentMax: string,
    @Query('areaMin') areaMin: string,
    @Query('areaMax') areaMax: string,
    @Query('listingPriceMin') listingPriceMin: string,
    @Query('listingPriceMax') listingPriceMax: string,
    @Query('nextContactAfter') nextContactAfter: string,
    @Query('nextContactBefore') nextContactBefore: string,
    @Query('moveInAfter') moveInAfter: string,
    @Query('moveInBefore') moveInBefore: string,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: string,
    @Query('cursor') cursor: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const number = (value: string) => (value ? Number(value) : undefined);
    return this.brokerageCases.findLedger(user.officeId, {
      search: search || undefined,
      mode: (mode as BrokerageCaseLedgerMode) || undefined,
      status: status || undefined,
      urgency: urgency || undefined,
      transactionType: transactionType || undefined,
      assignedToId: assignedToId || undefined,
      preferredSiteIds: preferredSiteIds || undefined,
      provinceCodes: provinceCodes || undefined,
      districtCodes: districtCodes || undefined,
      wardCodes: wardCodes || undefined,
      priceMin: number(priceMin),
      priceMax: number(priceMax),
      depositMin: number(depositMin),
      depositMax: number(depositMax),
      budgetMin: number(budgetMin),
      budgetMax: number(budgetMax),
      monthlyRentMin: number(monthlyRentMin),
      monthlyRentMax: number(monthlyRentMax),
      areaMin: number(areaMin),
      areaMax: number(areaMax),
      listingPriceMin: number(listingPriceMin),
      listingPriceMax: number(listingPriceMax),
      nextContactAfter: nextContactAfter || undefined,
      nextContactBefore: nextContactBefore || undefined,
      moveInAfter: moveInAfter || undefined,
      moveInBefore: moveInBefore || undefined,
      sortBy: (sortBy as BrokerageCaseLedgerSortField) || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      cursor: cursor || undefined,
      limit: number(limit),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.brokerageCases.findOne(id, user.officeId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: { title?: string | null; memo?: string | null; archived?: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.brokerageCases.update(id, user.officeId, dto);
  }

  @Post(':id/dependencies')
  createDependency(
    @Param('id') id: string,
    @Body()
    dto: {
      fromListingIntakeId: string;
      toBuyerIntakeId: string;
      type: string;
      isRequired?: boolean;
      expectedAmount?: number | null;
      requiredBy?: string | null;
      status?: string;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.brokerageCases.createDependency(id, user.officeId, dto);
  }

  @Delete(':caseId/dependencies/:dependencyId')
  removeDependency(
    @Param('caseId') caseId: string,
    @Param('dependencyId') dependencyId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.brokerageCases.removeDependency(
      caseId,
      dependencyId,
      user.officeId,
    );
  }
}
