import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseRealtimeRoomRequest,
  type RealtimeEventMessage,
} from '../src/common/desktopRealtime';
import {
  SIGNED_OUT_AUTH_SESSION,
  type DesktopAuthSessionSnapshot,
} from '../src/common/desktopAuth';
import {
  RealtimeConnection,
  isGatewayRefusal,
  realtimeTargetForSession,
  resolveRealtimeUrl,
  type RealtimeSocket,
} from '../src/main/realtime/realtimeConnection';
import { mask, unmask } from '../src/main/realtime/wsOptionalDeps/bufferutil';
import isValidUTF8 from '../src/main/realtime/wsOptionalDeps/utf-8-validate';

const testDir = dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:3000/realtime';
const HYUNSU = { sessionId: 4, principal: 'user-1\u0000office-1' };

function defined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'expected a value');
  return value;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const READY_TIMEOUT_MS = 20_000;
/** socket.io가 서버에 닿지 못했을 때 주는 오류 모양. */
const transportError = () =>
  Object.assign(new Error('websocket error'), { type: 'TransportError' });

class FakeSocket implements RealtimeSocket {
  readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly sent: Array<[string, unknown]> = [];
  disconnected = 0;
  constructor(
    readonly url: string,
    readonly token: string,
  ) {}
  on(event: string, listener: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }
  emit(event: string, payload?: unknown) {
    this.sent.push([event, payload]);
  }
  disconnect() {
    this.disconnected += 1;
  }
  /** 서버(또는 네트워크)에서 온 일을 흉내 낸다. */
  fire(event: string, ...args: unknown[]) {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
  ready() {
    this.fire('realtime.ready', { userId: 'user-1', officeId: 'office-1' });
  }
}

function setup(options: {
  verifySession?: (sessionId: number, connection: RealtimeConnection) => Promise<void> | void;
  random?: () => number;
} = {}) {
  const sockets: FakeSocket[] = [];
  const events: RealtimeEventMessage[] = [];
  const tokenRequests: number[] = [];
  const verified: number[] = [];
  const timers: Array<{ callback: () => void; delayMs: number; done: boolean }> = [];
  let issued = 0;
  let nowMs = 1_000_000;
  const connection: RealtimeConnection = new RealtimeConnection({
    url: URL,
    createSocket: ({ url, token }) => {
      const socket = new FakeSocket(url, token);
      sockets.push(socket);
      return socket;
    },
    getAccessToken: async (sessionId) => {
      tokenRequests.push(sessionId);
      // 요청마다 새 토큰이다. 다시 연결할 때 새로 받는지 볼 수 있다.
      issued += 1;
      return `token-${issued}`;
    },
    verifySession: async (sessionId) => {
      verified.push(sessionId);
      await options.verifySession?.(sessionId, connection);
    },
    onEvent: (event) => events.push(event),
    reconnectDelaysMs: [1_000, 2_000, 5_000],
    refusalDelaysMs: [5_000, 30_000, 120_000],
    readyTimeoutMs: READY_TIMEOUT_MS,
    now: () => nowMs,
    // 0.5면 간격을 흩뜨리지 않는다.
    random: options.random ?? (() => 0.5),
    setTimer: (callback, delayMs) => {
      const timer = {
        callback: () => {
          timer.done = true;
          callback();
        },
        delayMs,
        done: false,
      };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { done: boolean }).done = true;
    },
  });
  /** 예약된 재시도. 연결마다 거는 ready 대기 타이머는 따로 본다. */
  const pendingTimers = () =>
    timers.filter((timer) => !timer.done && timer.delayMs !== READY_TIMEOUT_MS);
  const pendingReadyTimers = () =>
    timers.filter((timer) => !timer.done && timer.delayMs === READY_TIMEOUT_MS);
  const last = () => defined(sockets.at(-1));
  /** 예약된 재시도를 지금 울린다. */
  const fireTimer = async () => {
    defined(pendingTimers()[0]).callback();
    await tick();
  };
  const advance = (ms: number) => {
    nowMs += ms;
  };
  return {
    connection,
    sockets,
    events,
    tokenRequests,
    verified,
    timers,
    pendingTimers,
    pendingReadyTimers,
    last,
    fireTimer,
    advance,
  };
}

