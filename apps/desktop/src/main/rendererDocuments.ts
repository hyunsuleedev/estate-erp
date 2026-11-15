import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isInternalRoute, resolveInternalUrl } from '../common/internalRoute';

/**
 * 앱이 창과 탭 화면에 불러오는 문서의 주소 규칙. Electron에 의존하지 않는다.
 *
 * 창 자체의 화면은 두 문서 중 하나다.
 * - gate: 로그인 전의 화면(로그인·가입·온보딩·서버에 닿지 못함). 앱 문서(index.html)다.
 * - tab-bar: 로그인 뒤의 화면. 탭바만 그리는 작은 문서(tabbar.html)다.
 * 탭 화면과 전화 팝업 층은 앱 문서를 앱 안의 주소로 연다.
 */
export type WindowPageKind = 'gate' | 'tab-bar';

export const APP_DOCUMENT = 'index.html';
export const TAB_BAR_DOCUMENT = 'tabbar.html';

/** 문서를 어디서 불러오는지. 개발 서버, 패키지 앱의 전용 주소, 아니면 파일이다. */
export interface RendererLocation {
  devServerUrl?: string | null;
  packagedBaseUrl?: string | null;
  /** 문서 파일이 있는 폴더. 위 둘이 없을 때 file: 로 연다. */
  rendererDir: string;
}

export type DocumentTarget =
  | { url: string }
  | { filePath: string; hash?: string };

function baseUrlOf(location: RendererLocation): string | null {
  return location.devServerUrl || location.packagedBaseUrl || null;
}

/** 창 자체의 화면에 불러올 문서. */
export function windowPageTarget(
  location: RendererLocation,
  kind: WindowPageKind,
): DocumentTarget {
  const baseUrl = baseUrlOf(location);
  if (baseUrl) {
    return { url: `${baseUrl}/${kind === 'tab-bar' ? TAB_BAR_DOCUMENT : ''}` };
  }
  return {
    filePath: path.join(
      location.rendererDir,
      kind === 'tab-bar' ? TAB_BAR_DOCUMENT : APP_DOCUMENT,
    ),
  };
}

/**
 * 탭 화면·팝업 층에 불러올 문서의 주소. 앱 밖을 가리키는 주소는 preload가 붙은 화면에
 * 불러오면 안 되므로, 여기서 던져 그 화면을 띄우지 않는다.
 */
export function appRouteTarget(
  location: RendererLocation,
  route: string,
): DocumentTarget {
  const baseUrl = baseUrlOf(location);
  if (baseUrl) {
    // 해석한 결과가 앱과 같은 출처일 때만 받는다(`/\host` 같은 값은 다른 호스트가 된다).
    const url = resolveInternalUrl(route, `${baseUrl}/`);
    if (!url) throw new Error('refused to load a route outside the app');
    return { url };
  }
  if (!isInternalRoute(route)) {
    throw new Error('refused to load a route outside the app');
  }
  return { filePath: path.join(location.rendererDir, APP_DOCUMENT), hash: route };
}

/** 앱이 내주는 문서의 주소인지. 창의 화면과 탭 화면이 보낸 요청을 믿어도 되는지 가린다. */
export function isTrustedDocumentUrl(
  location: RendererLocation,
  rawUrl: string,
): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const requested = path.resolve(decodeURIComponent(url.pathname));
      return (
        requested === path.resolve(location.rendererDir, APP_DOCUMENT) ||
        requested === path.resolve(location.rendererDir, TAB_BAR_DOCUMENT)
      );
    }
    if (location.devServerUrl) {
      return url.origin === new URL(location.devServerUrl).origin;
    }
    if (location.packagedBaseUrl) {
      const expected = new URL(location.packagedBaseUrl);
      return url.protocol === expected.protocol && url.host === expected.host;
    }
    return false;
  } catch {
    return false;
  }
}

/** 그 주소가 탭바 문서인지(믿을 수 있는 앱 문서 가운데). */
export function isTabBarDocumentUrl(
  location: RendererLocation,
  rawUrl: string,
): boolean {
  if (!isTrustedDocumentUrl(location, rawUrl)) return false;
  try {
    // 대소문자를 가리지 않는 파일 시스템에서는 TABBAR.HTML도 같은 파일을 내준다.
    return (
      path.posix.basename(new URL(rawUrl).pathname).toLowerCase() === TAB_BAR_DOCUMENT
    );
  } catch {
    return false;
  }
}

/** 앱 문서의 주소에서 앱 안의 주소(/properties/…)를 꺼낸다. 앱 문서가 아니면 null. */
export function internalHrefFromDocumentUrl(
  location: RendererLocation,
  rawUrl: string,
): string | null {
  try {
    if (!isTrustedDocumentUrl(location, rawUrl)) return null;
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const hash = url.hash.replace(/^#/, '');
      return hash.startsWith('/') ? hash : null;
    }
    const href = `${url.pathname}${url.search}${url.hash}`;
    return href.startsWith('/') ? href : null;
  } catch {
    return null;
  }
}

