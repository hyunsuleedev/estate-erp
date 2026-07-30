import { Module } from '@nestjs/common';
import { ExternalListingSourcesService } from './external-listing-sources.service';
import { ExternalListingSourcesController } from './external-listing-sources.controller';

@Module({
  controllers: [ExternalListingSourcesController],
  providers: [ExternalListingSourcesService],
  exports: [ExternalListingSourcesService],
})
export class ExternalListingSourcesModule {}
