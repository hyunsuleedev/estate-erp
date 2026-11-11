import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from './auth.types';
import {
  Auth0ManagementError,
  Auth0ManagementService,
} from './auth0-management.service';
import {
  Auth0TokenVerifier,
  MAX_ACCESS_TOKEN_LENGTH,
  type Auth0AccessTokenClaims,
} from './auth0-token-verifier';

/**
 * ERP 직원(owner/manager/agent) 인증. 로그인 서비스는 Auth0 하나다.
 *
 * - 접근 토큰을 검증한 뒤, 토큰의 sub(Auth0 user_id)로 User.auth0Id를 찾는다.
 *   아이디(loginId) 문자열로는 연결하지 않는다. 공개 가입이 열려 있어서, 아직
 *   연결되지 않은 아이디를 누군가 먼저 가입해 기존 계정을 가져갈 수 있기 때문이다.
 * - 처음 보는 sub는 방금 가입한 사장님이다. Auth0에서 프로필을 확인하고 사무소 없는
 *   owner User를 만든다(사무소는 온보딩에서 만든다).
 * - 사무소·역할·활성 여부는 우리 DB가 정한다. 토큰에는 넣지 않고, 기억해 두지도
 *   않는다. 요청마다 User 행을 읽으므로 비활성화·역할 변경·사무소 비활성화가 모든
 *   서버에서 다음 요청부터 바로 적용된다. 기억하는 것은 "이 토큰의 서명을 이미
 *   확인했다"는 사실(검증된 클레임)뿐이다.
 * - User.tokensValidAfter 이전에 발급된 토큰은 거절한다(비밀번호 재설정·비활성화).
 */

export type StaffUser = {
  /** 자체 DB User.id */
  userId: string;
  /** Auth0 user_id (토큰의 sub) */
  auth0UserId: string;
  /** 사무소가 아직 없는 owner는 빈 문자열 */
  officeId: string;
  role: UserRole;
};

export type BearerAuthTimings = {
  cacheHit?: boolean;
  verifyTokenMs?: number;
  userLookupMs?: number;
};

export interface ResolveStaffUserOptions {
  /** 처음 보는 Auth0 계정을 owner로 만들지. 기본값 true. */
  allowProvisioning?: boolean;
}

export interface AuthenticatedBearer {
  user: StaffUser;
  /** 토큰 만료 시각(초). 실시간 연결을 이때 끊는다. */
  expiresAtSeconds: number;
}

/** 서명을 확인한 토큰의 클레임을 기억하는 시간(토큰 만료 전까지). */
const VERIFIED_CLAIMS_TTL_MS = 30_000;
const VERIFIED_CLAIMS_EXPIRY_SKEW_MS = 5_000;
/**
 * 기억하는 토큰 수의 상한. 넘으면 만료된 것부터, 그래도 넘으면 오래된 것부터 버린다.
 * 키는 토큰의 SHA-256(64자)이라 항목 하나의 크기도 일정하다.
 */
export const VERIFIED_CLAIMS_MAX_ENTRIES = 5_000;

/** 사용자 확인에 쓰는 검증된 클레임. */
export type VerifiedStaffClaims = Pick<
  Auth0AccessTokenClaims,
  'sub' | 'exp' | 'iat' | 'azp'
>;
/**
 * 연결할 수 없다고 판정한 Auth0 계정을 기억하는 시간. 같은 계정이 요청을 반복해도
 * 그때마다 Auth0 Management API를 부르지 않게 한다(호출 한도 보호).
 */
const PROVISIONING_REJECTION_TTL_MS = 30_000;
const PROVISIONING_REJECTION_MAX_ENTRIES = 1_000;
/** Auth0 아이디·비밀번호(DB) 연결 계정의 user_id 접두사. */
const AUTH0_DATABASE_USER_PREFIX = 'auth0|';
/**
 * 직원 REST API를 쓸 수 있는 Auth0 앱(토큰의 azp)의 기본값: 데스크톱 Native 앱.
 * 다른 앱을 허용하려면 AUTH0_STAFF_CLIENT_IDS(쉼표 구분)로 바꾼다.
 */
