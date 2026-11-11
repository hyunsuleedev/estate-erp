import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(testDir, relativePath), 'utf8');
}

describe('property full-page window', () => {
  it('opens the inspector full page in a standalone window instead of a tab', () => {
    const pageSource = source(
      '../src/renderer/routes/_authenticated/properties/index.tsx',
    );
    const handlerStart = pageSource.indexOf('const openFullPage = async () =>');
    const handlerEnd = pageSource.indexOf('\n  };', handlerStart);
    const handler = pageSource.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.match(handler, /tabsBridge\.openPropertyWindow\(\{/);
    assert.match(handler, /propertyId: property\.id/);
    assert.match(handler, /if \(!result\.ok\)/);
    assert.match(handler, /onClose\(\)/);
    assert.doesNotMatch(handler, /openOrRevealResource|createTab/);
    const inspectorViewSource = source(
      '../src/renderer/routes/_authenticated/properties/-components/property-inspector-view.tsx',
    );
    assert.match(pageSource, /isOpeningFullPage=\{isOpeningFullPage\}/);
    assert.match(inspectorViewSource, /disabled=\{isOpeningFullPage\}/);
    assert.match(
      inspectorViewSource,
      /aria-label="전체 페이지를 새 창으로 열기"/,
    );
  });

  it('opens an independent window whose single tab the main-side tab list owns', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const methodStart = mainSource.indexOf('  openPropertyWindow(');
    const methodEnd = mainSource.indexOf('  /**', methodStart);
    const method = mainSource.slice(methodStart, methodEnd);

    assert.ok(methodStart >= 0 && methodEnd > methodStart);
    // 다른 탭을 건드리지 않고, 탭 하나를 가진 새 창을 탭 목록이 만든다.
    assert.match(method, /this\.tabRegistry\.openStandaloneTab\(/);
    assert.match(
      method,
      /resourceKey: tabResourceKeys\.entity\('property', payload\.propertyId\)/,
    );
    // 창은 숨긴 채 만들고, 탭 화면이 붙거나 창의 화면이 준비되면 스스로 보인다.
    const createStart = mainSource.indexOf('private createTabWindow(');
    const createEnd = mainSource.indexOf('private tabDropScene(', createStart);
    const create = mainSource.slice(createStart, createEnd);
    assert.match(create, /show: false/);
    assert.match(create, /win\.once\('ready-to-show', reveal\)/);
    assert.match(
      mainSource,
      /onViewAttached: \(tabId, windowId\) => \{[\s\S]{0,300}this\.pendingWindowReveals\.get\(windowId\)\?\.\(\);/,
    );
    // 창의 화면이 탭을 받았다고 답하기를 기다리지 않는다.
    assert.match(
      mainSource,
      /ipcMain\.handle\('tabs:openPropertyWindow', \(event, payload: unknown\) => \{[\s\S]*?return manager\.openPropertyWindow\(payload, source\.id\);/,
    );
    assert.doesNotMatch(mainSource, /acceptance|acceptInitialTab/);
  });

  it('exposes only the narrow property-window IPC contract', () => {
    const sharedSource = source('../../../packages/shared/src/types/tabs.ts');
    const preloadSource = source('../src/preload.ts');
    const declarationSource = source('../src/renderer/electron.d.ts');

    assert.match(
      sharedSource,
      /interface OpenPropertyWindowPayload \{\s*propertyId: string;\s*title: string;\s*\}/,
    );
    assert.match(preloadSource, /openPropertyWindow:[\s\S]*?tabs:openPropertyWindow/);
    assert.match(declarationSource, /openPropertyWindow:[\s\S]*?OpenPropertyWindowPayload/);
  });

  it('restores native detail view state through an authorized main snapshot', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const preloadSource = source('../src/preload.ts');
    const reporterSource = source(
      '../src/renderer/features/tabs/native/NativeTabRetentionReporter.tsx',
    );
    assert.match(mainSource, /tabs:getNativeTabSnapshot/);
    assert.match(
      mainSource,
      /manager\.isAuthorizedNativeSender\(event\.sender\.id\)/,
    );
    assert.match(preloadSource, /getNativeTabSnapshot:[\s\S]*?tabs:getNativeTabSnapshot/);
    assert.match(reporterSource, /data-window-shell="native-tab"/);
    assert.match(reporterSource, /container\.scrollTop = scrollY/);
  });

  it('keeps the tabs in main so a reloaded window page finds them unchanged', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const preloadSource = source('../src/preload.ts');
    const layoutSource = source('../src/renderer/routes/_authenticated.tsx');

    // 창의 화면은 탭 목록을 갖지 않는다. 뜰 때 main에서 읽고, 바뀔 때마다 받는다.
    assert.match(mainSource, /private readonly tabRegistry: TabRegistry;/);
    assert.match(preloadSource, /ipcRenderer\.sendSync\(TAB_BAR_CHANNELS\.bootstrap\)/);
    // 로그인 뒤의 창 화면은 탭바 문서다. 앱 문서는 Electron에서 탭바를 그리지 않는다.
    assert.match(layoutSource, /if \(window\.electronBridge\) return <SplashScreen \/>;/);
    // 창의 화면이 탭 목록을 main에 올려 보내거나 되받던 통로는 없다.
    for (const removed of [
      'tabs:getWindowWorkspace',
      'tabs:syncWindowWorkspace',
      'tabs:syncWindowTabs',
      'tabs:commitTransfer',
      'tabs:beginDrag',
    ]) {
      assert.doesNotMatch(mainSource, new RegExp(removed), removed);
      assert.doesNotMatch(preloadSource, new RegExp(removed), removed);
    }
    // 창의 화면이 다시 뜬다고 탭 화면을 가리지 않는다.
    assert.doesNotMatch(mainSource, /rendererSuspendedNativeHosts|suspendNativeHost/);
  });

  it('attaches a live view to a window made for a dropped tab before showing it', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const methodStart = mainSource.indexOf('private createTabWindow(');
    const methodEnd = mainSource.indexOf('private tabDropScene(', methodStart);
    const method = mainSource.slice(methodStart, methodEnd);

    assert.ok(methodStart >= 0 && methodEnd > methodStart);
    assert.match(method, /show: false/);
    // 탭을 놓은 뒤에 만드는 보통 창이다: 보일 때 앞으로 나온다. 끄는 동안 떠다니는 창이 아니다.
    assert.match(method, /win\.show\(\);[\s\S]*?win\.focus\(\);/);
    assert.doesNotMatch(method, /alwaysOnTop|setIgnoreMouseEvents|showInactive|focusable/);
    // 놓은 자리에 맞춘 자리(화면 밖으로 걸치지 않게 다듬은 것)에 원래 창과 같은 크기로 만든다.
    assert.match(method, /dropPosition = this\.placedPosition\(request\.placement, \{ width, height \}\);/);
    // 처음 보여 줄 때 OS가 자리를 바꿨으면 우리가 정한 자리로 다시 맞춘다.
    assert.match(
      method,
      /win\.show\(\);[\s\S]*?if \(dropPosition\) win\.setPosition\(dropPosition\.x, dropPosition\.y, false\);\s*win\.focus\(\);/,
    );

    // 탭 화면을 붙일 자리를 준비한 뒤에 돌려준다. 탭 목록이 곧바로 떠 있는 화면을 옮긴다.
    const hostIndex = method.indexOf("this.registerNativeHost(win, 'detached')");
    const loadIndex = method.indexOf("this.loadWindowPage(win, 'tab-bar')");
    const returnIndex = method.indexOf('return windowId;');
    assert.ok(hostIndex >= 0 && loadIndex > hostIndex && returnIndex > loadIndex);

    // 탭 화면의 자리는 main이 창 크기로 정한다(탭바 40px 아래 전부).
    assert.match(
      mainSource,
      /private tabViewBoundsFor\(win: BrowserWindow\): NativeTabBounds \{[\s\S]*?y: DETACHED_TITLEBAR_HEIGHT,[\s\S]*?height: Math\.max\(0, height - DETACHED_TITLEBAR_HEIGHT\)/,
    );
  });

  it('caps live native renderers globally and never leaves a moved view pinned', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const coordinatorSource = source('../src/main/tabs/tabViewCoordinator.ts');

    assert.match(
      mainSource,
      /new NativeTabHost\([\s\S]*?maxLiveTabs: 5,[\s\S]*?inactiveGraceMs: 30_000/,
    );
    // 보여 주는 동안만 화면을 붙잡고, 끝나면 놓는다(놓지 않으면 내려가지 않는다).
    assert.match(coordinatorSource, /retainUntilActivation: true/);
    assert.match(
      coordinatorSource,
      /this\.host\.releaseActivationLease\(opened\.activationLease\)/,
    );
    // 창 사이로 옮긴 화면은 바로 확정한다. 되돌릴 일이 없다.
    assert.match(
      coordinatorSource,
      /const move = this\.host\.reparent\(tabId, toWindowId\);[\s\S]{0,120}this\.host\.settleMove\(move\);/,
    );
  });

  it('routes non-property links out of a native detail surface', () => {
    const layoutSource = source('../src/renderer/routes/_authenticated.tsx');
    const mainSource = source('../src/main/windowManager.ts');
    const preloadSource = source('../src/preload.ts');

    assert.match(layoutSource, /NativeTabNavigationBridge/);
    assert.match(layoutSource, /resolveNativeTabRoute\(rawHref\)/);
    assert.match(layoutSource, /openInMainWindow\(rawHref\)/);
    assert.match(preloadSource, /const nativeTabBridge[\s\S]*?openInMainWindow/);
    assert.match(
      mainSource,
      /if \(outcome !== 'not-a-tab-screen'\) return;[\s\S]*?nativeTabDestinationFor\(identity\.tab\.route\)/,
    );
  });
});
