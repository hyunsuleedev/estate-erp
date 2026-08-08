import { Module } from '@nestjs/common';
import { BrokerageCasesController } from './brokerage-cases.controller';
import { BrokerageCasesService } from './brokerage-cases.service';

@Module({
  controllers: [BrokerageCasesController],
  providers: [BrokerageCasesService],
  exports: [BrokerageCasesService],
})
export class BrokerageCasesModule {}
