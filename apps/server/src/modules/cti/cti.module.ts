import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CtiController } from './cti.controller';
import { CtiService } from './cti.service';

@Module({
  imports: [RealtimeModule],
  controllers: [CtiController],
  providers: [CtiService],
  exports: [CtiService],
})
export class CtiModule {}
