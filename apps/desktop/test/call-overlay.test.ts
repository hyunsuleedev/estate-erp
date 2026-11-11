import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isCallOverlayState,
  parseCallOverlayAction,
  parseCallOverlaySize,
  parseWindowToast,
  placeCallOverlay,
  toastBottomOffset,
} from '../src/common/callOverlay';
import { normalizeRendererSurface } from '../src/common/rendererSurface';
import { notify } from '../src/renderer/lib/notify';

const testDir = dirname(fileURLToPath(import.meta.url));
const globalWithWindow = globalThis as { window?: unknown };

describe('call overlay contract', () => {
  it('recognizes the call overlay renderer surface', () => {
    assert.deepEqual(normalizeRendererSurface({ kind: 'call-overlay' }), {
      kind: 'call-overlay',
      tabId: null,
    });
  });

  it('accepts only known popup actions and in-app routes', () => {
    assert.deepEqual(parseCallOverlayAction({ type: 'dismiss', extra: 1 }), {
      type: 'dismiss',
    });
    assert.deepEqual(
      parseCallOverlayAction({ type: 'open-route', route: '/calls/logs?phone=%2201012345678%22' }),
      { type: 'open-route', route: '/calls/logs?phone=%2201012345678%22' },
    );
    assert.deepEqual(
      parseCallOverlayAction({ type: 'patch-call-log', patch: { contactId: 'c1' } }),
      { type: 'patch-call-log', patch: { contactId: 'c1' } },
    );
    for (const value of [
      { type: 'open-route', route: 'https://example.com' },
      { type: 'open-route', route: '//example.com' },
      { type: 'patch-call-log', patch: 'x' },
      { type: 'close-window' },
      null,
    ]) {
      assert.equal(parseCallOverlayAction(value), null, JSON.stringify(value));
    }
  });

  it('bounds the reported popup size', () => {
    assert.deepEqual(parseCallOverlaySize({ width: 400.2, height: 380.9 }), {
      width: 401,
      height: 381,
    });
    assert.equal(parseCallOverlaySize({ width: 0, height: 10 }), null);
    assert.equal(parseCallOverlaySize({ width: 10, height: Number.POSITIVE_INFINITY }), null);
    assert.equal(parseCallOverlaySize({ width: 5000, height: 10 }), null);
  });

  it('accepts call state JSON and the hidden state', () => {
    assert.equal(isCallOverlayState(null), true);
    assert.equal(isCallOverlayState({ key: 1, phase: 'ringing', lookup: null }), true);
    assert.equal(isCallOverlayState('ringing'), false);
  });

  it('pins the popup layer to the bottom-right corner without covering the tab bar', () => {
    assert.deepEqual(
      placeCallOverlay({ width: 1440, height: 900 }, { width: 400, height: 440 }, 40),
      { x: 1040, y: 460, width: 400, height: 440 },
    );
    // 창이 팝업보다 작으면 탭바 아래로 줄인다.
    assert.deepEqual(
      placeCallOverlay({ width: 300, height: 300 }, { width: 400, height: 440 }, 40),
      { x: 0, y: 40, width: 300, height: 260 },
    );
  });

  it('lifts toasts above the call popup while it occupies the bottom-right corner', () => {
    // 팝업이 없으면 sonner 기본 여백 그대로다.
    assert.equal(toastBottomOffset({ bottom: 0 }), 24);
    // 팝업 층 195px = 카드 155 + 아래 16 + 그림자 24 → 카드 위 12px.
    assert.equal(toastBottomOffset({ bottom: 195 }), 183);
    assert.ok(toastBottomOffset({ bottom: 195 }) > 155 + 16);
  });

  it('validates forwarded toasts', () => {
    assert.deepEqual(parseWindowToast({ level: 'warning', message: '이동하지 않았습니다', description: '저장하세요' }), {
      level: 'warning',
      message: '이동하지 않았습니다',
      description: '저장하세요',
    });
    assert.equal(parseWindowToast({ level: 'fatal', message: 'x' }), null);
    assert.equal(parseWindowToast({ level: 'info', message: '' }), null);
  });
});

describe('window toasts', () => {
  const previousWindow = globalWithWindow.window;
  afterEach(() => {
    globalWithWindow.window = previousWindow;
  });

  it('sends shell toasts to the visible tab screen instead of drawing under it', () => {
    const forwarded: unknown[] = [];
    globalWithWindow.window = {
      electronBridge: {
        surface: { kind: 'window-shell', tabId: null },
        tabs: { showToast: (toast: unknown) => forwarded.push(toast) },
      },
      location: { search: '' },
    };

    notify('warning', '저장하지 않은 입력이 있어 이동하지 않았습니다.', {
      description: '저장하거나 입력을 취소한 뒤 다시 시도하세요.',
    });

    assert.deepEqual(forwarded, [
      {
        level: 'warning',
        message: '저장하지 않은 입력이 있어 이동하지 않았습니다.',
        description: '저장하거나 입력을 취소한 뒤 다시 시도하세요.',
      },
    ]);
  });

  it('resends the target window toast offset after a tab screen moves windows', () => {
    const manager = readFileSync(
      resolve(testDir, '../src/main/windowManager.ts'),
      'utf8',
    );
    // 옮기는 순간에는 새 창 소속으로 기록되기 전이라 창 단위 알림이 닿지 않는다.
    assert.match(
      manager,
      /this\.nativeTabs\.reparent\(tab\.id, win\.id\);[\s\S]{0,120}this\.pushWindowStateToTab\(tab\.id\)/,
    );
    assert.match(
      manager,
      /if \(rolledBack\) this\.pushWindowStateToTab\(move\.tabId\)/,
    );
    const pushStart = manager.indexOf('private pushWindowStateToTab(');
    assert.ok(pushStart > 0);
    assert.match(manager.slice(pushStart, pushStart + 900), /'tabs:overlayInset'/);
  });

  it('keeps the shell from hiding tab screens during a call when the popup layer exists', () => {
    const layout = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated.tsx'),
      'utf8',
    );
    assert.match(layout, /suspended=\{!popupOnOverlayLayer && activeCall !== null\}/);
    assert.match(layout, /popupOnOverlayLayer \? null : <CallPopup \/>/);
  });
});
