import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAuth0DesktopConfig } from '../src/common/auth0DesktopConfig';
import {
  authSessionPrincipal,
  type DesktopAuthSessionSnapshot,
} from '../src/common/desktopAuth';
import {
  Auth0DesktopSession,
  type Auth0TokenStore,
  type StoredAuth0Session,
} from '../src/main/auth/auth0DesktopSession';
import {
  DesktopAuthController,
  type SessionUserResult,
} from '../src/main/auth/desktopAuthController';
import {
  createSessionUserFetcher,
  resolveMainApiBaseUrl,
} from '../src/main/auth/sessionUserClient';

const config = resolveAuth0DesktopConfig({});

const HYUNSU = { id: 'user-1', loginId: 'hyunsu', office: { id: 'office-1' } };
const OTHER = { id: 'user-2', loginId: 'other', office: { id: 'office-2' } };

function defined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'expected a value');
  return value;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

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

const stored = (refreshToken: string): StoredAuth0Session => ({
  domain: config.domain,
  clientId: config.clientId,
  refreshToken,
});

/**
 * Auth0 토큰 서버 흉내. 비밀번호 'wrong'은 거절하고, 그 밖에는 아이디가 담긴 토큰을
 * 준다. refresh는 `rejectRefresh`가 켜져 있으면 invalid_grant, `offline`이면 연결 실패다.
 */
