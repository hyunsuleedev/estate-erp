import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NetworkController } from './network.controller';
import { NetworkRoomsService } from './network-rooms.service';
import { NetworkSharedPropertiesService } from './network-shared-properties.service';
import { NetworkInquiriesService } from './network-inquiries.service';
import { NetworkMessagesService } from './network-messages.service';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [NetworkController],
  providers: [
    NetworkRoomsService,
    NetworkSharedPropertiesService,
    NetworkInquiriesService,
    NetworkMessagesService,
  ],
  exports: [NetworkRoomsService],
})
export class NetworkModule {}
