import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Auth0 접근 토큰(JWT) 검증. RS256 서명, 발급자, 대상(aud), 유효 기간을 확인한다.
 * 사용자를 찾는 일은 하지 않는다(StaffAuthService가 한다).
 *
 * 서명 확인은 Node crypto로 직접 한다. 설치된 jose 6은 ESM 전용이라 CommonJS
 * 서버·jest에서 불러올 수 없다.
 */

/**
 * 받는 토큰의 최대 길이. Auth0 접근 토큰은 1KB 안팎이다. 이보다 긴 문자열은 읽지도
 * 않고 거절해, 큰 입력으로 CPU·메모리를 쓰게 만드는 요청을 막는다.
 */
export const MAX_ACCESS_TOKEN_LENGTH = 4_096;
/** base64url 글자만(패딩 없음). */
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** 모르는 서명 키(kid)가 와도 이 간격 안에서는 JWKS를 다시 받지 않는다. */
const JWKS_REFETCH_MIN_INTERVAL_MS = 30_000;
/**
 * 받아 둔 서명 키를 믿는 최대 시간. 이 시간이 지나면 다시 받아야 쓸 수 있다.
 * Auth0에서 폐기한 키로 서명된 토큰이 서버가 켜져 있는 내내 통과하지 않게 한다.
 */
const JWKS_MAX_AGE_MS = 6 * 60 * 60_000;
const CLOCK_SKEW_SECONDS = 30;

export interface Auth0AccessTokenClaims {
  iss: string;
  /** Auth0 user_id. 예: "auth0|6af3…" */
  sub: string;
  aud: string | string[];
  exp: number;
  /** 발급 시각(초) */
  iat?: number;
  /** 토큰을 받은 앱의 client ID */
  azp?: string;
  scope?: string;
  [claim: string]: unknown;
}

export interface VerifyAccessTokenOptions {
  /** 확인할 대상(aud). 생략하면 직원 API(AUTH0_AUDIENCE)다. */
  audience?: string;
  nowSeconds?: number;
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException(message);
}

/**
 * 토큰 문자열을 세 조각으로 나눈다. 형식이 표준과 글자 하나라도 다르면 거절한다.
 *
 * Node의 base64url 해석은 관대해서, 알파벳 밖의 글자를 건너뛰고 남는 비트도 무시한다.
 * 그래서 서명 조각에 군더더기를 붙인 문자열들이 모두 같은 서명으로 읽혀 검증을
 * 통과한다(토큰 하나로 "유효한" 문자열을 얼마든지 만들 수 있다). 서명 조각이
 * 다시 인코딩했을 때 원래 글자와 같아야만 받는다. 헤더와 내용은 서명이 글자 그대로를
 * 덮으므로 글자 집합만 확인한다.
 */
