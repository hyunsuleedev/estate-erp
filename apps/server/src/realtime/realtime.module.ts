import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
