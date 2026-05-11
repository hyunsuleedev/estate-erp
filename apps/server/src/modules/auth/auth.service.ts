import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AuthenticatedUser,
  UserRole,
} from './auth.types';

type UserWithOffice = Prisma.UserGetPayload<{
  include: { office: true };
}>;

/**
 * AuthService — 단일 Supabase JWT + sub만 신뢰 패턴.
 *
 * 결정 (이 대화의 결론):
 *   - 인증 외주 (Supabase), 권한 자체 (NestJS + 자체 DB)
 *   - 단일 토큰 (Supabase JWT 그대로 반환, 자체 JWT 발급 X)
 *   - 2중 구조 회피
 *   - sub만 신뢰: JwtStrategy가 payload.sub로 자체 DB 조회 → role/officeId
 *   - 권한 변경 즉시 반영 (자체 DB만 변경, JWT는 sub만 박혀있음)
 *
 * 흐름:
 *   1. Electron React 폼 → /auth/login (loginId + password)
 *   2. NestJS: 자체 DB로 loginId → syntheticEmail 변환
 *   3. Supabase signInWithPassword → Supabase JWT 발급
 *   4. NestJS: Supabase JWT 그대로 응답 (자체 JWT 발급 X)
 *   5. Electron이 Supabase JWT 저장 + 모든 API 요청에 사용
 *   6. NestJS JwtStrategy가 Supabase JWT 검증 (HS256 + Supabase secret)
 *   7. payload.sub(=Supabase user id) → 자체 DB User 조회 → role/officeId
 */
