import {
  authSessionPrincipal,
  type DesktopAuthLoginResult,
  type DesktopAuthRefreshResult,
  type DesktopAuthSignupResult,
  type DesktopAuthSessionSnapshot,
  type DesktopAuthStatus,
} from '../../common/desktopAuth';
import {
  SIGNUP_NAME_MAX_LENGTH,
  SIGNUP_PASSWORD_RULE,
  SIGNUP_USERNAME_RULE,
  isValidSignupUsername,
  meetsSignupPasswordPolicy,
  normalizeSignupUsername,
} from '../../common/signupRules';
import { Auth0SignupError, toLoginError } from './auth0DesktopSession';

/**
 * main 프로세스가 소유하는 로그인 세션 전체(토큰 + 로그인한 사용자).
 *
 * - 토큰은 provider(Auth0DesktopSession)가 갖고, 이 컨트롤러는 그 토큰으로
 *   서버의 `/auth/me`를 직접 불러 "누가 로그인했는지"까지 확인해 snapshot으로 둔다.
 * - 화면(셸·탭 화면·팝업 층)은 snapshot을 받아 그리기만 한다. 세션을 알리거나
 *   토큰을 대신 내주는 화면은 없다.
 * - 토큰은 "화면이 보여 주는 계정의 세션 번호"로만 내준다. 로그아웃·401 신고도
 *   세션 번호를 받아, 늦게 도착한 요청이 그사이 새로 로그인한 세션을 건드리지 못한다.
 * - 서버·네트워크 오류는 로그아웃이 아니다. refresh token을 그대로 두고
 *   `unreachable` 상태로 알린 뒤 자동으로 다시 확인한다. 서버의 401만 세션을 끝낸다.
 *
 * Electron에 의존하지 않는다. 창·IPC 연결은 windowManager가 한다.
 */

