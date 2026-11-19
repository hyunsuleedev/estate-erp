import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommissionPaymentService } from './commission-payment.service';
import { CommissionPaymentController } from './commission-payment.controller';
import { OfficeExpenseService } from './office-expense.service';
import { OfficeExpenseController } from './office-expense.controller';
import { CashflowService } from './cashflow.service';
import { CashflowController } from './cashflow.controller';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { CommissionAdjustmentService } from './commission-adjustment.service';
import { CommissionAdjustmentController } from './commission-adjustment.controller';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    CommissionPaymentController,
    OfficeExpenseController,
    CashflowController,
    LedgerController,
    CommissionAdjustmentController,
    SettlementController,
  ],
  providers: [
    CommissionPaymentService,
    OfficeExpenseService,
    CashflowService,
    LedgerService,
    CommissionAdjustmentService,
    SettlementService,
  ],
  exports: [
    CommissionPaymentService,
    CashflowService,
    LedgerService,
    CommissionAdjustmentService,
  ],
})
export class FinanceModule {}
