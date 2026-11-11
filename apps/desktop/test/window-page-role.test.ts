import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { RendererLocation } from '../src/main/rendererDocuments';
import {
  NO_WINDOW_PAGE_FAILURES,
  WINDOW_PAGE_RETRY_DELAYS_MS,
  WINDOW_PAGE_RETRY_RESET_MS,
  allowsWindowPageNavigation,
  planWindowPageRecovery,
  windowPageNeedsRecovery,
  windowPageReceivesAppBroadcasts,
  windowPageRoleOfDocument,
} from '../src/main/windowPageRole';

const rendererDir = path.resolve('/opt/app/.vite/renderer/main_window');
const dev: RendererLocation = { devServerUrl: 'http://localhost:5175', rendererDir };
const packaged: RendererLocation = { packagedBaseUrl: 'estate-erp://app', rendererDir };
const files: RendererLocation = { rendererDir };
const fileUrl = (name: string, hash = '') =>
  pathToFileURL(path.join(rendererDir, name)).toString() + hash;

describe('which document a window page is', () => {
  it('decides the role from the document that was committed', () => {
    for (const [location, base] of [
      [dev, 'http://localhost:5175'],
      [packaged, 'estate-erp://app'],
    ] as const) {
      assert.equal(windowPageRoleOfDocument(location, `${base}/tabbar.html`), 'tab-bar');
      assert.equal(windowPageRoleOfDocument(location, `${base}/`), 'gate');
      assert.equal(windowPageRoleOfDocument(location, `${base}/login`), 'gate');
      assert.equal(windowPageRoleOfDocument(location, `${base}/onboarding/office`), 'gate');
      // 대소문자를 가리지 않는 파일 시스템은 같은 파일을 내준다: 같은 문서로 본다.
      assert.equal(windowPageRoleOfDocument(location, `${base}/TABBAR.HTML`), 'tab-bar');
    }
    assert.equal(windowPageRoleOfDocument(files, fileUrl('tabbar.html')), 'tab-bar');
    assert.equal(windowPageRoleOfDocument(files, fileUrl('index.html', '#/login')), 'gate');
  });

  it('gives no role to documents the app does not serve, or to error responses', () => {
    assert.equal(windowPageRoleOfDocument(dev, 'https://example.com/tabbar.html'), null);
    assert.equal(windowPageRoleOfDocument(packaged, 'estate-erp://evil/tabbar.html'), null);
    assert.equal(windowPageRoleOfDocument(packaged, 'file:///etc/passwd'), null);
    assert.equal(windowPageRoleOfDocument(dev, 'about:blank'), null);
    assert.equal(windowPageRoleOfDocument(dev, 'not a url'), null);
    // 탭바 문서가 빠진 빌드의 404, 개발 서버의 500: 문서가 들어서도 역할이 없다.
    assert.equal(
      windowPageRoleOfDocument(packaged, 'estate-erp://app/tabbar.html', 404),
      null,
    );
    assert.equal(windowPageRoleOfDocument(dev, 'http://localhost:5175/', 500), null);
    // 파일로 연 문서에는 응답 코드가 없다(-1).
    assert.equal(windowPageRoleOfDocument(files, fileUrl('tabbar.html'), -1), 'tab-bar');
  });

  it('keeps the recorded role when the document rewrites its own address', () => {
    // 탭바 문서가 history.pushState로 주소를 /x로 바꿨다. 그 주소만 보면 로그인 화면으로
    // 보인다. 그래서 main은 문서가 들어설 때 기록한 역할을 쓰고, 이 함수는 문서가 바뀌는
    // 이동이 끝났을 때만 부른다(src/main/windowManager.ts의 did-navigate).
    const liveUrlAfterPushState = 'http://localhost:5175/x';
    assert.equal(windowPageRoleOfDocument(dev, liveUrlAfterPushState), 'gate');
    const recorded = windowPageRoleOfDocument(dev, 'http://localhost:5175/tabbar.html');
    assert.equal(recorded, 'tab-bar');
    // 그 상태에서 문서가 "다시 불러오기"를 해도(/x로 가는 이동) 역할이 달라지므로 막힌다.
    assert.equal(
      allowsWindowPageNavigation(
        dev,
        { requested: 'tab-bar', committed: recorded },
        liveUrlAfterPushState,
      ),
      false,
    );
  });

  it('lets a window page reload itself but not move to the other document', () => {
    const tabBar = { requested: 'tab-bar', committed: 'tab-bar' } as const;
    const gate = { requested: 'gate', committed: 'gate' } as const;
    // 다시 불러오기(개발 서버의 전체 새로 고침 등)
    assert.equal(
      allowsWindowPageNavigation(dev, tabBar, 'http://localhost:5175/tabbar.html'),
      true,
    );
    assert.equal(allowsWindowPageNavigation(dev, gate, 'http://localhost:5175/login'), true);
    assert.equal(allowsWindowPageNavigation(dev, gate, 'http://localhost:5175/'), true);
    // 탭바 문서 → 로그인 화면, 로그인 화면 → 탭바 문서: main만 바꾼다.
    assert.equal(allowsWindowPageNavigation(dev, tabBar, 'http://localhost:5175/login'), false);
    assert.equal(allowsWindowPageNavigation(dev, tabBar, 'http://localhost:5175/'), false);
    assert.equal(
      allowsWindowPageNavigation(dev, gate, 'http://localhost:5175/tabbar.html'),
      false,
    );
    assert.equal(
      allowsWindowPageNavigation(packaged, gate, 'estate-erp://app/TABBAR.HTML'),
      false,
    );
    // 앱 밖
    assert.equal(allowsWindowPageNavigation(dev, gate, 'https://example.com/'), false);
    assert.equal(allowsWindowPageNavigation(dev, tabBar, 'tel:01012345678'), false);
  });

  it('blocks page-started navigation while main is replacing the document', () => {
    // 로그인 직후: main이 탭바 문서를 불러오는 중이고 아직 로그인 화면이 떠 있다.
    assert.equal(
      allowsWindowPageNavigation(
        dev,
        { requested: 'tab-bar', committed: 'gate' },
        'http://localhost:5175/login',
      ),
      false,
    );
    // 아직 아무 문서도 들어서지 않았다.
    assert.equal(
      allowsWindowPageNavigation(
        dev,
        { requested: 'gate', committed: null },
        'http://localhost:5175/',
      ),
      false,
    );
  });

  it('asks for recovery only when the wrong document stays in place', () => {
    assert.equal(
      windowPageNeedsRecovery({ requested: 'tab-bar', committed: 'tab-bar', loading: false }),
      false,
    );
    // main이 시작한 로드가 진행 중이면 곧 바뀐다(로그인 화면이 막 들어선 직후 탭바 문서를 부른 경우).
    assert.equal(
      windowPageNeedsRecovery({ requested: 'tab-bar', committed: 'gate', loading: true }),
      false,
    );
    assert.equal(
      windowPageNeedsRecovery({ requested: 'tab-bar', committed: 'gate', loading: false }),
      true,
    );
    // 오류 응답이 들어섰다(역할 없음).
    assert.equal(
      windowPageNeedsRecovery({ requested: 'tab-bar', committed: null, loading: false }),
      true,
    );
    assert.equal(
      windowPageNeedsRecovery({ requested: null, committed: null, loading: false }),
      false,
    );
  });

  it('sends app-wide state to the login screen only, never to the tab bar document', () => {
    assert.equal(windowPageReceivesAppBroadcasts('gate'), true);
    assert.equal(windowPageReceivesAppBroadcasts('tab-bar'), false);
    assert.equal(windowPageReceivesAppBroadcasts(null), false);
  });
});