/** 로그인해서 연결이 자리 잡은 상태(연결된 지 1분). */
async function connected(context: ReturnType<typeof setup>, target = HYUNSU) {
  context.connection.setSession(target);
  await tick();
  context.last().ready();
  context.advance(60_000);
  return context.last();
}

describe('RealtimeConnection: one connection that follows the login session', () => {
  it('stays offline until a signed-in session is given', async () => {
    const context = setup();
    context.connection.setSession(null);
    await tick();

    assert.equal(context.sockets.length, 0);
    assert.equal(context.tokenRequests.length, 0);
    assert.deepEqual(context.connection.getStatus(), { state: 'offline', rooms: [] });
    // 로그인 전에는 방 구독도 받지 않는다.
    assert.equal(context.connection.subscribe(1, { kind: 'property', id: 'p1' }), false);
  });

  it('connects with that session’s token and reports the connection once the gateway is ready', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();

    assert.deepEqual(context.tokenRequests, [4]);
    assert.equal(context.sockets.length, 1);
    assert.equal(context.last().url, URL);
    assert.equal(context.last().token, 'token-1');
    // 서버가 인증을 마치기 전에는 연결된 것으로 보지 않는다.
    assert.equal(context.connection.getStatus().state, 'connecting');
    assert.deepEqual(context.events, []);

    context.last().ready();

    assert.equal(context.connection.getStatus().state, 'connected');
    assert.deepEqual(context.events, [{ name: 'realtime.connected', payload: null }]);
  });

  it('does nothing when the same session is announced again', async () => {
    const context = setup();
    await connected(context);

    context.connection.setSession({ ...HYUNSU });
    await tick();

    assert.equal(context.sockets.length, 1);
    assert.equal(context.last().disconnected, 0);
  });

  it('closes the socket on logout and does not try again', async () => {
    const context = setup();
    const socket = await connected(context);
    context.connection.subscribe(1, { kind: 'property', id: 'p1' });

    context.connection.setSession(null);
    await tick();

    assert.equal(socket.disconnected, 1);
    assert.deepEqual(context.connection.getStatus(), { state: 'offline', rooms: [] });
    assert.equal(context.pendingTimers().length, 0);
    assert.equal(context.sockets.length, 1);
    // 닫은 소켓에서 늦게 온 일은 무시한다.
    socket.fire('listing.updated', { propertyId: 'p1' });
    socket.fire('disconnect', 'io client disconnect');
    await tick();
    assert.equal(context.events.length, 1);
    assert.equal(context.pendingTimers().length, 0);
  });

  it('reconnects with a new token when the person or office changes', async () => {
    const context = setup();
    const first = await connected(context);
    context.connection.subscribe(1, { kind: 'property', id: 'p1' });

    // 같은 로그인 세션이지만 사무소가 생겼다(온보딩) → 다른 경계다.
    context.connection.setSession({ sessionId: 4, principal: 'user-1\u0000office-2' });
    await tick();

    assert.equal(first.disconnected, 1);
    assert.equal(context.sockets.length, 2);
    assert.equal(context.last().token, 'token-2');
    // 이전 계정의 화면이 요청한 방은 넘기지 않는다.
    context.last().ready();
    assert.deepEqual(context.last().sent, []);
    assert.deepEqual(context.connection.getStatus().rooms, []);
  });

  it('forwards only the known server events from the live socket', async () => {
    const context = setup();
    const socket = await connected(context);

    socket.fire('listing.updated', { listingId: 'l1', propertyId: 'p1' });
    socket.fire('cti.incoming', { caller: '01000000000' });
    socket.fire('something.else', { nope: true });

    assert.deepEqual(context.events.slice(1), [
      { name: 'listing.updated', payload: { listingId: 'l1', propertyId: 'p1' } },
      { name: 'cti.incoming', payload: { caller: '01000000000' } },
    ]);
  });
});

