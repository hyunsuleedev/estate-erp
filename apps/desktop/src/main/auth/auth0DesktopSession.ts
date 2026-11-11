import type { Auth0DesktopConfig } from '../../common/auth0DesktopConfig';
import {
  SIGNUP_PASSWORD_RULE,
  SIGNUP_USERNAME_RULE,
} from '../../common/signupRules';

/**
 * main 프로세스가 소유하는 Auth0 로그인 세션.
 *
 * - 로그인: 셸의 우리 로그인 화면이 받은 아이디·비밀번호로 Auth0
 *   password-realm 방식 토큰을 받는다. 비밀번호는 저장하지 않는다.
 * - 가입: 우리 가입 화면이 받은 값으로 Auth0 DB 연결에 계정을 만들고 바로 로그인한다.
 * - refresh token은 이 객체와 저장소(OS 키체인 암호화)에만 있다. 화면에는
 *   접근 토큰만 IPC로 건넨다.
 * - Auth0 refresh token 교체(rotation)는 이미 쓴 토큰을 다시 쓰면 그 계열을
 *   모두 무효로 만든다. 그래서 갱신은 한 번에 하나만 하고(single-flight),
 *   새 refresh token을 받으면 바로 저장한다.
 * - 저장소 작업(저장·지우기)은 한 줄로 세워 순서대로 한다. 로그아웃의 지우기가 그 전에
 *   시작된 저장보다 먼저 끝나 저장된 로그인이 되살아나는 일이 없다.
 * - 세션이 바뀌면 메모리에서 먼저 바꾸고 바로 알린 뒤 저장소를 고친다. 알림은 세션 번호
 *   순서대로 나간다.
 */

export interface StoredAuth0Session {
  domain: string;
  clientId: string;
  refreshToken: string;
}

export interface Auth0TokenStore {
  load(): Promise<StoredAuth0Session | null>;
  save(session: StoredAuth0Session): Promise<void>;
  clear(): Promise<void>;
}

/** 사용자가 로그아웃하지 않았는데 세션이 끝난 이유. */
export type Auth0SessionEndReason =
  /** refresh token이 만료·폐기됐거나 재사용으로 감지됐다. */
  | 'expired'
  /** Auth0가 계정이 차단됐다고 답했다. */
  | 'blocked'
  /**
   * 저장된 로그인을 실행 중인 다른 앱이 바꿨다. 이 프로세스가 가진 토큰은 이미 교체된
   * 것이라 쓰지 않는다(쓰면 Auth0가 재사용으로 보고 양쪽 로그인을 모두 끊는다).
   */
  | 'replaced';

export interface Auth0DesktopSessionOptions {
  config: Auth0DesktopConfig;
  store: Auth0TokenStore;
  /**
   * 세션이 저절로 끝난다(이유 포함). 바로 이어서 onSessionChanged가 온다.
   * 화면을 로그아웃시키고 이유를 보여 준다.
   */
  onSessionEnded?: (reason: Auth0SessionEndReason) => void;
  /** 로그인·로그아웃으로 세션 번호가 바뀌었다. 모든 셸이 다시 확인하게 한다. */
  onSessionChanged?: (sessionId: number) => void;
  /**
   * Auth0 요청을 보낼 주소. 기본은 `https://<domain>`이다. 브라우저 미리보기
   * (개발 전용)는 Vite 개발 서버의 프록시 경로를 넣는다.
   */
  endpointBaseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** 로그아웃이 저장소 정리를 기다리는 최대 시간. 디스크가 느려도 로그아웃은 끝난다. */
  storeWaitMs?: number;
}

export class Auth0TokenError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly description: string | null,
  ) {
    super(description || code || `Auth0 token request failed (${status})`);
    this.name = 'Auth0TokenError';
  }
}

/** 로그인 실패. message는 로그인 화면에 그대로 보여 줄 한국어 문구다. */
export class Auth0LoginError extends Error {
  constructor(
    readonly reason:
      | 'already-signed-in'
      | 'invalid-credentials'
      | 'blocked'
      | 'too-many-attempts'
      | 'mfa-required'
      | 'network'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'Auth0LoginError';
  }
}

