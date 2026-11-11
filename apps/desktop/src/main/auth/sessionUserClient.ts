import type { SessionUserResult } from './desktopAuthController';

const SESSION_USER_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * main이 직접 부르는 `GET /auth/me`. 화면의 API 클라이언트와 같은 서버 주소를 쓴다.
 *
 * 401만 "서버가 이 계정을 거절했다"로 본다. 연결 실패, 시간 초과, 5xx, 읽을 수 없는
 * 응답은 모두 "서버에 닿지 못했다"로 돌려준다. 그 경우 로그인은 유지된다.
 */
export function createSessionUserFetcher(options: {
  apiBaseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): (accessToken: string) => Promise<SessionUserResult> {
  const fetchImpl = options.fetch ?? fetch;
  const url = `${options.apiBaseUrl.replace(/\/+$/, '')}/auth/me`;
  return async (accessToken) => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(
          options.timeoutMs ?? SESSION_USER_TIMEOUT_MS,
        ),
      });
    } catch {
      return { kind: 'unreachable' };
    }
    if (response.status === 401) {
      const body: unknown = await response.json().catch(() => null);
      return {
        kind: 'unauthorized',
        message:
          isRecord(body) && typeof body.message === 'string'
            ? body.message
            : null,
      };
    }
    if (!response.ok) return { kind: 'unreachable' };
    const user: unknown = await response.json().catch(() => null);
    return isRecord(user) && typeof user.id === 'string' && user.id.length > 0
      ? { kind: 'ok', user }
      : { kind: 'unreachable' };
  };
}

/**
 * main이 쓸 API 서버 주소. 화면(`renderer/lib/api.ts`)과 같은 빌드 값
 * `VITE_API_BASE_URL`을 쓰고, 없을 때의 규칙도 맞춘다.
 *
 * - 절대 주소면 그대로 쓴다.
 * - 화면은 값이 없거나 상대 경로(`/api`)면 Vite 개발 서버의 프록시를 거친다.
 *   main도 개발 서버가 있으면 같은 프록시 주소를 쓴다.
 * - 그 밖에는(패키지 앱에 값이 없을 때) 화면과 같은 `http://localhost:3000`이다.
 */
export function resolveMainApiBaseUrl(options: {
  configured: string | undefined;
  devServerUrl: string | undefined;
}): string {
  const configured = options.configured?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const devServerUrl = options.devServerUrl?.trim();
  if (devServerUrl) {
    const path = configured && configured.startsWith('/') ? configured : '/api';
    return `${devServerUrl.replace(/\/+$/, '')}${path.replace(/\/+$/, '')}`;
  }
  return 'http://localhost:3000';
}
