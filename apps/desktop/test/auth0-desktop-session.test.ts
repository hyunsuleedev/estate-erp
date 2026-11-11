import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUTH_PROVIDER_ARGUMENT,
  parseAuthProviderArgument,
  parseProviderCredentials,
  resolveAuth0DesktopConfig,
} from '../src/common/desktopAuthProvider';
import {
  Auth0DesktopSession,
  Auth0LoginError,
  type Auth0TokenStore,
  type StoredAuth0Session,
} from '../src/main/auth0/auth0DesktopSession';
import {
  expectedTokenSessionId,
  mayReceiveToken,
} from '../src/main/auth0/tokenSessionScope';
import { AuthBroker } from '../src/main/authBroker';

const config = resolveAuth0DesktopConfig({});
const testDir = dirname(fileURLToPath(import.meta.url));

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

describe('desktop auth provider switch', () => {
  it('defaults to Clerk and accepts only the auth0 value', () => {
    assert.equal(parseAuthProviderArgument([]), 'clerk');
    assert.equal(parseAuthProviderArgument([`${AUTH_PROVIDER_ARGUMENT}auth0`]), 'auth0');
    assert.equal(parseAuthProviderArgument([`${AUTH_PROVIDER_ARGUMENT}other`]), 'clerk');
  });

  it('uses the trial tenant unless the environment overrides it', () => {
    assert.equal(config.domain, 'estait.jp.auth0.com');
    assert.equal(config.audience, 'https://api.estaitt.com');
    assert.equal(config.realm, 'Username-Password-Authentication');
    assert.match(config.scope, /offline_access/);
    assert.equal(
      resolveAuth0DesktopConfig({ ESTATE_AUTH0_DOMAIN: 'https://other.auth0.com/' }).domain,
      'other.auth0.com',
    );
  });

  it('accepts login input only with an ID and a password, without altering the password', () => {
    assert.deepEqual(parseProviderCredentials({ username: ' hyunsu ', password: ' pw ' }), {
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
      assert.equal(parseProviderCredentials(value), null, JSON.stringify(value));
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

  it('binds each shell window to the session of the account it shows', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/providers/auth-provider.tsx'),
      'utf8',
    );
    const start = source.indexOf('function Auth0ShellAuthProvider(');
    const end = source.indexOf('function BrokeredTabAuthProvider(');
    assert.ok(start > 0 && end > start);
    const shell = source.slice(start, end);
    // 토큰은 화면 계정의 세션 번호로만 받고, broker에도 그 번호를 알린다.
    assert.match(shell, /setTokenProvider\(\(\) => bridge\.getToken\(scope\)\)/);
    assert.match(shell, /providerSessionId: sessionId/);
    // 어느 창에서든 main 세션이 바뀌면 다시 확인해 따라간다.
    assert.match(
      shell,
      /onProviderSessionChanged\([\s\S]{0,200}setSessionVersion\(/,
    );
    // 토큰 없이 나간 요청(세션이 지나감)은 이 PC를 로그아웃시키지 않는다.
    assert.match(shell, /if \(!hadBearer\) \{[\s\S]{0,500}return;\s*\}/);
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
    assert.equal(ended, 1);
    assert.equal(store.saved, null);
    assert.equal(await session.hasSession(), false);
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

  it('keeps a newer login when an earlier sign-out completes late', () => {
    const shell = readFileSync(
      resolve(testDir, '../src/renderer/providers/auth-provider.tsx'),
      'utf8',
    );
    // 셸은 자기가 보여 주는 세션만 로그아웃하고, 그사이 새 세션을 보여 주면 지우지 않는다.
    assert.match(shell, /providerLogout\?\.\(\{ sessionId: target \}\)/);
    assert.match(shell, /if \(isShowingNewerSession\(target\)\) return;\s*commitLocalSignedOut\(\);/);
    assert.match(shell, /if \(isShowingNewerSession\(target\)\) return;\s*await publishSignedOutSession\(\);/);
    const manager = readFileSync(resolve(testDir, '../src/main/windowManager.ts'), 'utf8');
    // main도 새 로그인이 있으면 broker를 로그아웃으로 덮거나 다른 창에 로그아웃을 보내지 않는다.
    const accept = manager.slice(manager.indexOf('  acceptShellSignOut('), manager.indexOf('  private broadcastShellSignOutCleanup('));
    assert.match(accept, /response\.ok && this\.providerAuth\?\.isSignedInNow\(\)\) \{[\s\S]*?\} else if \(response\.ok\) \{[\s\S]*broadcastShellSignOutCleanup/);
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

describe('token session scope', () => {
  it('gives shells a token only for the session they show', () => {
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: true, shellScopeSessionId: 3, brokerSessionId: 1 }), 3),
      true,
    );
    // 다른 창에서 로그아웃·로그인해 세션이 3 → 5로 바뀌었다.
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: true, shellScopeSessionId: 3, brokerSessionId: 5 }), 5),
      false,
    );
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: true, shellScopeSessionId: null, brokerSessionId: 5 }), 5),
      false,
    );
  });

  it('gives tab screens a token only for the session published to the broker', () => {
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: false, shellScopeSessionId: 9, brokerSessionId: 5 }), 5),
      true,
    );
    // 탭 화면이 보낸 번호는 쓰지 않는다.
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: false, shellScopeSessionId: 7, brokerSessionId: 5 }), 7),
      false,
    );
    assert.equal(
      mayReceiveToken(expectedTokenSessionId({ fromShell: false, shellScopeSessionId: null, brokerSessionId: null }), 5),
      false,
    );
  });

  it('keeps the provider session id with the broker session and drops it on sign-out', () => {
    const broker = new AuthBroker({ sendTokenRequest: () => true });
    broker.registerShell(10);
    broker.publishSession(10, { authenticated: true, user: { id: 'user-1' }, providerSessionId: 4 });
    assert.equal(broker.getSession().providerSessionId, 4);
    broker.publishSession(10, { authenticated: false, user: null, providerSessionId: 4 });
    assert.equal(broker.getSession().providerSessionId, undefined);
  });
});
