import type { DesktopAuthSessionSnapshot } from '../../common/desktopAuth';
import {
  Auth0DesktopSession,
  type Auth0TokenStore,
  type StoredAuth0Session,
} from '../../main/auth/auth0DesktopSession';
import { DesktopAuthController } from '../../main/auth/desktopAuthController';
import { createSessionUserFetcher } from '../../main/auth/sessionUserClient';
import type { DesktopAuthBridge } from '../electron';
import { API_BASE_URL } from '../lib/api';

/**
 * 브라우저 미리보기 전용 로그인 (개발 서버를 Chromium·Playwright로 열었을 때).
 *
 * Electron에서는 main 프로세스가 세션의 주인이다. 일반 브라우저에는 main이 없으므로,
 * main이 쓰는 것과 같은 세션 코어를 이 페이지 안에서 돌려 같은 로그인 화면이 동작하게
 * 한다. Auth0는 Vite 개발 서버의 `/__auth0` 프록시로 부른다.
 *
 * - `import.meta.env.DEV`이고 Electron 다리가 없을 때만 `main.tsx`가 불러온다.
 *   패키지 빌드에는 이 파일이 들어가지 않는다.
 * - 로그인은 이 탭의 sessionStorage에만 둔다. 새로 고침에는 남고 탭을 닫으면 사라진다.
 *   탭끼리 나누지 않는 것은 refresh token 교체 때문이다(같은 토큰을 두 탭이 쓰면
 *   Auth0가 재사용으로 보고 전부 폐기한다).
 * - 실시간 연결과 전화(CTI)는 Electron 전용이라 여기서는 동작하지 않는다.
 */
const STORAGE_KEY = 'estate-erp:browser-preview-auth';
const AUTH0_PROXY_PATH = '/__auth0';

class SessionStorageTokenStore implements Auth0TokenStore {
  async load(): Promise<StoredAuth0Session | null> {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth0Session>;
    return typeof parsed.domain === 'string' &&
      typeof parsed.clientId === 'string' &&
      typeof parsed.refreshToken === 'string'
      ? {
          domain: parsed.domain,
          clientId: parsed.clientId,
          refreshToken: parsed.refreshToken,
        }
      : null;
  }

  async save(session: StoredAuth0Session): Promise<void> {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function createBrowserPreviewAuthBridge(): DesktopAuthBridge {
  if (!import.meta.env.DEV || window.electronBridge) {
    throw new Error('브라우저 미리보기 로그인은 개발 서버의 일반 브라우저에서만 쓴다.');
  }
  const listeners = new Set<(snapshot: DesktopAuthSessionSnapshot) => void>();
  const controller = new DesktopAuthController({
    createProvider: (callbacks) =>
      new Auth0DesktopSession({
        config: __ESTATE_DEV_AUTH0_CONFIG__,
        store: new SessionStorageTokenStore(),
        endpointBaseUrl: AUTH0_PROXY_PATH,
        ...callbacks,
      }),
    fetchUser: createSessionUserFetcher({ apiBaseUrl: API_BASE_URL }),
    onChange: (next) => {
      for (const listener of listeners) listener(next);
    },
  });
  void controller.start();

  return {
    getSession: async () => controller.getSnapshot(),
    onSession: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getToken: ({ sessionId }) => controller.getAccessToken(sessionId),
    logout: async ({ sessionId }) => {
      await controller.logout(sessionId);
      return { ok: true };
    },
    refreshUser: () => controller.refreshUser(),
    reportUnauthorized: async ({ sessionId }) => {
      await controller.reportUnauthorized(sessionId);
      return { ok: true };
    },
    login: ({ username, password }) => controller.login(username, password),
    signup: ({ username, password, name }) =>
      controller.signup(username, password, name),
    retry: async () => {
      await controller.retry();
      return { ok: true };
    },
  };
}
