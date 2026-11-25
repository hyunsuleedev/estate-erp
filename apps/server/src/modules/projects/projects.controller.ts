import {
  BadRequestException,
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
  ProjectsService,
  type CustomerLedgerMode,
  type CustomerLedgerSortField,
} from './projects.service';
import { ProjectPlanService } from './project-plan.service';
import { ProjectCommentsService } from './project-comments.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('프로젝트')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly plan: ProjectPlanService,
    private readonly comments: ProjectCommentsService,
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
    return this.projects.findLedger(user.officeId, {
      search: search || undefined,
      mode: (mode as CustomerLedgerMode) || undefined,
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
      sortBy: (sortBy as CustomerLedgerSortField) || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
      cursor: cursor || undefined,
      limit: number(limit),
    });
  }

  /**
   * 프로젝트 목록. 고객 원장에 줄이 없는 프로젝트도 여기서 연다.
   * 여럿을 고르는 조건(statuses · assignedToIds · intakes)은 쉼표로 잇는다. total은 조건에 맞는 전체 수다.
   */
  @Get()
  findAll(
    @Query('status') status: string,
    @Query('search') search: string,
    @Query('assignedToId') assignedToId: string,
    @Query('assignedToIds') assignedToIds: string,
    @Query('mine') mine: string,
    @Query('statuses') statuses: string,
    @Query('intakes') intakes: string,
    @Query('primary') primary: string,
    @Query('createdFrom') createdFrom: string,
    @Query('createdTo') createdTo: string,
    @Query('contactId') contactId: string,
    @Query('listingIntakeId') listingIntakeId: string,
    @Query('buyerIntakeId') buyerIntakeId: string,
    @Query('sort') sort: string,
    @Query('order') order: string,
    @Query('offset') offset: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    for (const value of [contactId, listingIntakeId, buyerIntakeId, assignedToId]) {
      if (value && !UUID_PATTERN.test(value)) {
        throw new BadRequestException('찾을 id가 올바르지 않습니다.');
      }
    }
    const list = (value: string) =>
      value
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    const assignees = list(assignedToIds);
    if (assignees?.some((value) => value !== 'none' && !UUID_PATTERN.test(value))) {
      throw new BadRequestException('담당 조건이 올바르지 않습니다.');
    }
    return this.plan.findAll(user.officeId, {
      status: status || undefined,
      search: search || undefined,
      assignedToId: assignedToId || undefined,
      assignedToIds: assignees,
      // "내 프로젝트": 담당이 요청한 사람인 것
      mineUserId: mine === 'true' || mine === '1' ? user.userId : undefined,
      statuses: list(statuses),
      intakes: list(intakes),
      primary: primary || undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      contactId: contactId || undefined,
      listingIntakeId: listingIntakeId || undefined,
      buyerIntakeId: buyerIntakeId || undefined,
      sort: sort || undefined,
      order: order || undefined,
      offset: offset ? Number(offset) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** 프로젝트를 연다. 아무것도 없이 빈 채로도 연다(작업 공간). 담당을 보내지 않으면 만든 사람이 담당이다. */
  @Post()
  create(
    @Body()
    dto: {
      title?: string | null;
      memo?: string | null;
      primaryContactId?: string | null;
      assignedToId?: string | null;
      listingIntakeIds?: string[];
      buyerIntakeIds?: string[];
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.create(user.officeId, dto ?? {}, user.userId);
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
    dto: {
      title?: string | null;
      memo?: string | null;
      archived?: boolean;
      primaryContactId?: string | null;
      assignedToId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.update(id, user.officeId, dto ?? {});
  }

  /** 프로젝트를 푼다(대표 · 매니저만). 의뢰와 거래는 남는다. */
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.remove(id, user.officeId, user.role, user.userId);
  }

  // ─── 코멘트 ──────────────────────────────────────────────────

  /** 최근 것부터 한 쪽. before에 앞 쪽의 nextBefore를 그대로 주면 그보다 오래된 쪽을 준다. */
  @Get(':id/comments')
  findComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.findAll(id, user.officeId, {
      before: before || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/comments')
  createComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { body?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.create(id, user, dto ?? {});
  }

  @Patch(':id/comments/:commentId')
  updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: { body?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.update(id, commentId, user, dto ?? {});
  }

  @Delete(':id/comments/:commentId')
  removeComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.remove(id, commentId, user);
  }

  /**
   * 이 프로젝트에 더 담을 만한 의뢰·거래 제안. contactId를 주면 그 손님(이 프로젝트 사람이 아니어도)의
   * 담을 수 있는 의뢰·거래를 준다.
   */
  @Get(':id/candidates')
  findCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('contactId') contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (contactId && !UUID_PATTERN.test(contactId)) {
      throw new BadRequestException('손님 id가 올바르지 않습니다.');
    }
    return this.plan.findCandidates(id, user.officeId, {
      contactId: contactId || undefined,
    });
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

  /** 단계를 지운다. 의뢰를 가리키는 단계였다면 그 의뢰도 프로젝트에서 빠진다. */
  @Delete(':id/steps/:stepId')
  removeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.plan.removeStep(id, stepId, user.officeId);
  }
}
