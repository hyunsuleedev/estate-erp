import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Auth0 Management API 클라이언트 (서버 전용 M2M 앱).
 *
 * 직원 계정 생성·비밀번호 재설정·차단·삭제와, 처음 로그인한 가입자의 프로필
 * 확인에 쓴다. M2M 앱에는 사용자와 refresh token(device credentials) 권한만 있다.
 *
 * 관리 토큰은 메모리에 두고 만료 직전까지 다시 쓴다. Auth0 무료 요금제의 M2M
 * 토큰은 월 1,000개뿐이라, 요청마다 새로 받으면 금방 바닥난다. 동시에 여러 요청이
 * 와도 토큰은 한 번만 받는다.
 *
 * 토큰은 서버 프로세스마다 따로 갖는다(서버 재시작·인스턴스 수만큼 받는다). 서버에는
 * 주입해서 쓸 수 있는 공용 Redis 클라이언트가 아직 없다(실시간 어댑터가 자기 연결만
 * 갖는다). 인스턴스가 많아지면 토큰을 Redis에 두고 나눠 써야 한다.
 */

export const DEFAULT_AUTH0_DB_CONNECTION = 'Username-Password-Authentication';

/** 만료 5분 전부터는 새로 받는다. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
/** 호출 한도(429)에 걸리면 잠깐 기다렸다가 다시 보낸다. */
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_MAX_WAIT_MS = 2_000;
/** refresh token 폐기: 목록(100개씩)을 비울 때까지 반복하는 최대 횟수. */
const REVOKE_MAX_ROUNDS = 10;

export type Auth0ManagementErrorReason =
  | 'user-exists'
  | 'weak-password'
  | 'invalid-username'
  | 'not-found'
  | 'not-configured'
  | 'unavailable'
  | 'unknown';

export class Auth0ManagementError extends Error {
  constructor(
    readonly reason: Auth0ManagementErrorReason,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'Auth0ManagementError';
  }
}

export interface Auth0UserProfile {
  /** Auth0 user_id. 예: "auth0|6af3…" */
  userId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  blocked: boolean;
  /** 이 계정이 속한 연결 이름. DB 연결이면 "Username-Password-Authentication". */
  connection: string | null;
}

interface ManagementResponse {
  status: number;
  body: unknown;
  /** 429일 때 다시 보내기 전에 기다릴 시간 */
  retryAfterMs?: number;
}