export type Auth0SignupFailure =
  | 'username-taken'
  | 'weak-password'
  | 'invalid-username'
  | 'username-length'
  | 'signup-disabled'
  | 'too-many-attempts'
  | 'network'
  /** 계정은 만들어졌지만 이어서 한 로그인이 실패했다. 로그인 화면에서 다시 하면 된다. */
  | 'created-but-login-failed'
  | 'unknown';

/** 가입 실패. message는 가입 화면에 그대로 보여 줄 한국어 문구다. */
export class Auth0SignupError extends Error {
  constructor(
    readonly reason: Auth0SignupFailure,
    message: string,
  ) {
    super(message);
    this.name = 'Auth0SignupError';
  }
}

/** Auth0 `/dbconnections/signup` 실패 응답을 가입 화면 문구로 바꾼다. */
export function toSignupError(status: number, body: unknown): Auth0SignupError {
  const payload =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const code = typeof payload.code === 'string' ? payload.code : null;
  const error = typeof payload.error === 'string' ? payload.error : null;
  if (code === 'invalid_signup' || code === 'user_exists' || code === 'username_exists') {
    return new Auth0SignupError(
      'username-taken',
      '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.',
    );
  }
  if (code === 'invalid_password' || code === 'password_dictionary_error') {
    return new Auth0SignupError('weak-password', SIGNUP_PASSWORD_RULE);
  }
  if (code === 'invalid_username_characters') {
    return new Auth0SignupError('invalid-username', SIGNUP_USERNAME_RULE);
  }
  if (error && /length criteria/i.test(error)) {
    return new Auth0SignupError('username-length', '아이디는 1~30자로 입력해 주세요.');
  }
  if (code === 'signup_disabled' || (error && /signup.*(disabled|not allowed)|public signup/i.test(error))) {
    return new Auth0SignupError(
      'signup-disabled',
      '지금은 가입을 받을 수 없습니다. 관리자에게 문의해 주세요.',
    );
  }
  if (status === 429 || code === 'too_many_requests') {
    return new Auth0SignupError(
      'too-many-attempts',
      '가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  return new Auth0SignupError(
    'unknown',
    `가입하지 못했습니다. 잠시 후 다시 시도해 주세요. (${code ?? error ?? status})`,
  );
}

/** Auth0 토큰 응답 오류를 로그인 화면 문구로 바꾼다. */
export function toLoginError(error: unknown): Auth0LoginError {
  if (error instanceof Auth0LoginError) return error;
  if (error instanceof Auth0TokenError) {
    if (error.code === 'invalid_grant' && /blocked/i.test(error.description ?? '')) {
      return new Auth0LoginError(
        'blocked',
        '사용이 중지된 계정입니다. 사장님(관리자)에게 문의해 주세요.',
      );
    }
    if (error.code === 'invalid_grant') {
      return new Auth0LoginError(
        'invalid-credentials',
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }
    if (error.code === 'too_many_attempts' || error.status === 429) {
      return new Auth0LoginError(
        'too-many-attempts',
        '로그인 실패가 반복되어 이 PC에서 로그인이 잠겼습니다. 사장님(관리자)에게 잠금 해제를 요청해 주세요.',
      );
    }
    if (error.code === 'mfa_required') {
      return new Auth0LoginError(
        'mfa-required',
        '추가 인증이 필요한 계정입니다. 사장님(관리자)에게 문의해 주세요.',
      );
    }
    return new Auth0LoginError(
      'unknown',
      `로그인에 실패했습니다. (${error.code ?? error.status})`,
    );
  }
  return new Auth0LoginError(
    'network',
    '로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
  );
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** 만료 1분 전부터는 새로 받는다. 서버까지 가는 동안 만료되지 않게 한다. */
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const REVOKE_TIMEOUT_MS = 5_000;
const SIGNUP_REQUEST_TIMEOUT_MS = 15_000;
const STORE_WAIT_MS = 1_000;
/** 이 답을 받은 refresh token은 다시 보내도 받아 주지 않는다. 세션을 끝낸다. */
const SESSION_ENDING_TOKEN_ERRORS = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
]);
const PASSWORD_REALM_GRANT = 'http://auth0.com/oauth/grant-type/password-realm';

function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.access_token === 'string' &&
    candidate.access_token.length > 0 &&
    typeof candidate.expires_in === 'number' &&
    Number.isFinite(candidate.expires_in) &&
    (candidate.refresh_token === undefined ||
      typeof candidate.refresh_token === 'string')
  );
}