function fakeAuth0() {
  const state = {
    offline: false,
    /** 토큰 요청만 실패시킨다(가입은 되고 이어진 로그인이 실패하는 경우). */
    tokenOffline: false,
    rejectRefresh: false,
    /** 차단된 계정: Auth0는 refresh에 403 invalid_grant "user is blocked"로 답한다. */
    blockedRefresh: false,
    /** 받은 비밀번호 로그인 요청의 아이디. */
    passwordLogins: [] as string[],
    issued: 0,
    revoked: [] as string[],
    /** 이미 있는 아이디. 가입하면 여기에 더해진다. */
    accounts: new Set<string>(['hyunsu']),
    signups: [] as Array<Record<string, string>>,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
    if (url.endsWith('/oauth/revoke')) {
      state.revoked.push(defined(body.token));
      return new Response('{}', { status: 200 });
    }
    if (state.offline) throw new TypeError('fetch failed');
    if (url.endsWith('/dbconnections/signup')) {
      state.signups.push(body);
      if (state.accounts.has(defined(body.username))) {
        return new Response(
          JSON.stringify({ name: 'BadRequestError', code: 'invalid_signup', description: 'Invalid sign up', statusCode: 400 }),
          { status: 400 },
        );
      }
      state.accounts.add(defined(body.username));
      return new Response(JSON.stringify({ _id: 'new', username: body.username }), { status: 200 });
    }
    if (state.tokenOffline) throw new TypeError('fetch failed');
    if (body.grant_type === 'refresh_token') {
      if (state.blockedRefresh) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'user is blocked' }),
          { status: 403 },
        );
      }
      if (state.rejectRefresh) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }),
          { status: 403 },
        );
      }
      state.issued += 1;
      const owner = defined(body.refresh_token).split(':')[1];
      return new Response(
        JSON.stringify({
          access_token: `at:${owner}:${state.issued}`,
          refresh_token: `rt:${owner}:${state.issued}`,
          expires_in: 900,
        }),
        { status: 200 },
      );
    }
    state.passwordLogins.push(defined(body.username));
    if (body.password === 'wrong') {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Wrong email or password.' }),
        { status: 403 },
      );
    }
    state.issued += 1;
    return new Response(
      JSON.stringify({
        access_token: `at:${body.username}:${state.issued}`,
        refresh_token: `rt:${body.username}:${state.issued}`,
        expires_in: 900,
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { fetchImpl, state };
}

type UserAnswer = SessionUserResult | (() => SessionUserResult | Promise<SessionUserResult>);

function setup(options: {
  store?: Auth0TokenStore;
  /** 다른 컨트롤러와 같은 Auth0를 쓴다(같은 PC의 두 프로세스). */
  auth0?: ReturnType<typeof fakeAuth0>;
  /** 토큰 주인(아이디)별 /auth/me 응답. 함수면 부를 때마다 계산한다. */
  users?: Record<string, UserAnswer>;
  now?: () => number;
} = {}) {
  const store = options.store ?? new MemoryStore();
  const auth0 = options.auth0 ?? fakeAuth0();
  const users: Record<string, UserAnswer> = {
    hyunsu: { kind: 'ok', user: HYUNSU },
    other: { kind: 'ok', user: OTHER },
    ...options.users,
  };
  const fetchedTokens: string[] = [];
  const changes: Array<{ next: DesktopAuthSessionSnapshot; previous: DesktopAuthSessionSnapshot }> = [];
  const timers: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
  let provider!: Auth0DesktopSession;
  const controller = new DesktopAuthController({
    createProvider: (callbacks) => {
      provider = new Auth0DesktopSession({
        config,
        store,
        fetch: auth0.fetchImpl,
        now: options.now,
        storeWaitMs: 20,
        ...callbacks,
      });
      return provider;
    },
    fetchUser: async (accessToken) => {
      fetchedTokens.push(accessToken);
      const answer = users[defined(accessToken.split(':')[1])];
      if (!answer) return { kind: 'unauthorized', message: '이 계정은 에스테잇플로우 사용자와 연결되어 있지 않습니다.' };
      return typeof answer === 'function' ? answer() : answer;
    },
    onChange: (next, previous) => changes.push({ next, previous }),
    now: options.now,
    setTimer: (callback, delayMs) => {
      const timer = {
        // 한 번 울린 타이머는 더 기다리는 타이머가 아니다.
        callback: () => {
          timer.cancelled = true;
          callback();
        },
        delayMs,
        cancelled: false,
      };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
  });
  const pendingTimers = () => timers.filter((timer) => !timer.cancelled);
  return { controller, provider, store, auth0, users, fetchedTokens, changes, pendingTimers };
}

function gate<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('DesktopAuthController: main owns the signed-in user', () => {
  it('starts signed out when nothing is stored', async () => {
    const { controller, changes, fetchedTokens } = setup();
    assert.equal(controller.getSnapshot().status, 'loading');

    await controller.start();

    const snapshot = controller.getSnapshot();
    assert.deepEqual(
      { status: snapshot.status, authenticated: snapshot.authenticated, user: snapshot.user, sessionId: snapshot.providerSessionId },
      { status: 'signed-out', authenticated: false, user: null, sessionId: null },
    );
    assert.deepEqual(changes.map((change) => change.next.status), ['signed-out']);
    assert.equal(fetchedTokens.length, 0);
  });

  it('restores a stored login and confirms the user with the server itself', async () => {
    const { controller, provider, changes } = setup({ store: new MemoryStore(stored('rt:hyunsu:0')) });

    await controller.start();

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, HYUNSU);
    assert.equal(snapshot.providerSessionId, provider.sessionId());
    assert.equal(controller.principal(), 'user-1\u0000office-1');
    assert.deepEqual(changes.map((change) => change.next.status), ['loading', 'signed-in']);
    // 사람이 바뀐 것으로 알리는 것은 사용자가 확인된 순간 한 번뿐이다.
    assert.deepEqual(
      changes.map((change) => authSessionPrincipal(change.previous) !== authSessionPrincipal(change.next)),
      [false, true],
    );
  });

  it('keeps a rejected password on the login form without touching the session', async () => {
    const { controller, changes, fetchedTokens, store } = setup();
    await controller.start();
    const before = controller.getSnapshot().revision;

    const result = await controller.login('hyunsu', 'wrong');

    assert.deepEqual(result, { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    assert.equal(controller.getSnapshot().revision, before);
    assert.equal(changes.length, 1);
    assert.equal(fetchedTokens.length, 0);
    assert.equal(store.saved, null);
  });

  it('logs in, confirms the user and hands tokens only to the session shown', async () => {
    const { controller, provider } = setup();
    await controller.start();

    assert.deepEqual(await controller.login('hyunsu', 'secret'), { ok: true });

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, HYUNSU);
    const sessionId = defined(snapshot.providerSessionId);
    assert.equal(sessionId, provider.sessionId());
    assert.match(defined(await controller.getAccessToken(sessionId)), /^at:hyunsu:/);
    assert.equal(await controller.getAccessToken(sessionId + 1), null);
    assert.equal(await controller.getAccessToken(null), null);
  });

  it('ends the session when the server rejects the account and tells the login form why', async () => {
    const { controller, store, auth0 } = setup({
      users: { hyunsu: { kind: 'unauthorized', message: '비활성화된 계정입니다.' } },
    });
    await controller.start();

    const result = await controller.login('hyunsu', 'secret');

    assert.deepEqual(result, { ok: false, error: '비활성화된 계정입니다.' });
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.error, '비활성화된 계정입니다.');
    assert.equal(snapshot.providerSessionId, null);
    assert.equal(store.saved, null);
    await tick();
    assert.equal(auth0.state.revoked.length, 1);
  });

  it('shows the expiry message when Auth0 rejects the stored refresh token', async () => {
    const { controller, auth0, store } = setup({ store: new MemoryStore(stored('rt:hyunsu:0')) });
    auth0.state.rejectRefresh = true;

    await controller.start();

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.error, '로그인이 만료되었습니다. 다시 로그인해 주세요.');
    assert.equal(store.saved, null);
  });

  it('signs out with the reason when Auth0 says the account is blocked', async () => {
    let now = 1_000_000;
    const { controller, auth0, store, changes } = setup({ now: () => now });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const sessionId = defined(controller.getSnapshot().providerSessionId);
    const before = changes.length;

    // 사장님이 계정을 차단했다. 접근 토큰이 만료되어 갱신할 때 드러난다.
    auth0.state.blockedRefresh = true;
    now += 900_000;
    assert.equal(await controller.getAccessToken(sessionId), null);

    const snapshot = controller.getSnapshot();
    // 로그인된 화면에 토큰만 없는 상태로 남지 않고, 이유와 함께 한 번에 로그아웃된다.
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.error, '사용이 중지된 계정입니다. 사장님(관리자)에게 문의해 주세요.');
    assert.deepEqual(
      changes.slice(before).map((change) => `${change.next.status}:${change.next.error ? 'reason' : 'none'}`),
      ['signed-out:reason'],
    );
    assert.equal(store.saved, null);
  });
});

