/**
 * SupabaseService — Supabase Auth Admin 클라이언트 + 합성 이메일 헬퍼.
 *
 * 책임:
 *   - Service Role Key로 Admin SDK 인스턴스 (사장님 발급, 비번 재설정 등)
 *   - 합성 이메일 생성/검증
 *
 * 보안:
 *   - SUPABASE_SERVICE_ROLE_KEY는 절대 클라이언트 노출 X (NestJS 서버에만)
 *   - 모든 Admin API 호출은 NestJS 게이트웨이 통과
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_ADMIN_CLIENT = Symbol('SUPABASE_ADMIN_CLIENT');

@Injectable()
export class SupabaseService {
  private readonly syntheticDomain: string;
  private readonly jwtSecret: string;

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly admin: SupabaseClient,
    config: ConfigService,
  ) {
    this.syntheticDomain =
      config.get<string>('SUPABASE_SYNTHETIC_DOMAIN') ?? 'estate-erp.local';
    this.jwtSecret = config.get<string>('SUPABASE_JWT_SECRET') ?? '';
  }

  /** Admin SDK 인스턴스 (사장님 발급, 비번 재설정 등 Service Role 작업) */
  getAdmin(): SupabaseClient {
    return this.admin;
  }

  /** Supabase JWT 검증용 secret (HS256 기준) */
  getJwtSecret(): string {
    return this.jwtSecret;
  }

  /**
   * 합성 이메일 생성: loginId@{syntheticDomain}
   * 예: kim_manager@estate-erp.local
   *
   * Supabase는 email NOT NULL UNIQUE이고 estate-erp는 loginId 기반이므로
   * 합성 이메일을 생성해 Supabase auth.users에 저장.
   * 직원 진짜 이메일이 있으면 자체 User.email 컬럼에 별도 저장.
   */
  buildSyntheticEmail(loginId: string): string {
    const normalized = loginId.trim().toLowerCase();
    if (!/^[a-z0-9_.-]+$/.test(normalized)) {
      throw new Error(
        `Invalid loginId for synthetic email: ${loginId}. ` +
          `Allowed: lowercase letters, numbers, underscore, dot, hyphen.`,
      );
    }
    return `${normalized}@${this.syntheticDomain}`;
  }

  /** 합성 이메일에서 loginId 추출 (디버깅/검증용) */
  extractLoginIdFromSyntheticEmail(email: string): string | null {
    const suffix = `@${this.syntheticDomain}`;
    if (!email.endsWith(suffix)) return null;
    return email.slice(0, -suffix.length);
  }
}