export class Auth0DesktopSession {
  private refreshToken: string | null = null;
  private access: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;
  /**
   * 진행 중인 로그인·가입. 입력이 똑같은 중복 제출만 이 결과를 함께 받고,
   * 다른 입력은 이게 끝난 뒤 따로 처리한다.
   */
  private attempt: { key: string; promise: Promise<void> } | null = null;
  /**
   * 세션 번호. 로그인·로그아웃마다 올리고 토큰 갱신으로는 바꾸지 않는다.
   * 그 사이에 끝난 요청 결과는 버리고, 화면은 이 번호로 토큰을 받는다.
   */
  private generation = 0;
  private restored: Promise<void> | null = null;
  /** 저장소 작업을 순서대로 하나씩 한다. */
  private storeQueue: Promise<void> = Promise.resolve();
  /** 이 프로세스가 저장소에서 마지막으로 읽었거나 쓴 refresh token. */
  private storedToken: string | null = null;

  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly endpointBaseUrl: string;
  private readonly storeWaitMs: number;

  constructor(private readonly options: Auth0DesktopSessionOptions) {
    // 브라우저의 fetch는 다른 객체의 메서드로 부르면 실패하므로 감싸 둔다.
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.endpointBaseUrl = (
      options.endpointBaseUrl ?? `https://${options.config.domain}`
    ).replace(/\/+$/, '');
    this.storeWaitMs = options.storeWaitMs ?? STORE_WAIT_MS;
  }

  /** 저장해 둔 refresh token을 한 번 읽는다. 다른 메서드도 먼저 이걸 기다린다. */
  ready(): Promise<void> {
    this.restored ??= this.restoreStoredSession();
    return this.restored;
  }

  /** 지금 세션 번호. 같은 번호인 동안은 같은 계정이다. */
  sessionId(): number {
    return this.generation;
  }

  async hasSession(): Promise<boolean> {
    await this.ready();
    return this.isSignedInNow();
  }

  /** 저장값을 읽은 뒤의 현재 로그인 여부(동기). 읽기 전이면 false다. */
  isSignedInNow(): boolean {
    return Boolean(
      this.refreshToken || (this.access && this.access.expiresAt > this.now()),
    );
  }

  /**
   * 아이디·비밀번호로 로그인한다. 실패하면 화면에 보여 줄 문구를 담은
   * Auth0LoginError를 던진다.
   *
   * 같은 입력의 중복 제출은 진행 중인 결과를 함께 받는다. 다른 계정이나 다른
   * 비밀번호는 결과를 공유하면 안 된다(그 계정으로 로그인됐다고 잘못 알리게 된다).
   * 그래서 앞의 로그인이 끝난 뒤 따로 처리한다.
   *
   * 이미 로그인된 상태에서는 다른 로그인을 받지 않는다('already-signed-in').
   * 계정은 로그아웃을 거쳐서만 바뀌므로, 화면의 계정과 토큰의 계정이 엇갈리지 않는다.
   */
  loginWithPassword(username: string, password: string): Promise<void> {
    return this.runAttempt(JSON.stringify(['login', username, password]), () =>
      this.performPasswordLogin(username, password),
    );
  }

  /**
   * Auth0 DB 연결에 계정을 만들고 바로 로그인한다. 실패하면 가입 화면에 보여 줄
   * 문구를 담은 Auth0SignupError를 던진다(이미 로그인된 상태면 Auth0LoginError).
   *
   * 로그인과 같은 규칙을 따른다. 입력이 똑같은 중복 제출만 결과를 함께 받고,
   * 로그인된 상태에서는 계정을 만들지 않는다.
   */
  signUpWithPassword(
    username: string,
    password: string,
    name: string,
  ): Promise<void> {
    return this.runAttempt(
      JSON.stringify(['signup', username, password, name]),
      () => this.performSignup(username, password, name),
    );
  }

