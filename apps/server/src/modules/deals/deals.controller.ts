import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('거래')
@ApiBearerAuth()
@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.dealsService.findAll(user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      propertyId?: string;
      listingId?: string;
      matchId?: string;
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
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.create(user.officeId, dto);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
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
    return this.dealsService.updateStage(id, user.officeId, dto);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: { cancelReason?: string; cancelledBy?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.cancel(id, user.officeId, dto);
  }

  @Post(':id/payments')
  createPayment(
    @Param('id') dealId: string,
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

  @Patch(':id/payments/:paymentId')
  updatePayment(
    @Param('id') dealId: string,
    @Param('paymentId') paymentId: string,
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
    @Param('id') dealId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.removePayment(dealId, paymentId, user.officeId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.remove(id, user.officeId);
  }
}
