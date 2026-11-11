import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { CallLog, CtiLookupResult } from '@estate-erp/api-client';
import { parseCallOverlayAction } from '../src/common/callOverlay';
import {
  CTI_DISCONNECTED_STATUS,
  parseCtiBridgeStatus,
  parseCtiCallEvent,
  parseCtiDialRequest,
  type ActiveCall,
  type CtiCallEvent,
  type CtiStatus,
} from '../src/common/desktopCti';
import {
  SessionApiError,
  createSessionApiClient,
} from '../src/main/api/sessionApiClient';
import {
  CallController,
  selectCallPopupWindow,
} from '../src/main/cti/callController';
import { createCtiApi } from '../src/main/cti/ctiApi';
import {
  CtiBridgeClient,
  resolveCtiBridgeUrl,
  type CtiBridgeSocket,
} from '../src/main/cti/ctiBridgeClient';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(resolve(testDir, path), 'utf8');

const HYUNSU = { sessionId: 4, principal: 'user-1\u0000office-1' };
const CALLER = '01012345678';

function defined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'expected a value');
  return value;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function ring(overrides: Partial<CtiCallEvent> = {}): CtiCallEvent {
  return {
    type: 'ring',
    vendor: 'mock',
    caller: CALLER,
    callee: '0212345678',
    seqno: 'seq-1',
    occurredAt: '2026-11-11T01:00:00.000Z',
    ...overrides,
  };
}

function terminate(overrides: Partial<CtiCallEvent> = {}): CtiCallEvent {
  return { ...ring(), type: 'terminate', durationSec: 42, ...overrides };
}

function callLog(overrides: Partial<CallLog> = {}): CallLog {
  return {
    id: 'log-1',
    officeId: 'office-1',
    userId: 'user-1',
    contactId: null,
    direction: 'inbound',
    phoneNumber: CALLER,
    lineNumber: '0212345678',
    vendor: 'mock',
    vendorSeqno: 'seq-1',
    status: 'ringing',
    durationSec: 0,
    consultationId: null,
    recordingId: null,
    memo: null,
    startedAt: '2026-11-11T01:00:00.000Z',
    endedAt: null,
    createdAt: '2026-11-11T01:00:00.000Z',
    updatedAt: '2026-11-11T01:00:00.000Z',
    contact: null,
    ...overrides,
  };
}

function lookupResult(overrides: Partial<CtiLookupResult> = {}): CtiLookupResult {
  return {
    phone: CALLER,
    isNew: true,
    contact: null,
    vendorContacts: [],
    recentConsultations: [],
    properties: [],
    buyerRequirement: null,
    openTasks: [],
    recentCalls: [],
    ...overrides,
  };
}

const KNOWN_CONTACT = { id: 'contact-1', name: '김고객', tags: ['VIP'], memo: null };