@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * 첫 회원가입: 새 사무소 + Owner User 생성.
   * - Supabase auth.users 생성 (합성 이메일 + password)
   * - 자체 DB Office + User 생성 (supabaseId, syntheticEmail 매핑)
   * - Supabase JWT 그대로 반환
   */
  async register(dto: {
    loginId?: string;
    email: string;
    password: string;
    name: string;
    officeName: string;
  }) {
    const email = this.normalizeEmail(dto.email);
    const loginId = this.normalizeLoginId(dto.loginId ?? email);

    if (!loginId) {
      throw new BadRequestException('아이디는 필수입니다.');
    }
    if (!email) {
      throw new BadRequestException('이메일은 필수입니다.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { loginId },
    });
    if (existing) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    const syntheticEmail = this.supabase.buildSyntheticEmail(loginId);

    // 1. Supabase auth.users 생성
    const { data: createdData, error: createError } =
      await this.supabase.getAdmin().auth.admin.createUser({
        email: syntheticEmail,
        password: dto.password,
        email_confirm: true,
        user_metadata: { loginId, name: dto.name, realEmail: email },
      });

    if (createError || !createdData.user) {
      throw new InternalServerErrorException(
        `Supabase user 생성 실패: ${createError?.message ?? 'unknown'}`,
      );
    }

    const supabaseUserId = createdData.user.id;

    // 2. 자체 DB Office + User 생성
    let createdUser: UserWithOffice;
    try {
      createdUser = await this.prisma.$transaction(async (tx) => {
        const office = await tx.office.create({
          data: { name: dto.officeName },
        });

        // password 컬럼은 마이그레이션 잔재라 dummy hash로 채움
        const dummyHash = await bcrypt.hash(
          this.randomString(32),
          AuthService.PASSWORD_SALT_ROUNDS,
        );

        const user = await tx.user.create({
          data: {
            loginId,
            email,
            password: dummyHash,
            name: dto.name,
            officeId: office.id,
            role: 'owner',
            supabaseId: supabaseUserId,
            syntheticEmail,
            mustChangePassword: false, // 본인이 직접 가입 → 강제 변경 X
            passwordChangedAt: new Date(),
          },
          include: { office: true },
        });

        return user;
      });
    } catch (error) {
      // 자체 DB 실패 시 Supabase user 청소
      await this.supabase
        .getAdmin()
        .auth.admin.deleteUser(supabaseUserId)
        .catch(() => {});

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const target = this.getUniqueConstraintTarget(error);
        if (target.includes('login_id') || target.includes('loginId')) {
          throw new ConflictException('이미 사용 중인 아이디입니다.');
        }
      }
      throw error;
    }

    // 3. Supabase signInWithPassword로 세션 발급 (Supabase JWT 받기 위해)
    const tokens = await this.signInToSupabase(syntheticEmail, dto.password);

    return this.toAuthResponse(this.toAuthenticatedUser(createdUser), tokens);
  }

  /**
   * 로그인: Supabase signInWithPassword → Supabase JWT 그대로 반환.
   *
   * LocalStrategy.validate() 흐름과 다르게, 이 메서드는 Supabase JWT 발급까지 담당.
   * (LocalStrategy는 검증만, AuthController.login이 이 메서드 호출)
   */
  async login(loginId: string, password: string) {
    const user = await this.findUserByLoginIdForAuth(loginId);

    if (!user.syntheticEmail || !user.supabaseId) {
      throw new UnauthorizedException(
        'Supabase 마이그레이션 필요. 사장님께 문의하세요.',
      );
    }

    // Supabase로 비번 검증 + JWT 발급
    const tokens = await this.signInToSupabase(
      user.syntheticEmail,
      password,
    );

    this.ensureUserIsActive(user);

    // 마지막 로그인 시각 기록
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.toAuthResponse(this.toAuthenticatedUser(user), tokens);
  }

  /**
   * Refresh: Supabase refreshSession → 새 Supabase JWT 반환.
   */
  async refresh(refreshToken: string) {
    const { data, error } = await this.supabase.getAdmin().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('유효한 리프레시 토큰이 아닙니다.');
    }

    // 자체 DB User 확인
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: data.user.id },
      include: { office: true },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    this.ensureUserIsActive(user);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      office: { id: user.office.id, name: user.office.name },
    };
  }

  /**
   * Logout: Supabase 세션 종료 (refresh token 무효).
   */
  async logout(supabaseUserId: string) {
    await this.supabase
      .getAdmin()
      .auth.admin.signOut(supabaseUserId, 'global')
      .catch(() => {});

    return { success: true };
  }

  /**
   * /auth/me — 현재 사용자 정보 (JwtStrategy가 자체 DB 조회 후 req.user에 담음).
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { office: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.ensureUserIsActive(user);

    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role,
      isPlatformAdmin: !!user.isPlatformAdmin,
      mustChangePassword: !!user.mustChangePassword,
      office: {
        id: user.office.id,
        name: user.office.name,
      },
    };
  }

  // ==================== 내부 헬퍼 ====================

  /**
   * Supabase signInWithPassword 호출 (서버 측, admin 클라이언트).
   * 비번 검증 + Supabase JWT 발급.
   */
  private async signInToSupabase(email: string, password: string) {
    const { data, error } = await this.supabase
      .getAdmin()
      .auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  private async findUserByLoginIdForAuth(
    loginId: string,
  ): Promise<UserWithOffice> {
    const normalized = this.normalizeLoginId(loginId);
    const user = await this.prisma.user.findUnique({
      where: { loginId: normalized },
      include: { office: true },
    });
    if (!user) {
      // 보안: 사용자 존재 여부 노출 안 함 — Supabase 호출 단계에서 동일 메시지로 실패
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }
    return user;
  }

  private getUniqueConstraintTarget(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    if (error.code !== 'P2002') return '';
    const target = error.meta?.target;
    if (Array.isArray(target)) return target.join(',');
    return typeof target === 'string' ? target : '';
  }

  private normalizeEmail(email: string) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  }

  private normalizeLoginId(loginId: string) {
    return typeof loginId === 'string' ? loginId.trim().toLowerCase() : '';
  }

  private toAuthenticatedUser(user: UserWithOffice): AuthenticatedUser {
    return {
      userId: user.id,
      officeId: user.officeId,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      office: {
        id: user.office.id,
        name: user.office.name,
        isActive: user.office.isActive,
      },
    };
  }

  private toAuthResponse(
    user: AuthenticatedUser,
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  ) {
    return {
      ...tokens,
      user: {
        id: user.userId,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      office: {
        id: user.office.id,
        name: user.office.name,
      },
    };
  }

  private ensureUserIsActive(user: UserWithOffice) {
    if (!user.isActive || !user.office.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }
  }

  private randomString(length: number) {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
