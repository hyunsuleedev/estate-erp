import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveAuth0DesktopConfig,
  resolveMainAuth0Config,
} from '../src/common/auth0DesktopConfig';
import { parseAuthCredentials } from '../src/common/desktopAuth';
import {
  SIGNUP_PASSWORD_RULE,
  SIGNUP_USERNAME_RULE,
  isValidSignupUsername,
  meetsSignupPasswordPolicy,
  normalizeSignupUsername,
} from '../src/common/signupRules';
import {
  Auth0DesktopSession,
  Auth0LoginError,
  Auth0SignupError,
  toSignupError,
  type Auth0SessionEndReason,
  type Auth0TokenStore,
  type StoredAuth0Session,
} from '../src/main/auth/auth0DesktopSession';
import { canPersistWithSafeStorage } from '../src/main/auth/tokenStorePolicy';

const config = resolveAuth0DesktopConfig({});

function defined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'expected a value');
  return value;
}

class MemoryStore implements Auth0TokenStore {
  saved: StoredAuth0Session | null;
  constructor(initial: StoredAuth0Session | null = null) {
    this.saved = initial;
  }
  async load() {
    return this.saved;
  }
  async save(session: StoredAuth0Session) {
    this.saved = { ...session };
  }
  async clear() {
    this.saved = null;
  }
}

interface RecordedRequest {
  url: string;
  body: Record<string, string>;
}

type FakeResponse = { status: number; body: unknown } | (() => Promise<never>);