describe('DesktopAuthController: a server or network failure is not a sign-out', () => {
  it('keeps the login, reports unreachable and retries automatically', async () => {
    const answer: { current: SessionUserResult } = { current: { kind: 'unreachable' } };
    const { controller, store, pendingTimers, changes } = setup({
      store: new MemoryStore(stored('rt:hyunsu:0')),
      users: { hyunsu: () => answer.current },
    });

    await controller.start();

    let snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'unreachable');
    assert.equal(snapshot.authenticated, false);
    assert.notEqual(snapshot.providerSessionId, null);
    assert.notEqual(store.saved, null);
    // 사용자가 확인되지 않은 동안은 토큰을 내주지 않는다.
    assert.equal(await controller.getAccessToken(snapshot.providerSessionId), null);
    assert.deepEqual(pendingTimers().map((timer) => timer.delayMs), [2_000]);

    // 아직 안 닿는다: 안내 화면을 그대로 두고(로딩으로 깜빡이지 않고) 더 길게 기다린다.
    defined(pendingTimers()[0]).callback();
    await tick();
    assert.equal(controller.getSnapshot().status, 'unreachable');
    assert.deepEqual(pendingTimers().map((timer) => timer.delayMs), [5_000]);
    assert.ok(!changes.slice(2).some((change) => change.next.status === 'loading'));

    answer.current = { kind: 'ok', user: HYUNSU };
    defined(pendingTimers()[0]).callback();
    await tick();
    snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, HYUNSU);
    assert.equal(pendingTimers().length, 0);
  });

  it('treats an unreachable Auth0 during restore the same way', async () => {
    const { controller, auth0, store } = setup({ store: new MemoryStore(stored('rt:hyunsu:0')) });
    auth0.state.offline = true;

    await controller.start();
    assert.equal(controller.getSnapshot().status, 'unreachable');
    assert.notEqual(store.saved, null);

    auth0.state.offline = false;
    await controller.retry();
    assert.equal(controller.getSnapshot().status, 'signed-in');
  });

  it('accepts a login that Auth0 confirmed even when the server cannot be reached yet', async () => {
    const { controller, store } = setup({ users: { hyunsu: { kind: 'unreachable' } } });
    await controller.start();

    assert.deepEqual(await controller.login('hyunsu', 'secret'), { ok: true });
    assert.equal(controller.getSnapshot().status, 'unreachable');
    assert.notEqual(store.saved, null);

    // 안내 화면의 로그아웃은 그 세션을 끝낸다.
    await controller.logout(controller.getSnapshot().providerSessionId);
    assert.equal(controller.getSnapshot().status, 'signed-out');
    assert.equal(store.saved, null);
  });

  it('keeps the confirmed user when a later re-check cannot reach the server', async () => {
    const answer: { current: SessionUserResult } = { current: { kind: 'ok', user: HYUNSU } };
    const { controller } = setup({ users: { hyunsu: () => answer.current } });
    await controller.start();
    await controller.login('hyunsu', 'secret');

    answer.current = { kind: 'unreachable' };
    const refreshed = await controller.refreshUser();

    assert.equal(refreshed.ok, false);
    assert.equal(refreshed.snapshot.status, 'signed-in');
    assert.deepEqual(controller.getSnapshot().user, HYUNSU);
  });
});

