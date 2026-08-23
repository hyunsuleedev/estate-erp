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
    assert.match(pageSource, /disabled=\{isOpeningFullPage\}/);
    assert.match(pageSource, /aria-label="전체 페이지를 새 창으로 열기"/);
  });

  it('bootstraps an independent sidebarless window without transfer ownership', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const methodStart = mainSource.indexOf('createPropertyWindow(');
    const methodEnd = mainSource.indexOf(
      '/**\n   * 드래그 detach 시작',
      methodStart,
    );
    const method = mainSource.slice(methodStart, methodEnd);

    assert.ok(methodStart >= 0 && methodEnd > methodStart);
    assert.match(method, /show: false/);
    assert.match(method, /registerStandaloneWindow/);
    assert.doesNotMatch(method, /this\.transfers\.set|outgoingTabIds/);
    assert.match(mainSource, /bootstrapMode: 'standalone'/);
    assert.match(mainSource, /transferCommitted: true/);
    assert.match(
      mainSource,
      /const accepted = await result\.acceptance;[\s\S]*?target\.show\(\);[\s\S]*?target\.focus\(\)/,
    );
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

  it('keeps committed live views out of rollback and restores main tab ids', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const preloadSource = source('../src/preload.ts');
    const layoutSource = source('../src/renderer/routes/_authenticated.tsx');
    const workspaceHook = source(
      '../src/renderer/features/tabs/hooks/useWindowWorkspace.ts',
    );

    assert.match(
      mainSource,
      /if \(transfer\.state === 'committed'\) continue;[\s\S]*?rollbackNativeTransferOrPrepareRecovery/,
    );
    assert.match(mainSource, /syncMainWindowWorkspace\(/);
    assert.match(mainSource, /getMainWindowWorkspace\(/);
    assert.match(preloadSource, /tabs:getWindowWorkspace/);
    assert.match(preloadSource, /tabs:syncWindowWorkspace/);
    assert.match(layoutSource, /useWindowWorkspace\(/);
    assert.match(workspaceHook, /restoreTransferredWorkspace\(workspace\)/);
  });

  it('attaches a live property view before presenting its drag window', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const methodStart = mainSource.indexOf('beginDragDetach(');
    const methodEnd = mainSource.indexOf(
      '/**\n   * 드래그 중 마우스 좌표',
      methodStart,
    );
    const method = mainSource.slice(methodStart, methodEnd);

    assert.ok(methodStart >= 0 && methodEnd > methodStart);
    assert.match(method, /show: !isLiveNativeTransfer/);
    assert.match(method, /y: DETACHED_TITLEBAR_HEIGHT/);
    assert.match(method, /contentBounds\.height - DETACHED_TITLEBAR_HEIGHT/);

    const reparentIndex = method.indexOf(
      'this.nativeTabs.reparent(tab.id, win.id)',
    );
    const showIndex = method.indexOf('win.showInactive()');
    const shellLoadIndex = method.indexOf(
      'this.loadDetachedRenderer(win, tab, transferId)',
    );
    assert.ok(reparentIndex >= 0);
    assert.ok(showIndex > reparentIndex);
    assert.ok(shellLoadIndex > showIndex);
  });

  it('caps live native renderers globally and settles transfer eviction protection on commit', () => {
    const mainSource = source('../src/main/windowManager.ts');

    assert.match(
      mainSource,
      /new NativeTabHost\([\s\S]*?maxLiveTabs: 5,[\s\S]*?inactiveGraceMs: 30_000/,
    );
    assert.match(mainSource, /retainUntilActivation: true/);
    assert.match(
      mainSource,
      /this\.nativeTabs\.releaseActivationLease\(opened\.activationLease\)/,
    );

    const methodStart = mainSource.indexOf(
      'private markTransferCommitted(transfer: TransferRecord)',
    );
    const methodEnd = mainSource.indexOf(
      'private rollbackNativeTransfer(',
      methodStart,
    );
    const method = mainSource.slice(methodStart, methodEnd);
    assert.ok(methodStart >= 0 && methodEnd > methodStart);
    assert.match(
      method,
      /const nativeMove = this\.nativeTransferMoves\.get\(transfer\.transferId\)/,
    );
    assert.match(method, /this\.nativeTabs\.settleMove\(nativeMove\)/);
    assert.match(
      method,
      /this\.nativeTransferMoves\.delete\(transfer\.transferId\)/,
    );
    assert.ok(
      method.indexOf('this.nativeTabs.settleMove(nativeMove)') <
        method.indexOf(
          'this.nativeTransferMoves.delete(transfer.transferId)',
        ),
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
      /if \(!route \|\| !descriptor\)[\s\S]*?nativeTabDestinationFor\(identity\.tab\.route\)/,
    );
  });
});
