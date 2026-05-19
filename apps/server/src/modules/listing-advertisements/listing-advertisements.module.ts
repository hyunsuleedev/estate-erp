import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ListingAdvertisementsController } from './listing-advertisements.controller';
import { ListingAdvertisementsService } from './listing-advertisements.service';

@Module({
  imports: [PrismaModule],
  controllers: [ListingAdvertisementsController],
  providers: [ListingAdvertisementsService],
  exports: [ListingAdvertisementsService],
})
export class ListingAdvertisementsModule {}
