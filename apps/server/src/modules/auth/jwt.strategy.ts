import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Supabase JWT payload (Asymmetric — ES256 또는 RS256, Supabase JWT Signing Keys 발급).
 *
 * 우리는 sub(=Supabase user.id)만 신뢰하고, 비즈니스 데이터(role, officeId)는
 * 자체 DB에서 매번 조회해서 결정. (sub만 신뢰 패턴)
 *
 * Supabase JWT 표준 클레임:
 *   sub: string (Supabase auth.users.id, UUID)
 *   aud: string ("authenticated")
 *   iss: string ("https://<project>.supabase.co/auth/v1")
 *   exp: number
 *   iat: number
 *   email: string (합성 이메일)
 *   role: string (Supabase 내부 — "authenticated" — 비즈니스 role 아님)
 *   user_metadata, app_metadata: object
 *   header.kid: 서명에 사용된 키 ID (회전 시 자동 처리)
 */
interface SupabaseJwtPayload {
  sub: string;
  aud: string;
  iss?: string;
  exp: number;
  iat: number;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const supabaseUrl = config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is required');
    }

    /**
     * JWKS endpoint — Supabase가 public key를 공개하는 표준 위치.
     *   https://<project>.supabase.co/auth/v1/.well-known/jwks.json
     *
     * 토큰 헤더의 kid로 검증할 public key를 자동 선택.
     * 키 회전 시에도 코드 변경 없이 자동 적용 (cache TTL 후 재조회).
     */
    const jwksUri = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
    const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // ES256 (Supabase 새 default) + RS256 (legacy/fallback) 둘 다 허용
      algorithms: ['ES256', 'RS256'],
      audience: 'authenticated',
      issuer,
      // JWKS 기반 비대칭 검증 (passport-jwt 공식 통합)
      secretOrKeyProvider: passportJwtSecret({
        jwksUri,
        // mandatory: 매 요청마다 JWKS fetch 방지
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600_000, // 10분
        // Supabase JWKS endpoint hiccup 방어
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
    });
  }

  /**
   * Supabase JWT 검증 통과 후 호출.
   * payload.sub(=Supabase user.id)로 자체 DB User 조회 → role/officeId 결정.
   *
   * sub만 신뢰 패턴:
   *   - JWT의 role, email 등은 무시 (Supabase 내부 값)
   *   - 자체 DB의 User.role, officeId가 항상 최신 (권한 변경 즉시 반영)
   *   - User.isActive, Office.isActive 매번 체크 (퇴사 직원 즉시 차단)
   *
   * Phase 2+ TODO: Redis 캐시 (1분 TTL) 추가해서 DB 부하 줄이기.
   */
  async validate(payload: SupabaseJwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid JWT: missing sub');
    }

    const user = await this.prisma.user.findUnique({
      where: { supabaseId: payload.sub },
      include: { office: { select: { id: true, isActive: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    if (!user.isActive || !user.office.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      // 자체 DB User.id (이후 비즈니스 로직에서 userId로 사용)
      userId: user.id,
      // Supabase user.id (logout 등에서 supabase admin API 호출 시 사용)
      supabaseUserId: payload.sub,
      officeId: user.officeId,
      role: user.role,
    };
  }
}