  private runAttempt(key: string, run: () => Promise<void>): Promise<void> {
    const current = this.attempt;
    if (current && current.key === key) return current.promise;
    const previous = current
      ? current.promise.catch(() => undefined)
      : Promise.resolve();
    const promise = previous.then(run);
    const entry = { key, promise };
    this.attempt = entry;
    void promise
      .finally(() => {
        if (this.attempt === entry) this.attempt = null;
      })
      .catch(() => undefined);
    return promise;
  }

  /** 유효한 접근 토큰. 세션이 없거나 refresh token이 거절되면 null. */
  async getAccessToken(): Promise<string | null> {
    await this.ready();
    const access = this.access;
    if (access && access.expiresAt - this.now() > ACCESS_TOKEN_EXPIRY_MARGIN_MS) {
      return access.token;
    }
    if (!this.refreshToken) {
      return access && access.expiresAt > this.now() ? access.token : null;
    }
    if (this.refreshing) return this.refreshing;
    const run = this.refreshAccessToken().finally(() => {
      if (this.refreshing === run) this.refreshing = null;
    });
    this.refreshing = run;
    return run;
  }

  /**
   * 이 PC에서 로그아웃한다. refresh token은 Auth0에서도 폐기한다(실패해도 로컬은 지운다).
   *
   * expectedSessionId를 주면 그 세션이 지금 세션일 때만 로그아웃한다. 예전 계정을
   * 보여 주던 창의 늦은 로그아웃이 그사이 새로 로그인한 세션을 지우지 않게 한다.
   * 폐기 요청은 기다리지 않는다(최대 몇 초). 기다리는 동안 새 로그인이 끼어들 틈을
   * 줄이기 위해서다. 로컬 세션은 이미 지웠으므로 폐기가 늦어도 이 PC는 로그아웃 상태다.
   * 저장소 정리도 잠깐만 기다린다. 디스크가 느려도 정리는 순서대로 끝까지 간다.
   */
  async logout(expectedSessionId?: number): Promise<boolean> {
    await this.ready();
    if (expectedSessionId !== undefined && expectedSessionId !== this.generation) {
      return false;
    }
    const refreshToken = this.refreshToken;
    const cleared = this.endSession();
    if (refreshToken) void this.revoke(refreshToken);
    await this.waitBriefly(cleared);
    return true;
  }

  private async performPasswordLogin(
    username: string,
    password: string,
  ): Promise<void> {
    await this.ready();
    if (await this.hasSession()) {
      throw new Auth0LoginError(
        'already-signed-in',
        '이미 다른 창에서 로그인했습니다. 그 계정으로 계속합니다.',
      );
    }
    const { config } = this.options;
    let response: TokenResponse;
    try {
      response = await this.tokenRequest({
        grant_type: PASSWORD_REALM_GRANT,
        realm: config.realm,
        client_id: config.clientId,
        username,
        password,
        audience: config.audience,
        scope: config.scope,
      });
    } catch (error) {
      throw toLoginError(error);
    }
    if (!response.refresh_token) {
      throw new Auth0LoginError(
        'unknown',
        '로그인 유지 토큰을 받지 못했습니다. Auth0 API의 Allow Offline Access 설정을 확인해 주세요.',
      );
    }

    this.generation += 1;
    const generation = this.generation;
    this.refreshing = null;
    this.refreshToken = response.refresh_token;
    this.access = {
      token: response.access_token,
      expiresAt: this.now() + response.expires_in * 1000,
    };
    // 메모리에서 바뀐 순서대로 알린다. 저장은 그 뒤에 순서대로 한다.
    this.options.onSessionChanged?.(generation);
    await this.persist(generation, response.refresh_token);
  }

