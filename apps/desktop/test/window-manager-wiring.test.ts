import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * WindowManager·main.ts·UpdaterService는 Electron에 묶여 있어 여기서 실행할 수 없다.
 * 규칙 자체는 순수 함수와 실제 클래스의 테스트가 지킨다(window-page-role, tab-registry,
 * tab-view-coordinator, native-tab-host, internal-route, startup, updater-access).
 * 이 파일은 그 규칙이 Electron 쪽에 실제로 연결돼 있는지만 소스에서 확인한다.
 */
const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

function body(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return text.slice(from, to);
}

describe('window manager wiring', () => {
  const manager = source('../src/main/windowManager.ts');

  it('applies tab shortcuts wherever the focus is, including the call popup', () => {
    const shortcut = body(manager, '  private handleTabShortcut(', '\n  }');
    assert.match(shortcut, /const command = tabCommandForInput\(input, process\.platform\);/);
    assert.match(shortcut, /if \(!this\.tabRegistry\.isSessionActive\(\)\) return;/);
    assert.match(
      shortcut,
      /event\.preventDefault\(\);\s*this\.tabRegistry\.runCommand\(windowId, command\);/,
    );
    // 창의 화면, 탭 화면, 전화 팝업 층: 셋 다 같은 처리를 거친다.
    assert.equal(manager.match(/this\.handleTabShortcut\(/g)?.length, 3);
    const overlay = body(manager, "additionalArguments: [`${RENDERER_SURFACE_ARGUMENT}call-overlay`]", 'return view;');
    assert.match(
      overlay,
      /view\.webContents\.on\('before-input-event', \(event, input\) => \{\s*this\.handleTabShortcut\(\s*event,\s*input,\s*this\.callOverlays\.windowIdForSender\(view\.webContents\.id\),/,
    );
  });

  it('takes tab commands only from the tab the window shows, and only back/forward', () => {
    const run = body(manager, '  runTabCommandFromSender(', '\n  }');
    assert.match(run, /if \(!isTabScreenCommand\(command\)\) return;/);
    assert.match(run, /const identity = this\.visibleTabSender\(senderWebContentsId\);/);
    const visible = body(manager, '  private visibleTabSender(', '\n  }');
    assert.match(
      visible,
      /this\.tabRegistry\.getActiveTabId\(identity\.hostId\) === identity\.tabId/,
    );
  });

  it('opens routes in the main window for tab views and the call popup only', () => {
    const handler = body(manager, "ipcMain.handle('tabs:openInMainWindow'", '\n  });');
    assert.match(handler, /manager\.isTabScreenSender\(event\.sender\.id\) \|\|\s*manager\.isCallOverlaySender\(event\.sender\.id\)/);
    assert.doesNotMatch(handler, /isCurrentRegisteredEvent/);
    const open = body(manager, '  openRouteInMainWindow(', '\n  }');
    assert.match(open, /if \(!isTabScreenRoute\(route\)\) \{/);
    // main 쪽에는 탭 화면 주소를 느슨하게 가리는 자리가 남아 있지 않다.
    assert.doesNotMatch(manager, /isInternalRoute|resolveNativeTabRoute\(/);
  });

  it('records what a tab view shows only through the shared recorder', () => {
    assert.match(manager, /const outcome = recordViewLocation\(\s*this\.nativeTabs,\s*this\.tabRegistry,/);
    assert.equal(manager.match(/updateRendererState\(/g), null);
  });

  it('names each window after its tab and keeps the document title out', () => {
    const publish = body(manager, '  private publishTabBarState(', '\n  }');
    assert.match(publish, /win\.setTitle\(windowTitleForTabs\(state\)\);/);
    assert.match(publish, /if \(this\.windows\.get\(windowId\)\?\.committed !== 'tab-bar'\) return;/);
    assert.match(manager, /win\.on\('page-title-updated', \(event\) => event\.preventDefault\(\)\);/);
  });

  it('reloads a window page that failed, crashed or is not the one main asked for', () => {
    assert.match(
      manager,
      /'did-fail-load',\s*\(_event, code, _description, _url, isMainFrame\) => \{\s*if \(isMainFrame && code !== -3\) \{\s*this\.recoverWindowPage\(windowId,/,
    );
    assert.match(
      manager,
      /win\.webContents\.on\('render-process-gone', \(_event, details\) => \{\s*entry\.committed = null;\s*this\.recoverWindowPage\(windowId,/,
    );
    assert.match(manager, /windowPageNeedsRecovery\(\{[\s\S]{0,200}\}\)\s*\) \{\s*this\.recoverWindowPage\(/);
    const recover = body(manager, '  private recoverWindowPage(', '\n  }\n');
    assert.match(recover, /const plan = planWindowPageRecovery\(entry\.recovery, Date\.now\(\)\);/);
    assert.match(recover, /this\.loadWindowPage\(win, entry\.page, \{ force: true \}\);/);
  });

  it('destroys a half-made tab window instead of leaving it hidden', () => {
    const create = body(manager, '  private createTabWindow(', '\n  private tabDropScene(');
    assert.match(create, /let created: BrowserWindow \| null = null;/);
    assert.match(
      create,
      /\} catch \(error\) \{[\s\S]*?if \(created && !created\.isDestroyed\(\)\) \{[\s\S]*?created\.destroy\(\);[\s\S]*?return null;/,
    );
  });

  it('delivers notices after the tab switch, and never to the tab bar document', () => {
    const toast = body(manager, '  deliverWindowToast(', '\n  }');
    assert.match(toast, /\.sendToPresentedTab\(windowId, 'tabs:toast', toast\)/);
    assert.match(toast, /if \(!delivered\) this\.sendToGatePage\(windowId, 'tabs:toast', toast\);/);
    const gate = body(manager, '  private sendToGatePage(', '\n  }');
    assert.match(gate, /if \(this\.windows\.get\(windowId\)\?\.committed !== 'gate'\) return false;/);
    // 창의 화면에 직접 보내는 자리는 탭바 상태(탭바 문서)와 gate 전용 통로뿐이다.
    assert.equal(manager.match(/win\.webContents\.send\(/g)?.length, 2);
  });

  it('makes a main window for the login screen when the registry asks for one', () => {
    assert.match(manager, /openMainWindow: \(\) => \{\s*this\.createMainWindow\(\);\s*\},/);
  });

  it('takes tab drops only through the tab bar channel and decides them in the registry', () => {
    // 탭을 옮기는 두 동작(다른 창이 받기, 탭 줄 밖에서 끝남)은 탭바 통로로만 온다. 그 통로는
    // 탭바 문서가 보낸 것만 받고, 모양은 계약의 검사를 거친다. 따로 낸 통로가 없다.
    const channel = body(manager, 'ipcMain.on(TAB_BAR_CHANNELS.action', '\n  });');
    assert.match(channel, /const windowId = windowIdOfTabBarEvent\(event\);/);
    assert.match(channel, /parseTabBarActionEnvelope\(payload\)/);
    assert.doesNotMatch(manager, /ipcMain\.(on|handle)\('tabs:(adopt|drop|drag|moveTab)/);
    // 자리를 따지는 것은 Electron 없는 규칙(src/main/tabs/tabDrop.ts)이다. 여기서는 창들의
    // 자리만 알려 준다: 보이는 창을, 가장 최근에 앞에 있던 창부터.
    const scene = body(manager, '  private tabDropScene(', '\n  }\n');
    assert.match(scene, /if \(!win \|\| win\.isDestroyed\(\) \|\| !win\.isVisible\(\) \|\| win\.isMinimized\(\)\) continue;/);
    assert.match(scene, /windows\.sort\(\(a, b\) => b\.order - a\.order\);/);
    assert.match(scene, /sourceContent: source\.getContentBounds\(\),/);
    assert.match(scene, /zoomFactor: source\.webContents\.getZoomFactor\(\),/);
    assert.match(manager, /tabDropScene: \(sourceWindowId\) => this\.tabDropScene\(sourceWindowId\),/);
  });

  it('keeps a window behind the one in use from jumping forward when its tab changes', () => {
    // 탭 화면에 focus를 주면 그 창도 앞으로 나온다. 탭을 다른 창으로 옮긴 뒤 원래 창이 남은
    // 탭을 보여 줄 때 새 창 앞으로 튀어나오지 않도록, 앞에 있는 창의 탭 화면에만 focus를 준다
    // (규칙은 NativeTabHost.activate, test/native-tab-host.test.ts).
    assert.match(manager, /\(\) => this\.isFrontAppWindow\(windowId\),/);
    const front = body(manager, '  private isFrontAppWindow(', '\n  }\n');
    assert.match(front, /for \(const order of this\.windowFocusOrder\.values\(\)\) \{\s*if \(order > mine\) return false;/);
    // 앞으로 가져오기로 한 창은 OS가 focus를 옮기기 전에 먼저 기록한다.
    const create = body(manager, '  private createTabWindow(', '\n  private tabDropScene(');
    assert.match(create, /this\.noteWindowBroughtForward\(windowId\);\s*win\.show\(\);/);
    const focus = body(manager, '  private focusWindow(', '\n  }\n');
    assert.match(focus, /this\.noteWindowBroughtForward\(windowId\);[\s\S]*?win\.focus\(\);\s*this\.focusActiveTabView\(windowId\);/);
    const adapter = source('../src/main/electronNativeTabAdapter.ts');
    assert.match(adapter, /canTakeFocus\(\): boolean \{\s*return this\.isFrontWindow\?\.\(\) \?\? true;/);
  });

  it('creates no window while a tab is being dragged', () => {
    // 예전에는 탭을 끌어내는 순간 새 창을 만들어 마우스를 따라가게 했다. 그 장치가 없다.
    for (const removed of [
      /alwaysOnTop/,
      /setIgnoreMouseEvents/,
      /showInactive/,
      /setFocusable/,
      /moveDraggedWindow|settleDraggedWindow|isDragging/,
      /drag-out/,
    ]) {
      assert.doesNotMatch(manager, removed);
    }
    const registry = source('../src/main/tabs/tabRegistry.ts');
    assert.doesNotMatch(registry, /drag-out|DragSession|dragTimeout|setTimeout/);
  });
});

describe('updater and startup wiring', () => {
  it('checks who is asking on every updater channel', () => {
    const updater = source('../src/main/updaterService.ts');
    for (const request of ['getStatus', 'check', 'install', 'getDismissed', 'dismiss']) {
      assert.match(
        updater,
        new RegExp(`this\\.isAllowed\\(event, '${request}'\\)`),
        request,
      );
    }
    // 정해 주지 않으면 아무 요청도 받지 않는다.
    assert.match(updater, /private readonly isAllowed: UpdaterAccess = \(\) => false,/);
    const main = source('../src/main.ts');
    assert.match(
      main,
      /allowsUpdaterRequest\(\s*request,\s*event\.senderFrame === event\.sender\.mainFrame\s*\? windowManager\.updaterSenderKind\(event\.sender\.id\)\s*: 'other',/,
    );
  });

  it('runs the startup order from src/main/startup.ts and stops reopening windows after a failure', () => {
    const main = source('../src/main.ts');
    assert.match(main, /void runStartup\(\{[\s\S]*?checkForUpdates: \(\) => \{\s*updaterService\.checkForUpdates\(\);\s*\},\s*createWindow,[\s\S]*?reportFailure: reportStartupFailure,/);
    assert.doesNotMatch(main, /app\.on\('ready', async/);
    assert.equal(main.match(/if \(startupFailed\) return;/g)?.length, 2);
    // 시작하지 못한 빌드도 고친 버전이 내려받아지면 스스로 설치한다.
    assert.match(main, /if \(startupFailed && channel === 'updater:status'\) installDownloadedUpdate\(\);/);
  });
});
