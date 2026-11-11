import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCallOverlayAction } from '../src/common/callOverlay';
import {
  MAX_INTERNAL_ROUTE_LENGTH,
  isInternalRoute,
  resolveInternalUrl,
} from '../src/common/internalRoute';
import { parseNativeTabAction } from '../src/common/nativeTabActions';
import {
  isOverlongTabScreenRoute,
  isTabScreenRoute,
  resolveNativeTabRoute,
  resolveTabScreenRoute,
} from '../src/common/nativeTabs';
import { isTabCommand, isTabScreenCommand } from '../src/common/tabCommands';
import { emptyTabBarState, isTabBarState } from '../src/common/tabs/tabBarContract';

/** URL 해석에서 다른 호스트가 되는 값들. `\`는 `/`와 같고 탭·줄바꿈은 지워진다. */
const ESCAPING = [
  '//evil.example/dashboard',
  '/\\evil.example/dashboard',
  '/\\evil.example/properties/abc',
  '/\\/evil.example/contacts',
  '/contacts/../\\evil.example',
  '/\t/evil.example/dashboard',
  '/\n/evil.example/dashboard',
  '/\r\\evil.example',
  'https://evil.example/dashboard',
  'javascript:alert(1)',
  '',
  'dashboard',
];

const INTERNAL = [
  '/dashboard',
  '/properties/7678feb6-182e-4406-a7f1-434e9ee76dc0?tab=history#price',
  '/contacts?q=%ED%99%8D%EA%B8%B8%EB%8F%99',
  '/properties?q=고덕 그라시움',
];

describe('addresses inside the app', () => {
  it('accepts app addresses and rejects anything that could name another host', () => {
    for (const route of INTERNAL) assert.equal(isInternalRoute(route), true, route);
    for (const route of ESCAPING) {
      assert.equal(isInternalRoute(route), false, JSON.stringify(route));
    }
    for (const value of [null, undefined, 3, {}, ['/dashboard']]) {
      assert.equal(isInternalRoute(value), false);
    }
    assert.equal(isInternalRoute('/' + 'a'.repeat(5_000)), false);
    assert.equal(isInternalRoute('/' + 'a'.repeat(50), 20), false);
  });

  it('resolves only to the same origin as the base', () => {
    const base = 'http://localhost:5175/';
    assert.equal(
      resolveInternalUrl('/properties/p1?tab=history', base),
      'http://localhost:5175/properties/p1?tab=history',
    );
    assert.equal(
      resolveInternalUrl('/dashboard', 'estate-erp://app/'),
      'estate-erp://app/dashboard',
    );
    for (const route of ESCAPING) {
      assert.equal(resolveInternalUrl(route, base), null, JSON.stringify(route));
    }
    // 검사를 건너뛴 값이 넘어왔더라도, 그대로 해석하면 다른 호스트가 된다는 것을 보인다.
    assert.equal(new URL('/\\evil.example/dashboard', base).origin, 'http://evil.example');
    assert.equal(resolveInternalUrl('/dashboard', 'not a url'), null);
  });

  it('is the rule every route validator applies', () => {
    for (const route of ESCAPING) {
      const label = JSON.stringify(route);
      assert.equal(parseCallOverlayAction({ type: 'open-route', route }), null, label);
      assert.equal(resolveNativeTabRoute(route), null, label);
      assert.equal(parseNativeTabAction({ type: 'adopt-location', route }), null, label);
      assert.equal(
        parseNativeTabAction({ type: 'navigate', input: { route, title: 'x' } }),
        null,
        label,
      );
      assert.equal(
        parseNativeTabAction({
          type: 'create-tab',
          input: { route, title: 'x' },
        }),
        null,
        label,
      );
      assert.equal(
        isTabBarState({
          ...emptyTabBarState('main', 'darwin'),
          tabs: [{ id: 'a', title: 'x', route, kind: 'generic', dirty: false }],
          activeTabId: 'a',
        }),
        false,
        label,
      );
    }
    assert.deepEqual(parseCallOverlayAction({ type: 'open-route', route: '/contacts/c1' }), {
      type: 'open-route',
      route: '/contacts/c1',
    });
  });
});