describe('RealtimeConnection: recovery', () => {
  it('reconnects after a network loss with backoff and a fresh token each time', async () => {
    const context = setup();
    const first = await connected(context);

    first.fire('disconnect', 'transport close');
    await tick();
    assert.equal(context.connection.getStatus().state, 'connecting');
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [1_000]);
    assert.equal(context.sockets.length, 1);

    await context.fireTimer();
    assert.equal(context.sockets.length, 2);
    assert.equal(context.last().token, 'token-2');

    // 서버가 아직 안 떴다: 간격을 늘린다.
    context.last().fire('connect_error', transportError());
    await tick();
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [2_000]);
    await context.fireTimer();
    context.last().fire('connect_error', new Error('timeout'));
    await tick();
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [5_000]);
    await context.fireTimer();
    assert.equal(context.last().token, 'token-4');
    assert.deepEqual(context.tokenRequests, [4, 4, 4, 4]);
    // 서버에 닿지 못한 것은 세션 문제가 아니다. 세션 확인을 시키지 않는다.
    assert.deepEqual(context.verified, []);

    // 다시 섰다: 화면이 놓친 변경을 읽게 알리고, 자리 잡은 뒤의 끊김은 처음 간격부터다.
    context.last().ready();
    assert.equal(context.connection.getStatus().state, 'connected');
    assert.equal(context.events.filter((event) => event.name === 'realtime.connected').length, 2);
    context.advance(60_000);
    context.last().fire('disconnect', 'ping timeout');
    await tick();
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [1_000]);
  });

  it('spreads the retry delay so every PC does not come back at the same instant', async () => {
    const delayWith = async (random: number) => {
      const context = setup({ random: () => random });
      const socket = await connected(context);
      socket.fire('disconnect', 'transport close');
      await tick();
      return defined(context.pendingTimers()[0]).delayMs;
    };
    assert.equal(await delayWith(0), 800);
    assert.equal(await delayWith(0.5), 1_000);
    assert.equal(await delayWith(0.999), 1_200);
  });

  it('waits and retries when no token can be had right now', async () => {
    let available = false;
    const sockets: FakeSocket[] = [];
    const timers: Array<() => void> = [];
    const connection = new RealtimeConnection({
      url: URL,
      createSocket: ({ url, token }) => {
        const socket = new FakeSocket(url, token);
        sockets.push(socket);
        return socket;
      },
      getAccessToken: async () => (available ? 'token-ok' : null),
      verifySession: async () => undefined,
      onEvent: () => undefined,
      setTimer: (callback) => timers.push(callback),
      clearTimer: () => undefined,
    });

    connection.setSession(HYUNSU);
    await tick();
    assert.equal(sockets.length, 0);
    assert.equal(timers.length, 1);

    available = true;
    defined(timers[0])();
    await tick();
    assert.equal(sockets.length, 1);
    assert.equal(defined(sockets[0]).token, 'token-ok');
  });

  it('reconnects at once with a fresh token when the gateway ends an established connection (access token expired)', async () => {
    const context = setup();
    const first = await connected(context);
    context.connection.subscribe(11, { kind: 'property', id: 'p1' });
    context.connection.subscribe(12, { kind: 'listing', id: 'l1' });

    // gateway는 접근 토큰이 만료되면 연결을 끊어 다시 인증하게 한다.
    first.fire('disconnect', 'io server disconnect');
    await tick();

    // 기다리지 않고, 세션 확인도 시키지 않고, 새 토큰으로 바로 다시 붙는다.
    assert.equal(context.sockets.length, 2);
    assert.equal(context.last().token, 'token-2');
    assert.deepEqual(context.pendingTimers(), []);
    assert.deepEqual(context.verified, []);
    assert.equal(context.connection.getStatus().state, 'connecting');

    context.last().ready();
    assert.equal(context.connection.getStatus().state, 'connected');
    // 방에 다시 들어가고, 화면은 끊긴 사이 놓친 변경을 다시 읽는다.
    assert.deepEqual(context.last().sent, [
      ['property.join', { propertyId: 'p1' }],
      ['listing.join', { listingId: 'l1' }],
    ]);
    assert.equal(context.events.filter((event) => event.name === 'realtime.connected').length, 2);
    assert.equal(context.connection.getStatus().rooms.length, 2);

    // 다음 만료 때도 같다.
    context.advance(15 * 60_000);
    context.last().fire('disconnect', 'io server disconnect');
    await tick();
    assert.equal(context.sockets.length, 3);
    assert.equal(context.last().token, 'token-3');
    assert.deepEqual(context.verified, []);
  });

  it('backs off when the gateway accepts a connection and drops it right away', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();
    const delays: number[] = [];
    for (let round = 0; round < 3; round++) {
      context.last().ready();
      context.advance(500);
      context.last().fire('disconnect', 'io server disconnect');
      await tick();
      delays.push(defined(context.pendingTimers()[0]).delayMs);
      await context.fireTimer();
    }
    // 붙자마자 끊기는 연결로는 바로 다시 붙지 않는다. 간격도 처음으로 돌아가지 않는다.
    assert.deepEqual(delays, [1_000, 2_000, 5_000]);
    assert.equal(context.sockets.length, 4);
  });

  it('abandons a connection the gateway never answers and tries again', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();
    const stuck = context.last();
    assert.equal(context.pendingReadyTimers().length, 1);

    defined(context.pendingReadyTimers()[0]).callback();
    await tick();
    assert.equal(stuck.disconnected, 1);
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [1_000]);

    // 제때 ready가 온 연결은 건드리지 않는다.
    await context.fireTimer();
    context.last().ready();
    assert.deepEqual(context.pendingReadyTimers(), []);
    assert.equal(context.connection.getStatus().state, 'connected');
  });
});

