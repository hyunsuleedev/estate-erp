import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentControlPlaneService } from './control-plane/control-plane.service';

/**
 * 외부 AI 실행의 세션·wakeup·run·activity를 추적하는 제어면.
 * 범용 Rule/Proposal 엔진은 제외한다. 사람이 검토할 외부 부작용은
 * 별도의 좁은 AgentActionRequest 도메인이 소유한다.
 */
@Module({
  imports: [PrismaModule],
  providers: [AgentControlPlaneService],
  exports: [AgentControlPlaneService],
})
export class AgentModule {}
