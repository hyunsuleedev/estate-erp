import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
  BadRequestException,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 500이 난다). */
const DealIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 거래 주소입니다.'),
});
const PaymentIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 지급 항목 주소입니다.'),
});

/** 보는 사람 (수수료 칸을 가리는 기준). finance 의 FinanceViewer 와 같은 모양 */
const viewerOf = (user: CurrentUserPayload) => ({ userId: user.userId, role: user.role });

@ApiTags('거래')
@ApiBearerAuth()
@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Query('scope') scope?: string) {
    return this.dealsService.findAll(user.officeId, scope === 'active', viewerOf(user));
  }

  @Get('views/archive')
  findArchive(
    @CurrentUser() user: CurrentUserPayload,
    @Query('kind') kind: string,
    @Query('q') q?: string,
    @Query('since') since?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (kind !== 'closed' && kind !== 'cancelled') throw new BadRequestException('종료 구분을 확인하세요.');
    if (cursor && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cursor)) throw new BadRequestException('잘못된 페이지입니다.');
    const from = since ? new Date(since) : undefined;
    if (from && !Number.isFinite(from.getTime())) throw new BadRequestException('기간을 확인하세요.');
    return this.dealsService.findArchive(user.officeId, kind, q?.trim(), from, cursor, viewerOf(user));
  }

  @Get(':id')
  findOne(
    @Param('id', DealIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.findOne(id, user.officeId, viewerOf(user));
  }

  @Post()
  async create(
    @Body()
    dto: {
      propertyId?: string;
      listingId?: string;
      matchId?: string;
      buyerIntakeId?: string;
      transactionType?: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      agreedMoveInDate?: string;
      specialTerms?: string;
      buyerContactId?: string;
      sellerContactId?: string;
      isJointBrokerage?: boolean;
      ourSide?: 'seller' | 'buyer' | 'both';
      partnerBrokerId?: string;
      resumeListing?: boolean;
      memo?: string;
      assigneeUserId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // 담당 기본값은 만든 사람이다 (직원 정산·직원 화면의 "내 거래"가 담당으로 거른다)
    const deal = await this.dealsService.create(user.officeId, dto, { userId: user.userId, role: user.role });
    return this.dealsService.forViewer(deal, viewerOf(user));
  }

  /** 담당을 한 사람으로 바꾼다. 대표·매니저만. */
  @Patch(':id/assignee')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  setAssignee(
    @Param('id', DealIdPipe) id: string,
    @Body() dto: { userId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.setAssignee(id, user.officeId, dto ?? {});
  }

  @Patch(':id/stage')
  async updateStage(
    @Param('id', DealIdPipe) id: string,
    @Body()
    dto: {
      stage: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.forViewer(await this.dealsService.updateStage(id, user.officeId, dto), viewerOf(user));
  }

  /** 거래 조건 고치기 (당사자·금액·입주일·특약·메모·공동중개). 단계는 :id/stage 로 바꾼다. */
  @Patch(':id')
  async update(
    @Param('id', DealIdPipe) id: string,
    @Body()
    dto: {
      buyerContactId?: string | null;
      sellerContactId?: string | null;
      agreedPrice?: number | null;
      agreedDeposit?: number | null;
      agreedMonthlyRent?: number | null;
      agreedMoveInDate?: string | null;
      specialTerms?: string | null;
      memo?: string | null;
      isJointBrokerage?: boolean;
      ourSide?: 'seller' | 'buyer' | 'both';
      partnerBrokerId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const deal = await this.dealsService.update(id, user.officeId, dto ?? {});
    return this.dealsService.forViewer(deal, viewerOf(user));
  }

  /** 우리 쪽 한 청구의 수수료 금액을 정한다. 수금 화면의 다른 변경과 같이 대표·매니저만 한다. */
  @Patch(':id/commission')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  setCommission(
    @Param('id', DealIdPipe) id: string,
    @Body() dto: { side?: string; amount?: number; propertyKind?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.setCommission(id, user.officeId, dto ?? {});
  }

  /** 취소한 거래를 되살린다. */
  @Patch(':id/restore')
  async restore(
    @Param('id', DealIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.forViewer(await this.dealsService.restore(id, user.officeId), viewerOf(user));
  }

  /** 완료된 거래의 소유권·임대차 변경 미리보기 */
  @Get(':id/property-transition-preview')
  getPropertyTransitionPreview(
    @Param('id', DealIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.getPropertyTransitionPreview(id, user.officeId);
  }

  /** 완료된 거래의 소유권·임대차 변경을 매물에 반영한다. */
  @Post(':id/apply-property-transition')
  applyPropertyTransition(
    @Param('id', DealIdPipe) id: string,
    @Body()
    dto: {
      archiveExistingOwners?: boolean;
      registerNewOwners?: boolean;
      markBuyersResident?: boolean;
      closeExistingLeases?: boolean;
      createNewLease?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.applyPropertyTransition(id, user.officeId, dto ?? {});
  }

  @Patch(':id/buyer-intake')
  async setBuyerIntake(
    @Param('id', DealIdPipe) id: string,
    @Body() dto: { buyerIntakeId?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.forViewer(await this.dealsService.setBuyerIntake(id, user.officeId, dto ?? {}), viewerOf(user));
  }

  @Patch(':id/cancel')
  async cancel(
    @Param('id', DealIdPipe) id: string,
    @Body() dto: { cancelReason?: string; cancelledBy?: string; paidMoneyNote?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.forViewer(await this.dealsService.cancel(id, user.officeId, dto), viewerOf(user));
  }

  @Post(':id/payments')
  createPayment(
    @Param('id', DealIdPipe) dealId: string,
    @Body()
    dto: {
      kind: string;
      sequence?: number;
      scheduledAmount: number;
      scheduledDate?: string;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.createPayment(dealId, user.officeId, dto);
  }

  /** 대금 일정을 계약서 요약(계약금·중도금·잔금)에 맞춘다. 사람이 누를 때만. */
  @Post(':id/payments/match-contract')
  async matchPaymentsToContract(
    @Param('id', DealIdPipe) dealId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.dealsService.matchPaymentsToContract(dealId, user.officeId);
    return { ...result, deal: this.dealsService.forViewer(result.deal, viewerOf(user)) };
  }

  @Patch(':id/payments/:paymentId')
  updatePayment(
    @Param('id', DealIdPipe) dealId: string,
    @Param('paymentId', PaymentIdPipe) paymentId: string,
    @Body()
    dto: {
      scheduledAmount?: number;
      scheduledDate?: string | null;
      paidAmount?: number | null;
      paidAt?: string | null;
      status?: string;
      method?: string | null;
      payerName?: string | null;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.updatePayment(
      dealId,
      paymentId,
      user.officeId,
      dto,
    );
  }

  @Delete(':id/payments/:paymentId')
  removePayment(
    @Param('id', DealIdPipe) dealId: string,
    @Param('paymentId', PaymentIdPipe) paymentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.removePayment(dealId, paymentId, user.officeId);
  }

  @Delete(':id')
  remove(
    @Param('id', DealIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.remove(id, user.officeId);
  }
}
