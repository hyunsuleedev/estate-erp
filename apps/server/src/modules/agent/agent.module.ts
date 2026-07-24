import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentControlPlaneService } from './control-plane/control-plane.service';

/**
 * 외부 AI 실행의 세션·wakeup·run·activity를 추적하는 제어면.
 * 승인 큐와 규칙 엔진은 제품 범위에서 제외한다.
 */
@Module({
  imports: [PrismaModule],
  providers: [AgentControlPlaneService],
  exports: [AgentControlPlaneService],
})
export class AgentModule {}
