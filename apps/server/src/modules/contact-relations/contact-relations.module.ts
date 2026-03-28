import { Module } from '@nestjs/common';
import { ContactRelationsService } from './contact-relations.service';
import { ContactRelationsController } from './contact-relations.controller';

@Module({
  controllers: [ContactRelationsController],
  providers: [ContactRelationsService],
  exports: [ContactRelationsService],
})
export class ContactRelationsModule {}