describe('DesktopAuthController: unauthorized reports are verified by main', () => {
  it('ends the session only when main itself gets a 401 from /auth/me', async () => {
    let now = 100_000;
    const answer: { current: SessionUserResult } = { current: { kind: 'ok', user: HYUNSU } };
    const { controller, fetchedTokens } = setup({
      users: { hyunsu: () => answer.current },
      now: () => now,
    });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const sessionId = defined(controller.getSnapshot().providerSessionId);
    const afterLogin = fetchedTokens.length;

    // 방금 확인했으면 화면의 신고만으로 다시 확인하지 않는다(401 폭주 방지).
    await controller.reportUnauthorized(sessionId);
    assert.equal(fetchedTokens.length, afterLogin);

    now += 10_000;
    await controller.reportUnauthorized(sessionId);
    assert.equal(fetchedTokens.length, afterLogin + 1);
    assert.equal(controller.getSnapshot().status, 'signed-in');

    now += 10_000;
    answer.current = { kind: 'unauthorized', message: '비활성화된 계정입니다.' };
    await controller.reportUnauthorized(sessionId);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.error, '비활성화된 계정입니다.');
  });

  it('ignores a report for a session that is no longer current', async () => {
    const { controller, fetchedTokens } = setup({ now: () => 0 });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const oldSession = defined(controller.getSnapshot().providerSessionId);
    await controller.logout(oldSession);
    await controller.login('other', 'secret');
    const calls = fetchedTokens.length;

    await controller.reportUnauthorized(oldSession);
    await controller.reportUnauthorized(null);

    assert.equal(fetchedTokens.length, calls);
    assert.deepEqual(controller.getSnapshot().user, OTHER);
  });

  it('never lets a stale verification end a newer session', async () => {
    let now = 0;
    const slow = gate<SessionUserResult>();
    let hyunsuCalls = 0;
    const { controller } = setup({
      now: () => now,
      users: {
        // 첫 확인(로그인)은 통과, 두 번째(401 신고 확인)는 늦게 401로 끝난다.
        hyunsu: () => {
          hyunsuCalls += 1;
          return hyunsuCalls === 2 ? slow.promise : { kind: 'ok', user: HYUNSU };
        },
      },
    });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const oldSession = defined(controller.getSnapshot().providerSessionId);

    now += 60_000;
    const report = controller.reportUnauthorized(oldSession);
    await tick();
    await controller.logout(oldSession);
    await controller.login('other', 'secret');
    slow.release({ kind: 'unauthorized', message: '비활성화된 계정입니다.' });
    await report;

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, OTHER);
    assert.equal(snapshot.error, null);
  });
});