interface Deferred<T> {
  sessionId: number;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function setup() {
  const ingests: Array<Deferred<{ handled: boolean; callLog?: CallLog }> & { event: CtiCallEvent }> = [];
  const lookups: Array<Deferred<CtiLookupResult> & { phone: string }> = [];
  const states: Array<ActiveCall | null> = [];
  const errors: string[] = [];
  const dialed: Array<{ callee: string; caller?: string }> = [];
  const timers: Array<{ callback: () => void; delayMs: number; done: boolean }> = [];
  let callLogsChanged = 0;
  let bridgeConnected = true;
  const bridgeStatus = (): CtiStatus => ({
    bridgeConnected,
    bridge: bridgeConnected
      ? {
          type: 'status',
          vendor: 'mock',
          connected: true,
          loggedIn: true,
          lines: ['0212345678'],
          bridgeVersion: '1.0.0',
        }
      : null,
  });
  const controller = new CallController({
    api: {
      ingestCallEvent: (sessionId, event) =>
        new Promise((resolve, reject) => {
          ingests.push({ sessionId, event, resolve, reject });
        }),
      lookup: (sessionId, phone) =>
        new Promise((resolve, reject) => {
          lookups.push({ sessionId, phone, resolve, reject });
        }),
    },
    bridge: {
      getStatus: bridgeStatus,
      dial: (command) => {
        if (!bridgeConnected) return false;
        dialed.push(command);
        return true;
      },
    },
    onCallChange: (call) => states.push(call),
    onCallLogsChanged: () => {
      callLogsChanged += 1;
    },
    onError: (what) => errors.push(what),
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
  return {
    controller,
    ingests,
    lookups,
    states,
    errors,
    dialed,
    timers,
    pendingTimers: () => timers.filter((timer) => !timer.done),
    callLogsChanged: () => callLogsChanged,
    setBridgeConnected: (value: boolean) => {
      bridgeConnected = value;
    },
    call: () => controller.getCall(),
  };
}

/** 로그인한 상태에서 전화가 울린다. */
function ringing(context: ReturnType<typeof setup>, event = ring()) {
  context.controller.setSession(HYUNSU);
  context.controller.handleBridgeEvent(event);
  return {
    ingest: defined(context.ingests.at(-1)),
    lookup: defined(context.lookups.at(-1)),
  };
}

describe('CallController: an incoming call', () => {
  it('shows the ringing call at once, then the looked-up contact and the call log', async () => {
    const context = setup();
    const { ingest, lookup } = ringing(context, ring({ lineId: 'L2' }));

    // 서버 답을 기다리지 않고 팝업부터 띄운다.
    assert.deepEqual(context.call(), {
      key: 1,
      phase: 'ringing',
      phoneNumber: CALLER,
      lineNumber: 'L2',
      durationSec: 0,
      startedAt: '2026-11-11T01:00:00.000Z',
      callLog: null,
      lookup: null,
      lookupLoading: true,
    });
    // 조회와 기록은 그 로그인 세션으로 따로 나간다.
    assert.equal(ingest.sessionId, 4);
    assert.equal(ingest.event.type, 'ring');
    assert.deepEqual([lookup.sessionId, lookup.phone], [4, CALLER]);

    lookup.resolve(lookupResult({ isNew: false, contact: KNOWN_CONTACT }));
    await tick();
    assert.equal(context.call()?.lookup?.contact?.name, '김고객');
    assert.equal(context.call()?.lookupLoading, false);
    assert.equal(context.call()?.callLog, null);

    ingest.resolve({ handled: true, callLog: callLog() });
    await tick();
    assert.equal(context.call()?.callLog?.id, 'log-1');
    // 통화 기록 목록을 보는 화면이 다시 읽는다.
    assert.equal(context.callLogsChanged(), 1);
    assert.deepEqual(context.errors, []);
    // 바뀔 때마다 한 번씩 알렸다: 울림, 고객 카드, 통화 기록.
    assert.equal(context.states.length, 3);
  });

  it('uses the called line when the bridge gives no line id', () => {
    const context = setup();
    ringing(context);
    assert.equal(context.call()?.lineNumber, '0212345678');
  });

  it('keeps the popup with the number alone when the lookup fails', async () => {
    const context = setup();
    const { ingest, lookup } = ringing(context);

    lookup.reject(new SessionApiError('unreachable', null));
    await tick();
    assert.equal(context.call()?.phase, 'ringing');
    assert.equal(context.call()?.lookup, null);
    assert.equal(context.call()?.lookupLoading, false);
    assert.deepEqual(context.errors, ['lookup 실패']);

    // 기록도 실패해도 팝업은 그대로다.
    ingest.reject(new SessionApiError('http', 500));
    await tick();
    assert.equal(context.call()?.phase, 'ringing');
    assert.deepEqual(context.errors, ['lookup 실패', 'call-event 기록 실패']);
    assert.equal(context.callLogsChanged(), 0);
  });

  it('replaces the popup when another call rings and ignores the earlier call’s late answers', async () => {
    const context = setup();
    const first = ringing(context);
    context.controller.handleBridgeEvent(ring({ caller: '01099998888', seqno: 'seq-2' }));
    assert.equal(context.call()?.key, 2);
    assert.equal(context.call()?.phoneNumber, '01099998888');

    first.lookup.resolve(lookupResult({ isNew: false, contact: KNOWN_CONTACT }));
    first.ingest.resolve({ handled: true, callLog: callLog() });
    await tick();
    assert.equal(context.call()?.lookup, null);
    assert.equal(context.call()?.callLog, null);
    assert.equal(context.call()?.lookupLoading, true);
  });

  it('ignores click-to-call results and calls that arrive while signed out', () => {
    const context = setup();
    context.controller.handleBridgeEvent(ring());
    assert.equal(context.call(), null);
    assert.equal(context.ingests.length, 0);

    context.controller.setSession(HYUNSU);
    context.controller.handleBridgeEvent({ ...ring(), type: 'ctc_result' });
    assert.equal(context.call(), null);
    assert.equal(context.ingests.length, 0);
    assert.equal(context.lookups.length, 0);
  });
});

describe('CallController: the call ends', () => {
  it('shows the ended call with its duration and closes the popup a minute later', async () => {
    const context = setup();
    const { ingest } = ringing(context);
    ingest.resolve({ handled: true, callLog: callLog() });
    await tick();

    context.controller.handleBridgeEvent(terminate({ durationSec: 42 }));
    assert.equal(context.call()?.phase, 'ended');
    assert.equal(context.call()?.durationSec, 42);
    assert.deepEqual(context.pendingTimers().map((timer) => timer.delayMs), [60_000]);
    // 종료도 서버에 남긴다.
    assert.equal(context.ingests.at(-1)?.event.type, 'terminate');

    defined(context.pendingTimers()[0]).callback();
    assert.equal(context.call(), null);
  });

  it('marks a call that was never answered as missed', () => {
    const context = setup();
    ringing(context);
    context.controller.handleBridgeEvent(terminate({ durationSec: 0 }));
    assert.equal(context.call()?.phase, 'missed');
  });

  it('does not let another line’s late terminate change the ringing popup', async () => {
    const context = setup();
    ringing(context);
    context.controller.handleBridgeEvent(terminate({ caller: '01099998888' }));

    assert.equal(context.call()?.phase, 'ringing');
    assert.equal(context.pendingTimers().length, 0);
    // 그 종료도 서버에는 남기지만, 답으로 온 통화 기록을 이 팝업에 붙이지 않는다.
    const other = defined(context.ingests.at(-1));
    assert.equal(other.event.caller, '01099998888');
    other.resolve({ handled: true, callLog: callLog({ id: 'other-log' }) });
    await tick();
    assert.equal(context.call()?.callLog, null);
  });

  it('adopts the terminate’s call log when this PC missed the ring’s', async () => {
    const context = setup();
    const { ingest } = ringing(context);
    ingest.reject(new SessionApiError('unreachable', null));
    await tick();

    context.controller.handleBridgeEvent(terminate());
    defined(context.ingests.at(-1)).resolve({
      handled: true,
      callLog: callLog({ status: 'ended', durationSec: 42 }),
    });
    await tick();
    assert.equal(context.call()?.callLog?.status, 'ended');
  });

  it('does not auto-close a newer call with the previous call’s timer', () => {
    const context = setup();
    ringing(context);
    context.controller.handleBridgeEvent(terminate());
    const oldTimer = defined(context.pendingTimers()[0]);

    context.controller.handleBridgeEvent(ring({ seqno: 'seq-2' }));
    assert.equal(context.call()?.key, 2);
    // 새 통화가 오면 이전 통화의 닫기 예약은 취소된다.
    assert.equal(oldTimer.done, true);
    assert.equal(context.pendingTimers().length, 0);
  });
});

describe('CallController: edits made in the popup', () => {
  it('keeps a call-log edit when the lookup answers late', async () => {
    const context = setup();
    const { ingest, lookup } = ringing(context);
    ingest.resolve({ handled: true, callLog: callLog() });
    await tick();

    // 팝업에서 연락처를 등록해 통화 기록에 연결했다.
    context.controller.patchCallLog(
      { contactId: 'contact-9', contact: { id: 'contact-9', name: '새 고객' } },
      1,
    );
    assert.equal(context.call()?.callLog?.contactId, 'contact-9');

    lookup.resolve(lookupResult());
    await tick();
    assert.equal(context.call()?.lookupLoading, false);
    assert.equal(context.call()?.callLog?.contactId, 'contact-9');
    assert.deepEqual(context.call()?.callLog?.contact, { id: 'contact-9', name: '새 고객' });
  });

  it('keeps a call-log edit when the ring’s own answer arrives after the terminate’s', async () => {
    const context = setup();
    const { ingest: ringIngest } = ringing(context);
    context.controller.handleBridgeEvent(terminate());
    defined(context.ingests.at(-1)).resolve({
      handled: true,
      callLog: callLog({ status: 'ended', durationSec: 42 }),
    });
    await tick();
    context.controller.patchCallLog({ consultationId: 'consult-1' });

    // 느린 ring 기록의 답(예전 상태)이 이제야 왔다.
    ringIngest.resolve({ handled: true, callLog: callLog() });
    await tick();
    assert.equal(context.call()?.callLog?.consultationId, 'consult-1');
    assert.equal(context.call()?.callLog?.status, 'ended');
  });

  it('never shows an older lookup over a newer one', async () => {
    const context = setup();
    const { lookup: first } = ringing(context);

    // 연락처를 등록한 뒤 다시 조회했고, 그 답이 먼저 왔다.
    const refreshed = context.controller.refreshLookup(1);
    const second = defined(context.lookups.at(-1));
    second.resolve(lookupResult({ isNew: false, contact: KNOWN_CONTACT }));
    await refreshed;
    assert.equal(context.call()?.lookup?.contact?.name, '김고객');
    assert.equal(context.call()?.lookupLoading, false);

    // 처음 조회의 답("신규")이 늦게 와도 덮지 않는다.
    first.resolve(lookupResult());
    await tick();
    assert.equal(context.call()?.lookup?.isNew, false);
    assert.equal(context.call()?.lookup?.contact?.name, '김고객');
  });

  it('drops a patch when no call log exists yet, and requests aimed at a previous call', async () => {
    const context = setup();
    const { ingest } = ringing(context);
    context.controller.patchCallLog({ contactId: 'contact-9' }, 1);
    assert.equal(context.call()?.callLog, null);

    ingest.resolve({ handled: true, callLog: callLog() });
    await tick();
    assert.equal(context.call()?.callLog?.contactId, null);

    // 다음 전화가 와서 팝업이 바뀌었다. 이전 통화의 저장이 이제 끝나 보낸 요청은 버린다.
    context.controller.handleBridgeEvent(ring({ seqno: 'seq-2' }));
    defined(context.ingests.at(-1)).resolve({
      handled: true,
      callLog: callLog({ id: 'log-2' }),
    });
    await tick();
    const lookupsBefore = context.lookups.length;
    context.controller.patchCallLog({ consultationId: 'consult-1' }, 1);
    await context.controller.refreshLookup(1);
    context.controller.dismiss(1);
    assert.equal(context.call()?.key, 2);
    assert.equal(context.call()?.callLog?.consultationId, null);
    assert.equal(context.lookups.length, lookupsBefore);
  });

  it('reloads the contact card on request and reports a failed reload to the caller', async () => {
    const context = setup();
    const { lookup } = ringing(context);
    lookup.resolve(lookupResult());
    await tick();

    const reload = context.controller.refreshLookup();
    assert.equal(context.lookups.length, 2);
    defined(context.lookups.at(-1)).resolve(
      lookupResult({ isNew: false, contact: KNOWN_CONTACT }),
    );
    await reload;
    assert.equal(context.call()?.lookup?.contact?.id, 'contact-1');

    const failed = context.controller.refreshLookup();
    defined(context.lookups.at(-1)).reject(new SessionApiError('http', 500));
    await assert.rejects(failed);
    // 실패한 다시 조회는 보이던 고객 카드를 지우지 않는다.
    assert.equal(context.call()?.lookup?.contact?.id, 'contact-1');
  });

  it('closes the popup and cancels the pending auto-close', () => {
    const context = setup();
    ringing(context);
    context.controller.handleBridgeEvent(terminate());
    assert.equal(context.pendingTimers().length, 1);

    context.controller.dismiss(1);
    assert.equal(context.call(), null);
    assert.equal(context.pendingTimers().length, 0);
    assert.equal(context.states.at(-1), null);
    // 닫힌 뒤에 온 요청은 조용히 버린다.
    context.controller.patchCallLog({ contactId: 'contact-9' });
    context.controller.dismiss();
    assert.equal(context.call(), null);
  });
});

describe('CallController: the login session', () => {
  it('drops the call and every pending answer when the session ends mid-call', async () => {
    const context = setup();
    const { ingest, lookup } = ringing(context);
    context.controller.handleBridgeEvent(terminate());
    assert.equal(context.pendingTimers().length, 1);

    context.controller.setSession(null);
    assert.equal(context.call(), null);
    assert.equal(context.states.at(-1), null);
    assert.equal(context.pendingTimers().length, 0);
    const notified = context.states.length;

    // 로그아웃 전에 보낸 요청의 답은 버린다. 화면에도 다시 알리지 않는다.
    lookup.resolve(lookupResult({ isNew: false, contact: KNOWN_CONTACT }));
    ingest.resolve({ handled: true, callLog: callLog() });
    await tick();
    assert.equal(context.call(), null);
    assert.equal(context.states.length, notified);
    assert.equal(context.callLogsChanged(), 0);

    // 로그아웃한 동안에는 전화도, 발신도 받지 않는다.
    context.controller.handleBridgeEvent(ring());
    assert.equal(context.call(), null);
    assert.deepEqual(context.controller.dial({ callee: CALLER }), {
      ok: false,
      error: 'not-signed-in',
    });
    assert.deepEqual(context.controller.getStatus(), CTI_DISCONNECTED_STATUS);
  });

  it('clears the call when another person or office signs in, and serves the new session', async () => {
    const context = setup();
    const { lookup } = ringing(context);
    const other = { sessionId: 6, principal: 'user-2\u0000office-2' };

    context.controller.setSession(other);
    assert.equal(context.call(), null);
    lookup.resolve(lookupResult({ isNew: false, contact: KNOWN_CONTACT }));
    await tick();
    assert.equal(context.call(), null);

    context.controller.handleBridgeEvent(ring());
    assert.equal(context.call()?.phase, 'ringing');
    assert.equal(context.ingests.at(-1)?.sessionId, 6);
    assert.equal(context.lookups.at(-1)?.sessionId, 6);
  });

  it('keeps the call when the same session is announced again', () => {
    const context = setup();
    ringing(context);
    const notified = context.states.length;
    context.controller.setSession({ ...HYUNSU });
    assert.equal(context.call()?.phase, 'ringing');
    assert.equal(context.states.length, notified);
  });
});

describe('CallController: dialing, bridge status and server-pushed events', () => {
  it('sends a click-to-call to the bridge and reports a missing bridge', () => {
    const context = setup();
    context.controller.setSession(HYUNSU);

    assert.deepEqual(
      context.controller.dial({ callee: CALLER, caller: '0212345678' }),
      { ok: true },
    );
    assert.deepEqual(context.dialed, [{ callee: CALLER, caller: '0212345678' }]);
    assert.equal(context.controller.getStatus().bridgeConnected, true);

    context.setBridgeConnected(false);
    assert.deepEqual(context.controller.dial({ callee: CALLER }), {
      ok: false,
      error: 'bridge-disconnected',
    });
    assert.equal(context.controller.getStatus().bridgeConnected, false);
  });

  it('refreshes call-log lists on a server-pushed call event without opening a popup', () => {
    const context = setup();
    // 로그인 전에는 무시한다.
    context.controller.handleServerCallEvent();
    assert.equal(context.callLogsChanged(), 0);

    context.controller.setSession(HYUNSU);
    context.controller.handleServerCallEvent();
    assert.equal(context.callLogsChanged(), 1);
    // 이 PC의 팝업은 Bridge 이벤트로만 뜬다(지금까지와 같다).
    assert.equal(context.call(), null);
    assert.equal(context.ingests.length, 0);
    assert.equal(context.lookups.length, 0);
  });
});

describe('call popup window', () => {
  it('prefers the main window, then the most recently focused app window', () => {
    const windows = [
      { id: 1, focusOrder: 3 },
      { id: 5, focusOrder: 9 },
      { id: 7, focusOrder: 4 },
    ];
    assert.equal(selectCallPopupWindow({ mainWindowId: 1, windows }), 1);
    // 메인 창이 닫혀 있으면 가장 최근에 쓰던 창이다.
    assert.equal(
      selectCallPopupWindow({ mainWindowId: null, windows: windows.slice(1) }),
      5,
    );
    // 메인 창 번호가 남아 있어도 그 창이 없으면 다른 창에서 고른다.
    assert.equal(
      selectCallPopupWindow({ mainWindowId: 1, windows: windows.slice(1) }),
      5,
    );
    assert.equal(selectCallPopupWindow({ mainWindowId: null, windows: [] }), null);
  });
});

describe('main-side API helper', () => {
  function setupApi(respond: () => Response | Promise<Response>, token: string | null = 'token-1') {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const tokenRequests: number[] = [];
    const unauthorized: number[] = [];
    const client = createSessionApiClient({
      apiBaseUrl: 'http://localhost:3000/',
      getAccessToken: async (sessionId) => {
        tokenRequests.push(sessionId);
        return token;
      },
      reportUnauthorized: (sessionId) => {
        unauthorized.push(sessionId);
      },
      fetch: (async (url: URL | RequestInfo, init?: RequestInit) => {
        requests.push({ url: String(url), init: init ?? {} });
        return respond();
      }) as typeof fetch,
    });
    return { client, requests, tokenRequests, unauthorized };
  }

  it('calls the API with that session’s token', async () => {
    const context = setupApi(() => Response.json(lookupResult()));
    const api = createCtiApi(context.client);

    const result = await api.lookup(4, CALLER);
    assert.equal(result.phone, CALLER);
    assert.deepEqual(context.tokenRequests, [4]);
    assert.equal(defined(context.requests[0]).url, `http://localhost:3000/cti/lookup?phone=${CALLER}`);
    assert.equal(
      (defined(context.requests[0]).init.headers as Record<string, string>).authorization,
      'Bearer token-1',
    );

    await api.ingestCallEvent(4, ring());
    const post = defined(context.requests[1]);
    assert.equal(post.url, 'http://localhost:3000/cti/call-events');
    assert.equal(post.init.method, 'POST');
    assert.equal(JSON.parse(String(post.init.body)).caller, CALLER);
  });

  it('hands a 401 to the session check instead of signing out', async () => {
    const context = setupApi(() => new Response('{}', { status: 401 }));
    await assert.rejects(
      context.client.request(4, '/cti/lookup', { params: { phone: CALLER } }),
      (error: unknown) =>
        error instanceof SessionApiError && error.kind === 'unauthorized' && error.status === 401,
    );
    await tick();
    // 확인은 로그인 세션 쪽이 `/auth/me`로 한다. 이 도우미에는 로그아웃 경로가 없다.
    assert.deepEqual(context.unauthorized, [4]);
    assert.doesNotMatch(source('../src/main/api/sessionApiClient.ts'), /logout/i);
  });

  it('does not call the server without a token for that session', async () => {
    const context = setupApi(() => Response.json({}), null);
    await assert.rejects(
      context.client.request(4, '/cti/lookup'),
      (error: unknown) => error instanceof SessionApiError && error.kind === 'no-session',
    );
    assert.equal(context.requests.length, 0);
    assert.deepEqual(context.unauthorized, []);
  });

  it('reports server errors and an unreachable server as failures of that request only', async () => {
    const failing = setupApi(() => Response.json({ message: 'boom' }, { status: 500 }));
    await assert.rejects(
      failing.client.request(4, '/cti/lookup'),
      (error: unknown) => error instanceof SessionApiError && error.kind === 'http' && error.status === 500,
    );
    const down = setupApi(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(
      down.client.request(4, '/cti/lookup'),
      (error: unknown) => error instanceof SessionApiError && error.kind === 'unreachable',
    );
    assert.deepEqual([...failing.unauthorized, ...down.unauthorized], []);
  });

  it('leaves the popup up when the lookup is refused', async () => {
    const context = setupApi(() => new Response('{}', { status: 401 }));
    const states: Array<ActiveCall | null> = [];
    const controller = new CallController({
      api: createCtiApi(context.client),
      bridge: { getStatus: () => CTI_DISCONNECTED_STATUS, dial: () => false },
      onCallChange: (call) => states.push(call),
      onCallLogsChanged: () => undefined,
      onError: () => undefined,
    });
    controller.setSession(HYUNSU);
    controller.handleBridgeEvent(ring());
    for (let i = 0; i < 5; i++) await tick();

    // 세션을 끝낼지는 로그인 세션 쪽이 정한다. 통화 흐름은 팝업을 그대로 둔다.
    assert.equal(controller.getCall()?.phase, 'ringing');
    assert.equal(controller.getCall()?.lookupLoading, false);
    assert.deepEqual([...new Set(context.unauthorized)], [4]);
  });
});

class FakeBridgeSocket implements CtiBridgeSocket {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  closed = 0;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed += 1;
  }
  message(value: unknown) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) });
  }
}

