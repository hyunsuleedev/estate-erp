import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isNativeTabRoute,
  resolveNativeTabRoute,
} from '../src/common/nativeTabs';
import {
  parseRendererSurfaceArguments,
  RENDERER_SURFACE_ARGUMENT,
  RENDERER_TAB_ID_ARGUMENT,
} from '../src/common/rendererSurface';
import { resolveRendererSurface } from '../src/renderer/features/tabs/native/rendererSurface';
import {
  blankTabRetentionUpdate,
  createNativeTabRetentionUpdate,
} from '../src/renderer/features/tabs/native/NativeTabRetentionReporter';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('native tab pilot route', () => {
  it('selects only property detail routes and preserves full href', () => {
    const route = resolveNativeTabRoute(
      '/properties/property-1?view=history#price',
    );

    assert.deepEqual(route, {
      kind: 'property-detail',
      entityId: 'property-1',
      pathname: '/properties/property-1',
      href: '/properties/property-1?view=history#price',
    });
    assert.equal(isNativeTabRoute('/properties/property-1/'), true);
  });

  it('keeps list, draft, and advertising routes on the legacy renderer in pilot scope', () => {
    for (const route of [
      '/properties',
      '/properties/new',
      '/properties/%6Eew',
      '/properties/external-listings',
      '/properties/my-ads',
      '/properties/naver-my-ads',
      '/contacts/contact-1',
    ]) {
      assert.equal(resolveNativeTabRoute(route, 'property-detail'), null, route);
    }
  });

  it('gives every signed-in app screen its own renderer in full scope', () => {
    for (const route of [
      '/dashboard',
      '/properties',
      '/properties/new',
      '/properties/external-listings?tab=1',
      '/contacts/contact-1',
      '/settings/office',
    ]) {
      assert.deepEqual(
        resolveNativeTabRoute(route, 'all'),
        {
          kind: 'app-route',
          pathname: route.split('?')[0],
          href: route,
        },
        route,
      );
    }
  });

  it('leaves sign-in, onboarding, dev, and external routes to the window shell', () => {
    for (const route of [
      '/',
      '/login',
      '/register',
      '/onboarding/office',
      '/onboarding',
      '/dev/cti-preview',
      '//evil.example/path',
      'https://example.com/dashboard',
      // URL 해석에서 역슬래시는 슬래시와 같고 탭·줄바꿈은 지워진다: 다른 호스트가 된다.
      '/\\evil.example/dashboard',
      '/\\/evil.example/contacts',
      '/contacts/../\\evil.example',
      '/\t/evil.example/dashboard',
      '/\n/evil.example/dashboard',
    ]) {
      assert.equal(resolveNativeTabRoute(route, 'all'), null, route);
    }
  });
});

