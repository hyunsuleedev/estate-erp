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
import { createNativeTabRetentionUpdate } from '../src/renderer/features/tabs/native/NativeTabRetentionReporter';

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
    const preload = readFileSync(resolve(testDir, '../src/preload.ts'), 'utf8');
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