describe('DesktopAuthController: sessions change only through logout', () => {
  it('ignores a late logout for a session that a new login replaced', async () => {
    const { controller, store } = setup();
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const first = defined(controller.getSnapshot().providerSessionId);
    await controller.logout(first);
    assert.equal(controller.getSnapshot().status, 'signed-out');
    await controller.login('other', 'secret');

    await controller.logout(first);
    await controller.logout(null);

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, OTHER);
    assert.notEqual(store.saved, null);
    assert.equal(await controller.getAccessToken(first), null);
  });

  it('makes a second window that logs in at the same time follow the first account', async () => {
    const { controller, auth0 } = setup();
    await controller.start();

    const [first, second] = await Promise.all([
      controller.login('hyunsu', 'secret'),
      controller.login('other', 'secret'),
    ]);

    assert.deepEqual(first, { ok: true });
    // 계정은 로그아웃으로만 바뀐다. 두 번째 창이 보낸 아이디·비밀번호로 로그인한 것이
    // 아니므로 성공이라고 답하지 않는다. 창은 세션 알림을 받아 먼저 로그인한 계정을 따른다.
    assert.deepEqual(second, {
      ok: false,
      error: '이미 다른 창에서 로그인했습니다. 그 계정으로 계속합니다.',
    });
    assert.deepEqual(controller.getSnapshot().user, HYUNSU);
    assert.equal(controller.getSnapshot().status, 'signed-in');
    // 두 번째 창의 비밀번호는 Auth0로 가지 않았다.
    assert.deepEqual(auth0.state.passwordLogins, ['hyunsu']);
  });

  it('never answers a login with the previous account after a logout that raced a token save', async () => {
    // 저장이 오래 걸리는 저장소: 갱신으로 받은 새 refresh token의 저장을 붙잡아 둔다.
    let holdSave: Promise<void> | null = null;
    const disk: { saved: StoredAuth0Session | null } = { saved: null };
    const store: Auth0TokenStore = {
      load: async () => disk.saved,
      save: async (session) => {
        if (holdSave) await holdSave;
        disk.saved = { ...session };
      },
      clear: async () => {
        disk.saved = null;
      },
    };
    let now = 1_000_000;
    const { controller, auth0 } = setup({ store, now: () => now });
    await controller.start();
    assert.deepEqual(await controller.login('hyunsu', 'secret'), { ok: true });
    const sessionId = defined(controller.getSnapshot().providerSessionId);

    const saving = gate<void>();
    holdSave = saving.promise;
    now += 880_000; // 접근 토큰이 만료 1분 안쪽이다: 다음 요청이 갱신한다
    const token = controller.getAccessToken(sessionId);
    await tick();
    await controller.logout(sessionId);
    assert.equal(controller.getSnapshot().status, 'signed-out');

    saving.release();
    holdSave = null;
    assert.equal(await token, null);
    await tick();
    assert.equal(disk.saved, null);

    // 다른 사람의 틀린 비밀번호: Auth0에 물어보고, 거절을 그대로 돌려준다.
    const result = await controller.login('other', 'wrong');
    assert.deepEqual(result, { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    assert.deepEqual(auth0.state.passwordLogins, ['hyunsu', 'other']);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.user, null);
    assert.equal(await controller.getAccessToken(sessionId), null);
  });

  it('keeps the first copy signed in when a second running copy shares the stored login', async () => {
    // 앱은 한 번만 뜨게 돼 있다(main.ts). 그 잠금이 듣지 않아 두 프로세스가 같은 저장소를
    // 쓰더라도, 서로의 refresh token을 재사용해 양쪽 로그인을 끊지 않는다.
    const store = new MemoryStore(stored('rt:hyunsu:0'));
    const auth0 = fakeAuth0();
    let now = 1_000_000;
    const first = setup({ store, auth0, now: () => now });
    const second = setup({ store, auth0, now: () => now });
    // 두 프로세스가 같은 저장된 로그인을 읽고 떴다.
    await first.provider.ready();
    await second.provider.ready();
    await first.controller.start();

    // 두 번째 프로세스가 가진 토큰은 첫 번째가 이미 교체했다.
    await second.controller.start();
    assert.equal(second.controller.getSnapshot().status, 'signed-out');
    assert.equal(
      second.controller.getSnapshot().error,
      '이 PC에서 실행 중인 다른 에스테잇플로우가 로그인을 바꿨습니다. 다시 로그인해 주세요.',
    );

    // 첫 번째는 그대로 쓰고, 다음 갱신도 된다.
    const sessionId = defined(first.controller.getSnapshot().providerSessionId);
    assert.equal(first.controller.getSnapshot().status, 'signed-in');
    now += 900_000;
    assert.match(defined(await first.controller.getAccessToken(sessionId)), /^at:hyunsu:/);
    assert.equal(first.controller.getSnapshot().status, 'signed-in');
  });

  it('drops a user confirmation that finishes after logout', async () => {
    const slow = gate<SessionUserResult>();
    const { controller } = setup({ users: { hyunsu: () => slow.promise } });
    await controller.start();

    const login = controller.login('hyunsu', 'secret');
    await tick();
    await tick();
    const loading = controller.getSnapshot();
    assert.equal(loading.status, 'loading');
    await controller.logout(loading.providerSessionId);
    slow.release({ kind: 'ok', user: HYUNSU });
    const result = await login;

    assert.equal(result.ok, false);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.user, null);
  });

  it('reports every boundary where the person or office changes', async () => {
    const { controller, changes } = setup();
    await controller.start();
    await controller.login('hyunsu', 'secret');
    await controller.logout(controller.getSnapshot().providerSessionId);
    await controller.login('other', 'secret');

    const boundaries = changes
      .filter((change) => authSessionPrincipal(change.previous) !== authSessionPrincipal(change.next))
      .map((change) => authSessionPrincipal(change.next));
    assert.deepEqual(boundaries, ['user-1\u0000office-1', null, 'user-2\u0000office-2']);
    // revision은 한 방향으로만 올라간다. 화면은 이 번호로 늦게 온 알림을 버린다.
    const revisions = changes.map((change) => change.next.revision);
    assert.deepEqual(revisions, [...revisions].sort((a, b) => a - b));
    assert.equal(new Set(revisions).size, revisions.length);
  });
});