const DEFAULT_STAFF_CLIENT_IDS = ['iOIMt1hOFpmyk5IlD1jl0JARuoycUCMF'];

const userWithOffice = {
  office: { select: { isActive: true } },
} satisfies Prisma.UserInclude;

type UserWithOffice = Prisma.UserGetPayload<{ include: typeof userWithOffice }>;

/** 가입한 아이디를 다른 User가 이미 쓰고 있다. */
class LoginIdTakenError extends Error {}

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);
  /** 키: 토큰의 SHA-256. 값: 서명·대상·만료를 이미 확인한 클레임. */
  private readonly bearerAuthCache = new Map<
    string,
    { expiresAt: number; claims: VerifiedStaffClaims }
  >();
  /** 같은 계정의 첫 요청이 동시에 와도 owner 생성은 한 번만 한다. */
  private readonly provisioning = new Map<string, Promise<UserWithOffice>>();
  private readonly provisioningRejections = new Map<
    string,
    { expiresAt: number; message: string }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokens: Auth0TokenVerifier,
    private readonly management: Auth0ManagementService,
  ) {}

  /**
   * REST guard가 쓰는 bearer 확인 입구. 토큰 서명 확인 결과는 잠깐 기억하지만
   * 사용자(활성 여부·사무소·역할)는 요청마다 DB에서 읽는다.
   */
  async authenticateBearerToken(
    token: string,
    timings?: BearerAuthTimings,
  ): Promise<StaffUser> {
    return (await this.authenticateBearer(token, timings)).user;
  }

  /** 실시간 연결용: 사용자와 함께 토큰 만료 시각을 돌려준다. */
  async authenticateBearer(
    token: string,
    timings?: BearerAuthTimings,
  ): Promise<AuthenticatedBearer> {
    // 너무 긴 문자열은 해시도 하지 않는다(검증기가 같은 한도로 거절한다).
    if (typeof token !== 'string' || token.length > MAX_ACCESS_TOKEN_LENGTH) {
      throw new UnauthorizedException('잘못된 토큰입니다.');
    }
    const cacheKey = createHash('sha256').update(token).digest('hex');
    let claims: VerifiedStaffClaims | null = this.getCachedClaims(cacheKey);
    if (claims) {
      if (timings) timings.cacheHit = true;
    } else {
      const verifyStartedAt = Date.now();
      claims = await this.tokens.verifyAccessToken(token);
      this.assertStaffClient(claims.azp);
      if (timings) timings.verifyTokenMs = Date.now() - verifyStartedAt;
      this.cacheClaims(cacheKey, claims);
    }

    const userLookupStartedAt = Date.now();
    const user = await this.resolveStaffUser(claims);
    if (timings) timings.userLookupMs = Date.now() - userLookupStartedAt;

    return { user, expiresAtSeconds: claims.exp };
  }

  /**
   * 검증된 토큰의 클레임으로 직원을 찾는다. 반드시 서명을 확인한 클레임만 넘긴다.
   * 비활성 계정·비활성 사무소, 그리고 User.tokensValidAfter 이전에 발급된 토큰을
   * 거절한다.
   */
  async resolveStaffUser(
    claims: Pick<Auth0AccessTokenClaims, 'sub' | 'iat'>,
    options: ResolveStaffUserOptions = {},
  ): Promise<StaffUser> {
    const auth0UserId = claims.sub;
    let user = await this.prisma.user.findUnique({
      where: { auth0Id: auth0UserId },
      include: userWithOffice,
    });
    if (!user) {
      if (options.allowProvisioning === false) {
        throw new UnauthorizedException(
          '이 계정은 에스테잇플로우 사용자와 연결되어 있지 않습니다.',
        );
      }
      user = await this.provisionOwnerOnce(auth0UserId);
    }

    if (!user.isActive || user.office?.isActive === false) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }
    if (isIssuedBeforeCutoff(claims.iat, user.tokensValidAfter)) {
      throw new UnauthorizedException(
        '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      );
    }

    return {
      userId: user.id,
      auth0UserId,
      officeId: user.officeId ?? '',
      role: user.role as UserRole,
    };
  }

  /**
   * 직원 REST API는 우리 앱(데스크톱)이 받은 토큰만 받는다. 테넌트의 다른 앱 — 특히
   * 외부 AI가 스스로 등록한 MCP 클라이언트 — 이 REST 대상(aud) 토큰을 얻더라도
   * 여기서 거절한다. MCP 클라이언트는 MCP 전용 토큰으로 /mcp만 쓴다.
   */
  private assertStaffClient(authorizedParty: unknown): void {
    const configured = this.config
      .get<string>('AUTH0_STAFF_CLIENT_IDS')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const allowed = configured?.length ? configured : DEFAULT_STAFF_CLIENT_IDS;
    if (typeof authorizedParty !== 'string' || !allowed.includes(authorizedParty)) {
      throw new UnauthorizedException('이 앱에서는 사용할 수 없는 토큰입니다.');
    }
  }

  private provisionOwnerOnce(auth0UserId: string): Promise<UserWithOffice> {
    const rejected = this.provisioningRejections.get(auth0UserId);
    if (rejected) {
      if (rejected.expiresAt > Date.now()) {
        return Promise.reject(new UnauthorizedException(rejected.message));
      }
      this.provisioningRejections.delete(auth0UserId);
    }

    const inflight = this.provisioning.get(auth0UserId);
    if (inflight) return inflight;
    const run = this.provisionOwner(auth0UserId)
      .catch((error: unknown) => {
        // 계정 자체가 연결 대상이 아니라는 판정(401)만 기억한다. 일시 오류(503)는 다시 시도한다.
        if (error instanceof UnauthorizedException) {
          this.rememberProvisioningRejection(auth0UserId, error.message);
        }
        throw error;
      })
      .finally(() => {
        if (this.provisioning.get(auth0UserId) === run) {
          this.provisioning.delete(auth0UserId);
        }
      });
    this.provisioning.set(auth0UserId, run);
    return run;
  }

  private rememberProvisioningRejection(auth0UserId: string, message: string) {
    const now = Date.now();
    if (this.provisioningRejections.size >= PROVISIONING_REJECTION_MAX_ENTRIES) {
      for (const [key, entry] of this.provisioningRejections) {
        if (entry.expiresAt <= now) this.provisioningRejections.delete(key);
      }
      if (this.provisioningRejections.size >= PROVISIONING_REJECTION_MAX_ENTRIES) {
        this.provisioningRejections.clear();
      }
    }
    this.provisioningRejections.set(auth0UserId, {
      expiresAt: now + PROVISIONING_REJECTION_TTL_MS,
      message,
    });
  }

  /** 방금 가입한 Auth0 계정에 사무소 없는 owner User를 만든다. */
  private async provisionOwner(auth0UserId: string): Promise<UserWithOffice> {
    // 소셜 로그인 계정이나 앱(M2M) 토큰은 프로필을 조회할 것도 없이 대상이 아니다.
    if (!auth0UserId.startsWith(AUTH0_DATABASE_USER_PREFIX)) {
      throw new UnauthorizedException(
        '이 계정은 에스테잇플로우 사용자와 연결되어 있지 않습니다.',
      );
    }

    const profile = await this.management
      .getUser(auth0UserId)
      .catch((error: unknown) => {
        this.logger.error(
          `Auth0 profile lookup failed for a first login: ${
            error instanceof Auth0ManagementError
              ? `${error.reason} (${error.status ?? 'no status'})`
              : 'unknown error'
          }`,
        );
        // 가입자 확인을 못 한 것은 토큰 문제가 아니다. 401로 답하면 앱이 로그아웃해 버린다.
        throw new ServiceUnavailableException(
          '계정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
      });

    // 직원 계정은 우리 아이디·비밀번호 연결에서만 만든다. 테넌트에 다른 연결(소셜 등)이
    // 켜져 있어도 그 계정으로는 ERP 사용자가 생기지 않는다.
    if (
      !profile ||
      profile.connection !== this.management.getConnection() ||
      !profile.username
    ) {
      throw new UnauthorizedException(
        '이 계정은 에스테잇플로우 사용자와 연결되어 있지 않습니다.',
      );
    }
    if (profile.blocked) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    const loginId = profile.username.trim().toLowerCase();
    const name = profile.name?.trim() || loginId;
    const email = profile.email?.trim().toLowerCase() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const linked = await tx.user.findUnique({
          where: { auth0Id: auth0UserId },
          include: userWithOffice,
        });
        if (linked) return linked;

        const taken = await tx.user.findUnique({
          where: { loginId },
          select: { id: true },
        });
        if (taken) throw new LoginIdTakenError();

        return tx.user.create({
          data: {
            auth0Id: auth0UserId,
            loginId,
            email,
            name,
            role: 'owner',
            lastLoginAt: new Date(),
          },
          include: userWithOffice,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // 다른 서버 프로세스가 같은 계정을 먼저 만들었으면 그 User를 쓴다.
        const existing = await this.prisma.user.findUnique({
          where: { auth0Id: auth0UserId },
          include: userWithOffice,
        });
        if (existing) return existing;
        throw this.loginIdTaken();
      }
      if (error instanceof LoginIdTakenError) throw this.loginIdTaken();
      throw error;
    }
  }

  /**
   * 같은 아이디의 User가 이미 있는데 이 Auth0 계정과 연결되어 있지 않다.
   * 아이디가 같다는 이유로 연결하지 않는다(계정 탈취 방지).
   */
  private loginIdTaken(): UnauthorizedException {
    return new UnauthorizedException(
      '이미 사용 중인 아이디입니다. 다른 아이디로 가입해 주세요.',
    );
  }

  private getCachedClaims(cacheKey: string): VerifiedStaffClaims | null {
    const cached = this.bearerAuthCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.bearerAuthCache.delete(cacheKey);
      return null;
    }
    return cached.claims;
  }

  private cacheClaims(cacheKey: string, claims: VerifiedStaffClaims): void {
    const now = Date.now();
    const expiresAt = Math.min(
      now + VERIFIED_CLAIMS_TTL_MS,
      claims.exp * 1000 - VERIFIED_CLAIMS_EXPIRY_SKEW_MS,
    );
    if (expiresAt <= now) return;

    if (this.bearerAuthCache.size >= VERIFIED_CLAIMS_MAX_ENTRIES) {
      for (const [key, entry] of this.bearerAuthCache) {
        if (entry.expiresAt <= now) this.bearerAuthCache.delete(key);
      }
      // Map은 넣은 순서로 돈다. 아직도 가득 차 있으면 가장 오래된 것부터 버린다.
      for (const key of this.bearerAuthCache.keys()) {
        if (this.bearerAuthCache.size < VERIFIED_CLAIMS_MAX_ENTRIES) break;
        this.bearerAuthCache.delete(key);
      }
    }
    // 필요한 값만 남긴다(토큰의 나머지 클레임을 붙들고 있지 않는다).
    this.bearerAuthCache.set(cacheKey, {
      expiresAt,
      claims: {
        sub: claims.sub,
        exp: claims.exp,
        iat: claims.iat,
        azp: claims.azp,
      },
    });
  }
}

/**
 * 토큰이 사용자의 기준 시각(tokensValidAfter) 이전에 발급됐는지.
 * iat는 초 단위라, 기준 시각과 같은 초에 발급된 토큰도 이전으로 본다(안전한 쪽).
 * 기준 시각이 있는데 토큰에 iat가 없으면 확인할 수 없으므로 거절한다.
 */
export function isIssuedBeforeCutoff(
  issuedAtSeconds: number | undefined,
  tokensValidAfter: Date | null,
): boolean {
  if (!tokensValidAfter) return false;
  if (typeof issuedAtSeconds !== 'number' || !Number.isFinite(issuedAtSeconds)) {
    return true;
  }
  return issuedAtSeconds <= Math.floor(tokensValidAfter.getTime() / 1000);
}