describe('RealtimeConnection: the gateway refuses or kicks the connection', () => {
  it('asks the session to verify itself instead of reconnecting in a loop', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();

    // 토큰을 받아 주지 않으면 서버가 ready 없이 끊는다.
    context.last().fire('disconnect', 'io server disconnect');
    await tick();

    assert.deepEqual(context.verified, [4]);
    // 바로 다시 붙지 않는다. 세션이 그대로면 간격을 두고 한 번 시도한다.
    assert.equal(context.sockets.length, 1);
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [5_000]);

    // 계속 거절돼도 시도는 타이머마다 한 번이고, 간격은 연결 실패 때보다 훨씬 길게 늘어난다.
    const delays: number[] = [];
    for (let round = 0; round < 3; round++) {
      await context.fireTimer();
      context.last().fire('disconnect', 'io server disconnect');
      await tick();
      delays.push(defined(context.pendingTimers()[0]).delayMs);
    }
    assert.deepEqual(delays, [30_000, 120_000, 120_000]);
    assert.equal(context.sockets.length, 4);
    assert.deepEqual(context.verified, [4, 4, 4, 4]);
    // 거절만으로는 세션을 끝내지 않는다(사무소가 없어 거절된 경우도 있다).
    // 세션 확인이 세션을 그대로 두는 한 계속 시도한다.
    assert.equal(context.connection.getStatus().state, 'connecting');
  });

  it('does not hammer a gateway that keeps refusing a token the server accepts', async () => {
    // 기본 간격을 본다. 세션 확인(/auth/me)이 매번 따라가므로 10분까지 늘린다.
    const delays: number[] = [];
    const sockets: FakeSocket[] = [];
    const retry: { run: (() => void) | null } = { run: null };
    let verified = 0;
    const connection = new RealtimeConnection({
      url: URL,
      createSocket: ({ url, token }) => {
        const socket = new FakeSocket(url, token);
        sockets.push(socket);
        return socket;
      },
      getAccessToken: async () => 'token',
      verifySession: async () => {
        verified += 1;
      },
      onEvent: () => undefined,
      random: () => 0.5,
      readyTimeoutMs: READY_TIMEOUT_MS,
      setTimer: (callback, delayMs) => {
        if (delayMs !== READY_TIMEOUT_MS) {
          delays.push(delayMs);
          retry.run = callback;
        }
        return callback;
      },
      clearTimer: () => undefined,
    });

    connection.setSession(HYUNSU);
    for (let round = 0; round < 6; round++) {
      await tick();
      defined(sockets.at(-1)).fire('disconnect', 'io server disconnect');
      await tick();
      defined(retry.run)();
    }

    assert.deepEqual(delays, [5_000, 30_000, 120_000, 600_000, 600_000, 600_000]);
    assert.equal(verified, 6);
  });

  it('starts over with the short refusal delay once the gateway has accepted a connection', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();
    for (let round = 0; round < 2; round++) {
      context.last().fire('disconnect', 'io server disconnect');
      await tick();
      await context.fireTimer();
    }
    // 이번에는 받아 줬다가, 나중에 다시 거절한다.
    context.last().ready();
    context.advance(60_000);
    context.last().fire('disconnect', 'io server disconnect');
    await tick();
    context.last().fire('disconnect', 'io server disconnect');
    await tick();
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [5_000]);
  });

  it('treats a refusal the gateway reports as a connect error the same way', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();

    // gateway가 연결 단계에서 오류를 돌려주면 socket.io는 서버 문구를 가진 connect_error를 준다.
    context.last().fire(
      'connect_error',
      Object.assign(new Error('unauthorized'), { data: { code: 'token_revoked' } }),
    );
    await tick();

    assert.deepEqual(context.verified, [4]);
    assert.equal(context.sockets.length, 1);
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [5_000]);

    assert.equal(isGatewayRefusal(new Error('unauthorized')), true);
    assert.equal(isGatewayRefusal(transportError()), false);
    assert.equal(isGatewayRefusal(new Error('timeout')), false);
    assert.equal(isGatewayRefusal(undefined), false);
  });

  it('stops for good when the check ends the session (deactivated account, password reset)', async () => {
    const context = setup({
      // 로그인 세션 쪽이 서버에서 401을 확인하고 세션을 끝낸다.
      verifySession: (_sessionId, connection) => connection.setSession(null),
    });
    const socket = await connected(context);

    // 서버가 그 사용자의 연결을 끊는다. 이어지던 연결이므로 한 번은 바로 다시 붙는다.
    socket.fire('disconnect', 'io server disconnect');
    await tick();
    assert.deepEqual(context.verified, []);
    assert.equal(context.sockets.length, 2);

    // 그 전에 발급된 토큰은 바로 거절된다: 이때 세션을 확인하고, 확인이 세션을 끝낸다.
    context.last().fire('disconnect', 'io server disconnect');
    await tick();

    assert.deepEqual(context.verified, [4]);
    assert.equal(context.sockets.length, 2);
    assert.equal(context.pendingTimers().length, 0);
    assert.equal(context.pendingReadyTimers().length, 0);
    assert.equal(context.connection.getStatus().state, 'offline');
  });

  it('follows a new login made while the check was running', async () => {
    const other = { sessionId: 6, principal: 'user-2\u0000office-2' };
    const context = setup({
      verifySession: (_sessionId, connection) => {
        connection.setSession(null);
        connection.setSession(other);
      },
    });
    context.connection.setSession(HYUNSU);
    await tick();

    context.last().fire('disconnect', 'io server disconnect');
    await tick();

    // 새 세션의 연결 하나만 있다. 예전 세션을 위한 재시도는 예약되지 않는다.
    assert.equal(context.sockets.length, 2);
    assert.deepEqual(context.tokenRequests, [4, 6]);
    assert.equal(context.pendingTimers().length, 0);
    assert.equal(context.pendingReadyTimers().length, 1);
  });
});