describe('DesktopAuthController: refreshing the user', () => {
  it('fetches the user again and treats a new office as a new boundary', async () => {
    const answer: { current: SessionUserResult } = {
      current: { kind: 'ok', user: { id: 'user-1', loginId: 'hyunsu', office: null } },
    };
    const { controller, changes } = setup({ users: { hyunsu: () => answer.current } });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    assert.equal(controller.principal(), 'user-1\u0000');

    answer.current = { kind: 'ok', user: HYUNSU };
    const result = await controller.refreshUser();

    assert.equal(result.ok, true);
    assert.deepEqual(result.snapshot.user, HYUNSU);
    assert.equal(controller.principal(), 'user-1\u0000office-1');
    const last = defined(changes.at(-1));
    assert.notEqual(authSessionPrincipal(last.previous), authSessionPrincipal(last.next));
  });

  it('does not reuse a check that started before the change it must see', async () => {
    let now = 0;
    const first = gate<SessionUserResult>();
    let calls = 0;
    const { controller } = setup({
      now: () => now,
      users: {
        hyunsu: () => {
          calls += 1;
          if (calls === 1) return { kind: 'ok', user: { ...HYUNSU, name: '이전 이름' } };
          if (calls === 2) return first.promise;
          return { kind: 'ok', user: { ...HYUNSU, name: '새 이름' } };
        },
      },
    });
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const sessionId = defined(controller.getSnapshot().providerSessionId);

    now += 60_000;
    const report = controller.reportUnauthorized(sessionId);
    await tick();
    const refresh = controller.refreshUser();
    first.release({ kind: 'ok', user: { ...HYUNSU, name: '이전 이름' } });
    await report;
    const result = await refresh;

    assert.equal(calls, 3);
    assert.equal((result.snapshot.user as { name: string }).name, '새 이름');
  });

  it('does not announce a change when the user is the same', async () => {
    const { controller, changes } = setup();
    await controller.start();
    await controller.login('hyunsu', 'secret');
    const before = changes.length;

    assert.equal((await controller.refreshUser()).ok, true);

    assert.equal(changes.length, before);
  });

  it('refuses to refresh while signed out', async () => {
    const { controller } = setup();
    await controller.start();
    const result = await controller.refreshUser();
    assert.equal(result.ok, false);
    assert.equal(result.snapshot.status, 'signed-out');
  });
});

describe('main API server address', () => {
  it('uses the same build value and fallback as the renderer', () => {
    assert.equal(
      resolveMainApiBaseUrl({ configured: 'http://localhost:3000/', devServerUrl: 'http://localhost:5175' }),
      'http://localhost:3000',
    );
    assert.equal(
      resolveMainApiBaseUrl({ configured: 'https://api.estaitt.com', devServerUrl: undefined }),
      'https://api.estaitt.com',
    );
    // 값이 없거나 상대 경로면 화면은 개발 서버의 /api 프록시를 쓴다. main도 같다.
    assert.equal(
      resolveMainApiBaseUrl({ configured: undefined, devServerUrl: 'http://localhost:5175/' }),
      'http://localhost:5175/api',
    );
    assert.equal(
      resolveMainApiBaseUrl({ configured: '/api', devServerUrl: 'http://localhost:5175' }),
      'http://localhost:5175/api',
    );
    assert.equal(
      resolveMainApiBaseUrl({ configured: undefined, devServerUrl: undefined }),
      'http://localhost:3000',
    );
  });
});