function withoutHash(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * 문서를 불러오다 받은 오류가 "다른 문서의 로드가 끊겼다"는 알림일 뿐인지.
 *
 * 로그인 정보가 남아 있는 채로 앱을 켜면 창은 로그인 전 화면을 불러오다가 곧 탭바 문서로
 * 바뀐다. 이때 Electron은 끊긴 앞의 로드(ERR_ABORTED, -3)를 뒤이어 시작한 로드의 약속에도
 * 알린다. 끊긴 주소가 이번에 연 문서가 아니면 이번 로드는 실패하지 않았다.
 */
export function isAbortOfAnotherLoad(
  error: unknown,
  target: DocumentTarget,
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { errno, url } = error as { errno?: unknown; url?: unknown };
  if (errno !== -3 || typeof url !== 'string' || !url) return false;
  const expected =
    'url' in target ? target.url : pathToFileURL(target.filePath).toString();
  return withoutHash(url) !== withoutHash(expected);
}

/** 패키지 앱에 들어 있어야 하는 탭바 문서의 경로. 앱을 시작할 때 있는지 확인한다. */
export function tabBarDocumentPath(rendererRoot: string): string {
  return path.join(rendererRoot, TAB_BAR_DOCUMENT);
}

/**
 * 패키지 앱에 들어 있어야 하는데 없는 문서들. 하나라도 없으면 앱을 쓸 수 없으므로
 * 시작할 때 확인해 바로 알린다(로그인 뒤에야 빈 창으로 드러나지 않게).
 */
export function missingRendererDocuments(
  rendererRoot: string,
  exists: (filePath: string) => boolean,
): string[] {
  return [APP_DOCUMENT, TAB_BAR_DOCUMENT]
    .map((name) => path.join(rendererRoot, name))
    .filter((filePath) => !exists(filePath));
}

/**
 * 패키지 앱의 전용 주소(estate-erp://app/…)로 온 요청이 가리키는 파일.
 * 문서 폴더 밖을 가리키면 거절한다.
 */
export function resolvePackagedRequest(
  rendererRoot: string,
  requestUrl: string,
): { filePath: string; relativePath: string } | { forbidden: true } {
  const decodedPath = decodeURIComponent(new URL(requestUrl).pathname || '/');
  const relativePath = decodedPath === '/' ? APP_DOCUMENT : decodedPath.slice(1);
  const filePath = path.normalize(path.join(rendererRoot, relativePath));
  const fromRoot = path.relative(rendererRoot, filePath);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    return { forbidden: true };
  }
  return { filePath, relativePath };
}

/** 빌드한 화면의 자산(스크립트·스타일 등)이 들어 있는 폴더. Vite의 기본값이다. */
const ASSETS_DIR = 'assets';

/**
 * 화면 주소 아래로 온 자산 요청이 실제로 가리키는 파일. 해당하지 않으면 null.
 *
 * 빌드한 앱 문서는 자산을 상대 주소(`./assets/…`)로 부른다. 탭 화면은 그 문서를
 * `/properties/p1` 같은 주소로 열기 때문에, 자산 요청은 `/properties/assets/…`로 온다.
 * 자산은 언제나 문서 폴더 바로 아래의 `assets/`에 있으므로 그 파일로 답한다. 이 처리가
 * 없으면 두 단계 이상인 주소로 연 화면은 스크립트 대신 앱 문서를 받아 빈 화면이 된다.
 */
export function resolveAssetUnderRoute(
  rendererRoot: string,
  relativePath: string,
  /** 파일 경로를 계산하는 규칙. 테스트가 Windows의 규칙으로도 확인할 수 있게 받는다. */
  fs: path.PlatformPath = path,
): { filePath: string; relativePath: string } | null {
  // Windows는 역슬래시도 폴더 구분자로 읽는다(`assets/..\..\x`). 자산 주소에는 올 일이 없다.
  if (relativePath.includes('\\')) return null;
  const segments = path.posix.normalize(relativePath).split('/');
  if (segments.includes('..')) return null;
  const at = segments.lastIndexOf(ASSETS_DIR);
  // 맨 앞의 assets/는 이미 제자리다. 폴더 이름뿐이고 파일이 없는 주소도 아니다.
  if (at <= 0 || at === segments.length - 1) return null;
  const assetPath = segments.slice(at);
  const filePath = fs.normalize(fs.join(rendererRoot, ...assetPath));
  // 운영체제의 경로 규칙으로 다시 확인한다. 자산 폴더 밖을 가리키면 답하지 않는다.
  const fromAssets = fs.relative(fs.join(rendererRoot, ASSETS_DIR), filePath);
  if (!fromAssets || fromAssets.startsWith('..') || fs.isAbsolute(fromAssets)) {
    return null;
  }
  return { filePath, relativePath: assetPath.join('/') };
}

/**
 * 파일이 없을 때 앱 문서로 대신 답해도 되는지. 화면 주소(/properties/…)는 앱 문서가
 * 받아 그리지만, 없는 .html 문서와 없는 자산을 앱 문서로 대신하지는 않는다: 탭바 문서가 빠진 빌드가
 * 로그인 뒤의 창에 앱 전체를 조용히 띄우게 된다.
 */
export function fallsBackToAppDocument(relativePath: string): boolean {
  // 없는 자산(오래된 스크립트 조각 등)도 앱 문서로 대신하지 않는다. 스크립트를 달라는
  // 요청에 문서를 주면 404가 아니라 알아보기 어려운 형식 오류로 드러난다.
  if (relativePath.split('/').includes(ASSETS_DIR)) return false;
  return path.extname(relativePath).toLowerCase() !== '.html';
}
