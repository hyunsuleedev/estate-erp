import { Module } from '@nestjs/common';
import { ContactGroupsController } from './contact-groups.controller';
import { ContactGroupsService } from './contact-groups.service';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  controllers: [ContactsController, ContactGroupsController],
  providers: [ContactsService, ContactGroupsService],
  exports: [ContactsService],
})
export class ContactsModule {}
