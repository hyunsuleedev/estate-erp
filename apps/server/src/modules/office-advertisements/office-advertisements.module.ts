import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OfficeAdvertisementsController } from './office-advertisements.controller';
import { OfficeAdvertisementsService } from './office-advertisements.service';

@Module({
  imports: [PrismaModule],
  controllers: [OfficeAdvertisementsController],
  providers: [OfficeAdvertisementsService],
  exports: [OfficeAdvertisementsService],
})
export class OfficeAdvertisementsModule {}
