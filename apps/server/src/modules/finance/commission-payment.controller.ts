import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CommissionPaymentService } from './commission-payment.service';

@ApiTags('Finance / Commission Payment')
@ApiBearerAuth()
@Controller('finance/commission-payments')
@UseGuards(JwtAuthGuard)
export class CommissionPaymentController {
  constructor(private readonly service: CommissionPaymentService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
  ) {
    return this.service.listByOffice(user.officeId, { status });
  }

  @Get('deal/:dealId')
  listByDeal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('dealId') dealId: string,
  ) {
    return this.service.listByDeal(user.officeId, dealId);
  }

  @Post(':id/collect')
  collect(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { actualAmount: number; method: string; paidAt?: string; note?: string },
  ) {
    return this.service.collect(id, user.officeId, body);
  }

  @Post(':id/waive')
  waive(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { note?: string },
  ) {
    return this.service.waive(id, user.officeId, body.note);
  }

  @Post(':id/tax-invoice')
  issueTaxInvoice(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taxInvoiceNo: string; taxInvoiceDate?: string },
  ) {
    return this.service.issueTaxInvoice(id, user.officeId, body);
  }
}
