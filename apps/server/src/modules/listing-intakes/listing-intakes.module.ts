import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { ListingsModule } from '../listings/listings.module';
import { ListingIntakesController } from './listing-intakes.controller';
import { ListingIntakesService } from './listing-intakes.service';

@Module({
  imports: [ListingsModule, RealtimeModule],
  controllers: [ListingIntakesController],
  providers: [ListingIntakesService],
  exports: [ListingIntakesService],
})
export class ListingIntakesModule {}