export function splitCanonicalJwt(token: unknown): [string, string, string] {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_ACCESS_TOKEN_LENGTH
  ) {
    throw unauthorized('잘못된 토큰입니다.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('잘못된 토큰입니다.');
  const [header, payload, signature] = parts as [string, string, string];
  if (
    !BASE64URL_SEGMENT.test(header) ||
    !BASE64URL_SEGMENT.test(payload) ||
    !BASE64URL_SEGMENT.test(signature) ||
    Buffer.from(signature, 'base64url').toString('base64url') !== signature
  ) {
    throw unauthorized('잘못된 토큰입니다.');
  }
  return [header, payload, signature];
}

@Injectable()
export class Auth0TokenVerifier {
  private readonly keys = new Map<string, KeyObject>();
  /** 마지막으로 JWKS를 받으려 한 시각(성공·실패 모두). */
  private lastJwksAttemptAt = 0;
  /** 지금 가진 키를 받은 시각. */
  private keysFetchedAt = 0;
  private lastJwksAttemptFailed = false;
  private jwksFetch: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** 발급자 주소. 예: "https://estait.jp.auth0.com/". 설정이 없으면 null. */
  getIssuer(): string | null {
    const domain = this.config
      .get<string>('AUTH0_DOMAIN')
      ?.trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    return domain ? `https://${domain}/` : null;
  }

  async verifyAccessToken(
    token: string,
    options: VerifyAccessTokenOptions = {},
  ): Promise<Auth0AccessTokenClaims> {
    // 길이·형식부터 본다. 여기서 걸러지는 입력에는 해석도 서명 확인도 하지 않는다.
    const [headerSegment, payloadSegment, signatureSegment] =
      splitCanonicalJwt(token);

    const issuer = this.getIssuer();
    const audience =
      options.audience ?? this.config.get<string>('AUTH0_AUDIENCE');
    if (!issuer || !audience) throw unauthorized('Auth0 설정이 없습니다.');
    const nowSeconds = options.nowSeconds ?? Math.floor(this.now() / 1000);

    const header = decodeSegment(headerSegment);
    const payload = decodeSegment(payloadSegment);
    if (!isRecord(header) || !isRecord(payload)) {
      throw unauthorized('잘못된 토큰입니다.');
    }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw unauthorized('지원하지 않는 토큰 서명 방식입니다.');
    }
    // 서명 키를 받으러 가기 전에 발급자부터 본다. 남의 토큰으로 JWKS 요청을 유발하지 않게 한다.
    if (payload.iss !== issuer) throw unauthorized('토큰 발급자가 다릅니다.');

    const key = await this.getSigningKey(header.kid, issuer);
    const signatureValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      key,
      Buffer.from(signatureSegment, 'base64url'),
    );
    if (!signatureValid) throw unauthorized('토큰 서명이 올바르지 않습니다.');

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience)) {
      throw unauthorized('이 서버용 토큰이 아닙니다.');
    }
    if (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp + CLOCK_SKEW_SECONDS <= nowSeconds
    ) {
      throw unauthorized('만료된 토큰입니다.');
    }
    if (
      typeof payload.nbf === 'number' &&
      payload.nbf - CLOCK_SKEW_SECONDS > nowSeconds
    ) {
      throw unauthorized('아직 쓸 수 없는 토큰입니다.');
    }
    if (payload.iat !== undefined && typeof payload.iat !== 'number') {
      throw unauthorized('잘못된 토큰입니다.');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw unauthorized('사용자 정보가 없는 토큰입니다.');
    }
    return payload as Auth0AccessTokenClaims;
  }

  /** 테스트에서 바꿔 끼운다. */
  protected async fetchJwks(issuer: string): Promise<unknown> {
    const response = await fetch(`${issuer}.well-known/jwks.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`JWKS request failed (${response.status})`);
    }
    return response.json();
  }

  protected now(): number {
    return Date.now();
  }

  /**
   * 서명 키를 찾는다.
   * - 받은 지 JWKS_MAX_AGE_MS 안의 키만 쓴다. 오래됐거나 모르는 kid면 다시 받는다.
   * - 다시 받기는 JWKS_REFETCH_MIN_INTERVAL_MS에 한 번만 한다(모르는 kid로 요청을
   *   퍼붓지 못하게).
   * - 필요한 다시 받기가 실패했거나 간격 때문에 하지 못했으면 401이 아니라 503으로
   *   답한다. 토큰이 틀린 게 아니라 확인을 못 한 것이고, 401이면 앱이 로그아웃해 버린다.
   *   "알 수 없는 서명 키"(401)는 목록을 방금 새로 받고도 kid가 없을 때만이다.
   */
  private async getSigningKey(kid: string, issuer: string): Promise<KeyObject> {
    const fresh = () =>
      this.keys.size > 0 && this.now() - this.keysFetchedAt < JWKS_MAX_AGE_MS;

    const cached = this.keys.get(kid);
    if (cached && fresh()) return cached;

    const mayRefetch =
      this.lastJwksAttemptAt === 0 ||
      this.now() - this.lastJwksAttemptAt >= JWKS_REFETCH_MIN_INTERVAL_MS;
    // 이번 요청을 위해 목록을 방금 새로 받았는지. 받았을 때만 "없는 키"라고 단정할 수 있다.
    const refreshedNow = mayRefetch
      ? await this.refreshJwks(issuer).then(
          () => true,
          () => false,
        )
      : false;

    if (fresh()) {
      const key = this.keys.get(kid);
      if (key) return key;
      // 방금 받은 최신 목록에도 없는 kid다: 우리 테넌트가 서명한 토큰이 아니다.
      if (refreshedNow) throw unauthorized('알 수 없는 서명 키입니다.');
    }
    // 판단할 수 없는 경우는 503이다. 401로 답하면 데스크톱 앱이 로그아웃하고 refresh
    // token까지 폐기한다.
    // - 목록을 받지 못했다(Auth0에 닿지 않음).
    // - 모르는 kid인데 다시 받기 간격 안이라 목록을 새로 받지 않았다. Auth0가 서명 키를
    //   막 바꾼 직후의 정상 토큰일 수 있다. 간격이 지난 뒤의 요청에서 판정한다.
    throw new ServiceUnavailableException(
      '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  private refreshJwks(issuer: string): Promise<void> {
    this.jwksFetch ??= (async () => {
      try {
        const jwks = await this.fetchJwks(issuer);
        const entries =
          isRecord(jwks) && Array.isArray(jwks.keys) ? jwks.keys : [];
        const next = new Map<string, KeyObject>();
        for (const entry of entries) {
          if (
            !isRecord(entry) ||
            entry.kty !== 'RSA' ||
            typeof entry.kid !== 'string'
          ) {
            continue;
          }
          try {
            next.set(
              entry.kid,
              createPublicKey({ key: entry as JsonWebKey, format: 'jwk' }),
            );
          } catch {
            // 읽을 수 없는 키는 건너뛴다.
          }
        }
        if (next.size === 0) throw new Error('JWKS has no usable keys');
        this.keys.clear();
        for (const [kid, key] of next) this.keys.set(kid, key);
        this.keysFetchedAt = this.now();
        this.lastJwksAttemptFailed = false;
      } catch (error) {
        this.lastJwksAttemptFailed = true;
        throw error;
      } finally {
        this.lastJwksAttemptAt = this.now();
        this.jwksFetch = null;
      }
    })();
    return this.jwksFetch;
  }
}
