import { Module } from '@nestjs/common';
import { BuyerRequirementsService } from './buyer-requirements.service';
import { BuyerRequirementsController } from './buyer-requirements.controller';

@Module({
  controllers: [BuyerRequirementsController],
  providers: [BuyerRequirementsService],
  exports: [BuyerRequirementsService],
})
export class BuyerRequirementsModule {}
