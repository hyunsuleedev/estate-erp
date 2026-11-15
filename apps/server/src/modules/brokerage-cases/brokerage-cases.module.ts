import { Module } from '@nestjs/common';
import { BrokerageCasesController } from './brokerage-cases.controller';
import { BrokerageCasesService } from './brokerage-cases.service';
import { BrokerageCasePlanService } from './brokerage-case-plan.service';

@Module({
  controllers: [BrokerageCasesController],
  providers: [BrokerageCasesService, BrokerageCasePlanService],
  exports: [BrokerageCasesService, BrokerageCasePlanService],
})
export class BrokerageCasesModule {}
