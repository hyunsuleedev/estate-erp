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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
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
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  collect(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { actualAmount: number; method: string; paidAt?: string; note?: string },
  ) {
    return this.service.collect(id, user.officeId, user.userId, body);
  }

  @Get(':id/receipts')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  listReceipts(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listReceipts(user.officeId, id);
  }

  @Post(':id/receipts')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  addReceipt(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { amountWon: number; receivedAt?: string; method?: string; memo?: string },
  ) {
    return this.service.addReceipt(id, user.officeId, user.userId, body);
  }

  @Post(':id/refund')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  refund(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { amountWon: number; refundedAt?: string; memo?: string },
  ) {
    return this.service.refund(id, user.officeId, user.userId, body);
  }

  @Post('receipts/:receiptId/void')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  voidReceipt(
    @Param('receiptId') receiptId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { reason?: string },
  ) {
    return this.service.voidReceipt(receiptId, user.officeId, user.userId, body?.reason);
  }

  @Post(':id/waive')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  waive(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { note?: string },
  ) {
    return this.service.waive(id, user.officeId, body.note);
  }

  @Post(':id/confirm')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  confirmDraft(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { dueDate?: string },
  ) {
    return this.service.confirmDraft(id, user.officeId, body);
  }

  @Post(':id/tax-invoice')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  issueTaxInvoice(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taxInvoiceNo: string; taxInvoiceDate?: string },
  ) {
    return this.service.issueTaxInvoice(id, user.officeId, body);
  }

  @Patch(':id/distributions')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  replaceDistributions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { items: DistributionInput[] },
  ) {
    return this.service.replaceDistributions(id, user.officeId, body.items);
  }

  @Patch('deal/:dealId/distributions')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
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