/** 429 응답의 대기 시간. Auth0는 x-ratelimit-reset(초 단위 시각)을 준다. */
function retryAfterMs(response: Response, now: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const wait =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Number.isFinite(reset) && reset > 0
        ? reset * 1000 - now
        : 1_000;
  return Math.min(Math.max(wait, 200), RATE_LIMIT_MAX_WAIT_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toProfile(body: unknown): Auth0UserProfile | null {
  if (!isRecord(body) || typeof body.user_id !== 'string') return null;
  const identities = Array.isArray(body.identities) ? body.identities : [];
  const primary = identities.find(isRecord);
  return {
    userId: body.user_id,
    username: typeof body.username === 'string' ? body.username : null,
    name: typeof body.name === 'string' ? body.name : null,
    email: typeof body.email === 'string' ? body.email : null,
    blocked: body.blocked === true,
    connection:
      primary && typeof primary.connection === 'string'
        ? primary.connection
        : null,
  };
}

/** Management API 오류 응답을 이유별로 나눈다(메시지 형식은 실제 응답으로 확인했다). */
function classify(status: number, body: unknown): Auth0ManagementErrorReason {
  const message =
    isRecord(body) && typeof body.message === 'string' ? body.message : '';
  if (status === 404) return 'not-found';
  if (status === 409) return 'user-exists';
  if (status === 400) {
    if (/PasswordStrengthError|password is too weak/i.test(message)) {
      return 'weak-password';
    }
    if (/username/i.test(message)) return 'invalid-username';
  }
  if (status === 429 || status >= 500) return 'unavailable';
  return 'unknown';
}

@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name);
  private token: { value: string; expiresAt: number } | null = null;
  private tokenFetch: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** 직원 계정이 속하는 DB 연결 이름. */
  getConnection(): string {
    return (
      this.config.get<string>('AUTH0_DB_CONNECTION')?.trim() ||
      DEFAULT_AUTH0_DB_CONNECTION
    );
  }

  async getUser(userId: string): Promise<Auth0UserProfile | null> {
    const response = await this.request(
      'GET',
      `users/${encodeURIComponent(userId)}`,
    );
    if (response.status === 404) return null;
    this.assertOk(response);
    return toProfile(response.body);
  }

  async createUser(params: {
    username: string;
    password: string;
    name: string;
  }): Promise<Auth0UserProfile> {
    const response = await this.request('POST', 'users', {
      connection: this.getConnection(),
      username: params.username,
      password: params.password,
      name: params.name,
    });
    this.assertOk(response);
    const profile = toProfile(response.body);
    if (!profile) {
      throw new Auth0ManagementError(
        'unknown',
        response.status,
        'Auth0 사용자 생성 응답을 읽지 못했습니다.',
      );
    }
    return profile;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    this.assertOk(
      await this.request('PATCH', `users/${encodeURIComponent(userId)}`, {
        password,
        connection: this.getConnection(),
      }),
    );
  }

  async setBlocked(userId: string, blocked: boolean): Promise<void> {
    this.assertOk(
      await this.request('PATCH', `users/${encodeURIComponent(userId)}`, {
        blocked,
      }),
    );
  }

  /**
   * 그 사용자의 refresh token을 모두 폐기한다(로그인된 모든 PC에서 갱신이 끊긴다).
   * 비밀번호를 바꿔도 Auth0는 기존 refresh token을 살려 두기 때문에 따로 해야 한다.
   * 무료 요금제에서는 `users/{id}/refresh-tokens` 삭제가 막혀 있어, 토큰별
   * device credential을 지운다. 목록 반영이 조금 늦을 수 있어 몇 번 다시 본다.
   */
  async revokeRefreshTokens(userId: string): Promise<void> {
    for (let round = 0; round < REVOKE_MAX_ROUNDS; round += 1) {
      const ids: string[] = [];
      for (const type of ['rotating_refresh_token', 'refresh_token']) {
        const response = await this.request(
          'GET',
          `device-credentials?user_id=${encodeURIComponent(userId)}&type=${type}&per_page=100`,
        );
        this.assertOk(response);
        if (Array.isArray(response.body)) {
          for (const entry of response.body) {
            if (isRecord(entry) && typeof entry.id === 'string') {
              ids.push(entry.id);
            }
          }
        }
      }
      if (ids.length === 0) return;
      for (const id of ids) {
        const response = await this.request(
          'DELETE',
          `device-credentials/${encodeURIComponent(id)}`,
        );
        if (response.status !== 404) this.assertOk(response);
      }
    }
    throw new Auth0ManagementError(
      'unknown',
      null,
      'refresh token이 너무 많아 한 번에 모두 폐기하지 못했습니다.',
    );
  }

  /** 이미 없는 사용자(404)도 성공으로 본다. */
  async deleteUser(userId: string): Promise<void> {
    const response = await this.request(
      'DELETE',
      `users/${encodeURIComponent(userId)}`,
    );
    if (response.status === 404) return;
    this.assertOk(response);
  }

  /** 테스트에서 바꿔 끼운다. */
  protected fetchImpl(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  protected now(): number {
    return Date.now();
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertOk(response: ManagementResponse): void {
    if (response.status >= 200 && response.status < 300) return;
    const message =
      isRecord(response.body) && typeof response.body.message === 'string'
        ? response.body.message
        : `Auth0 Management API ${response.status}`;
    throw new Auth0ManagementError(
      classify(response.status, response.body),
      response.status,
      message,
    );
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<ManagementResponse> {
    const usedToken = await this.getToken();
    let response = await this.send(method, path, body, usedToken);
    if (response.status === 401) {
      // 토큰이 폐기됐거나 앱 비밀값이 바뀌었다. 한 번만 새로 받아 다시 보낸다.
      // 거절된 그 토큰일 때만 버린다. 동시에 실패한 다른 요청이 이미 새 토큰을
      // 받아 놨으면 그걸 쓴다(요청마다 새 토큰을 받지 않게).
      if (this.token?.value === usedToken) this.token = null;
      response = await this.send(method, path, body, await this.getToken());
    }
    for (
      let retry = 0;
      response.status === 429 && retry < RATE_LIMIT_MAX_RETRIES;
      retry += 1
    ) {
      await this.sleep(response.retryAfterMs ?? 1_000);
      response = await this.send(method, path, body, await this.getToken());
    }
    return response;
  }

  private async send(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    token: string,
  ): Promise<ManagementResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl()}/api/v2/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Auth0ManagementError(
        'unavailable',
        null,
        `Auth0 Management API에 연결하지 못했습니다: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return {
      status: response.status,
      body: parsed,
      ...(response.status === 429
        ? { retryAfterMs: retryAfterMs(response, this.now()) }
        : {}),
    };
  }

  private getToken(): Promise<string> {
    const cached = this.token;
    if (cached && cached.expiresAt - this.now() > TOKEN_EXPIRY_MARGIN_MS) {
      return Promise.resolve(cached.value);
    }
    this.tokenFetch ??= this.fetchToken().finally(() => {
      this.tokenFetch = null;
    });
    return this.tokenFetch;
  }

  private async fetchToken(): Promise<string> {
    const clientId = this.config.get<string>('AUTH0_MGMT_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('AUTH0_MGMT_CLIENT_SECRET');
    const baseUrl = this.baseUrl();
    if (!clientId || !clientSecret) {
      throw new Auth0ManagementError(
        'not-configured',
        null,
        'AUTH0_MGMT_CLIENT_ID / AUTH0_MGMT_CLIENT_SECRET 설정이 없습니다.',
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          audience: `${baseUrl}/api/v2/`,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Auth0ManagementError(
        'unavailable',
        null,
        `Auth0 토큰 서버에 연결하지 못했습니다: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !isRecord(body) ||
      typeof body.access_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      this.logger.error(
        `Auth0 management token request failed (${response.status})`,
      );
      throw new Auth0ManagementError(
        response.status === 401 || response.status === 403
          ? 'not-configured'
          : 'unavailable',
        response.status,
        'Auth0 관리 토큰을 받지 못했습니다.',
      );
    }
    this.token = {
      value: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }

  private baseUrl(): string {
    const domain = this.config
      .get<string>('AUTH0_DOMAIN')
      ?.trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    if (!domain) {
      throw new Auth0ManagementError(
        'not-configured',
        null,
        'AUTH0_DOMAIN 설정이 없습니다.',
      );
    }
    return `https://${domain}`;
  }
}