  private async refreshAccessToken(): Promise<string | null> {
    const generation = this.generation;
    if (!this.refreshToken) return null;

    // 실행 중인 다른 앱이 저장된 로그인을 바꿨으면 이 프로세스의 refresh token은 이미
    // 교체된 것이다. 그것을 보내면 Auth0가 재사용으로 보고 양쪽 로그인을 모두 끊는다.
    // 보내지 않고, 저장소도 건드리지 않고, 이 프로세스의 세션만 끝낸다.
    const replaced = await this.storedSessionReplacedElsewhere();
    if (generation !== this.generation) return null;
    if (replaced) {
      this.options.onSessionEnded?.('replaced');
      await this.waitBriefly(this.endSession({ keepStore: true }));
      return null;
    }
    const refreshToken = this.refreshToken;
    if (!refreshToken) return null;

    try {
      const response = await this.tokenRequest({
        grant_type: 'refresh_token',
        client_id: this.options.config.clientId,
        refresh_token: refreshToken,
      });
      if (generation !== this.generation) {
        // 기다리는 사이 로그아웃·재로그인했다. 새로 받은 토큰은 쓰지 않고 폐기한다.
        if (response.refresh_token) void this.revoke(response.refresh_token);
        return null;
      }
      if (response.refresh_token && response.refresh_token !== refreshToken) {
        this.refreshToken = response.refresh_token;
        await this.persist(generation, response.refresh_token);
        if (generation !== this.generation) {
          // 저장하는 사이 로그아웃했다. 방금 받은 토큰으로 로그인된 상태를 만들지 않는다.
          // 저장소는 순서대로 처리되므로 로그아웃의 지우기가 이 저장 뒤에 실행된다.
          void this.revoke(response.refresh_token);
          return null;
        }
      }
      this.access = {
        token: response.access_token,
        expiresAt: this.now() + response.expires_in * 1000,
      };
      return response.access_token;
    } catch (error) {
      if (generation !== this.generation) return null;
      if (
        error instanceof Auth0TokenError &&
        error.code !== null &&
        SESSION_ENDING_TOKEN_ERRORS.has(error.code)
      ) {
        // 만료·폐기·재사용 감지·계정 차단. 이 PC의 로그인은 끝났다.
        // 차단된 계정의 갱신에 Auth0는 403 invalid_grant "user is blocked"로 답한다.
        this.options.onSessionEnded?.(
          /blocked/i.test(error.description ?? '') ? 'blocked' : 'expired',
        );
        await this.waitBriefly(this.endSession());
        return null;
      }
      // 네트워크·일시 오류는 세션을 유지한다. 아직 쓸 수 있는 토큰이 있으면 쓴다.
      const access = this.access;
      return access && access.expiresAt > this.now() ? access.token : null;
    }
  }

