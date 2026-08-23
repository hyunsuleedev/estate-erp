import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthBroker } from '../src/main/authBroker';
import type { DesktopAuthTokenRequest } from '../src/common/desktopAuth';

test('동시에 열린 native tabs의 token 요청을 shell 요청 하나로 합친다', async () => {
  const sent: Array<{ shellId: number; request: DesktopAuthTokenRequest }> = [];
  const broker = new AuthBroker({
    createRequestId: () => 'request-1',
    sendTokenRequest: (shellId, request) => {
      sent.push({ shellId, request });
      return true;
    },
  });
  broker.registerShell(10);
  broker.publishSession(10, { authenticated: true, user: { id: 'user-1' } });

  const first = broker.requestToken();
  const second = broker.requestToken();

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.shellId, 10);
  assert.equal(
    broker.acceptToken(10, { requestId: 'request-1', token: 'token-a' }),
    true,
  );
  assert.deepEqual(await Promise.all([first, second]), ['token-a', 'token-a']);
});

test('짧은 burst cache 이후에는 shell에서 새 토큰을 요청한다', async () => {
  let now = 1_000;
  let sequence = 0;
  const sent: DesktopAuthTokenRequest[] = [];
  const broker = new AuthBroker({
    now: () => now,
    cacheTtlMs: 100,
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: (_shellId, request) => {
      sent.push(request);
      return true;
    },
  });
  broker.registerShell(10);
  broker.publishSession(10, { authenticated: true, user: { id: 'user-1' } });

  const first = broker.requestToken();
  broker.acceptToken(10, { requestId: 'request-1', token: 'token-a' });
  assert.equal(await first, 'token-a');
  assert.equal(await broker.requestToken(), 'token-a');
  assert.equal(sent.length, 1);

  now += 101;
  const refreshed = broker.requestToken();
  assert.equal(sent.length, 2);
  broker.acceptToken(10, { requestId: 'request-2', token: 'token-b' });
  assert.equal(await refreshed, 'token-b');
});

test('등록되지 않은 shell의 응답은 거절하고 shell 종료 시 대기 요청을 해제한다', async () => {
  const broker = new AuthBroker({
    createRequestId: () => 'request-1',
    sendTokenRequest: () => true,
  });
  broker.registerShell(10);
  broker.publishSession(10, { authenticated: true, user: { id: 'user-1' } });

  const request = broker.requestToken();
  assert.equal(
    broker.acceptToken(11, { requestId: 'request-1', token: 'forged' }),
    false,
  );
  broker.unregister(10);
  assert.equal(await request, null);
});

test('인증된 shell이 없으면 즉시 null을 반환한다', async () => {
  const broker = new AuthBroker({ sendTokenRequest: () => true });
  broker.registerShell(10);
  assert.equal(await broker.requestToken(), null);
});

test('shell session을 revision과 함께 authoritative snapshot으로 보관한다', () => {
  const broker = new AuthBroker({ sendTokenRequest: () => true });
  broker.registerShell(10);

  const published = broker.publishSession(10, {
    authenticated: true,
    user: { id: 'user-1', office: { id: 'office-1' } },
  });
  assert.equal(published?.revision, 1);
  assert.deepEqual(broker.getSession(), published);

  broker.publishSession(10, { authenticated: false, user: { ignored: true } });
  assert.deepEqual(broker.getSession(), {
    authenticated: false,
    user: null,
    revision: 2,
  });
});

test('logout 또는 account switch가 이전 pending/cache token을 폐기한다', async () => {
  let sequence = 0;
  const broker = new AuthBroker({
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: () => true,
  });
  broker.registerShell(10);
  broker.publishSession(10, { authenticated: true, user: { id: 'user-a' } });

  const pending = broker.requestToken();
  broker.publishSession(10, { authenticated: false, user: null });
  assert.equal(await pending, null);
  assert.equal(
    broker.acceptToken(10, { requestId: 'request-1', token: 'late-user-a' }),
    false,
  );

  broker.publishSession(10, { authenticated: true, user: { id: 'user-b' } });
  const current = broker.requestToken();
  assert.equal(
    broker.acceptToken(10, { requestId: 'request-2', token: 'user-b-token' }),
    true,
  );
  assert.equal(await current, 'user-b-token');
});

test('첫 shell만 auth authority이며 detached shell의 stale session은 무시한다', () => {
  const broker = new AuthBroker({ sendTokenRequest: () => true });
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, { authenticated: true, user: { id: 'main-user' } });
  const stale = broker.publishSession(20, { authenticated: false, user: null });

  assert.equal(broker.isAuthoritativeShell(10), true);
  assert.equal(broker.isAuthoritativeShell(20), false);
  assert.deepEqual(stale, broker.getSession());
  assert.equal(broker.getSession().authenticated, true);
});

test('main authority가 닫히면 인증된 detached shell로 token authority가 승계된다', async () => {
  const sent: number[] = [];
  let sequence = 0;
  const broker = new AuthBroker({
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: (shellId) => {
      sent.push(shellId);
      return true;
    },
  });
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, { authenticated: true, user: { id: 'main-user' } });
  broker.publishSession(20, { authenticated: true, user: { id: 'main-user' } });
  broker.unregister(10);

  assert.equal(broker.isAuthoritativeShell(20), true);
  const token = broker.requestToken();
  assert.deepEqual(sent, [20]);
  broker.acceptToken(20, { requestId: 'request-1', token: 'detached-token' });
  assert.equal(await token, 'detached-token');
  assert.equal(broker.getSession().authenticated, true);
});

