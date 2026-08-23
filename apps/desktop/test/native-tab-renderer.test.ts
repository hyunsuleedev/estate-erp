import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isNativeTabRoute,
  normalizeNativeTabViewportBounds,
  resolveNativeTabRoute,
} from '../src/common/nativeTabs';
import {
  hasDetachedWindowMarker,
  parseRendererSurfaceArguments,
  RENDERER_SURFACE_ARGUMENT,
  RENDERER_TAB_ID_ARGUMENT,
} from '../src/common/rendererSurface';
import { NativeTabViewportFrame } from '../src/renderer/features/tabs/native/NativeTabViewport';
import { resolveRendererSurface } from '../src/renderer/features/tabs/native/rendererSurface';
import { windowWorkspaceOwnerKey } from '../src/common/windowWorkspace';
import { createNativeTabRetentionUpdate } from '../src/renderer/features/tabs/native/NativeTabRetentionReporter';

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

  it('keeps list, draft, and advertising routes on the legacy renderer', () => {
    for (const route of [
      '/properties',
      '/properties/new',
      '/properties/%6Eew',
      '/properties/external-listings',
      '/properties/my-ads',
      '/properties/naver-my-ads',
      '/contacts/contact-1',
    ]) {
      assert.equal(resolveNativeTabRoute(route), null, route);
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
    assert.deepEqual(
      parseRendererSurfaceArguments([`${RENDERER_SURFACE_ARGUMENT}native-tab`]),
      { kind: 'window-shell', tabId: null },
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

  it('detects detached shells in both packaged search and dev/file hash URLs', () => {
    assert.equal(hasDetachedWindowMarker('?window=detached&tabId=1', ''), true);
    assert.equal(
      hasDetachedWindowMarker('', '#?window=detached&tabId=1'),
      true,
    );
    assert.equal(hasDetachedWindowMarker('?view=history', '#price'), false);
  });
});

describe('native tab viewport', () => {
  it('rounds CSS bounds without producing negative Electron View bounds', () => {
    assert.deepEqual(
      normalizeNativeTabViewportBounds({
        left: -0.4,
        top: 39.6,
        width: 900.5,
        height: -0.1,
      }),
      { x: 0, y: 40, width: 901, height: 0 },
    );
  });

  it('keeps legacy content visible until the native host confirms attachment', () => {
    const mounting = renderToStaticMarkup(
      createElement(
        NativeTabViewportFrame,
        { state: 'mounting' },
        createElement('span', null, 'legacy detail'),
      ),
    );
    const native = renderToStaticMarkup(
      createElement(
        NativeTabViewportFrame,
        { state: 'native' },
        createElement('span', null, 'legacy detail'),
      ),
    );

    assert.match(mounting, /data-native-tab-state="mounting"/);
    assert.doesNotMatch(mounting, /aria-hidden="true"/);
    assert.match(native, /data-native-tab-state="native"/);
    assert.match(native, /aria-hidden="true"/);
    assert.match(native, /invisible pointer-events-none/);
    assert.doesNotMatch(native, /legacy detail/);

    const deferred = renderToStaticMarkup(
      createElement(
        NativeTabViewportFrame,
        { state: 'mounting', renderFallback: false },
        createElement('span', null, 'must not bootstrap twice'),
      ),
    );
    assert.doesNotMatch(deferred, /must not bootstrap twice/);
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

describe('main window workspace identity', () => {
  it('binds reload snapshots to both user and office', () => {
    assert.notEqual(
      windowWorkspaceOwnerKey({ userId: 'user-a', officeId: 'office-a' }),
      windowWorkspaceOwnerKey({ userId: 'user-a', officeId: 'office-b' }),
    );
    assert.notEqual(
      windowWorkspaceOwnerKey({ userId: 'user-a', officeId: 'office-a' }),
      windowWorkspaceOwnerKey({ userId: 'user-b', officeId: 'office-a' }),
    );
  });
});
