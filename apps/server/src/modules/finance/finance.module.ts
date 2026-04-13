import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommissionPaymentService } from './commission-payment.service';
import { CommissionPaymentController } from './commission-payment.controller';
import { OfficeExpenseService } from './office-expense.service';
import { OfficeExpenseController } from './office-expense.controller';
import { CashflowService } from './cashflow.service';
import { CashflowController } from './cashflow.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    CommissionPaymentController,
    OfficeExpenseController,
    CashflowController,
  ],
  providers: [CommissionPaymentService, OfficeExpenseService, CashflowService],
  exports: [CommissionPaymentService, CashflowService],
})
export class FinanceModule {}
