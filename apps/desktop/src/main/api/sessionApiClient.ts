/**
 * main 프로세스가 서버 API를 부를 때 쓰는 작은 도우미.
 *
 * 요청마다 로그인 세션 번호를 받아 그 세션의 접근 토큰으로 부른다. 세션이 지나갔으면
 * 토큰을 받지 못해 요청하지 않는다. 서버가 401을 주면 로그인 세션 쪽에 그 세션을
 * 확인하게 할 뿐, 여기서 로그아웃시키지 않는다(확인은 `/auth/me`로 main이 직접 한다).
 *
 * Electron에 의존하지 않는다.
 */

export type SessionApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SessionApiRequestOptions {
  method?: SessionApiMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

export type SessionApiErrorKind =
  /** 그 세션의 토큰을 받지 못했다(로그아웃했거나 다른 세션이 됐다). */
  | 'no-session'
  /** 서버가 토큰을 받아 주지 않았다. 로그인 세션 쪽에 확인을 맡겼다. */
  | 'unauthorized'
  /** 서버가 오류로 답했다. */
  | 'http'
  /** 서버에 닿지 못했거나 시간 안에 답이 없었다. */
  | 'unreachable';

export class SessionApiError extends Error {
  constructor(
    readonly kind: SessionApiErrorKind,
    readonly status: number | null,
    readonly body: unknown = null,
  ) {
    super(
      status === null ? `API request failed (${kind})` : `API request failed (${status})`,
    );
    this.name = 'SessionApiError';
  }
}

export interface SessionApiClientOptions {
  /** 예: http://localhost:3000 */
  apiBaseUrl: string;
  /** 그 세션의 접근 토큰. 세션이 지나갔거나 지금 받을 수 없으면 null. */
  getAccessToken: (sessionId: number) => Promise<string | null>;
  /** 서버가 401을 줬다. 로그인 세션 쪽이 그 세션을 서버에 직접 확인한다. */
  reportUnauthorized: (sessionId: number) => void | Promise<void>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface SessionApiClient {
  request<T>(
    sessionId: number,
    path: string,
    options?: SessionApiRequestOptions,
  ): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function createSessionApiClient(
  options: SessionApiClientOptions,
): SessionApiClient {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetch ?? fetch;

  return {
    async request<T>(
      sessionId: number,
      path: string,
      { method = 'GET', body, params }: SessionApiRequestOptions = {},
    ): Promise<T> {
      let token: string | null;
      try {
        token = await options.getAccessToken(sessionId);
      } catch {
        token = null;
      }
      if (!token) throw new SessionApiError('no-session', null);

      const url = new URL(`${baseUrl}${path}`);
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      }

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchFn(url, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: abort.signal,
        });
      } catch {
        throw new SessionApiError('unreachable', null);
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401) {
        // 확인은 맡기고 기다리지 않는다. 이 요청은 실패로 끝난다.
        void Promise.resolve()
          .then(() => options.reportUnauthorized(sessionId))
          .catch(() => undefined);
        throw new SessionApiError('unauthorized', 401);
      }
      if (!response.ok) {
        throw new SessionApiError(
          'http',
          response.status,
          await response.json().catch(() => null),
        );
      }
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    },
  };
}
