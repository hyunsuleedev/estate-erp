import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { ListingIntakesController } from './listing-intakes.controller';
import { ListingIntakesService } from './listing-intakes.service';

@Module({
  imports: [ListingsModule],
  controllers: [ListingIntakesController],
  providers: [ListingIntakesService],
  exports: [ListingIntakesService],
})
export class ListingIntakesModule {}
