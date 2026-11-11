import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  appRouteTarget,
  fallsBackToAppDocument,
  internalHrefFromDocumentUrl,
  isAbortOfAnotherLoad,
  isTabBarDocumentUrl,
  isTrustedDocumentUrl,
  missingRendererDocuments,
  resolvePackagedRequest,
  tabBarDocumentPath,
  windowPageTarget,
  type RendererLocation,
} from '../src/main/rendererDocuments';

const rendererDir = path.resolve('/opt/app/.vite/renderer/main_window');
const dev: RendererLocation = { devServerUrl: 'http://localhost:5175', rendererDir };
const packaged: RendererLocation = { packagedBaseUrl: 'estate-erp://app', rendererDir };
const files: RendererLocation = { rendererDir };
const fileUrl = (name: string, hash = '') =>
  pathToFileURL(path.join(rendererDir, name)).toString() + hash;

describe('documents the app loads into windows and tab views', () => {
  it('loads the login screen before sign-in and the tab bar document after', () => {
    assert.deepEqual(windowPageTarget(dev, 'gate'), { url: 'http://localhost:5175/' });
    assert.deepEqual(windowPageTarget(dev, 'tab-bar'), {
      url: 'http://localhost:5175/tabbar.html',
    });
    assert.deepEqual(windowPageTarget(packaged, 'gate'), { url: 'estate-erp://app/' });
    assert.deepEqual(windowPageTarget(packaged, 'tab-bar'), {
      url: 'estate-erp://app/tabbar.html',
    });
    assert.deepEqual(windowPageTarget(files, 'gate'), {
      filePath: path.join(rendererDir, 'index.html'),
    });
    assert.deepEqual(windowPageTarget(files, 'tab-bar'), {
      filePath: path.join(rendererDir, 'tabbar.html'),
    });
  });

  it('trusts both documents in every way the app is run, and nothing else', () => {
    for (const [location, urls] of [
      [dev, ['http://localhost:5175/', 'http://localhost:5175/tabbar.html', 'http://localhost:5175/properties/p1']],
      [packaged, ['estate-erp://app/', 'estate-erp://app/tabbar.html', 'estate-erp://app/properties/p1']],
      [files, [fileUrl('index.html'), fileUrl('index.html', '#/properties/p1'), fileUrl('tabbar.html')]],
    ] as const) {
      for (const url of urls) assert.equal(isTrustedDocumentUrl(location, url), true, url);
    }
    for (const [location, urls] of [
      [dev, ['http://localhost:5174/', 'http://evil.example/tabbar.html', 'estate-erp://app/']],
      [packaged, ['estate-erp://other/', 'http://localhost:5175/', 'https://app/tabbar.html']],
      [files, [fileUrl('other.html'), pathToFileURL('/tmp/tabbar.html').toString(), 'http://localhost:5175/']],
    ] as const) {
      for (const url of urls) assert.equal(isTrustedDocumentUrl(location, url), false, url);
    }
    assert.equal(isTrustedDocumentUrl(dev, 'not a url'), false);
  });

  it('tells the tab bar document from the login screen and from tab views', () => {
    assert.equal(isTabBarDocumentUrl(dev, 'http://localhost:5175/tabbar.html'), true);
    assert.equal(isTabBarDocumentUrl(packaged, 'estate-erp://app/tabbar.html'), true);
    assert.equal(isTabBarDocumentUrl(files, fileUrl('tabbar.html')), true);
    for (const [location, url] of [
      [dev, 'http://localhost:5175/'],
      [dev, 'http://localhost:5175/login'],
      [dev, 'http://localhost:5175/properties/p1'],
      [dev, 'http://evil.example/tabbar.html'],
      [packaged, 'estate-erp://app/dashboard'],
      [files, fileUrl('index.html', '#/tabbar.html')],
    ] as const) {
      assert.equal(isTabBarDocumentUrl(location, url), false, url);
    }
  });

  it('opens tab views at app addresses only', () => {
    assert.deepEqual(appRouteTarget(dev, '/properties/p1?tab=history'), {
      url: 'http://localhost:5175/properties/p1?tab=history',
    });
    assert.deepEqual(appRouteTarget(packaged, '/call-overlay'), {
      url: 'estate-erp://app/call-overlay',
    });
    assert.deepEqual(appRouteTarget(files, '/dashboard'), {
      filePath: path.join(rendererDir, 'index.html'),
      hash: '/dashboard',
    });
    for (const location of [dev, packaged, files]) {
      for (const route of ['/\\evil.example/dashboard', '//evil.example', 'https://evil.example/', '/\t/evil.example']) {
        assert.throws(() => appRouteTarget(location, route), /outside the app/, route);
      }
    }
    assert.equal(
      internalHrefFromDocumentUrl(dev, 'http://localhost:5175/properties/p1?tab=history#price'),
      '/properties/p1?tab=history#price',
    );
    assert.equal(internalHrefFromDocumentUrl(files, fileUrl('index.html', '#/contacts/c1')), '/contacts/c1');
    assert.equal(internalHrefFromDocumentUrl(dev, 'http://evil.example/properties/p1'), null);
  });

  it('serves packaged files from the renderer folder and never swaps a missing document', () => {
    const root = rendererDir;
    assert.deepEqual(resolvePackagedRequest(root, 'estate-erp://app/'), {
      filePath: path.join(root, 'index.html'),
      relativePath: 'index.html',
    });
    assert.deepEqual(resolvePackagedRequest(root, 'estate-erp://app/tabbar.html'), {
      filePath: path.join(root, 'tabbar.html'),
      relativePath: 'tabbar.html',
    });
    assert.deepEqual(resolvePackagedRequest(root, 'estate-erp://app/assets/tabbar-abc.js'), {
      filePath: path.join(root, 'assets/tabbar-abc.js'),
      relativePath: 'assets/tabbar-abc.js',
    });
    // 인코딩한 슬래시로 폴더 밖을 가리키면 거절한다.
    assert.deepEqual(resolvePackagedRequest(root, 'estate-erp://app/..%2f..%2fsecret'), {
      forbidden: true,
    });
    assert.deepEqual(
      resolvePackagedRequest(root, 'estate-erp://app/assets/..%2f..%2f..%2fetc%2fpasswd'),
      { forbidden: true },
    );
    // 점 조각(`..`, `%2e%2e`)은 주소를 해석할 때 이미 정리돼 폴더 안에 머문다.
    assert.deepEqual(resolvePackagedRequest(root, 'estate-erp://app/%2e%2e/%2e%2e/secret'), {
      filePath: path.join(root, 'secret'),
      relativePath: 'secret',
    });
    // 화면 주소는 앱 문서가 받아 그린다. 없는 문서(.html)는 404다.
    assert.equal(fallsBackToAppDocument('properties/p1'), true);
    assert.equal(fallsBackToAppDocument('dashboard'), true);
    assert.equal(fallsBackToAppDocument('tabbar.html'), false);
    assert.equal(fallsBackToAppDocument('missing/PAGE.HTML'), false);
    assert.equal(tabBarDocumentPath(root), path.join(root, 'tabbar.html'));
  });

  it('does not count the abort of the document it replaced as a failed load', () => {
    // 로그인 정보가 남은 채로 켜면 로그인 전 화면을 불러오다 탭바 문서로 바뀐다. Electron은
    // 끊긴 앞의 로드를 뒤의 로드에도 알린다.
    const aborted = (url: string) => ({ errno: -3, code: 'ERR_ABORTED', url });
    const tabBar = windowPageTarget(dev, 'tab-bar');
    const gate = windowPageTarget(dev, 'gate');
    assert.equal(isAbortOfAnotherLoad(aborted('http://localhost:5175/'), tabBar), true);
    assert.equal(isAbortOfAnotherLoad(aborted('http://localhost:5175/tabbar.html'), gate), true);
    // 이번에 연 문서 자신이 끊긴 것은 넘기지 않는다.
    assert.equal(
      isAbortOfAnotherLoad(aborted('http://localhost:5175/tabbar.html'), tabBar),
      false,
    );
    assert.equal(isAbortOfAnotherLoad(aborted('http://localhost:5175/#x'), gate), false);
    // 끊김이 아닌 실패(서버에 닿지 못함 등)는 언제나 실패다.
    assert.equal(
      isAbortOfAnotherLoad({ errno: -102, url: 'http://localhost:5175/' }, tabBar),
      false,
    );
    assert.equal(isAbortOfAnotherLoad(new Error('boom'), tabBar), false);
    assert.equal(isAbortOfAnotherLoad(null, tabBar), false);
    // 파일로 여는 경우에도 같은 규칙이다.
    const fileTabBar = windowPageTarget(files, 'tab-bar');
    assert.equal(isAbortOfAnotherLoad(aborted(fileUrl('index.html')), fileTabBar), true);
    assert.equal(isAbortOfAnotherLoad(aborted(fileUrl('tabbar.html')), fileTabBar), false);
  });

  it('names the documents a packaged build is missing', () => {
    const root = rendererDir;
    const index = path.join(root, 'index.html');
    const tabBar = path.join(root, 'tabbar.html');
    assert.deepEqual(missingRendererDocuments(root, () => true), []);
    assert.deepEqual(missingRendererDocuments(root, (file) => file !== tabBar), [tabBar]);
    assert.deepEqual(missingRendererDocuments(root, (file) => file !== index), [index]);
    assert.deepEqual(missingRendererDocuments(root, () => false), [index, tabBar]);
  });

  it('treats the tab bar document the same whatever the letter case of its name', () => {
    // 대소문자를 가리지 않는 파일 시스템은 TABBAR.HTML에도 같은 파일을 내준다.
    assert.equal(isTabBarDocumentUrl(packaged, 'estate-erp://app/TABBAR.HTML'), true);
    assert.equal(isTabBarDocumentUrl(dev, 'http://localhost:5175/TabBar.html'), true);
    assert.equal(isTabBarDocumentUrl(packaged, 'estate-erp://app/tabbar.htm'), false);
    assert.equal(isTabBarDocumentUrl(packaged, 'estate-erp://evil/TABBAR.HTML'), false);
  });
});