describe('RealtimeConnection: room subscriptions', () => {
  it('counts subscribers per screen and joins or leaves the room once', async () => {
    const context = setup();
    const socket = await connected(context);
    const listing = { kind: 'listing', id: 'l1' } as const;

    assert.equal(context.connection.subscribe(11, listing), true);
    assert.equal(context.connection.subscribe(12, listing), true);
    assert.equal(context.connection.subscribe(11, listing), true);
    assert.deepEqual(socket.sent, [['listing.join', { listingId: 'l1' }]]);
    assert.deepEqual(context.connection.getStatus().rooms, [{ room: 'listing:l1', subscribers: 2 }]);

    context.connection.unsubscribe(12, listing);
    context.connection.unsubscribe(11, listing);
    // 같은 화면이 두 번 요청했으면 두 번 놓아야 한다.
    assert.equal(socket.sent.length, 1);
    assert.deepEqual(context.connection.getStatus().rooms, [{ room: 'listing:l1', subscribers: 1 }]);

    context.connection.unsubscribe(11, listing);
    assert.deepEqual(socket.sent.at(-1), ['listing.leave', { listingId: 'l1' }]);
    assert.deepEqual(context.connection.getStatus().rooms, []);
    // 더 놓을 것이 없으면 아무 일도 없다.
    context.connection.unsubscribe(11, listing);
    assert.equal(socket.sent.length, 2);
  });

  it('uses the gateway’s own message for each kind of room', async () => {
    const context = setup();
    const socket = await connected(context);

    context.connection.subscribe(1, { kind: 'property', id: 'p1' });
    context.connection.subscribe(1, { kind: 'listing-intake', id: 'i1' });
    context.connection.subscribe(1, { kind: 'network', id: 'r1' });
    context.connection.unsubscribe(1, { kind: 'property', id: 'p1' });
    context.connection.unsubscribe(1, { kind: 'listing-intake', id: 'i1' });
    context.connection.unsubscribe(1, { kind: 'network', id: 'r1' });

    // 매물·의뢰 방은 gateway에 나가기 메시지가 없다. 구독만 지우고 다시 들어가지 않는다.
    assert.deepEqual(socket.sent, [
      ['property.join', { propertyId: 'p1' }],
      ['listing-intake.join', { intakeId: 'i1' }],
      ['network.room.join', { roomId: 'r1' }],
      ['network.room.leave', { roomId: 'r1' }],
    ]);
    assert.deepEqual(context.connection.getStatus().rooms, []);
  });

  it('joins rooms requested before the gateway was ready, and again after every reconnect', async () => {
    const context = setup();
    context.connection.setSession(HYUNSU);
    await tick();
    context.connection.subscribe(11, { kind: 'property', id: 'p1' });
    context.connection.subscribe(12, { kind: 'network', id: 'r1' });
    assert.deepEqual(context.last().sent, []);

    context.last().ready();
    assert.deepEqual(context.last().sent, [
      ['property.join', { propertyId: 'p1' }],
      ['network.room.join', { roomId: 'r1' }],
    ]);

    // 끊긴 동안 놓은 방은 다시 들어가지 않는다.
    context.last().fire('disconnect', 'transport close');
    await tick();
    context.connection.unsubscribe(12, { kind: 'network', id: 'r1' });
    await context.fireTimer();
    context.last().ready();

    assert.equal(context.sockets.length, 2);
    assert.deepEqual(context.last().sent, [['property.join', { propertyId: 'p1' }]]);
  });

  it('releases everything a screen held when that screen goes away', async () => {
    const context = setup();
    const socket = await connected(context);
    context.connection.subscribe(11, { kind: 'listing', id: 'l1' });
    context.connection.subscribe(11, { kind: 'property', id: 'p1' });
    context.connection.subscribe(11, { kind: 'property', id: 'p1' });
    context.connection.subscribe(12, { kind: 'property', id: 'p1' });
    context.connection.subscribe(12, { kind: 'network', id: 'r1' });
    socket.sent.length = 0;

    // 탭이 닫혔다(webContents destroyed).
    context.connection.releaseOwner(11);

    assert.deepEqual(socket.sent, [['listing.leave', { listingId: 'l1' }]]);
    assert.deepEqual(context.connection.getStatus().rooms, [
      { room: 'property:p1', subscribers: 1 },
      { room: 'network:r1', subscribers: 1 },
    ]);
    context.connection.releaseOwner(11);
    assert.equal(socket.sent.length, 1);
  });
});

