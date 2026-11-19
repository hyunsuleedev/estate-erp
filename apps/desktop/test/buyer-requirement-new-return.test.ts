import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { NativeTabAction } from '../src/common/nativeTabActions';
import { getRouteMetaCore } from '../src/common/tabs/routeMeta';
import { TabRegistry, type TabRegistryHost } from '../src/main/tabs/tabRegistry';
import { installNativeTabStoreBridge } from '../src/renderer/features/tabs/native/nativeTabStoreBridge';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

/*
 * 구함 의뢰 추가 화면에서 취소하면 연 화면으로 돌아가는지를, 실제 앱과 같은 길로 확인한다:
 * 탭 화면의 store(자기 탭만 담은 사본) → 셸로 보내는 요청 → main의 탭 목록(TabRegistry).
 * 브라우저 미리보기는 탭 목록이 한곳에 있어서 요청 순서가 틀려도 드러나지 않는다.
 */

const MAIN = 1;
const FORM_FROM_WANTED = '/buyer-requirements/new?from=wanted-properties';
const pageSource = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../src/renderer/routes/_authenticated/buyer-requirements/new.tsx',
  ),
  'utf8',
);

function setup() {
  // 화면을 그리는 쪽은 이 시험에서 보지 않는다. 탭 목록이 어떻게 바뀌는지만 본다.
  const ignore = () => undefined;
  const host: TabRegistryHost = {
    platform: 'darwin',
    views: {
      present: ignore,
      discard: ignore,
      move: ignore,
      hasUnsavedWork: () => false,
    },
    publishState: ignore,
    publishSidebar: ignore,
    showToast: ignore,
    showMenu: async () => null,
    createWindow: () => null,
    openMainWindow: ignore,
    closeWindow: ignore,
    tabDropScene: () => null,
    moveWindow: ignore,
    focusWindow: ignore,
  };
  let nextId = 0;
  let now = 1_000;
  const registry = new TabRegistry(host, {
    env: { newId: () => `tab-${(nextId += 1)}`, now: () => (now += 1) },
  });
  registry.registerWindow(MAIN, 'main');
  registry.startSession();

  const active = () => {
    const id = registry.getActiveTabId(MAIN);
    assert.ok(id, 'main window has no active tab');
    return id;
  };
  const routeOf = (tabId: string) => registry.getTabSnapshot(tabId)?.route;
  /** 그 탭 화면 안의 페이지가 "새 탭으로 열기"를 한 것처럼 연다 (새 탭은 맨 끝에 붙고 앞으로 나온다). */
  const openFrom = (senderTabId: string, route: string) => {
    const meta = getRouteMetaCore(route);
    registry.applyTabAction(senderTabId, {
      type: 'create-tab',
      input: { route, kind: meta.kind, title: meta.title },
    });
    return active();
  };
  /**
   * 그 탭 화면 안에서 페이지가 store를 부르는 것처럼 실행한다. 실제 앱과 같이, 탭 화면의 store는
   * 자기 탭만 담은 사본이고 부른 것은 요청이 되어 탭 목록으로 간다.
   */
  const inTabScreen = (tabId: string, run: () => void) => {
    const tab = registry.getTabSnapshot(tabId);
    assert.ok(tab, `tab ${tabId} is not open`);
    const sent: NativeTabAction['type'][] = [];
    const uninstall = installNativeTabStoreBridge(tab, (action) => {
      sent.push(action.type);
      registry.applyTabAction(tabId, action);
    });
    try {
      run();
    } finally {
      uninstall();
    }
    return sent;
  };
  const openModule = (route: string) => {
    const meta = getRouteMetaCore(route);
    useTabStore.getState().openModule({ route, kind: meta.kind, title: meta.title });
  };

  return { registry, active, routeOf, openFrom, inTabScreen, openModule };
}

/** 희망매물 → 매물관리 → 고객 원장 순으로 열려 있고, 희망매물에서 "희망매물 생성"을 누른 상태. */
function openFormFromWanted() {
  const s = setup();
  const wanted = s.openFrom(s.active(), '/wanted-properties');
  s.openFrom(wanted, '/properties');
  const ledger = s.openFrom(wanted, '/customers-table');
  const form = s.openFrom(wanted, FORM_FROM_WANTED);
  assert.equal(s.routeOf(form), FORM_FROM_WANTED, '등록 화면의 주소에 연 곳이 남아 있어야 한다');
  assert.equal(s.active(), form);
  return { ...s, wanted, ledger, form };
}

describe('구함 의뢰 추가 화면의 취소', () => {
  it('opens the return screen first and then closes its own tab', () => {
    // 화면이 store를 부르는 순서
    assert.match(
      pageSource,
      /const handleCancel = \(\) => \{[\s\S]*?openModule\(\{[\s\S]*?\}\);\s*if \(ownerTabIdRef\.current\) \{\s*closeTab\(ownerTabIdRef\.current\);\s*\}\s*\};/,
    );
    assert.match(
      pageSource,
      /const returnRoute = from === 'wanted-properties' \? '\/wanted-properties' : '\/customers-table';/,
    );
  });

  it('returns to the 희망매물 tab it was opened from, not to the tab next to the closed one', () => {
    const s = openFormFromWanted();
    const sent = s.inTabScreen(s.form, () => {
      s.openModule('/wanted-properties');
      useTabStore.getState().closeTab(s.form);
    });

    assert.deepEqual(sent, ['open-module', 'close']);
    assert.equal(s.active(), s.wanted);
    assert.equal(s.registry.getTabSnapshot(s.form), null, '등록 화면 탭은 닫힌다');
    // 희망매물 탭을 새로 만들지 않고 있던 탭으로 돌아간다
    assert.equal(
      s.registry.getTabs(MAIN).filter((tab) => tab.route.startsWith('/wanted-properties')).length,
      1,
    );
  });

  it('would land on the last tab if it closed itself first (the request after closing is dropped)', () => {
    // 고치기 전의 순서. 셸은 이미 닫힌 탭이 보낸 요청을 받지 않으므로 "희망매물을 열어 달라"가 버려지고,
    // 닫힌 자리의 옆 탭(이 화면은 맨 끝에 열리므로 그때의 마지막 탭)이 뜬다.
    const s = openFormFromWanted();
    s.inTabScreen(s.form, () => {
      useTabStore.getState().closeTab(s.form);
      s.openModule('/wanted-properties');
    });

    assert.equal(s.active(), s.ledger);
    assert.notEqual(s.active(), s.wanted);
  });

  it('opens 희망매물 anew when the tab it came from is gone', () => {
    const s = openFormFromWanted();
    // 등록 화면을 연 뒤에 희망매물 탭을 닫았다
    s.inTabScreen(s.wanted, () => useTabStore.getState().closeTab(s.wanted));
    assert.equal(s.registry.getTabSnapshot(s.wanted), null);

    s.inTabScreen(s.form, () => {
      s.openModule('/wanted-properties');
      useTabStore.getState().closeTab(s.form);
    });

    assert.equal(s.routeOf(s.active()), '/wanted-properties');
    assert.equal(s.registry.getTabSnapshot(s.form), null);
  });

  it('still returns to the customer ledger when opened from there', () => {
    const s = setup();
    const ledger = s.openFrom(s.active(), '/customers-table');
    s.openFrom(ledger, '/wanted-properties');
    const form = s.openFrom(ledger, '/buyer-requirements/new');

    s.inTabScreen(form, () => {
      s.openModule('/customers-table');
      useTabStore.getState().closeTab(form);
    });

    assert.equal(s.active(), ledger);
    assert.equal(s.registry.getTabSnapshot(form), null);
  });
});