describe('renderer surface role', () => {
  it('requires both native role and tab id in Electron arguments', () => {
    assert.deepEqual(
      parseRendererSurfaceArguments([
        `${RENDERER_SURFACE_ARGUMENT}native-tab`,
        `${RENDERER_TAB_ID_ARGUMENT}tab-1`,
      ]),
      { kind: 'native-tab', tabId: 'tab-1' },
    );
    // 역할은 main이 정해 준 것만 따른다. 빠졌거나 모르는 값이면 어떤 역할도 아니다:
    // 가장 많은 것을 할 수 있는 창의 화면으로 떨어지지 않는다.
    assert.equal(
      parseRendererSurfaceArguments([`${RENDERER_SURFACE_ARGUMENT}native-tab`]),
      null,
    );
    assert.equal(parseRendererSurfaceArguments([]), null);
    assert.equal(
      parseRendererSurfaceArguments([`${RENDERER_SURFACE_ARGUMENT}admin`]),
      null,
    );
    assert.deepEqual(
      parseRendererSurfaceArguments([`${RENDERER_SURFACE_ARGUMENT}window-shell`]),
      { kind: 'window-shell', tabId: null },
    );
    assert.deepEqual(
      parseRendererSurfaceArguments([`${RENDERER_SURFACE_ARGUMENT}call-overlay`]),
      { kind: 'call-overlay', tabId: null },
    );
  });

  it('gives a document a bridge only for the role main granted it', () => {
    const preload = readFileSync(resolve(testDir, '../src/preload/index.ts'), 'utf8');
    const main = readFileSync(resolve(testDir, '../src/main/windowManager.ts'), 'utf8');
    assert.match(preload, /if \(surface\.kind !== 'none'\) \{\s*contextBridge\.exposeInMainWorld\(/);
    assert.match(
      main,
      /additionalArguments: \[`\$\{RENDERER_SURFACE_ARGUMENT\}window-shell`\]/,
    );
  });

  it('prefers preload surface data and supports a browser-test adapter', () => {
    assert.deepEqual(
      resolveRendererSurface(
        { surface: { kind: 'native-tab', tabId: 'bridge-tab' } },
        '?__estate_surface=native-tab&__estate_tab_id=url-tab',
      ),
      { kind: 'native-tab', tabId: 'bridge-tab' },
    );
    assert.deepEqual(
      resolveRendererSurface(
        undefined,
        '?__estate_surface=native-tab&__estate_tab_id=url-tab',
      ),
      { kind: 'native-tab', tabId: 'url-tab' },
    );
  });
});

describe('native tab retention', () => {
  it('reports an upload in progress and clears it even in a hidden tab', () => {
    // 올리는 중이 아니면 보고 내용이 예전과 같다 (칸을 넣지 않는다)
    assert.equal(
      'transferring' in
        createNativeTabRetentionUpdate(0, { transientEditor: false, explicitDirty: false, transferring: false }).reasons,
      false,
    );
    const uploading = createNativeTabRetentionUpdate(0, {
      transientEditor: false,
      explicitDirty: false,
      transferring: true,
    });
    assert.equal(uploading.protected, true);
    assert.equal(uploading.reasons.transferring, true);

    // 보이지 않는 탭에서는 애니메이션 프레임이 돌지 않는다. 타이머로도 상태를 읽어야
    // 뒤에 있는 탭에서 올리기가 끝났을 때 "올리는 중"이 풀려 탭을 닫을 수 있다.
    const reporter = readFileSync(
      new URL('../src/renderer/features/tabs/native/NativeTabRetentionReporter.tsx', import.meta.url),
      'utf8',
    );
    assert.match(reporter, /scheduledFrame = window\.requestAnimationFrame\(read\);/);
    assert.match(reporter, /scheduledTimer = window\.setTimeout\(read, 250\);/);
    assert.match(reporter, /'data-native-tab-transfer',/);
  });

  it('reports a freshly taken blank tab as clean at once, but not a tab that has state to restore', () => {
    // 화면이 처음 알려 오기 전에는 main이 그 탭을 저장 전 작업이 있는 탭으로 본다. 그동안
    // 사이드바 메뉴를 누르면 탭이 옮겨 가지 않고 새 탭이 하나 더 열린다(실제 창에서 재현).
    assert.deepEqual(blankTabRetentionUpdate({}), {
      schemaVersion: 1,
      protected: false,
      viewState: { scrollY: 0 },
      reasons: { mutating: false, transientEditor: false, explicitDirty: false },
    });
    assert.notEqual(blankTabRetentionUpdate({ uiState: { scrollY: 0 } }), null);
    assert.notEqual(blankTabRetentionUpdate({ uiState: { formDraft: {} } }), null);
    // 되살릴 것이 있으면 다 되살린 뒤에 알린다. 먼저 알리면 스크롤 0이 저장된 위치를 덮는다.
    assert.equal(blankTabRetentionUpdate({ uiState: { scrollY: 320 } }), null);
    assert.equal(blankTabRetentionUpdate({ uiState: { formDraft: { memo: '초안' } } }), null);
  });

  it('takes over a prewarmed tab without a gap in which sidebar clicks go nowhere', () => {
    const shell = readFileSync(
      new URL('../src/renderer/routes/_authenticated.tsx', import.meta.url),
      'utf8',
    );
    const takeover = shell.slice(
      shell.indexOf('void ownTab.then(async (snapshot) => {'),
      shell.indexOf('return () => {\n      cancelled = true;'),
    );
    const at = (text: string) => {
      const index = takeover.indexOf(text);
      assert.notEqual(index, -1, `missing: ${text}`);
      return index;
    };
    // 예비 화면은 탭을 맡는 순간 사이드바가 보이고 눌린다. 그 전에 기다리는 것이 하나라도
    // 있으면 그 사이의 클릭은 main에 가지 않는다.
    const firstAwait = at('await ');
    assert.ok(at('bridge.setRetention?.(cleanReport)') < firstAwait);
    assert.ok(at('uninstall = installNativeTabStoreBridge(snapshot, sendAction)') < firstAwait);
    assert.ok(at('uninstall ??= installNativeTabStoreBridge(tab, sendAction)') > firstAwait);
    // 링크·마우스 옆 단추 처리는 탭을 맡기 전부터 걸려 있다.
    const frame = shell.slice(shell.indexOf('function NativeTabShell('));
    assert.ok(
      frame.indexOf('<NativeTabNavigationBridge />') < frame.indexOf('{assigned ? ('),
    );
  });

  it('keeps mutation, transient editor, and dirty reasons independent', () => {
    assert.deepEqual(
      createNativeTabRetentionUpdate(0, {
        transientEditor: false,
        explicitDirty: false,
      }),
      {
        schemaVersion: 1,
        protected: false,
        reasons: {
          mutating: false,
          transientEditor: false,
          explicitDirty: false,
        },
      },
    );
    assert.deepEqual(
      createNativeTabRetentionUpdate(2, {
        transientEditor: true,
        explicitDirty: false,
      }),
      {
        schemaVersion: 1,
        protected: true,
        reasons: {
          mutating: true,
          transientEditor: true,
          explicitDirty: false,
        },
      },
    );

    assert.deepEqual(
      createNativeTabRetentionUpdate(
        0,
        { transientEditor: false, explicitDirty: false },
        { scrollY: 640 },
      ),
      {
        schemaVersion: 1,
        protected: false,
        viewState: { scrollY: 640 },
        reasons: {
          mutating: false,
          transientEditor: false,
          explicitDirty: false,
        },
      },
    );
  });
});
