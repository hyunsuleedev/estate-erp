import { Module } from '@nestjs/common';
import { ExternalListingsController } from './external-listings.controller';
import { ExternalListingsService } from './external-listings.service';

@Module({
  controllers: [ExternalListingsController],
  providers: [ExternalListingsService],
  exports: [ExternalListingsService],
})
export class ExternalListingsModule {}