describe('realtime wiring', () => {
  const source = (path: string) => readFileSync(resolve(testDir, path), 'utf8');
  const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it('connects only for a confirmed user who has an office', () => {
    const session = (
      overrides: Partial<DesktopAuthSessionSnapshot>,
    ): DesktopAuthSessionSnapshot => ({
      ...SIGNED_OUT_AUTH_SESSION,
      status: 'signed-in',
      authenticated: true,
      providerSessionId: 4,
      user: { id: 'user-1', office: { id: 'office-1' } },
      ...overrides,
    });

    assert.deepEqual(realtimeTargetForSession(session({})), {
      sessionId: 4,
      principal: 'user-1\u0000office-1',
    });
    // 가입 직후(온보딩 전)에는 사무소가 없다. gateway가 거절하므로 연결하지 않는다.
    assert.equal(realtimeTargetForSession(session({ user: { id: 'user-1', office: null } })), null);
    assert.equal(realtimeTargetForSession(session({ user: { id: 'user-1' } })), null);
    // 사무소가 생기면 그때 연결할 대상이 된다(principal이 달라 새 연결이다).
    assert.notEqual(
      realtimeTargetForSession(session({ user: { id: 'user-1', office: { id: 'office-9' } } }))
        ?.principal,
      realtimeTargetForSession(session({}))?.principal,
    );
    for (const status of ['loading', 'unreachable', 'signed-out'] as const) {
      assert.equal(
        realtimeTargetForSession(session({ status, authenticated: false })),
        null,
        status,
      );
    }
    assert.equal(realtimeTargetForSession(SIGNED_OUT_AUTH_SESSION), null);
  });

  it('builds the gateway address the way the renderer used to', () => {
    assert.equal(resolveRealtimeUrl('http://localhost:3000'), 'http://localhost:3000/realtime');
    assert.equal(resolveRealtimeUrl('https://api.estaitt.com/v1'), 'https://api.estaitt.com/realtime');
  });

  it('accepts only well-formed room requests', () => {
    assert.deepEqual(
      parseRealtimeRoomRequest({ room: { kind: 'property', id: 'p1' }, sessionId: 4, extra: 1 }),
      { room: { kind: 'property', id: 'p1' }, sessionId: 4 },
    );
    for (const value of [
      null,
      { room: { kind: 'office', id: 'o1' }, sessionId: 4 },
      { room: { kind: 'property', id: '' }, sessionId: 4 },
      { room: { kind: 'property', id: 'x'.repeat(101) }, sessionId: 4 },
      { room: { kind: 'property', id: 'p1' } },
      { room: { kind: 'property', id: 'p1' }, sessionId: '4' },
    ]) {
      assert.equal(parseRealtimeRoomRequest(value), null, JSON.stringify(value));
    }
  });

  it('keeps the only socket in main: renderers no longer connect or elect an owner', () => {
    const rendererAndPreload = [
      ...sourceFiles(resolve(testDir, '../src/renderer')),
      resolve(testDir, '../src/preload.ts'),
    ];
    assert.deepEqual(
      rendererAndPreload.filter((path) => /socket\.io-client/.test(readFileSync(path, 'utf8'))),
      [],
    );
    const main = source('../src/main/windowManager.ts');
    const preload = source('../src/preload.ts');
    for (const removed of [
      'realtime:claimAuthority',
      'realtime:releaseAuthority',
      'realtime:authority',
      'RealtimeLeaseBroker',
      'isRealtimeCandidateEligible',
    ]) {
      assert.ok(!main.includes(removed), `main still has ${removed}`);
      assert.ok(!preload.includes(removed), `preload still has ${removed}`);
    }
    // 셸과 탭 화면이 같은 통로를 쓴다.
    assert.equal(preload.match(/realtime: realtimeBridge,/g)?.length, 2);
  });

  it('ties the connection to the session and fans events out from main', () => {
    const main = source('../src/main/windowManager.ts');
    assert.match(
      main,
      /private handleAuthSessionChanged\([\s\S]*?const target = realtimeTargetForSession\(next\);\s*this\.realtime\.setSession\(target\);/,
    );
    assert.match(main, /getAccessToken: \(sessionId\) => this\.auth\.getAccessToken\(sessionId\)/);
    assert.match(main, /verifySession: \(sessionId\) => this\.auth\.reportUnauthorized\(sessionId\)/);
    assert.match(
      main,
      /private handleRealtimeEvent\(event: RealtimeEventMessage\): void \{[\s\S]{0,200}this\.broadcastToRenderers\('realtime:event', event\);/,
    );
    // 방 구독은 어느 화면에서든 요청할 수 있지만, 지금 로그인한 세션의 요청만 받는다.
    const subscribe = main.slice(main.indexOf("ipcMain.handle('realtime:subscribe'"));
    assert.match(subscribe.slice(0, 500), /isCurrentRegisteredEvent\(event\)/);
    assert.match(
      main,
      /subscribeRealtimeRoom\([\s\S]*?if \(!this\.isCurrentSignedInSession\(sessionId\)\) return false;[\s\S]*?this\.watchRealtimeSubscriber\(sender\);/,
    );
    // 화면이 닫히거나 다시 불리면 main이 그 화면의 구독을 놓는다.
    const watch = main.slice(
      main.indexOf('private watchRealtimeSubscriber('),
      main.indexOf('private watchRealtimeSubscriber(') + 1_200,
    );
    // 다른 문서가 실제로 들어섰을 때만 놓는다. 시작만 하고 막힌 이동(tel: 링크 등)은
    // 문서가 그대로라 구독도 그대로여야 한다.
    assert.match(watch, /sender\.on\('did-navigate', release\)/);
    assert.doesNotMatch(watch, /'did-start-navigation'/);
    assert.match(watch, /'render-process-gone'/);
    assert.match(watch, /once\('destroyed'/);
  });

  it('refreshes each renderer’s own cache without re-broadcasting', () => {
    const provider = source('../src/renderer/providers/realtime-provider.tsx');
    assert.match(provider, /queryClient\.invalidateQueriesFromRemote\(queryKey\)/);
    assert.ok(!/queryClient\.invalidateQueries\(/.test(provider));
    assert.match(provider, /window\.electronBridge\?\.realtime\?\.onEvent\(applyRealtimeEvent\)/);
  });
});

describe('socket.io in the main bundle', () => {
  it('masks and unmasks frames of any size like ws itself', () => {
    const maskBytes = Uint8Array.from([0x12, 0x34, 0x56, 0x78]);
    // 48바이트를 넘는 프레임(로그인 토큰이 든 연결 요청)이 이 경로를 탄다.
    const source = Uint8Array.from({ length: 1_000 }, (_value, index) => (index * 7) % 256);
    const output = new Uint8Array(1_004);

    mask(source, maskBytes, output, 4, source.length);

    for (const index of [0, 1, 47, 48, 49, 999]) {
      assert.equal(output[4 + index], defined(source[index]) ^ defined(maskBytes[index & 3]), `byte ${index}`);
    }
    assert.deepEqual([...output.slice(0, 4)], [0, 0, 0, 0]);
    const roundTrip = output.slice(4);
    unmask(roundTrip, maskBytes);
    assert.deepEqual(roundTrip, source);
  });

  it('validates UTF-8 for ws', () => {
    assert.equal(isValidUTF8(Buffer.from('실시간 연결')), true);
    assert.equal(isValidUTF8(Uint8Array.from([0xff, 0xfe, 0xfd])), false);
  });

  it('replaces ws’s optional native modules in the main build', () => {
    // 이 연결이 없으면 Vite가 넣는 대체 모듈 때문에 main 번들이 뜨지 않거나
    // (개발 빌드) 48바이트 이상의 프레임을 보내지 못한다(프로덕션 빌드).
    const config = readFileSync(resolve(testDir, '../vite.main.config.ts'), 'utf8');
    assert.match(config, /bufferutil: path\.resolve\(\s*__dirname,\s*'src\/main\/realtime\/wsOptionalDeps\/bufferutil\.ts'/);
    assert.match(config, /'utf-8-validate': path\.resolve\(\s*__dirname,\s*'src\/main\/realtime\/wsOptionalDeps\/utf-8-validate\.ts'/);
    const factory = readFileSync(resolve(testDir, '../src/main/realtime/socketIoRealtimeSocket.ts'), 'utf8');
    // 다시 연결은 코어가 직접 한다(시도마다 새 토큰). socket.io의 자동 재연결은 끈다.
    assert.match(factory, /reconnection: false/);
    assert.match(factory, /transports: \['websocket'\]/);
    // 연결 요청에는 토큰만 싣는다(gateway가 받는 크기가 작다).
    assert.match(factory, /auth: \{ token \},/);
    assert.doesNotMatch(factory, /extraHeaders|query:/);
  });
});