describe('reloading a window page that failed', () => {
  it('retries a few times with growing delays and then gives up', () => {
    let state = NO_WINDOW_PAGE_FAILURES;
    let now = 1_000;
    const delays: number[] = [];
    for (;;) {
      const plan = planWindowPageRecovery(state, now);
      if (!plan) break;
      delays.push(plan.delayMs);
      state = plan.next;
      now += plan.delayMs + 50;
      assert.ok(delays.length <= 10, 'recovery must be bounded');
    }
    assert.deepEqual(delays, [...WINDOW_PAGE_RETRY_DELAYS_MS]);
    // 그만둔 뒤 곧바로 또 실패해도 다시 시도하지 않는다(끝없이 깜빡이지 않게).
    assert.equal(planWindowPageRecovery(state, now + 1_000), null);
  });

  it('starts counting again after the page has been fine for a while', () => {
    let state = NO_WINDOW_PAGE_FAILURES;
    let now = 1_000;
    for (let i = 0; i < WINDOW_PAGE_RETRY_DELAYS_MS.length; i += 1) {
      const plan = planWindowPageRecovery(state, now);
      assert.ok(plan);
      state = plan.next;
      now += 100;
    }
    assert.equal(planWindowPageRecovery(state, now), null);
    const later = planWindowPageRecovery(state, now + WINDOW_PAGE_RETRY_RESET_MS + 1);
    assert.deepEqual(later, {
      delayMs: WINDOW_PAGE_RETRY_DELAYS_MS[0],
      next: { attempts: 1, lastFailureAt: now + WINDOW_PAGE_RETRY_RESET_MS + 1 },
    });
  });
});
