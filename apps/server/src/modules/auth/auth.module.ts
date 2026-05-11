import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * AuthModule — Supabase Auth 통합 (단일 토큰 + sub만 신뢰).
 *
 * 단순화:
 *   - LocalStrategy 제거 (AuthController.login이 직접 AuthService 호출)
 *   - RefreshJwtStrategy 제거 (AuthController.refresh가 Supabase refreshSession 직접 호출)
 *   - JwtStrategy는 Supabase JWT (HS256) 검증 + 자체 DB User 조회
 *
 * 자체 JWT 발급은 더 이상 안 함 (Supabase JWT 그대로 사용).
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt', session: false })],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [AuthService],
})
export class AuthModule {}