describe('session user request', () => {
  const call = async (respond: () => Response | Promise<Response>) => {
    const requests: Array<{ url: string; authorization: string | undefined }> = [];
    const fetchUser = createSessionUserFetcher({
      apiBaseUrl: 'http://localhost:3000/',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
        });
        return respond();
      }) as typeof fetch,
    });
    return { result: await fetchUser('token-1'), requests };
  };

  it('asks /auth/me with the bearer token', async () => {
    const { result, requests } = await call(
      () => new Response(JSON.stringify(HYUNSU), { status: 200 }),
    );
    assert.deepEqual(result, { kind: 'ok', user: HYUNSU });
    assert.deepEqual(requests, [
      { url: 'http://localhost:3000/auth/me', authorization: 'Bearer token-1' },
    ]);
  });

  it('treats only a 401 as a rejected account', async () => {
    assert.deepEqual(
      (await call(() => new Response(JSON.stringify({ message: '비활성화된 계정입니다.' }), { status: 401 }))).result,
      { kind: 'unauthorized', message: '비활성화된 계정입니다.' },
    );
    for (const respond of [
      () => new Response('{}', { status: 500 }),
      () => new Response('{}', { status: 403 }),
      () => new Response('not json', { status: 200 }),
      () => new Response(JSON.stringify({ name: 'no id' }), { status: 200 }),
      () => Promise.reject(new TypeError('fetch failed')),
    ]) {
      assert.deepEqual((await call(respond)).result, { kind: 'unreachable' });
    }
  });
});

