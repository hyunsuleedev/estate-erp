import {
  createApiClient,
  type AuthFailureContext,
} from '@estate-erp/api-client';

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;
const defaultBaseUrl =
  window.location.protocol === 'file:' ? 'http://localhost:3000' : '/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl;
/** 화면이 쓰는 API 서버 주소. */
export const API_BASE_URL: string = baseUrl;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

/**
 * 요청에 실을 접근 토큰. 로그인 세션의 주인(main, 브라우저 미리보기에서는 개발용 다리)이
 * 내주는 것만 쓴다. 화면은 토큰을 저장하지 않는다.
 */
async function getToken(): Promise<string | null> {
  return tokenProvider ? tokenProvider() : null;
}

let onAuthFailureHandler: ((context: AuthFailureContext) => void) | null = null;

export function setAuthFailureHandler(
  handler: ((context: AuthFailureContext) => void) | null,
): void {
  onAuthFailureHandler = handler;
}

export const api = createApiClient({
  baseUrl,
  getToken,
  onAuthFailure: (context) => {
    onAuthFailureHandler?.(context);
  },
});