  private async performSignup(
    username: string,
    password: string,
    name: string,
  ): Promise<void> {
    await this.ready();
    if (this.isSignedInNow()) {
      throw new Auth0LoginError(
        'already-signed-in',
        '이미 로그인되어 있습니다. 로그아웃한 뒤 가입해 주세요.',
      );
    }
    const { config } = this.options;
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.endpointBaseUrl}/dbconnections/signup`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            connection: config.realm,
            username,
            password,
            ...(name ? { name } : {}),
          }),
          signal: AbortSignal.timeout(SIGNUP_REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new Auth0SignupError(
        'network',
        '가입 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
      );
    }
    if (!response.ok) {
      throw toSignupError(response.status, await response.json().catch(() => null));
    }
    try {
      await this.performPasswordLogin(username, password);
    } catch (error) {
      // 계정은 이미 있다. 같은 아이디로 다시 가입하게 두지 않고 로그인으로 안내한다.
      const reason = toLoginError(error).reason;
      throw new Auth0SignupError(
        'created-but-login-failed',
        reason === 'network'
          ? '가입은 완료되었습니다. 인터넷 연결을 확인한 뒤 로그인 화면에서 로그인해 주세요.'
          : '가입은 완료되었습니다. 로그인 화면에서 로그인해 주세요.',
      );
    }
  }

  private async tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
    const response = await this.fetchImpl(
      `${this.endpointBaseUrl}/oauth/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      },
    );
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const payload = (json ?? {}) as Record<string, unknown>;
      throw new Auth0TokenError(
        response.status,
        typeof payload.error === 'string' ? payload.error : null,
        typeof payload.error_description === 'string'
          ? payload.error_description
          : null,
      );
    }
    if (!isTokenResponse(json)) {
      throw new Error('Auth0 토큰 응답 형식이 올바르지 않습니다.');
    }
    return json;
  }

  private async revoke(token: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.endpointBaseUrl}/oauth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: this.options.config.clientId, token }),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
    } catch {
      // 폐기는 최선 노력이다. 로컬 세션은 이미 지웠다.
    }
  }

  /**
   * 세션을 끝낸다. 메모리에서 먼저 끝내고 바로 알린 뒤, 저장소 정리를 줄에 세운다.
   * 저장소를 지우는 동안 새 로그인이 끝나도 그 알림은 이 알림 뒤에 가고, 새 로그인의
   * 저장은 이 지우기 뒤에 실행된다. 돌려주는 값은 저장소 정리가 끝나는 때다.
   */
  private endSession(options: { keepStore?: boolean } = {}): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    this.refreshToken = null;
    this.access = null;
    this.refreshing = null;
    this.options.onSessionChanged?.(generation);
    if (options.keepStore) return Promise.resolve();
    return this.enqueueStore(() => this.clearStore());
  }

  private async clearStore(): Promise<void> {
    try {
      await this.options.store.clear();
      this.storedToken = null;
    } catch (error) {
      console.warn('[auth0] failed to clear stored session', error);
    }
  }

  /**
   * 그 세션의 refresh token을 저장한다. 차례가 왔을 때 세션이 이미 바뀌었으면 저장하지
   * 않는다. 저장에 실패하면 파일에 남은 예전 토큰을 지운다: 그 토큰은 이미 교체됐고,
   * 다음 실행이 그것으로 갱신하면 Auth0가 재사용으로 보기 때문이다. 이번 실행은 메모리
   * 세션으로 계속 쓴다.
   */
  private persist(generation: number, refreshToken: string): Promise<void> {
    return this.enqueueStore(async () => {
      if (generation !== this.generation) return;
      try {
        await this.options.store.save({
          domain: this.options.config.domain,
          clientId: this.options.config.clientId,
          refreshToken,
        });
        this.storedToken = refreshToken;
      } catch (error) {
        console.warn('[auth0] failed to persist session', error);
        await this.clearStore();
      }
    });
  }

  /**
   * 저장소에 이 프로세스가 쓰지 않은 refresh token이 있는가. 앱은 한 번만 뜨게 돼
   * 있지만(main.ts), 그 잠금이 듣지 않는 환경에서도 두 프로세스가 서로의 로그인을
   * 끊지 않게 한다.
   */
  private storedSessionReplacedElsewhere(): Promise<boolean> {
    return this.enqueueStore(async () => {
      let onDisk: string | null;
      try {
        onDisk = (await this.options.store.load())?.refreshToken ?? null;
      } catch {
        return false;
      }
      return (
        onDisk !== null &&
        onDisk !== this.storedToken &&
        onDisk !== this.refreshToken
      );
    });
  }

  private enqueueStore<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.storeQueue.then(operation);
    this.storeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** 저장소 정리를 잠깐만 기다린다. 넘겨도 정리는 줄에서 계속된다. */
  private async waitBriefly(work: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      work.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.storeWaitMs);
      }),
    ]);
    clearTimeout(timer);
  }

  private async restoreStoredSession(): Promise<void> {
    try {
      const stored = await this.options.store.load();
      if (!stored) return;
      if (
        stored.domain === this.options.config.domain &&
        stored.clientId === this.options.config.clientId &&
        stored.refreshToken
      ) {
        this.refreshToken = stored.refreshToken;
        this.storedToken = stored.refreshToken;
        return;
      }
      // 다른 테넌트·앱의 토큰이다. 쓰지 않는다.
      await this.options.store.clear();
    } catch (error) {
      console.warn('[auth0] ignoring unreadable stored session', error);
      await this.options.store.clear().catch(() => undefined);
    }
  }
}