describe('CtiBridgeClient', () => {
  function setupBridge() {
    const sockets: FakeBridgeSocket[] = [];
    const events: CtiCallEvent[] = [];
    const statuses: CtiStatus[] = [];
    const timers: Array<{ callback: () => void; delayMs: number; done: boolean }> = [];
    const client = new CtiBridgeClient({
      url: 'ws://127.0.0.1:45332/',
      createSocket: () => {
        const socket = new FakeBridgeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
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
    const pendingTimers = () => timers.filter((timer) => !timer.done);
    return { client, sockets, events, statuses, pendingTimers, last: () => defined(sockets.at(-1)) };
  }

  const STATUS = {
    type: 'status',
    vendor: 'mock',
    connected: true,
    loggedIn: true,
    lines: ['0212345678'],
    bridgeVersion: '1.0.0',
  };

  it('reports the bridge status and passes call events on', () => {
    const context = setupBridge();
    context.client.start();
    assert.equal(context.client.getStatus().bridgeConnected, false);

    context.last().onopen?.({});
    context.last().message(STATUS);
    assert.deepEqual(context.statuses.at(-1), { bridgeConnected: true, bridge: STATUS });

    context.last().message({ ...ring(), extra: 'ignored' });
    context.last().message('not json');
    context.last().message({ type: 'unknown' });
    assert.deepEqual(context.events, [ring()]);
  });

  it('dials only while the bridge is connected', () => {
    const context = setupBridge();
    context.client.start();
    assert.equal(context.client.dial({ callee: CALLER }), false);

    context.last().onopen?.({});
    assert.equal(context.client.dial({ callee: CALLER, caller: '0212345678' }), true);
    assert.deepEqual(JSON.parse(defined(context.last().sent[0])), {
      type: 'dial',
      callee: CALLER,
      caller: '0212345678',
    });
  });

  it('keeps retrying quietly when the bridge is not running, and stops on request', () => {
    const context = setupBridge();
    context.client.start();
    const delays: number[] = [];
    for (let round = 0; round < 7; round++) {
      context.last().onclose?.({});
      const timer = defined(context.pendingTimers()[0]);
      delays.push(timer.delayMs);
      timer.callback();
    }
    assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    // 붙은 적이 없으면 상태를 알리지 않는다(설치하지 않은 사무소가 보통이다).
    assert.deepEqual(context.statuses, []);

    // 붙었다가 끊기면 알리고, 다음 간격은 처음부터다.
    context.last().onopen?.({});
    context.last().onclose?.({});
    assert.equal(context.statuses.at(-1)?.bridgeConnected, false);
    assert.equal(defined(context.pendingTimers()[0]).delayMs, 1_000);

    context.client.stop();
    assert.equal(context.pendingTimers().length, 0);
    assert.equal(context.sockets.length, 8);
  });

  it('uses the bridge port from the environment', () => {
    assert.equal(resolveCtiBridgeUrl({}), 'ws://127.0.0.1:45332/');
    assert.equal(
      resolveCtiBridgeUrl({ ESTATE_CTI_BRIDGE_PORT: '45999' }),
      'ws://127.0.0.1:45999/',
    );
  });
});

describe('CTI contract', () => {
  it('keeps only the contract fields of a bridge call event', () => {
    assert.deepEqual(
      parseCtiCallEvent({ ...terminate(), lineId: 'L1', direction: 'inbound', injected: { a: 1 } }),
      { ...terminate(), lineId: 'L1', direction: 'inbound' },
    );
    // 발신번호 표시 제한 통화는 번호가 비어 온다.
    assert.equal(parseCtiCallEvent(ring({ caller: '' }))?.caller, '');
    for (const value of [
      null,
      { ...ring(), type: 'status' },
      { ...ring(), caller: 123 },
      { ...ring(), durationSec: -1 },
      { ...ring(), direction: 'sideways' },
      { ...ring(), caller: '0'.repeat(65) },
    ]) {
      assert.equal(parseCtiCallEvent(value), null, JSON.stringify(value));
    }
    assert.equal(parseCtiBridgeStatus({ type: 'status', vendor: 'kt' }), null);
  });

  it('accepts a dial request only with a phone number and a session', () => {
    assert.deepEqual(parseCtiDialRequest({ callee: '010-1234-5678', sessionId: 4 }), {
      callee: '010-1234-5678',
      sessionId: 4,
    });
    for (const value of [
      { callee: CALLER },
      { callee: '', sessionId: 4 },
      { callee: 'tel:010', sessionId: 4 },
      { callee: CALLER, caller: 'x', sessionId: 4 },
      { callee: CALLER, sessionId: '4' },
    ]) {
      assert.equal(parseCtiDialRequest(value), null, JSON.stringify(value));
    }
  });

  it('carries the call a popup button refers to', () => {
    assert.deepEqual(parseCallOverlayAction({ type: 'dismiss', callKey: 3 }), {
      type: 'dismiss',
      callKey: 3,
    });
    assert.deepEqual(
      parseCallOverlayAction({ type: 'patch-call-log', patch: { contactId: 'c1' }, callKey: 3 }),
      { type: 'patch-call-log', patch: { contactId: 'c1' }, callKey: 3 },
    );
    assert.equal(parseCallOverlayAction({ type: 'dismiss', callKey: '3' }), null);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('CTI wiring: main owns the call flow', () => {
  const manager = source('../src/main/windowManager.ts');
  const preload = source('../src/preload.ts');

  it('leaves no call owner or relay in the shell', () => {
    // 셸이 통화 상태를 팝업 층에 보내거나 팝업의 버튼을 받던 길이 없다.
    for (const text of [manager, preload, source('../src/renderer/electron.d.ts')]) {
      assert.doesNotMatch(text, /cti:setOverlayState|setOverlayState|onOverlayAction|'cti:event'/);
    }
    assert.doesNotMatch(manager, /forwardCallOverlayAction|webContents\.send\('cti:overlayAction'/);
    assert.equal(existsSync(resolve(testDir, '../src/main/ctiClient.ts')), false);
    assert.doesNotMatch(source('../src/main.ts'), /ctiClient|CtiClient|setMainOverlayVisible/);

    // 화면은 서버에 통화를 기록하거나 고객 카드를 조회하지 않는다(팝업의 저장 버튼은 예외).
    const provider = source('../src/renderer/features/cti/cti-provider.tsx');
    assert.doesNotMatch(provider, /@\/lib\/api|ingestCallEvent|\.lookup\(/);
    const rendererRoot = resolve(testDir, '../src/renderer');
    const ingesting = sourceFiles(rendererRoot).filter((path) =>
      /ingestCallEvent\(/.test(readFileSync(path, 'utf8')),
    );
    assert.deepEqual(ingesting, []);
  });

  it('removes the legacy path where the shell drew the popup and hid the tab screens', () => {
    const layout = source('../src/renderer/routes/_authenticated.tsx');
    assert.doesNotMatch(layout, /CallPopup|callPopupUsesOverlayLayer|suspended=/);
    // 탭 화면을 숨기는 전역 덮개는 이제 없다. 업데이트 안내도 보이는 탭 화면이 그린다.
    for (const path of sourceFiles(resolve(testDir, '../src'))) {
      assert.doesNotMatch(
        readFileSync(path, 'utf8'),
        /setGlobalOverlayVisible|GlobalOverlaySource/,
        path,
      );
    }
  });

  it('handles popup buttons in main, only from the popup layer of the current session', () => {
    const handler = manager.slice(manager.indexOf("ipcMain.on('cti:overlayAction'"));
    assert.match(
      handler.slice(0, 400),
      /!isCurrentMainFrame\(event\) \|\| !manager\.isCallOverlaySender\(event\.sender\.id\)[\s\S]*?manager\.handleCallOverlayAction\(event\.sender\.id, action\)/,
    );
    const handle = manager.slice(manager.indexOf('  handleCallOverlayAction('));
    // 팝업의 링크는 "닫기 → 열기" 순서로 온다. 팝업이 닫힌 뒤에 온 열기도 받아야 하므로
    // 지금 팝업이 떠 있는지로 걸러서는 안 된다.
    assert.doesNotMatch(handle.slice(0, 1_400), /this\.callPopup/);
    assert.match(
      handle.slice(0, 1_400),
      /!this\.auth\.isAuthenticated\(\) \|\|\s*!this\.isCallOverlaySender\(senderWebContentsId\)[\s\S]*?this\.cti\.dismiss\(action\.callKey\)[\s\S]*?this\.cti\.refreshLookup\(action\.callKey\)[\s\S]*?this\.cti\.patchCallLog\(action\.patch, action\.callKey\)[\s\S]*?this\.openRouteInMainWindow\(action\.route\)/,
    );
  });

  it('opens routes in the main window through one main-side function', () => {
    // 탭 목록의 주인은 main이다. 화면을 여는 일을 창의 화면에 부탁하지 않는다.
    assert.doesNotMatch(manager, /tabs:openRoute/);
    const open = manager.slice(manager.indexOf('  openRouteInMainWindow('));
    // 메인 창이 닫혀 있으면 다시 띄운다. 새 창은 등록되면서 첫 탭을 받으므로 바로 열 수 있다.
    assert.match(
      open.slice(0, 1_400),
      /const existing = this\.getMainWindow\(\);[\s\S]*?existing && !existing\.isDestroyed\(\) \? existing : this\.createMainWindow\(\);\s*main\.focus\(\);\s*return this\.tabRegistry\.openRoute\(route, main\.id\)/,
    );
    assert.match(
      manager,
      /createMainWindow\(\): BrowserWindow \{[\s\S]*?this\.tabRegistry\.registerWindow\(win\.id, 'main'/,
    );
    assert.match(manager, /ipcMain\.handle\('tabs:openInMainWindow'[\s\S]{0,400}return manager\.openRouteInMainWindow\(route\);/);
  });

  it('takes calls only for a signed-in session and clears them when it changes', () => {
    assert.match(
      manager,
      /private handleAuthSessionChanged\([\s\S]*?const target = realtimeTargetForSession\(next\);[\s\S]*?this\.cti\.setSession\(target\);/,
    );
    assert.match(manager, /reportUnauthorized: \(sessionId\) => this\.auth\.reportUnauthorized\(sessionId\)/);
    // 발신과 상태 조회는 등록된 화면이면 어디서든, 지금 로그인한 세션으로만.
    for (const channel of ['cti:getStatus', 'cti:getCall', 'cti:dial']) {
      const start = manager.indexOf(`ipcMain.handle('${channel}'`);
      assert.ok(start > 0, channel);
      assert.match(manager.slice(start, start + 320), /isCurrentRegisteredEvent\(event\)/, channel);
    }
    assert.match(
      manager,
      /dialCti\(request: CtiDialRequest\): CtiDialResult \{\s*if \(!this\.isCurrentSignedInSession\(request\.sessionId\)\)/,
    );
    assert.match(manager, /getCtiCall\(\): ActiveCall \| null \{\s*return this\.auth\.isAuthenticated\(\) \? this\.cti\.getCall\(\) : null;/);
  });

  it('pushes call state from main to the popup layer and to every screen', () => {
    assert.match(
      manager,
      /private handleCallChanged\(call: ActiveCall \| null\): void \{\s*this\.presentCallPopup\(call\);\s*this\.broadcastToRenderers\('cti:call', call\);/,
    );
    assert.match(manager, /if \(event\.name === 'cti\.incoming' \|\| event\.name === 'cti\.call\.updated'\) \{\s*this\.cti\.handleServerCallEvent\(\);/);
    // 셸과 탭 화면은 같은 얇은 다리를 쓴다. 팝업의 버튼은 팝업 층 다리에만 있다.
    assert.match(preload, /const windowShellBridge = \{[\s\S]*?\n {2}cti: ctiBridge,\n\};/);
    assert.match(preload, /const nativeTabBridge = \{\s*realtime: realtimeBridge,\s*cti: ctiBridge,/);
    const thin = preload.slice(preload.indexOf('const ctiBridge = {'), preload.indexOf('const realtimeBridge = {'));
    assert.doesNotMatch(thin, /overlay/i);
  });
});
