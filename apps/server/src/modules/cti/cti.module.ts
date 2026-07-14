import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CtiController } from './cti.controller';
import { CtiService } from './cti.service';
import { CtiBridgeGateway } from './cti-bridge.gateway';
import { CtiBridgeTokenService } from './cti-bridge-token.service';

/**
 * CTI 모듈 — 레거시 MySpider V2 전화(CID) 서브시스템의 서버 측 대체.
 * 스펙: docs/desktop-prd/migration/cti-cid-legacy-spec.md §9
 *
 * - REST: 회선/통화이력/lookup/발신/브리지 토큰
 * - WSS /cti-bridge: 마스터 PC cti-bridge 업링크 (ctib_ 토큰 인증)
 * - 사용자 앱 브로드캐스트는 RealtimeService(/realtime) 재사용
 */
@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [CtiController],
  providers: [CtiService, CtiBridgeGateway, CtiBridgeTokenService],
  exports: [CtiService],
})
export class CtiModule {}
