import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InboxService } from './inbox.service';
import { DraftExecutorService } from './executor.service';
import { InboxController } from './inbox.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InboxController],
  providers: [InboxService, DraftExecutorService],
  exports: [InboxService],
})
export class InboxModule {}
