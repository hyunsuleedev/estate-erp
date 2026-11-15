import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { BrokerageCasePlanService } from './brokerage-case-plan.service';

@ApiTags('고객 원장')
@ApiBearerAuth()
@Controller('brokerage-cases')
@UseGuards(JwtAuthGuard)
export class BrokerageCasesController {
  constructor(
    private readonly brokerageCases: BrokerageCasesService,
    private readonly plan: BrokerageCasePlanService,
  ) {}

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

  /** 보관하지 않은 중개 건 목록. 고객 원장에 줄이 없는 건도 여기서 연다. */
  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.plan.findAll(user.officeId);
  }

  /** 사용자가 고른 의뢰들을 중개 건으로 묶는다. */
  @Post()
  create(
    @Body()
    dto: {
      title?: string | null;
      memo?: string | null;
      listingIntakeIds?: string[];
      buyerIntakeIds?: string[];
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.create(user.officeId, dto ?? {});
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.findOne(id, user.officeId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: { title?: string | null; memo?: string | null; archived?: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.update(id, user.officeId, dto ?? {});
  }

  /** 묶음을 푼다. 의뢰와 거래는 남는다. */
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.remove(id, user.officeId);
  }

  /** 이 건에 더 담을 만한 의뢰·거래 제안. */
  @Get(':id/candidates')
  findCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.findCandidates(id, user.officeId);
  }

  @Post(':id/intakes')
  addIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { kind: 'listing' | 'buyer'; intakeId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.addIntake(id, user.officeId, dto ?? ({} as never));
  }

  @Post(':id/steps')
  createStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: {
      title?: string;
      targetDate?: string | null;
      memo?: string | null;
      dealId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.createStep(id, user.officeId, dto ?? {});
  }

  @Put(':id/steps/order')
  reorderSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { steps: Array<{ id: string; sortOrder: number }> },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.reorderSteps(id, user.officeId, dto ?? { steps: [] });
  }

  @Patch(':id/steps/:stepId')
  updateStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body()
    dto: {
      title?: string;
      targetDate?: string | null;
      memo?: string | null;
      done?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.updateStep(id, stepId, user.officeId, dto ?? {});
  }

  /** 단계를 지운다. 의뢰를 가리키는 단계였다면 그 의뢰도 건에서 빠진다. */
  @Delete(':id/steps/:stepId')
  removeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.removeStep(id, stepId, user.officeId);
  }
}
