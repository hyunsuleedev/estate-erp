import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(testDir, relativePath), 'utf8');
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function methodBody(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return text.slice(from, to);
}

describe('desktop auth lifecycle wiring', () => {
  it('lets only main own the session: renderers cannot publish it or hold tokens for others', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const preloadSource = source('../src/preload.ts');

    // 셸을 "세션 주인"으로 뽑던 통로는 없다.
    for (const removed of [
      'auth:publishSession',
      'auth:tokenRequest',
      'auth:resolveToken',
      'auth:requestSignOut',
      'auth:signOutRequest',
      'auth:resolveSignOut',
      'authBroker',
    ]) {
      assert.ok(!mainSource.includes(removed), `main still has ${removed}`);
      assert.ok(!preloadSource.includes(removed), `preload still has ${removed}`);
    }
    assert.match(mainSource, /private readonly auth: DesktopAuthController;/);
    assert.match(mainSource, /createSessionUserFetcher\(\{ apiBaseUrl, fetch: electronFetch \}\)/);
  });

  it('has no Clerk left in the desktop app', () => {
    const offenders = sourceFiles(resolve(testDir, '../src')).filter((path) =>
      /@clerk\/|ClerkProvider/.test(readFileSync(path, 'utf8')),
    );
    assert.deepEqual(offenders, []);
    const pkg = JSON.parse(source('../package.json')) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(
      Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('@clerk/')),
      [],
    );
    assert.ok(!/clerk/i.test(source('../index.html')));
  });

  it('clears the previous account before announcing a new session to every surface', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const handler = methodBody(
      mainSource,
      'private handleAuthSessionChanged(',
      '\n  /**\n   * 창 자체의 화면 가운데 앱 전체의 상태를 받는 것',
    );

    // 사람·사무소가 바뀔 때만 탭 목록(탭·닫은 탭·입력 초안, 메인 창이 아닌 창), 탭 화면과
    // 예비 화면, 팝업 층을 치운다.
    assert.match(
      handler,
      /if \(authSessionPrincipal\(previous\) !== authSessionPrincipal\(next\)\) \{[\s\S]*?\(\) => this\.tabRegistry\.endSession\(\),[\s\S]*?\(\) => this\.nativeTabs\.clearTabs\(\),[\s\S]*?\(\) => this\.callOverlays\.destroyAll\(\),/,
    );
    // 치우다 한 단계가 실패해도 새 세션은 반드시 알린다(다른 창이 이전 계정 화면에 남지 않게).
    assert.match(
      handler,
      /\} finally \{[\s\S]{0,200}this\.broadcastToRenderers\('auth:session', next, \{ overlays: true \}\);\s*\}/,
    );
    // 실시간 연결도 화면보다 먼저 새 세션을 따른다(이전 계정의 연결을 먼저 끊는다).
    assert.ok(
      handler.indexOf('this.realtime.setSession(') <
        handler.indexOf("this.broadcastToRenderers('auth:session'"),
    );
    // 치운 다음에 셸, 탭 화면(여분 포함), 팝업 층 모두에 알린다.
    const cleanupEnd = handler.indexOf('this.callOverlays.destroyAll()');
    assert.ok(cleanupEnd !== -1);
    assert.match(
      handler.slice(cleanupEnd),
      /this\.broadcastToRenderers\('auth:session', next, \{ overlays: true \}\)/,
    );
    // 사무소가 있는 로그인이 확인된 뒤에야 메인 창에 첫 탭을 연다(알린 다음에).
    const broadcastAt = handler.indexOf("this.broadcastToRenderers('auth:session'");
    assert.match(
      handler.slice(broadcastAt),
      /if \(target && !this\.tabRegistry\.isSessionActive\(\)\) \{\s*this\.tabRegistry\.startSession\(\);/,
    );
    assert.match(handler, /const target = realtimeTargetForSession\(next\);/);
    const broadcast = methodBody(
      mainSource,
      '  broadcastToRenderers(',
      '\n  /** 지금 로그인한 세션의 접근 토큰',
    );
    // 창의 화면 가운데는 로그인 전 화면만 받는다. 탭바 문서에는 세션(사용자 정보)을 보내지 않는다.
    assert.match(
      broadcast,
      /for \(const page of this\.gatePages\(\)\) \{\s*try \{\s*page\.send\(channel, payload\);/,
    );
    assert.doesNotMatch(broadcast, /getAllWindows/);
    assert.match(
      mainSource,
      /private gatePages\(\): Electron\.WebContents\[\] \{[\s\S]*?if \(!windowPageReceivesAppBroadcasts\(entry\.committed\)\) continue;/,
    );
    assert.match(
      broadcast,
      /this\.nativeTabs\.broadcast\(channel, payload, \{ includeSpare: true \}\)/,
    );
    assert.match(
      broadcast,
      /if \(options\.overlays\) this\.callOverlays\.broadcast\(channel, payload\)/,
    );
  });

  it('accepts login and retry only from the window shell itself', () => {
    const mainSource = source('../src/main/windowManager.ts');
    // 창에 붙은 탭 화면도 isRegisteredShellSender는 통과하므로 창 자체의 화면인지 본다.
    assert.match(
      mainSource,
      /const isCurrentWindowShellEvent = [\s\S]{0,120}manager\.isWindowShellSender\(event\.sender\.id\)/,
    );
    for (const channel of ['auth:login', 'auth:signup', 'auth:retry']) {
      const handler = methodBody(mainSource, `ipcMain.handle('${channel}'`, '\n  });');
      assert.match(handler, /if \(!isCurrentWindowShellEvent\(event\)\)/, channel);
    }
    const preloadSource = source('../src/preload.ts');
    const sessionBridge = methodBody(
      preloadSource,
      'const sessionAuthBridge = {',
      '\n};',
    );
    assert.ok(!/login|signup|retry/.test(sessionBridge));
    assert.equal(preloadSource.match(/auth: sessionAuthBridge,/g)?.length, 2);
    assert.equal(preloadSource.match(/auth: shellAuthBridge,/g)?.length, 1);
  });

  it('scopes tokens, logout and unauthorized reports to the session a screen shows', () => {
    const mainSource = source('../src/main/windowManager.ts');
    for (const [channel, call] of [
      ['auth:getToken', 'manager.requestAuthToken(parseAuthSessionScope(payload))'],
      ['auth:logout', 'manager.logoutAuth(parseAuthSessionScope(payload))'],
      [
        'auth:reportUnauthorized',
        'manager.reportAuthUnauthorized(parseAuthSessionScope(payload))',
      ],
    ] as const) {
      const handler = methodBody(mainSource, `ipcMain.handle('${channel}'`, '\n  });');
      assert.ok(handler.includes(call), channel);
    }

    const providerSource = source('../src/renderer/providers/auth-provider.tsx');
    // 토큰은 사용자가 확인된 세션 번호로만 받는다.
    assert.match(
      providerSource,
      /tokenSessionIdRef\.current = next\.authenticated\s*\? next\.providerSessionId\s*: null;/,
    );
    assert.match(
      providerSource,
      /const sessionId = tokenSessionIdRef\.current;\s*return sessionId === null \? null : bridge\.getToken\(\{ sessionId \}\);/,
    );
    // bearer가 실린 401은 main에 확인을 맡기고, 화면이 스스로 로그아웃시키지 않는다.
    assert.match(
      providerSource,
      /if \(hadBearer && sessionId !== null\) \{[\s\S]*?bridge\.reportUnauthorized\(\{ sessionId \}\)[\s\S]*?return;\s*\}[\s\S]*?void resync\(\);/,
    );
  });

  it('mirrors main on every surface and keeps the unreachable state out of the login form', () => {
    const providerSource = source('../src/renderer/providers/auth-provider.tsx');
    assert.equal(providerSource.match(/export function AuthProvider\(/g)?.length, 1);
    assert.ok(!/publishSession|api\.auth\.me\(/.test(providerSource));
    assert.match(
      providerSource,
      /isShell && status === 'unreachable' \? \([\s\S]*?<ServerUnreachableScreen onRetry=\{retry\} onLogout=\{logout\} \/>/,
    );
    assert.match(
      providerSource,
      /isLoading: status === 'loading' \|\| \(!isShell && status === 'unreachable'\)/,
    );
  });

  it('keeps the browser-preview login out of Electron and out of packaged builds', () => {
    const entry = source('../src/renderer/main.tsx');
    // 개발 서버를 일반 브라우저로 연 경우에만 불러온다. 조건이 거짓으로 굳는 빌드에서는
    // 아래 동적 import가 통째로 빠진다.
    assert.match(
      entry,
      /if \(import\.meta\.env\.DEV && !window\.electronBridge\) \{[\s\S]*?import\('\.\/dev\/browser-preview-auth'\)/,
    );
    assert.equal(entry.match(/browser-preview-auth/g)?.length, 1);
    const importers = sourceFiles(resolve(testDir, '../src')).filter(
      (path) =>
        !path.endsWith('browser-preview-auth.ts') &&
        /browser-preview-auth/.test(readFileSync(path, 'utf8')),
    );
    assert.deepEqual(importers.map((path) => path.split('/src/')[1]), ['renderer/main.tsx']);

    const bridge = source('../src/renderer/lib/auth-bridge.ts');
    assert.match(
      bridge,
      /if \(!import\.meta\.env\.DEV \|\| window\.electronBridge\) return;/,
    );
    // Electron의 main이 있으면 언제나 그쪽이 먼저다.
    assert.match(bridge, /return window\.electronBridge\?\.auth \?\? browserPreviewBridge \?\? undefined;/);
    const preview = source('../src/renderer/dev/browser-preview-auth.ts');
    assert.match(
      preview,
      /if \(!import\.meta\.env\.DEV \|\| window\.electronBridge\) \{\s*throw new Error/,
    );
  });

  it('does not erase a restored detached workspace during initial same-principal hydration', () => {
    const providerSource = source('../src/renderer/providers/auth-provider.tsx');

    assert.match(
      providerSource,
      /principalRef\.current !== nextPrincipal &&\s*\(!isShell \|\| hasEstablishedPrincipalRef\.current\)/,
    );
    assert.match(
      providerSource,
      /if \(shouldReset\) \{[\s\S]*?resetWorkspaceForAuthChange\(\)/,
    );
    assert.match(
      providerSource,
      /if \(nextPrincipal !== null\) hasEstablishedPrincipalRef\.current = true/,
    );
  });

  it('hands a window its tabs from main without trusting what the page says about the account', () => {
    const preloadSource = source('../src/preload.ts');
    const mainSource = source('../src/main/windowManager.ts');

    // 탭바 문서만, 문서가 뜨는 순간 main에서 자기 창의 탭 상태를 읽는다. 누구의 탭인지는
    // 화면이 말하지 않는다: main의 탭 목록은 지금 로그인한 세션의 것뿐이다.
    assert.match(
      preloadSource,
      /if \(isTabBarDocument\) \{[\s\S]*?ipcRenderer\.sendSync\(TAB_BAR_CHANNELS\.bootstrap\)/,
    );
    assert.doesNotMatch(preloadSource, /tabs:getInitialTab|tabs:getWindowWorkspace/);
    assert.match(
      mainSource,
      /ipcMain\.on\(TAB_BAR_CHANNELS\.bootstrap, \(event\) => \{\s*const windowId = windowIdOfTabBarEvent\(event\);\s*event\.returnValue = windowId === null \? null : manager\.getTabBarState\(windowId\);/,
    );
    assert.match(
      mainSource,
      /ipcMain\.on\(TAB_BAR_CHANNELS\.action, \(event, payload: unknown\) => \{\s*const windowId = windowIdOfTabBarEvent\(event\);\s*const envelope = windowId === null \? null : parseTabBarActionEnvelope\(payload\);/,
    );
    // 탭바 통로는 창 자체의 화면이 탭바 문서일 때만 열린다. 창에 붙은 탭 화면도, 로그인
    // 화면도 쓸 수 없다.
    assert.match(
      mainSource,
      /windowIdForTabBarSender\(senderWebContentsId: number\): number \| null \{[\s\S]*?if \(win\.webContents\.id !== senderWebContentsId\) return null;\s*return entry\.committed === 'tab-bar' \? win\.id : null;/,
    );
  });

  it('keeps the signed-in tab bar document away from login and tokens', () => {
    const preloadSource = source('../src/preload.ts');
    const mainSource = source('../src/main/windowManager.ts');

    // 탭바 문서에는 탭바 통로만 내준다. 로그인·토큰·실시간·전화 통로는 없다.
    const bridge = methodBody(preloadSource, 'const tabBarWindowBridge = {', '\n};');
    assert.match(bridge, /tabs: \{ tabBar: tabBarBridge \}/);
    assert.doesNotMatch(bridge, /auth|realtime|cti|updater/);
    assert.match(
      preloadSource,
      /: isTabBarDocument\s*\? tabBarWindowBridge\s*: windowShellBridge/,
    );
    // main도 다시 가린다: 창의 화면은 문서가 들어설 때 기록한 역할로 본다(떠 있는 동안의
    // 주소가 아니다. 규칙은 test/window-page-role.test.ts). 탭바 문서는 "등록된 화면"이
    // 아니어서 세션·토큰을 읽을 수 없고, 로그인 화면이 아니어서 로그인·가입을 요청할 수 없다.
    const registered = methodBody(
      mainSource,
      '  isRegisteredShellSender(senderWebContentsId: number): boolean {',
      '\n  }',
    );
    assert.match(
      registered,
      /if \(win\.webContents\.id !== senderWebContentsId\) return true;\s*return entry\.committed === 'gate';/,
    );
    assert.doesNotMatch(mainSource, /isTabBarPageUrl|isTabBarDocumentUrl/);
    assert.match(
      mainSource,
      /win\.webContents\.on\('did-navigate', \(_event, url, httpResponseCode\) => \{\s*entry\.committed = windowPageRoleOfDocument\(/,
    );
    // 창의 화면은 스스로 다른 문서로 옮겨 가지 못한다.
    assert.match(
      mainSource,
      /const guardShellNavigation = \(event: Electron\.Event, url: string\) => \{\s*if \(\s*allowsWindowPageNavigation\(/,
    );
    const shellOnly = methodBody(
      mainSource,
      '  isWindowShellSender(senderWebContentsId: number): boolean {',
      '\n  }',
    );
    assert.match(shellOnly, /if \(!this\.isRegisteredShellSender\(senderWebContentsId\)\) return false;/);
    // 세션이 시작되고 끝날 때만 창의 화면을 바꾼다.
    assert.match(
      mainSource,
      /this\.tabRegistry\.startSession\(\);[\s\S]{0,160}this\.showTabBarPages\(\);/,
    );
    assert.match(mainSource, /\(\) => this\.showGatePages\(\),/);
  });
});
