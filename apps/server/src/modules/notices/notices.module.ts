import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { NoticesAdminController } from './notices-admin.controller';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [NoticesController, NoticesAdminController],
  providers: [NoticesService, PlatformAdminGuard],
})
export class NoticesModule {}