/** 토큰을 가진 쪽(Auth0DesktopSession)에서 이 컨트롤러가 쓰는 부분. */
export interface AuthProviderSession {
  ready(): Promise<void>;
  /** 로그인·로그아웃마다 바뀌는 번호. 토큰 갱신으로는 바뀌지 않는다. */
  sessionId(): number;
  isSignedInNow(): boolean;
  loginWithPassword(username: string, password: string): Promise<void>;
  /** 계정을 만들고 바로 로그인한다. 로그인된 상태에서는 만들지 않는다. */
  signUpWithPassword(username: string, password: string, name: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  /** expectedSessionId가 지금 세션일 때만 로그아웃한다. 했으면 true. */
  logout(expectedSessionId?: number): Promise<boolean>;
}

/** provider가 세션을 저절로 끝낸 이유. 없으면 만료로 본다. */
export type ProviderSessionEndReason = 'expired' | 'blocked' | 'replaced';

export interface AuthProviderCallbacks {
  /**
   * refresh token이 거절되어 provider가 세션을 끝낸다(만료·폐기·계정 차단 등).
   * 세션 번호가 바뀌기 직전이나 직후에 온다.
   */
  onSessionEnded: (reason?: ProviderSessionEndReason) => void;
  /** 로그인·로그아웃으로 세션 번호가 바뀌었다. */
  onSessionChanged: (sessionId: number) => void;
}

export type SessionUserResult =
  | { kind: 'ok'; user: unknown }
  /** 서버가 이 계정의 토큰을 거절했다(차단·연결 안 됨). 세션을 끝낸다. */
  | { kind: 'unauthorized'; message: string | null }
  /** 서버에 닿지 못했거나 서버 오류다. 세션은 그대로 둔다. */
  | { kind: 'unreachable' };

export interface DesktopAuthControllerOptions {
  createProvider: (callbacks: AuthProviderCallbacks) => AuthProviderSession;
  /** 접근 토큰으로 `GET /auth/me`를 부른다. */
  fetchUser: (accessToken: string) => Promise<SessionUserResult>;
  /** snapshot이 바뀔 때마다 부른다. 화면에 알리고 계정 경계를 정리하는 데 쓴다. */
  onChange?: (
    next: DesktopAuthSessionSnapshot,
    previous: DesktopAuthSessionSnapshot,
  ) => void;
  /** `unreachable`에서 자동으로 다시 확인하는 간격. 마지막 값을 계속 쓴다. */
  retryDelaysMs?: readonly number[];
  /** 401 신고로 확인이 끝난 뒤 이 시간 안의 신고는 다시 확인하지 않는다. */
  unauthorizedRecheckCooldownMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000] as const;
const DEFAULT_UNAUTHORIZED_RECHECK_COOLDOWN_MS = 5_000;

const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
const ACCOUNT_BLOCKED_MESSAGE =
  '사용이 중지된 계정입니다. 사장님(관리자)에게 문의해 주세요.';
const SESSION_REPLACED_MESSAGE =
  '이 PC에서 실행 중인 다른 에스테잇플로우가 로그인을 바꿨습니다. 다시 로그인해 주세요.';
const ACCOUNT_REJECTED_MESSAGE =
  '이 계정으로 로그인할 수 없습니다. 사장님(관리자)에게 문의해 주세요.';
const LOGIN_NOT_COMPLETED_MESSAGE = '로그인하지 못했습니다. 다시 시도해 주세요.';
const NOT_SIGNED_IN_MESSAGE = '로그인 상태가 아닙니다.';
const SERVER_UNREACHABLE_MESSAGE =
  '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

type SnapshotFields = Pick<
  DesktopAuthSessionSnapshot,
  'status' | 'user' | 'providerSessionId' | 'error'
>;

type VerifyOutcome = SessionUserResult['kind'] | 'stale';

function cloneSnapshot(
  snapshot: DesktopAuthSessionSnapshot,
): DesktopAuthSessionSnapshot {
  return structuredClone(snapshot);
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export class DesktopAuthController {
  private readonly provider: AuthProviderSession;
  private snapshot: DesktopAuthSessionSnapshot = {
    status: 'loading',
    authenticated: false,
    user: null,
    revision: 0,
    providerSessionId: null,
    error: null,
  };

  private started: Promise<void> | null = null;
  /** 지금 세션의 사용자를 처음 확인하는 중인 작업(로그인 직후, 복원, 재시도). */
  private confirming: { sessionId: number; promise: Promise<void> } | null = null;
  /** 이미 로그인된 세션의 사용자를 다시 확인하는 중인 작업(새로 고침, 401 신고). */
  private verifying: { sessionId: number; promise: Promise<VerifyOutcome> } | null =
    null;
  private lastVerifiedOkAt: { sessionId: number; at: number } | null = null;
  /** 다음에 signed-out으로 바뀔 때 로그인 화면에 보여 줄 문구. */
  private nextSignedOutError: string | null = null;
  private retryTimer: unknown = null;
  private retryAttempt = 0;
  private disposed = false;

  private readonly retryDelaysMs: readonly number[];
  private readonly recheckCooldownMs: number;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: DesktopAuthControllerOptions) {
    this.retryDelaysMs =
      options.retryDelaysMs && options.retryDelaysMs.length > 0
        ? options.retryDelaysMs
        : DEFAULT_RETRY_DELAYS_MS;
    this.recheckCooldownMs =
      options.unauthorizedRecheckCooldownMs ??
      DEFAULT_UNAUTHORIZED_RECHECK_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.provider = options.createProvider({
      onSessionEnded: (reason) => this.handleProviderSessionEnded(reason),
      onSessionChanged: (sessionId) => this.handleProviderSessionChanged(sessionId),
    });
  }

  /**
   * 저장된 로그인을 읽고, 있으면 사용자를 확인한다. 여러 번 불러도 한 번만 한다.
   * 끝나기 전의 snapshot은 `loading`이다.
   */
  start(): Promise<void> {
    this.started ??= (async () => {
      await this.provider.ready();
      if (this.disposed) return;
      if (!this.provider.isSignedInNow()) {
        this.set({
          status: 'signed-out',
          user: null,
          providerSessionId: null,
          error: null,
        });
        return;
      }
      await this.confirm(this.provider.sessionId());
    })();
    return this.started;
  }

  getSnapshot(): DesktopAuthSessionSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  isAuthenticated(): boolean {
    return this.snapshot.authenticated;
  }

  /** 로그인한 사람·사무소의 열쇠. 로그인 상태가 아니면 null. */
  principal(): string | null {
    return authSessionPrincipal(this.snapshot);
  }

  /**
   * 아이디·비밀번호로 로그인하고 사용자를 확인한다. 비밀번호는 이 호출 안에서만
   * 쓴다. Auth0가 받아 준 뒤 서버에 닿지 못하면 로그인은 유지되고(`unreachable`)
   * 결과는 ok다. 화면은 snapshot을 보고 다시 시도 안내를 띄운다.
   */
  async login(username: string, password: string): Promise<DesktopAuthLoginResult> {
    await this.start();
    try {
      await this.provider.loginWithPassword(username, password);
    } catch (error) {
      const loginError = toLoginError(error);
      if (loginError.reason === 'already-signed-in') {
        // 다른 창이 먼저 로그인했다. 계정은 로그아웃으로만 바뀌므로 그 세션을 따른다.
        // 이 요청이 보낸 아이디·비밀번호로 로그인한 것이 아니므로 성공이라고 답하지 않는다.
        // 창은 세션 알림을 받아 먼저 로그인한 계정의 화면으로 넘어간다.
        await this.confirmCurrentSession();
      }
      return { ok: false, error: loginError.message };
    }
    await this.confirm(this.provider.sessionId());
    return this.loginOutcome();
  }

  /**
   * 사장님 가입: 계정을 만들고 바로 로그인한 뒤 사용자를 확인한다. 처음 확인할 때
   * 서버가 사무소 없는 owner를 만들고, 화면은 이어서 사무소 만들기로 간다.
   *
   * 서버가 그 아이디를 받아 주지 않으면(이미 쓰는 아이디 등 401) 세션을 끝내고
   * 서버의 안내 문구를 돌려준다. 사용자는 다른 아이디로 다시 가입하면 된다.
   */
  async signup(
    username: string,
    password: string,
    name: string,
  ): Promise<DesktopAuthSignupResult> {
    await this.start();
    const normalizedUsername = normalizeSignupUsername(username);
    const trimmedName = name.trim();
    if (!isValidSignupUsername(normalizedUsername)) {
      return { ok: false, error: SIGNUP_USERNAME_RULE };
    }
    if (!meetsSignupPasswordPolicy(password)) {
      return { ok: false, error: SIGNUP_PASSWORD_RULE };
    }
    if (trimmedName.length > SIGNUP_NAME_MAX_LENGTH) {
      return {
        ok: false,
        error: `이름은 ${SIGNUP_NAME_MAX_LENGTH}자까지 입력할 수 있습니다.`,
      };
    }
    try {
      await this.provider.signUpWithPassword(
        normalizedUsername,
        password,
        trimmedName,
      );
    } catch (error) {
      if (error instanceof Auth0SignupError) {
        return {
          ok: false,
          error: error.message,
          ...(error.reason === 'created-but-login-failed'
            ? { continueAtLogin: true }
            : {}),
        };
      }
      // 로그인된 상태에서는 계정을 만들지 않는다. 계정은 로그아웃으로만 바뀐다.
      return { ok: false, error: toLoginError(error).message };
    }
    await this.confirm(this.provider.sessionId());
    return this.loginOutcome();
  }

  /**
   * 화면이 보여 주던 세션(sessionId)이 지금 세션일 때만 로그아웃한다. 예전 계정을
   * 보여 주던 화면의 늦은 로그아웃은 새로 로그인한 세션을 지우지 않는다.
   */
  async logout(sessionId: number | null): Promise<void> {
    await this.start();
    if (sessionId === null) return;
    await this.provider.logout(sessionId);
  }

  /**
   * 서버에서 사용자 정보를 새로 받는다(사무소 생성, 내 정보 수정 뒤). 이미 진행
   * 중인 확인이 있어도 그 결과를 쓰지 않고 그 뒤에 새로 받는다.
   */
  async refreshUser(): Promise<DesktopAuthRefreshResult> {
    await this.start();
    const { status, providerSessionId } = this.snapshot;
    if (status !== 'signed-in' || providerSessionId === null) {
      return { ok: false, error: NOT_SIGNED_IN_MESSAGE, snapshot: this.getSnapshot() };
    }
    const outcome = await this.verify(providerSessionId, { fresh: true });
    if (outcome === 'ok') return { ok: true, snapshot: this.getSnapshot() };
    return {
      ok: false,
      error:
        outcome === 'unreachable'
          ? SERVER_UNREACHABLE_MESSAGE
          : (this.snapshot.error ?? NOT_SIGNED_IN_MESSAGE),
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * 화면이 bearer를 실어 보낸 요청에서 401을 받았다. 화면 말을 그대로 믿지 않고
   * main이 `/auth/me`로 직접 확인한다. 거기서도 401이고 그 세션이 아직 지금
   * 세션일 때만 로그아웃한다.
   */
  async reportUnauthorized(sessionId: number | null): Promise<void> {
    await this.start();
    if (
      sessionId === null ||
      this.snapshot.status !== 'signed-in' ||
      this.snapshot.providerSessionId !== sessionId ||
      !this.isCurrent(sessionId)
    ) {
      return;
    }
    const lastOk = this.lastVerifiedOkAt;
    if (
      lastOk &&
      lastOk.sessionId === sessionId &&
      this.now() - lastOk.at < this.recheckCooldownMs
    ) {
      return;
    }
    await this.verify(sessionId, { fresh: false });
  }

  /** `unreachable`에서 사용자가 "다시 시도"를 눌렀다. */
  async retry(): Promise<void> {
    await this.start();
    const { status, providerSessionId } = this.snapshot;
    if (status !== 'unreachable' || providerSessionId === null) return;
    await this.confirm(providerSessionId);
  }

  /**
   * 화면이 보여 주는 세션(scopeSessionId)의 접근 토큰. 그 세션의 사용자가 확인된
   * 상태이고 아직 지금 세션일 때만 준다. 갱신을 기다리는 사이 세션이 바뀌어도 주지 않는다.
   */
  async getAccessToken(scopeSessionId: number | null): Promise<string | null> {
    if (!this.mayUseToken(scopeSessionId)) return null;
    const token = await this.provider.getAccessToken();
    return this.mayUseToken(scopeSessionId) ? token : null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearRetry();
  }

  private mayUseToken(scopeSessionId: number | null): boolean {
    return (
      scopeSessionId !== null &&
      this.snapshot.status === 'signed-in' &&
      this.snapshot.providerSessionId === scopeSessionId &&
      this.isCurrent(scopeSessionId)
    );
  }

  private isCurrent(sessionId: number): boolean {
    return (
      !this.disposed &&
      this.provider.isSignedInNow() &&
      this.provider.sessionId() === sessionId
    );
  }

  private loginOutcome(): DesktopAuthLoginResult {
    if (this.snapshot.status === 'signed-out') {
      return {
        ok: false,
        error: this.snapshot.error ?? LOGIN_NOT_COMPLETED_MESSAGE,
      };
    }
    return { ok: true };
  }

  private async confirmCurrentSession(): Promise<void> {
    if (this.confirming) {
      await this.confirming.promise;
      return;
    }
    if (this.provider.isSignedInNow() && this.snapshot.status !== 'signed-in') {
      await this.confirm(this.provider.sessionId());
    }
  }

  /** 세션의 사용자를 확인해 snapshot을 정한다. 같은 세션의 확인은 하나만 돈다. */
  private confirm(sessionId: number): Promise<void> {
    if (this.confirming?.sessionId === sessionId) return this.confirming.promise;
    this.clearRetry();
    const promise = this.runConfirm(sessionId).finally(() => {
      if (this.confirming?.promise === promise) this.confirming = null;
    });
    this.confirming = { sessionId, promise };
    return promise;
  }

  private async runConfirm(sessionId: number): Promise<void> {
    if (!this.isCurrent(sessionId)) return;
    const retrying =
      this.snapshot.status === 'unreachable' &&
      this.snapshot.providerSessionId === sessionId;
    // 다시 시도하는 동안은 안내 화면을 그대로 둔다(로딩과 번갈아 깜빡이지 않게).
    if (!retrying) {
      this.set({
        status: 'loading',
        user: null,
        providerSessionId: sessionId,
        error: null,
      });
    }

    const result = await this.fetchCurrentUser(sessionId);
    // null: 기다리는 사이 세션이 끝났거나 바뀌었다. 바꾼 쪽이 snapshot을 정했다.
    if (result === null) return;

    if (result.kind === 'ok') {
      this.retryAttempt = 0;
      this.lastVerifiedOkAt = { sessionId, at: this.now() };
      this.set({
        status: 'signed-in',
        user: result.user,
        providerSessionId: sessionId,
        error: null,
      });
      return;
    }
    if (result.kind === 'unauthorized') {
      await this.endRejectedSession(sessionId, result.message);
      return;
    }
    this.set({
      status: 'unreachable',
      user: null,
      providerSessionId: sessionId,
      error: null,
    });
    this.scheduleRetry(sessionId);
  }

  /**
   * 이미 로그인된 세션의 사용자를 다시 확인한다.
   * fresh=false(401 신고)는 진행 중인 확인에 합류하고, fresh=true(새로 고침)는
   * 진행 중인 확인이 끝난 뒤 서버에서 새로 받는다.
   */
  private async verify(
    sessionId: number,
    { fresh }: { fresh: boolean },
  ): Promise<VerifyOutcome> {
    const current = this.verifying;
    if (current?.sessionId === sessionId) {
      if (!fresh) return current.promise;
      await current.promise.catch(() => undefined);
      if (this.verifying && this.verifying !== current) {
        return this.verify(sessionId, { fresh });
      }
    }
    const promise = this.runVerify(sessionId).finally(() => {
      if (this.verifying?.promise === promise) this.verifying = null;
    });
    this.verifying = { sessionId, promise };
    return promise;
  }

  private async runVerify(sessionId: number): Promise<VerifyOutcome> {
    const result = await this.fetchCurrentUser(sessionId);
    if (result === null) return 'stale';
    if (result.kind === 'ok') {
      this.lastVerifiedOkAt = { sessionId, at: this.now() };
      if (
        this.snapshot.status === 'signed-in' &&
        this.snapshot.providerSessionId === sessionId &&
        !sameJson(this.snapshot.user, result.user)
      ) {
        this.set({
          status: 'signed-in',
          user: result.user,
          providerSessionId: sessionId,
          error: null,
        });
      }
    } else if (result.kind === 'unauthorized') {
      await this.endRejectedSession(sessionId, result.message);
    }
    // unreachable: 이미 확인된 사용자를 그대로 둔다. 서버 장애는 로그아웃이 아니다.
    return result.kind;
  }

  private async fetchCurrentUser(
    sessionId: number,
  ): Promise<SessionUserResult | null> {
    let token: string | null;
    try {
      token = await this.provider.getAccessToken();
    } catch {
      token = null;
    }
    if (!this.isCurrent(sessionId)) return null;
    // 로그인은 있는데 토큰을 못 받았다: 로그인 서버에 닿지 못한 경우다.
    if (!token) return { kind: 'unreachable' };
    let result: SessionUserResult;
    try {
      result = await this.options.fetchUser(token);
    } catch {
      result = { kind: 'unreachable' };
    }
    return this.isCurrent(sessionId) ? result : null;
  }

  /** 서버가 계정을 거절했다. 그 세션이 아직 지금 세션일 때만 끝낸다. */
  private async endRejectedSession(
    sessionId: number,
    message: string | null,
  ): Promise<void> {
    this.nextSignedOutError = message?.trim() || ACCOUNT_REJECTED_MESSAGE;
    const ended = await this.provider.logout(sessionId);
    if (!ended) this.nextSignedOutError = null;
  }

  private handleProviderSessionChanged(sessionId: number): void {
    this.clearRetry();
    this.retryAttempt = 0;
    this.lastVerifiedOkAt = null;
    if (this.provider.isSignedInNow()) {
      // 새 로그인. 사용자는 login()이 이어서 확인한다.
      this.nextSignedOutError = null;
      this.set({
        status: 'loading',
        user: null,
        providerSessionId: sessionId,
        error: null,
      });
      return;
    }
    const error = this.nextSignedOutError;
    this.nextSignedOutError = null;
    this.set({ status: 'signed-out', user: null, providerSessionId: null, error });
  }

  private handleProviderSessionEnded(reason?: ProviderSessionEndReason): void {
    const message =
      reason === 'blocked'
        ? ACCOUNT_BLOCKED_MESSAGE
        : reason === 'replaced'
          ? SESSION_REPLACED_MESSAGE
          : SESSION_EXPIRED_MESSAGE;
    if (this.snapshot.status === 'signed-out') {
      // provider가 세션을 먼저 지우고 이유를 알려 준 경우.
      if (this.snapshot.error === null) {
        this.set({ ...this.fields(), error: message });
      }
      return;
    }
    // 곧 세션 번호가 바뀐다. 그때 로그인 화면에 이 이유를 보여 준다.
    // 서버가 준 안내가 이미 있으면 그것이 더 구체적이다.
    this.nextSignedOutError ??= message;
  }

  private scheduleRetry(sessionId: number): void {
    this.clearRetry();
    const delay =
      this.retryDelaysMs[
        Math.min(this.retryAttempt, this.retryDelaysMs.length - 1)
      ] ?? DEFAULT_RETRY_DELAYS_MS[0];
    this.retryAttempt += 1;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (
        this.snapshot.status === 'unreachable' &&
        this.snapshot.providerSessionId === sessionId
      ) {
        void this.confirm(sessionId);
      }
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer === null) return;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  private fields(): SnapshotFields {
    const { status, user, providerSessionId, error } = this.snapshot;
    return { status, user, providerSessionId, error };
  }

  private set(next: SnapshotFields): void {
    const previous = this.snapshot;
    if (
      previous.status === next.status &&
      previous.providerSessionId === next.providerSessionId &&
      previous.error === next.error &&
      sameJson(previous.user, next.user)
    ) {
      return;
    }
    const status: DesktopAuthStatus = next.status;
    this.snapshot = {
      status,
      authenticated: status === 'signed-in',
      user: status === 'signed-in' ? next.user : null,
      revision: previous.revision + 1,
      providerSessionId: next.providerSessionId,
      error: next.error,
    };
    try {
      this.options.onChange?.(cloneSnapshot(this.snapshot), cloneSnapshot(previous));
    } catch (error) {
      console.warn('[auth] session change listener failed', error);
    }
  }
}
