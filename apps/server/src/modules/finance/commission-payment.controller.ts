import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CommissionPaymentService,
  DistributionInput,
} from './commission-payment.service';

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

  @Post(':id/confirm')
  confirmDraft(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { dueDate?: string },
  ) {
    return this.service.confirmDraft(id, user.officeId, body);
  }

  @Post(':id/tax-invoice')
  issueTaxInvoice(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taxInvoiceNo: string; taxInvoiceDate?: string },
  ) {
    return this.service.issueTaxInvoice(id, user.officeId, body);
  }

  @Patch(':id/distributions')
  replaceDistributions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { items: DistributionInput[] },
  ) {
    return this.service.replaceDistributions(id, user.officeId, body.items);
  }

  @Patch('deal/:dealId/distributions')
  applyDistributionsToDeal(
    @Param('dealId') dealId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { items: DistributionInput[] },
  ) {
    return this.service.applyDistributionsToDeal(
      dealId,
      user.officeId,
      body.items,
    );
  }
}