test('다른 principal의 stale shell에는 auth authority를 승계하지 않는다', async () => {
  const sent: number[] = [];
  const broker = new AuthBroker({
    createRequestId: () => 'request-1',
    sendTokenRequest: (shellId) => {
      sent.push(shellId);
      return true;
    },
  });
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, {
    authenticated: true,
    user: { id: 'user-b', office: { id: 'office-b' } },
  });
  broker.publishSession(20, {
    authenticated: true,
    user: { id: 'user-a', office: { id: 'office-a' } },
  });

  const changed = broker.unregister(10);
  assert.deepEqual(changed, {
    authenticated: false,
    user: null,
    revision: 2,
  });
  assert.equal(broker.isShellAuthenticated(20), false);
  assert.equal(await broker.requestToken(), null);
  assert.deepEqual(sent, []);
});

test('동일 webContents renderer reload는 global session을 logout으로 바꾸지 않는다', () => {
  const broker = new AuthBroker({ sendTokenRequest: () => true });
  broker.registerShell(10);
  const published = broker.publishSession(10, {
    authenticated: true,
    user: { id: 'user-a', office: { id: 'office-a' } },
  });
  assert.equal(published?.authenticated, true);

  broker.suspendShell(10);
  assert.equal(broker.getSession().authenticated, true);
  assert.equal(broker.isShellAuthenticated(10), false);

  broker.registerShell(10);
  broker.publishSession(10, {
    authenticated: true,
    user: { id: 'user-a', office: { id: 'office-a' } },
  });
  assert.equal(broker.getSession().authenticated, true);
  assert.equal(broker.isShellAuthenticated(10), true);
});

test('authority renderer suspend 중에는 같은 principal의 shell로 token authority가 승계된다', async () => {
  const sent: number[] = [];
  const broker = new AuthBroker({
    createRequestId: () => 'request-1',
    sendTokenRequest: (shellId) => {
      sent.push(shellId);
      return true;
    },
  });
  const user = { id: 'user-a', office: { id: 'office-a' } };
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, { authenticated: true, user });
  broker.publishSession(20, { authenticated: true, user });

  broker.suspendShell(10);
  assert.equal(broker.isAuthoritativeShell(20), true);
  assert.equal(broker.getSession().authenticated, true);
  const token = broker.requestToken();
  assert.deepEqual(sent, [20]);
  broker.acceptToken(20, { requestId: 'request-1', token: 'successor' });
  assert.equal(await token, 'successor');
});

test('token 응답 대기 중 authority가 suspend되면 같은 principal successor에 재요청한다', async () => {
  const sent: Array<{ shellId: number; requestId: string }> = [];
  let sequence = 0;
  const broker = new AuthBroker({
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: (shellId, request) => {
      sent.push({ shellId, requestId: request.requestId });
      return true;
    },
  });
  const user = { id: 'user-a', office: { id: 'office-a' } };
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, { authenticated: true, user });
  broker.publishSession(20, { authenticated: true, user });

  const token = broker.requestToken();
  broker.suspendShell(10);

  assert.deepEqual(sent, [
    { shellId: 10, requestId: 'request-1' },
    { shellId: 20, requestId: 'request-2' },
  ]);
  assert.equal(
    broker.acceptToken(10, { requestId: 'request-1', token: 'stale' }),
    false,
  );
  assert.equal(
    broker.acceptToken(20, { requestId: 'request-2', token: 'successor' }),
    true,
  );
  assert.equal(await token, 'successor');
});

test('유일한 authority reload 중 pending token은 같은 webContents 재등록까지 유지된다', async () => {
  const sent: Array<{ shellId: number; requestId: string }> = [];
  let sequence = 0;
  const broker = new AuthBroker({
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: (shellId, request) => {
      sent.push({ shellId, requestId: request.requestId });
      return true;
    },
  });
  const user = { id: 'user-a', office: { id: 'office-a' } };
  broker.registerShell(10);
  broker.publishSession(10, { authenticated: true, user });

  const token = broker.requestToken();
  broker.suspendShell(10);
  broker.registerShell(10);
  assert.deepEqual(sent, [{ shellId: 10, requestId: 'request-1' }]);

  broker.publishSession(10, { authenticated: true, user });
  assert.deepEqual(sent, [
    { shellId: 10, requestId: 'request-1' },
    { shellId: 10, requestId: 'request-2' },
  ]);
  broker.acceptToken(10, { requestId: 'request-2', token: 'after-reload' });
  assert.equal(await token, 'after-reload');
});

test('authority가 닫혀도 pending token은 같은 principal successor에서 완료된다', async () => {
  const sent: Array<{ shellId: number; requestId: string }> = [];
  let sequence = 0;
  const broker = new AuthBroker({
    createRequestId: () => `request-${++sequence}`,
    sendTokenRequest: (shellId, request) => {
      sent.push({ shellId, requestId: request.requestId });
      return true;
    },
  });
  const user = { id: 'user-a', office: { id: 'office-a' } };
  broker.registerShell(10);
  broker.registerShell(20);
  broker.publishSession(10, { authenticated: true, user });
  broker.publishSession(20, { authenticated: true, user });

  const token = broker.requestToken();
  assert.equal(broker.unregister(10), null);
  assert.deepEqual(sent, [
    { shellId: 10, requestId: 'request-1' },
    { shellId: 20, requestId: 'request-2' },
  ]);
  broker.acceptToken(20, { requestId: 'request-2', token: 'after-close' });
  assert.equal(await token, 'after-close');
});
