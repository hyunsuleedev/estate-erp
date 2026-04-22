import { Module } from '@nestjs/common';
import { ServiceVendorsController } from './service-vendors.controller';
import { ServiceVendorsService } from './service-vendors.service';

@Module({
  controllers: [ServiceVendorsController],
  providers: [ServiceVendorsService],
  exports: [ServiceVendorsService],
})
export class ServiceVendorsModule {}
