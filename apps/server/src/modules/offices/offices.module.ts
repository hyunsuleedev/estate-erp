import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';
import { OfficeGeocodingService } from './office-geocoding.service';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService, OfficeGeocodingService],
  exports: [OfficesService],
})
export class OfficesModule {}
