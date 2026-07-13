import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { ContractsModule } from '../contracts/contracts.module';
import { InboxService } from './inbox.service';
import { DraftExecutorService } from './executor.service';
import { InboxController } from './inbox.controller';

@Module({
  imports: [PrismaModule, AgentModule, ContractsModule],
  controllers: [InboxController],
  providers: [InboxService, DraftExecutorService],
  exports: [InboxService],
})
export class InboxModule {}