describe('DesktopAuthController: owner signup', () => {
  const NEW_OWNER = { id: 'user-9', loginId: 'new-owner', office: null };

  it('creates the account, logs in and confirms the new office-less owner', async () => {
    const { controller, auth0, store } = setup({
      users: { 'new-owner': { kind: 'ok', user: NEW_OWNER } },
    });
    await controller.start();

    // Auth0가 소문자로 저장하므로 보내기 전에 맞춘다.
    const result = await controller.signup(' New-Owner ', 'Passw0rd!x', ' 새 사장 ');

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(auth0.state.signups, [
      {
        client_id: config.clientId,
        connection: 'Username-Password-Authentication',
        username: 'new-owner',
        password: 'Passw0rd!x',
        name: '새 사장',
      },
    ]);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.deepEqual(snapshot.user, NEW_OWNER);
    // 사무소가 아직 없는 사람이다. 사무소를 만들면 경계가 바뀐다.
    assert.equal(controller.principal(), 'user-9\u0000');
    assert.match(defined(store.saved).refreshToken, /^rt:new-owner:/);
    assert.ok(!JSON.stringify(store.saved).includes('Passw0rd'));
  });

  it('checks the stated rules before asking Auth0', async () => {
    const { controller, auth0 } = setup();
    await controller.start();

    const badId = await controller.signup('한글 아이디', 'Passw0rd!x', '이름');
    const longId = await controller.signup('a'.repeat(31), 'Passw0rd!x', '이름');
    const weak = await controller.signup('new-owner', 'abcdefg1', '이름');
    const longName = await controller.signup('new-owner', 'Passw0rd!x', '가'.repeat(51));

    assert.equal(badId.ok, false);
    assert.match((badId as { error: string }).error, /영문 소문자, 숫자/);
    assert.match((longId as { error: string }).error, /1~30자/);
    assert.match((weak as { error: string }).error, /8자 이상/);
    assert.match((longName as { error: string }).error, /50자/);
    assert.equal(auth0.state.signups.length, 0);
    assert.equal(controller.getSnapshot().status, 'signed-out');
  });

  it('tells the form when the ID is taken and leaves the session alone', async () => {
    const { controller, changes } = setup();
    await controller.start();
    const before = changes.length;

    const result = await controller.signup('hyunsu', 'Passw0rd!x', '이름');

    assert.deepEqual(result, {
      ok: false,
      error: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.',
    });
    assert.equal(changes.length, before);
  });

  it('ends the session cleanly when the server refuses the new ID so another can be tried', async () => {
    const collision = '이미 사용 중인 아이디입니다. 다른 아이디로 가입해 주세요.';
    const { controller, store, auth0 } = setup({
      users: {
        taken: { kind: 'unauthorized', message: collision },
        fresh: { kind: 'ok', user: { id: 'user-10', loginId: 'fresh', office: null } },
      },
    });
    await controller.start();

    const refused = await controller.signup('taken', 'Passw0rd!x', '이름');

    assert.deepEqual(refused, { ok: false, error: collision });
    let snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-out');
    assert.equal(snapshot.error, collision);
    assert.equal(snapshot.providerSessionId, null);
    assert.equal(store.saved, null);
    await tick();
    assert.equal(auth0.state.revoked.length, 1);

    assert.deepEqual(await controller.signup('fresh', 'Passw0rd!x', '이름'), { ok: true });
    snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'signed-in');
    assert.equal(snapshot.error, null);
  });

  it('keeps the new login when the server cannot provision the user yet (503)', async () => {
    const { controller, store, pendingTimers } = setup({
      users: { 'new-owner': { kind: 'unreachable' } },
    });
    await controller.start();

    assert.deepEqual(await controller.signup('new-owner', 'Passw0rd!x', '이름'), { ok: true });

    assert.equal(controller.getSnapshot().status, 'unreachable');
    assert.notEqual(store.saved, null);
    assert.equal(pendingTimers().length, 1);
  });

  it('sends the user to the login form when the account exists but the first login failed', async () => {
    const { controller, auth0 } = setup({
      users: { 'new-owner': { kind: 'ok', user: NEW_OWNER } },
    });
    await controller.start();
    auth0.state.tokenOffline = true;

    const result = await controller.signup('new-owner', 'Passw0rd!x', '이름');

    assert.equal(result.ok, false);
    assert.equal((result as { continueAtLogin?: boolean }).continueAtLogin, true);
    assert.match((result as { error: string }).error, /가입은 완료되었습니다/);
    assert.ok(auth0.state.accounts.has('new-owner'));
    assert.equal(controller.getSnapshot().status, 'signed-out');

    // 안내대로 로그인하면 된다. 같은 아이디로 다시 가입할 필요가 없다.
    auth0.state.tokenOffline = false;
    assert.deepEqual(await controller.login('new-owner', 'Passw0rd!x'), { ok: true });
    assert.equal(auth0.state.signups.length, 1);
    assert.deepEqual(controller.getSnapshot().user, NEW_OWNER);
  });

  it('reports a network failure without creating a session', async () => {
    const { controller, auth0 } = setup();
    await controller.start();
    auth0.state.offline = true;

    const result = await controller.signup('new-owner', 'Passw0rd!x', '이름');

    assert.deepEqual(result, {
      ok: false,
      error: '가입 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
    });
    assert.equal(controller.getSnapshot().status, 'signed-out');
  });

  it('refuses to create an account while someone is signed in', async () => {
    const { controller, auth0 } = setup();
    await controller.start();
    await controller.login('hyunsu', 'secret');

    const result = await controller.signup('new-owner', 'Passw0rd!x', '이름');

    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /로그아웃한 뒤 가입/);
    assert.equal(auth0.state.signups.length, 0);
    assert.deepEqual(controller.getSnapshot().user, HYUNSU);
  });

  it('shares only identical double submits and never another input’s result', async () => {
    const { controller, auth0 } = setup({
      users: {
        'owner-a': { kind: 'ok', user: { id: 'user-a', loginId: 'owner-a', office: null } },
        'owner-b': { kind: 'ok', user: { id: 'user-b', loginId: 'owner-b', office: null } },
      },
    });
    await controller.start();

    const [first, duplicate, other] = await Promise.all([
      controller.signup('owner-a', 'Passw0rd!x', '가'),
      controller.signup('owner-a', 'Passw0rd!x', '가'),
      controller.signup('owner-b', 'Passw0rd!x', '나'),
    ]);

    assert.deepEqual(first, { ok: true });
    assert.deepEqual(duplicate, { ok: true });
    // 다른 입력은 앞의 가입이 끝난 뒤 따로 처리되고, 이미 로그인된 상태라 만들지 않는다.
    assert.equal(other.ok, false);
    assert.deepEqual(auth0.state.signups.map((body) => body.username), ['owner-a']);
    assert.equal((controller.getSnapshot().user as { loginId: string }).loginId, 'owner-a');
  });
});
