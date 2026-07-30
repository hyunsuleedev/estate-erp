import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentActionRequestsController } from './agent-action-requests.controller';
import { AgentActionRequestsService } from './agent-action-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AgentActionRequestsController],
  providers: [AgentActionRequestsService],
  exports: [AgentActionRequestsService],
})
export class AgentActionRequestsModule {}