describe('addresses that can be a tab', () => {
  /** 창의 화면이 그리는 것(로그인 전 화면, 문서 파일). 앱 안의 주소이지만 탭이 될 수 없다. */
  const NOT_TAB_SCREENS = [
    '/',
    '/login',
    '/login?next=%2Fdashboard',
    '/register',
    '/onboarding',
    '/onboarding/office',
    '/dev/cti-preview',
    '/tabbar.html',
    '/TABBAR.HTML',
    '/index.html',
  ];

  it('accepts the screens of the signed-in app only', () => {
    for (const route of INTERNAL) {
      assert.equal(isTabScreenRoute(route), true, route);
      assert.ok(resolveTabScreenRoute(route), route);
    }
    assert.equal(resolveTabScreenRoute('/properties/p1')?.kind, 'property-detail');
    assert.equal(resolveTabScreenRoute('/properties/new')?.kind, 'app-route');
    for (const route of NOT_TAB_SCREENS) {
      assert.equal(isInternalRoute(route), true, `${route} is inside the app`);
      assert.equal(isTabScreenRoute(route), false, route);
    }
    for (const route of ESCAPING) assert.equal(isTabScreenRoute(route), false);
    for (const value of [null, undefined, 3, {}, ['/dashboard']]) {
      assert.equal(isTabScreenRoute(value), false);
    }
  });

  it('is what a page inside a tab view and the call popup may ask to open', () => {
    for (const route of NOT_TAB_SCREENS) {
      assert.equal(parseCallOverlayAction({ type: 'open-route', route }), null, route);
      assert.equal(parseNativeTabAction({ type: 'adopt-location', route }), null, route);
      for (const type of ['create-tab', 'open-module', 'navigate']) {
        assert.equal(parseNativeTabAction({ type, input: { route, title: 'x' } }), null, route);
      }
      for (const type of ['open-resource', 'replace-resource']) {
        assert.equal(
          parseNativeTabAction({
            type,
            input: { route, title: 'x', resourceKey: 'entity:property:p1' },
          }),
          null,
          route,
        );
      }
    }
    assert.ok(parseNativeTabAction({ type: 'navigate', input: { route: '/contacts', title: 'x' } }));
  });

  it('uses one length limit everywhere, so no side keeps an address the other refused', () => {
    const atLimit = `/properties?q=${'a'.repeat(MAX_INTERNAL_ROUTE_LENGTH - '/properties?q='.length)}`;
    const overLimit = `${atLimit}a`;
    assert.equal(atLimit.length, MAX_INTERNAL_ROUTE_LENGTH);

    assert.equal(isTabScreenRoute(atLimit), true);
    assert.ok(resolveNativeTabRoute(atLimit));
    assert.ok(parseNativeTabAction({ type: 'adopt-location', route: atLimit }));

    assert.equal(isTabScreenRoute(overLimit), false);
    assert.equal(resolveNativeTabRoute(overLimit), null);
    assert.equal(resolveTabScreenRoute(overLimit), null);
    assert.equal(parseNativeTabAction({ type: 'adopt-location', route: overLimit }), null);
    assert.equal(parseCallOverlayAction({ type: 'open-route', route: overLimit }), null);

    // 너무 긴 앱 화면 주소는 따로 알아본다: 화면은 그대로 두고 기록만 하지 않는다.
    assert.equal(isOverlongTabScreenRoute(overLimit), true);
    assert.equal(isOverlongTabScreenRoute(atLimit), false);
    // 길다고 해서 탭이 될 수 없는 화면이나 앱 밖의 주소가 그렇게 취급되지는 않는다.
    assert.equal(isOverlongTabScreenRoute(`/login?x=${'a'.repeat(5_000)}`), false);
    assert.equal(isOverlongTabScreenRoute(`//evil.example/${'a'.repeat(5_000)}`), false);
    assert.equal(isOverlongTabScreenRoute(null), false);
  });
});

describe('tab commands a tab view may send', () => {
  it('allows back and forward only', () => {
    assert.equal(isTabScreenCommand({ type: 'history', direction: 'back' }), true);
    assert.equal(isTabScreenCommand({ type: 'history', direction: 'forward' }), true);
    // 아래는 모두 올바른 탭 명령이지만(단축키로는 main이 직접 받는다) 탭 화면이 보낼 수는 없다.
    for (const command of [
      { type: 'close-tab' },
      { type: 'new-tab' },
      { type: 'reopen-closed-tab' },
      { type: 'select-relative-tab', offset: 1 },
      { type: 'select-tab-index', index: 0 },
    ] as const) {
      assert.equal(isTabCommand(command), true, command.type);
      assert.equal(isTabScreenCommand(command), false, command.type);
    }
  });
});
