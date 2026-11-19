import { Module } from '@nestjs/common';
import { ContactGroupsController } from './contact-groups.controller';
import { ContactGroupsService } from './contact-groups.service';
import { ContactTagsController } from './contact-tags.controller';
import { ContactTagsService } from './contact-tags.service';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  controllers: [ContactsController, ContactGroupsController, ContactTagsController],
  providers: [ContactsService, ContactGroupsService, ContactTagsService],
  exports: [ContactsService],
})
export class ContactsModule {}
