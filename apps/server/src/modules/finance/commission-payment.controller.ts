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
import { uuidParam } from './finance-params';
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
    // 직원은 자기가 담당으로 배정된 거래의 청구만 받는다 (캘린더의 수금 예정 등)
    return this.service.listByOffice(user.officeId, { status }, { userId: user.userId, role: user.role });
  }

  @Get('deal/:dealId')
  listByDeal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('dealId', uuidParam('거래')) dealId: string,
  ) {
    return this.service.listByDeal(user.officeId, dealId, { userId: user.userId, role: user.role });
  }

  @Post(':id/collect')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  collect(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { actualAmount: number; method: string; paidAt?: string; note?: string },
  ) {
    return this.service.collect(id, user.officeId, user.userId, body);
  }

  @Get(':id/receipts')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  listReceipts(@Param('id', uuidParam('청구')) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listReceipts(user.officeId, id);
  }

  @Post(':id/receipts')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  addReceipt(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      amountWon: number;
      receivedAt?: string;
      method?: string;
      memo?: string;
      vat?: 'included' | 'none';
    },
  ) {
    return this.service.addReceipt(id, user.officeId, user.userId, body ?? {});
  }

  @Post(':id/refund')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  refund(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { amountWon: number; refundedAt?: string; memo?: string },
  ) {
    return this.service.refund(id, user.officeId, user.userId, body);
  }

  @Post('receipts/:receiptId/void')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  voidReceipt(
    @Param('receiptId', uuidParam('입금 기록')) receiptId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { reason?: string },
  ) {
    return this.service.voidReceipt(receiptId, user.officeId, user.userId, body?.reason);
  }

  // 면제는 할인·대손 승인과 같이 대표만 바로 한다. 매니저·중개사는 조정 요청(면제)을 올려 대표가 승인한다.
  @Post(':id/waive')
  @Roles('owner')
  @UseGuards(RolesGuard)
  waive(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { note?: string },
  ) {
    return this.service.waive(id, user.officeId, body.note);
  }

  @Post(':id/confirm')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  confirmDraft(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { dueDate?: string },
  ) {
    return this.service.confirmDraft(id, user.officeId, body);
  }

  @Post(':id/tax-invoice')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  issueTaxInvoice(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: { taxInvoiceNo: string; taxInvoiceDate?: string; kind?: 'tax_invoice' | 'cash_receipt' },
  ) {
    return this.service.issueTaxInvoice(id, user.officeId, body ?? {});
  }

  @Post(':id/tax-invoice/clear')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  clearTaxInvoice(@Param('id', uuidParam('청구')) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.clearTaxInvoice(id, user.officeId);
  }

  @Post('distributions/:distributionId/settle')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  settleDistribution(
    @Param('distributionId', uuidParam('분배')) distributionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { settledAt?: string; memo?: string },
  ) {
    return this.service.settleDistribution(distributionId, user.officeId, body ?? {});
  }

  @Post('distributions/:distributionId/unsettle')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  unsettleDistribution(
    @Param('distributionId', uuidParam('분배')) distributionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.unsettleDistribution(distributionId, user.officeId);
  }

  @Patch(':id/distributions')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  replaceDistributions(
    @Param('id', uuidParam('청구')) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { items: DistributionInput[] },
  ) {
    return this.service.replaceDistributions(id, user.officeId, body.items);
  }

  @Patch('deal/:dealId/distributions')
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  applyDistributionsToDeal(
    @Param('dealId', uuidParam('거래')) dealId: string,
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