/** Auth0 토큰 서버 흉내. 토큰 응답은 차례대로 꺼내 쓰고, 폐기 요청은 늘 성공한다. */
function fakeAuth0(responses: FakeResponse[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    if (url.endsWith('/oauth/revoke')) return new Response('{}', { status: 200 });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected token request: ${url}`);
    if (typeof next === 'function') return next();
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const tokens = (access: string, refresh: string) => ({
  status: 200,
  body: { access_token: access, refresh_token: refresh, expires_in: 900 },
});

const storedSession = (refreshToken: string): StoredAuth0Session => ({
  domain: config.domain,
  clientId: config.clientId,
  refreshToken,
});

describe('Auth0 desktop config and login input', () => {
  it('uses the trial tenant as the development default', () => {
    assert.equal(config.domain, 'estait.jp.auth0.com');
    assert.equal(config.audience, 'https://api.estaitt.com');
    assert.equal(config.realm, 'Username-Password-Authentication');
    assert.match(config.scope, /offline_access/);
    assert.equal(
      resolveAuth0DesktopConfig({ ESTATE_AUTH0_DOMAIN: 'https://other.auth0.com/' }).domain,
      'other.auth0.com',
    );
  });

  it('takes the tenant from the build and ignores the runtime environment once packaged', () => {
    const build = {
      domain: 'https://login.estaitt.com/',
      clientId: 'prod-client',
      audience: 'https://api.estaitt.com',
      realm: 'Staff',
    };
    const hostile = {
      ESTATE_AUTH0_DOMAIN: 'evil.example',
      ESTATE_AUTH0_CLIENT_ID: 'evil-client',
      ESTATE_AUTH0_AUDIENCE: 'https://evil.example/api',
      ESTATE_AUTH0_REALM: 'Evil',
    };

    // 패키지 앱: 로그인 정보가 갈 곳은 빌드할 때 정한 값뿐이다.
    assert.deepEqual(
      resolveMainAuth0Config({ build, runtimeEnv: hostile, packaged: true }),
      {
        domain: 'login.estaitt.com',
        clientId: 'prod-client',
        audience: 'https://api.estaitt.com',
        realm: 'Staff',
        scope: config.scope,
      },
    );
    // 빌드 값을 정하지 않은 패키지 앱도 실행 환경을 듣지 않는다(시험 테넌트로 간다).
    assert.deepEqual(
      resolveMainAuth0Config({ build: {}, runtimeEnv: hostile, packaged: true }),
      config,
    );
    // 개발 실행에서는 실행 환경 변수로 빌드 값을 덮어쓸 수 있다.
    const dev = resolveMainAuth0Config({
      build,
      runtimeEnv: { ESTATE_AUTH0_DOMAIN: 'dev-tenant.auth0.com' },
      packaged: false,
    });
    assert.equal(dev.domain, 'dev-tenant.auth0.com');
    assert.equal(dev.clientId, 'prod-client');
    // 비어 있는 값은 정하지 않은 것으로 본다.
    assert.equal(
      resolveMainAuth0Config({ build: { domain: '  ' }, runtimeEnv: {}, packaged: true }).domain,
      config.domain,
    );
  });

  it('keeps the refresh token off the disk when the OS cannot really encrypt it', () => {
    const answer = (platform: string, backend: string | null, encryptionAvailable = true) =>
      canPersistWithSafeStorage({ encryptionAvailable, platform, backend });
    assert.equal(answer('darwin', null), true);
    assert.equal(answer('win32', null), true);
    assert.equal(answer('linux', 'gnome_libsecret'), true);
    assert.equal(answer('linux', 'kwallet6'), true);
    // Linux에 비밀 저장소가 없으면 고정된 비밀번호로 가리기만 한다.
    assert.equal(answer('linux', 'basic_text'), false);
    assert.equal(answer('darwin', null, false), false);
  });

  it('accepts login input only with an ID and a password, without altering the password', () => {
    assert.deepEqual(parseAuthCredentials({ username: ' hyunsu ', password: ' pw ' }), {
      username: 'hyunsu',
      password: ' pw ',
    });
    for (const value of [
      null,
      { username: 'hyunsu' },
      { username: '  ', password: 'pw' },
      { username: 'hyunsu', password: '' },
      { username: 'x'.repeat(129), password: 'pw' },
      { username: 1, password: 'pw' },
    ]) {
      assert.equal(parseAuthCredentials(value), null, JSON.stringify(value));
    }
  });
});

describe('Auth0DesktopSession password login', () => {
  it('signs in through the password realm for our API and stores only the refresh token', async () => {
    const store = new MemoryStore();
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1')]);
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });

    await session.loginWithPassword('hyunsu', 'secret');

    const request = defined(requests[0]);
    assert.equal(request.url, 'https://estait.jp.auth0.com/oauth/token');
    assert.deepEqual(request.body, {
      grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
      realm: 'Username-Password-Authentication',
      client_id: config.clientId,
      username: 'hyunsu',
      password: 'secret',
      audience: 'https://api.estaitt.com',
      scope: 'openid profile offline_access',
    });
    assert.equal(await session.getAccessToken(), 'at-1');
    assert.deepEqual(store.saved, storedSession('rt-1'));
    assert.ok(!JSON.stringify(store.saved).includes('secret'));
  });

  it('turns Auth0 errors into messages for the login screen', async () => {
    const cases: Array<[FakeResponse, Auth0LoginError['reason']]> = [
      [{ status: 403, body: { error: 'invalid_grant', error_description: 'Wrong email or password.' } }, 'invalid-credentials'],
      [{ status: 403, body: { error: 'invalid_grant', error_description: 'user is blocked' } }, 'blocked'],
      [{ status: 429, body: { error: 'too_many_attempts', error_description: 'blocked after multiple attempts' } }, 'too-many-attempts'],
      [{ status: 403, body: { error: 'mfa_required', mfa_token: 'x' } }, 'mfa-required'],
      [() => Promise.reject(new TypeError('fetch failed')), 'network'],
    ];
    for (const [response, reason] of cases) {
      const store = new MemoryStore();
      const { fetchImpl } = fakeAuth0([response]);
      const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });
      await assert.rejects(session.loginWithPassword('hyunsu', 'wrong'), (error: unknown) => {
        assert.ok(error instanceof Auth0LoginError);
        assert.equal(error.reason, reason);
        assert.match(error.message, /[가-힣]/);
        return true;
      });
      assert.equal(store.saved, null);
      assert.equal(await session.hasSession(), false);
    }
  });

  it('shares one in-flight login only between identical double submits', async () => {
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1')]);
    const session = new Auth0DesktopSession({ config, store: new MemoryStore(), fetch: fetchImpl });
    await Promise.all([
      session.loginWithPassword('hyunsu', 'secret'),
      session.loginWithPassword('hyunsu', 'secret'),
    ]);
    assert.equal(requests.length, 1);
  });

  it('never reports another account’s login result to a concurrent caller', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const usernames: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
      if (String(input).endsWith('/oauth/revoke')) return new Response('{}', { status: 200 });
      usernames.push(defined(body.username));
      if (body.username === 'hyunsu') {
        await firstGate;
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Wrong email or password.' }),
          { status: 403 },
        );
      }
      return new Response(
        JSON.stringify({ access_token: 'at-other', refresh_token: 'rt-other', expires_in: 900 }),
        { status: 200 },
      );
    }) as typeof fetch;
    const store = new MemoryStore();
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });

    // 창 A는 hyunsu(틀린 비밀번호), 창 B는 다른 계정으로 동시에 제출한다.
    const first = session.loginWithPassword('hyunsu', 'wrong');
    const second = session.loginWithPassword('other', 'secret');
    // 같은 아이디라도 비밀번호가 다르면(오타 수정 후 재제출) 따로 처리한다.
    const retry = session.loginWithPassword('hyunsu', 'corrected');
    await new Promise((resolve) => setImmediate(resolve));
    // 앞 요청이 끝나기 전에는 다음 계정 요청을 보내지 않는다.
    assert.deepEqual(usernames, ['hyunsu']);
    releaseFirst();

    await assert.rejects(first, (error: unknown) => {
      assert.ok(error instanceof Auth0LoginError);
      assert.equal(error.reason, 'invalid-credentials');
      return true;
    });
    await second;
    // 'other'가 로그인된 뒤라, 계정을 바꾸는 재제출은 로그아웃 전까지 받지 않는다.
    await assert.rejects(retry, (error: unknown) => {
      assert.ok(error instanceof Auth0LoginError);
      assert.equal(error.reason, 'already-signed-in');
      return true;
    });
    assert.deepEqual(usernames, ['hyunsu', 'other']);
    assert.equal(store.saved?.refreshToken, 'rt-other');
    assert.equal(await session.getAccessToken(), 'at-other');
  });

  it('refuses another login while signed in so accounts only change through logout', async () => {
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1'), tokens('at-2', 'rt-2')]);
    const store = new MemoryStore();
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });
    await session.loginWithPassword('hyunsu', 'secret');
    await assert.rejects(session.loginWithPassword('other', 'secret'), (error: unknown) => {
      assert.ok(error instanceof Auth0LoginError);
      assert.equal(error.reason, 'already-signed-in');
      return true;
    });
    assert.equal(requests.length, 1);
    assert.equal(store.saved?.refreshToken, 'rt-1');

    await session.logout();
    await session.loginWithPassword('other', 'secret');
    assert.equal(store.saved?.refreshToken, 'rt-2');
  });

  it('changes the session id on login and logout, not on token refresh', async () => {
    let now = 1_000_000;
    const { fetchImpl } = fakeAuth0([tokens('at-1', 'rt-1'), tokens('at-2', 'rt-2')]);
    const changes: number[] = [];
    const session = new Auth0DesktopSession({
      config,
      store: new MemoryStore(),
      fetch: fetchImpl,
      now: () => now,
      onSessionChanged: (id) => changes.push(id),
    });
    const initial = session.sessionId();

    await session.loginWithPassword('hyunsu', 'secret');
    const loggedIn = session.sessionId();
    assert.notEqual(loggedIn, initial);

    now += 900_000;
    assert.equal(await session.getAccessToken(), 'at-2');
    assert.equal(session.sessionId(), loggedIn);

    await session.logout();
    assert.notEqual(session.sessionId(), loggedIn);
    assert.deepEqual(changes, [loggedIn, session.sessionId()]);
  });
});

describe('Auth0DesktopSession tokens', () => {
  it('refreshes once for concurrent callers and stores the rotated token', async () => {
    const store = new MemoryStore(storedSession('rt-old'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: RecordedRequest[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
      await gate;
      return new Response(
        JSON.stringify({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 900 }),
        { status: 200 },
      );
    }) as typeof fetch;
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });

    const callers = [session.getAccessToken(), session.getAccessToken(), session.getAccessToken()];
    await new Promise((resolve) => setImmediate(resolve));
    release();
    assert.deepEqual(await Promise.all(callers), ['at-new', 'at-new', 'at-new']);
    // 교체(rotation) 중 같은 refresh token을 두 번 쓰면 Auth0가 계열 전체를 폐기한다.
    assert.equal(requests.length, 1);
    assert.equal(defined(requests[0]).body.refresh_token, 'rt-old');
    assert.equal(store.saved?.refreshToken, 'rt-new');
  });

  it('reuses an access token until a minute before it expires', async () => {
    let now = 1_000_000;
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1'), tokens('at-2', 'rt-2')]);
    const session = new Auth0DesktopSession({
      config,
      store: new MemoryStore(),
      fetch: fetchImpl,
      now: () => now,
    });
    await session.loginWithPassword('hyunsu', 'secret');

    now += 800_000;
    assert.equal(await session.getAccessToken(), 'at-1');
    now += 60_000;
    assert.equal(await session.getAccessToken(), 'at-2');
    assert.equal(defined(requests.at(-1)).body.refresh_token, 'rt-1');
  });

  it('ends the session and notifies when Auth0 rejects the refresh token', async () => {
    const store = new MemoryStore(storedSession('rt-revoked'));
    const { fetchImpl } = fakeAuth0([
      { status: 403, body: { error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' } },
    ]);
    const events: string[] = [];
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      onSessionEnded: (reason) => events.push(`ended:${reason}`),
      onSessionChanged: () => events.push(`changed:${session.isSignedInNow() ? 'in' : 'out'}`),
    });

    assert.equal(await session.getAccessToken(), null);
    // 이유를 먼저 알리고 바로 세션을 끝낸다. 화면은 한 번에 이유와 함께 로그아웃된다.
    assert.deepEqual(events, ['ended:expired', 'changed:out']);
    assert.equal(store.saved, null);
    assert.equal(await session.hasSession(), false);
  });

  it('ends the session as blocked when Auth0 says the user is blocked', async () => {
    // 실제 테넌트의 답: 차단된 계정의 refresh는 403 invalid_grant "user is blocked".
    const store = new MemoryStore(storedSession('rt-1'));
    const { fetchImpl } = fakeAuth0([
      { status: 403, body: { error: 'invalid_grant', error_description: 'user is blocked' } },
    ]);
    const reasons: Auth0SessionEndReason[] = [];
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      onSessionEnded: (reason) => reasons.push(reason),
    });

    assert.equal(await session.getAccessToken(), null);
    assert.deepEqual(reasons, ['blocked']);
    // 로그인된 것처럼 보이는데 토큰은 없는 상태로 남지 않는다.
    assert.equal(session.isSignedInNow(), false);
    assert.equal(store.saved, null);
  });

  it('ends the session when the app itself is no longer allowed, but not on a server error', async () => {
    const gone = new MemoryStore(storedSession('rt-1'));
    const refused = new Auth0DesktopSession({
      config,
      store: gone,
      fetch: fakeAuth0([{ status: 401, body: { error: 'invalid_client' } }]).fetchImpl,
    });
    assert.equal(await refused.getAccessToken(), null);
    assert.equal(refused.isSignedInNow(), false);

    const kept = new MemoryStore(storedSession('rt-1'));
    const flaky = new Auth0DesktopSession({
      config,
      store: kept,
      fetch: fakeAuth0([
        { status: 503, body: { error: 'temporarily_unavailable' } },
        { status: 429, body: { error: 'too_many_requests' } },
      ]).fetchImpl,
    });
    assert.equal(await flaky.getAccessToken(), null);
    assert.equal(await flaky.getAccessToken(), null);
    // 일시 오류는 로그아웃이 아니다. 저장된 로그인도 그대로다.
    assert.equal(flaky.isSignedInNow(), true);
    assert.equal(kept.saved?.refreshToken, 'rt-1');
  });

  it('keeps the session through a network failure', async () => {
    const store = new MemoryStore(storedSession('rt-1'));
    const { fetchImpl } = fakeAuth0([() => Promise.reject(new TypeError('fetch failed'))]);
    let ended = 0;
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      onSessionEnded: () => {
        ended += 1;
      },
    });

    assert.equal(await session.getAccessToken(), null);
    assert.equal(ended, 0);
    assert.equal(store.saved?.refreshToken, 'rt-1');
    assert.equal(await session.hasSession(), true);
  });

  it('ignores a stored token from another tenant or app', async () => {
    const store = new MemoryStore({ domain: 'other.auth0.com', clientId: config.clientId, refreshToken: 'rt-x' });
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: (async () => assert.fail('no token request expected')) as typeof fetch,
    });
    assert.equal(await session.hasSession(), false);
    assert.equal(store.saved, null);
  });

  it('logs out locally and revokes the refresh token', async () => {
    const store = new MemoryStore();
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1')]);
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });
    await session.loginWithPassword('hyunsu', 'secret');
    await session.logout();

    assert.equal(await session.getAccessToken(), null);
    assert.equal(store.saved, null);
    const revoke = requests.find((request) => request.url.endsWith('/oauth/revoke'));
    assert.equal(revoke?.body.token, 'rt-1');
  });

  it('ignores a late logout for a session that a new login already replaced', async () => {
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1'), tokens('at-2', 'rt-2')]);
    const store = new MemoryStore();
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });
    await session.loginWithPassword('hyunsu', 'secret');
    const first = session.sessionId();

    assert.equal(await session.logout(first), true);
    await session.loginWithPassword('hyunsu', 'secret');
    // 예전 창이 보여 주던 세션(first)으로 다시 로그아웃을 보내도 새 세션은 그대로다.
    assert.equal(await session.logout(first), false);
    assert.equal(session.isSignedInNow(), true);
    assert.equal(store.saved?.refreshToken, 'rt-2');
    assert.equal(await session.getAccessToken(), 'at-2');
    assert.ok(!requests.some((r) => r.url.endsWith('/oauth/revoke') && r.body.token === 'rt-2'));
  });

  it('finishes logout without waiting for Auth0 to confirm the revoke', async () => {
    const store = new MemoryStore(storedSession('rt-1'));
    let revokeStarted = false;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/oauth/revoke')) {
        revokeStarted = true;
        return new Promise<Response>(() => undefined); // 응답이 오지 않는 폐기 요청
      }
      throw new Error('unexpected token request');
    }) as typeof fetch;
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });

    assert.equal(await session.logout(session.sessionId()), true);
    assert.equal(revokeStarted, true);
    assert.equal(store.saved, null);
    assert.equal(session.isSignedInNow(), false);
  });

  it('drops a refresh that finishes after logout', async () => {
    const store = new MemoryStore(storedSession('rt-1'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const revoked: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
      if (String(input).endsWith('/oauth/revoke')) {
        revoked.push(defined(body.token));
        return new Response('{}', { status: 200 });
      }
      await gate;
      return new Response(
        JSON.stringify({ access_token: 'at-late', refresh_token: 'rt-late', expires_in: 900 }),
        { status: 200 },
      );
    }) as typeof fetch;
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl });

    const pending = session.getAccessToken();
    await new Promise((resolve) => setImmediate(resolve));
    await session.logout();
    release();

    assert.equal(await pending, null);
    assert.equal(store.saved, null);
    assert.equal(await session.hasSession(), false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(revoked.includes('rt-late'));
  });
});

/** 저장·지우기를 붙잡아 둘 수 있는 저장소. 일이 실제로 실행된 순서를 적는다. */
class GatedStore implements Auth0TokenStore {
  saved: StoredAuth0Session | null;
  readonly log: string[] = [];
  holdSave: Promise<void> | null = null;
  holdClear: Promise<void> | null = null;
  failSave = false;
  constructor(initial: StoredAuth0Session | null = null) {
    this.saved = initial;
  }
  async load() {
    return this.saved;
  }
  async save(session: StoredAuth0Session) {
    this.log.push(`save:${session.refreshToken}:start`);
    if (this.holdSave) await this.holdSave;
    if (this.failSave) {
      this.log.push(`save:${session.refreshToken}:failed`);
      throw new Error('disk full');
    }
    this.saved = { ...session };
    this.log.push(`save:${session.refreshToken}:done`);
  }
  async clear() {
    this.log.push('clear:start');
    if (this.holdClear) await this.holdClear;
    this.saved = null;
    this.log.push('clear:done');
  }
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

describe('Auth0DesktopSession: the stored login and a session that changes meanwhile', () => {
  it('never revives a login when logout lands while a rotated token is being saved', async () => {
    const store = new GatedStore(storedSession('rt-1'));
    const { fetchImpl, requests } = fakeAuth0([
      tokens('at-2', 'rt-2'),
      { status: 403, body: { error: 'invalid_grant', error_description: 'Wrong email or password.' } },
    ]);
    const changed: number[] = [];
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      storeWaitMs: 20,
      onSessionChanged: (sessionId) => changed.push(sessionId),
    });

    // 갱신으로 새 refresh token을 받았고, 그 저장이 끝나지 않고 있다.
    const saving = gate();
    store.holdSave = saving.promise;
    const pending = session.getAccessToken();
    await settle();
    assert.deepEqual(store.log, ['save:rt-2:start']);

    // 그사이 로그아웃한다. 디스크가 느려도 로그아웃은 끝난다.
    assert.equal(await session.logout(session.sessionId()), true);
    assert.equal(session.isSignedInNow(), false);

    saving.release();
    store.holdSave = null;
    assert.equal(await pending, null);
    await settle();

    // 지우기는 그 저장 뒤에 실행된다. 저장된 로그인도, 메모리의 접근 토큰도 남지 않는다.
    assert.deepEqual(store.log, ['save:rt-2:start', 'save:rt-2:done', 'clear:start', 'clear:done']);
    assert.equal(store.saved, null);
    assert.equal(session.isSignedInNow(), false);
    assert.equal(await session.getAccessToken(), null);
    const revoked = requests
      .filter((request) => request.url.endsWith('/oauth/revoke'))
      .map((request) => request.body.token);
    assert.ok(revoked.includes('rt-2'));

    // 다음 로그인은 어떤 아이디·비밀번호든 반드시 Auth0에 묻는다. 이전 계정으로 성공하지 않는다.
    await assert.rejects(
      session.loginWithPassword('someone-else', 'whatever'),
      (error: unknown) => error instanceof Auth0LoginError && error.reason === 'invalid-credentials',
    );
    const password = defined(requests.at(-1));
    assert.equal(password.body.username, 'someone-else');
    assert.match(defined(password.body.grant_type), /password-realm/);
    assert.equal(session.isSignedInNow(), false);
    assert.equal(changed.length, 1);
  });

  it('keeps a login that finishes while the previous session is still being cleared', async () => {
    const store = new GatedStore(storedSession('rt-old'));
    const { fetchImpl } = fakeAuth0([tokens('at-new', 'rt-new')]);
    const changed: Array<{ sessionId: number; signedIn: boolean }> = [];
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      storeWaitMs: 20,
      onSessionChanged: (sessionId) =>
        changed.push({ sessionId, signedIn: session.isSignedInNow() }),
    });
    await session.ready();

    // 지우기가 오래 걸리는 동안 새로 로그인한다.
    const clearing = gate();
    store.holdClear = clearing.promise;
    await session.logout(session.sessionId());
    const login = session.loginWithPassword('hyunsu', 'secret');
    await settle();
    const loggedInAs = session.sessionId();
    assert.equal(session.isSignedInNow(), true);

    clearing.release();
    store.holdClear = null;
    await login;
    await settle();

    // 알림은 세션 번호 순서대로 한 번씩이다. 늦게 끝난 지우기가 새 로그인을 다시 알리지 않는다.
    assert.deepEqual(changed, [
      { sessionId: loggedInAs - 1, signedIn: false },
      { sessionId: loggedInAs, signedIn: true },
    ]);
    // 새 로그인의 저장은 지우기 뒤에 실행됐다.
    assert.deepEqual(store.log, ['clear:start', 'clear:done', 'save:rt-new:start', 'save:rt-new:done']);
    assert.equal(store.saved?.refreshToken, 'rt-new');
    assert.equal(await session.getAccessToken(), 'at-new');
  });

  it('removes the stored token when saving the rotated one fails', async () => {
    let now = 1_000_000;
    const store = new GatedStore(storedSession('rt-1'));
    const { fetchImpl, requests } = fakeAuth0([tokens('at-2', 'rt-2'), tokens('at-3', 'rt-3')]);
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl, now: () => now });

    store.failSave = true;
    assert.equal(await session.getAccessToken(), 'at-2');
    // 파일에 남은 rt-1은 이미 교체됐다. 남겨 두면 다음 실행이 재사용으로 계열을 끊는다.
    assert.equal(store.saved, null);
    assert.deepEqual(store.log, ['save:rt-2:start', 'save:rt-2:failed', 'clear:start', 'clear:done']);

    // 이번 실행은 메모리의 로그인으로 계속 쓴다.
    store.failSave = false;
    now += 900_000;
    assert.equal(await session.getAccessToken(), 'at-3');
    assert.equal(defined(requests.at(-1)).body.refresh_token, 'rt-2');
    assert.equal(store.saved?.refreshToken, 'rt-3');
  });

  it('does not wait forever for the store when logging out', async () => {
    const store = new GatedStore(storedSession('rt-1'));
    const { fetchImpl } = fakeAuth0([]);
    const session = new Auth0DesktopSession({ config, store, fetch: fetchImpl, storeWaitMs: 10 });
    await session.ready();
    store.holdClear = new Promise<void>(() => undefined); // 끝나지 않는 지우기

    assert.equal(await session.logout(session.sessionId()), true);
    assert.equal(session.isSignedInNow(), false);
  });

  it('does not present a refresh token that another running copy has already replaced', async () => {
    // 한 사용자 데이터 폴더를 두 프로세스가 같이 쓴다. Auth0는 교체된 토큰을 다시 쓰면 계열을 끊는다.
    const store = new MemoryStore(storedSession('rt-1'));
    let current = 'rt-1';
    let familyRevoked = false;
    let issued = 1;
    const tokenRequests: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
      if (!url.endsWith('/oauth/token')) return new Response('{}', { status: 200 });
      tokenRequests.push(defined(body.refresh_token));
      if (familyRevoked || body.refresh_token !== current) {
        familyRevoked = true;
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }),
          { status: 403 },
        );
      }
      issued += 1;
      current = `rt-${issued}`;
      return new Response(
        JSON.stringify({ access_token: `at-${issued}`, refresh_token: current, expires_in: 900 }),
        { status: 200 },
      );
    }) as typeof fetch;
    let now = 0;
    const ended: string[] = [];
    const make = (name: string) =>
      new Auth0DesktopSession({
        config,
        store,
        fetch: fetchImpl,
        now: () => now,
        onSessionEnded: (reason) => ended.push(`${name}:${reason}`),
      });
    const first = make('first');
    const second = make('second');
    await first.ready();
    await second.ready();

    assert.equal(await first.getAccessToken(), 'at-2');
    // 두 번째 프로세스의 rt-1은 이미 교체됐다. 보내지 않고 자기 세션만 끝낸다.
    assert.equal(await second.getAccessToken(), null);
    assert.deepEqual(ended, ['second:replaced']);
    assert.deepEqual(tokenRequests, ['rt-1']);
    assert.equal(second.isSignedInNow(), false);
    // 저장된 로그인은 건드리지 않는다. 먼저 뜬 앱은 계속 쓴다.
    assert.equal(store.saved?.refreshToken, 'rt-2');
    now += 900_000;
    assert.equal(await first.getAccessToken(), 'at-3');
    assert.equal(familyRevoked, false);
    assert.equal(first.isSignedInNow(), true);
  });
});

describe('signup rules and Auth0 signup errors', () => {
  it('accepts the IDs the form promises and Auth0 stores', () => {
    assert.equal(normalizeSignupUsername('  Hyun.Su_01-a '), 'hyun.su_01-a');
    for (const ok of ['a', 'hyun.su_01-a', 'a'.repeat(30), '0123']) {
      assert.equal(isValidSignupUsername(ok), true, ok);
    }
    for (const bad of ['', 'a'.repeat(31), 'Hyunsu', '한글', 'has space', 'a@b.com', 'a+b']) {
      assert.equal(isValidSignupUsername(bad), false, bad);
    }
  });

  it('matches the tenant password policy: 8+ characters and three of four kinds', () => {
    for (const ok of ['Passw0rd', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefg!']) {
      assert.equal(meetsSignupPasswordPolicy(ok), true, ok);
    }
    // 실제 테넌트가 invalid_password로 거절한 입력들.
    for (const weak of ['abcdefgh', 'abcdefg1', 'Ab1!', 'ABCDEFGH1']) {
      assert.equal(meetsSignupPasswordPolicy(weak), false, weak);
    }
  });

  it('turns every Auth0 signup error shape into a message for the form', () => {
    const cases: Array<[number, unknown, Auth0SignupError['reason'], RegExp]> = [
      [400, { name: 'BadRequestError', code: 'invalid_signup', description: 'Invalid sign up', statusCode: 400 }, 'username-taken', /이미 사용 중인 아이디/],
      [400, { name: 'PasswordStrengthError', code: 'invalid_password', statusCode: 400 }, 'weak-password', /8자 이상/],
      [400, { name: 'BadRequestError', code: 'invalid_username_characters', statusCode: 400 }, 'invalid-username', /영문 소문자, 숫자/],
      [400, { error: '"username" does not meet length criteria.' }, 'username-length', /1~30자/],
      [429, { error: 'too_many_requests' }, 'too-many-attempts', /잠시 후/],
      [500, null, 'unknown', /가입하지 못했습니다/],
    ];
    for (const [status, body, reason, message] of cases) {
      const error = toSignupError(status, body);
      assert.equal(error.reason, reason);
      assert.match(error.message, message);
    }
    assert.equal(toSignupError(400, { code: 'invalid_password' }).message, SIGNUP_PASSWORD_RULE);
    assert.equal(
      toSignupError(400, { code: 'invalid_username_characters' }).message,
      SIGNUP_USERNAME_RULE,
    );
  });

  it('signs up and logs in through the configured endpoint base', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
      if (String(input).endsWith('/dbconnections/signup')) {
        return new Response(JSON.stringify({ _id: 'x', username: body.username }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 900 }),
        { status: 200 },
      );
    }) as typeof fetch;
    const store = new MemoryStore();
    // 브라우저 미리보기는 Auth0를 개발 서버의 프록시 경로로 부른다.
    const session = new Auth0DesktopSession({
      config,
      store,
      fetch: fetchImpl,
      endpointBaseUrl: '/__auth0/',
    });

    await session.signUpWithPassword('new-owner', 'Passw0rd!x', '새 사장');
    await session.logout();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(urls, [
      '/__auth0/dbconnections/signup',
      '/__auth0/oauth/token',
      '/__auth0/oauth/revoke',
    ]);
  });

  it('does not create an account while signed in', async () => {
    const { fetchImpl, requests } = fakeAuth0([tokens('at-1', 'rt-1')]);
    const session = new Auth0DesktopSession({ config, store: new MemoryStore(), fetch: fetchImpl });
    await session.loginWithPassword('hyunsu', 'secret');

    await assert.rejects(
      session.signUpWithPassword('new-owner', 'Passw0rd!x', '이름'),
      (error: unknown) => error instanceof Auth0LoginError && error.reason === 'already-signed-in',
    );
    assert.ok(!requests.some((request) => request.url.endsWith('/dbconnections/signup')));
  });
});
