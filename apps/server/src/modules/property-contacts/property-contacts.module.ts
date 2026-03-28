import { Module } from '@nestjs/common';
import { PropertyContactsService } from './property-contacts.service';
import { PropertyContactsController } from './property-contacts.controller';

@Module({
  controllers: [PropertyContactsController],
  providers: [PropertyContactsService],
  exports: [PropertyContactsService],
})
export class PropertyContactsModule {}
