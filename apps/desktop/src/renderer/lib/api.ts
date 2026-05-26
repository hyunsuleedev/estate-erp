import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';
const REFRESH_TOKEN_KEY = 'estate-erp-refresh';
type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;
const defaultBaseUrl =
  window.location.protocol === 'file:' ? 'http://localhost:3000' : '/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function getToken(): Promise<string | null> {
  if (tokenProvider) {
    return tokenProvider();
  }
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return (
    localStorage.getItem(REFRESH_TOKEN_KEY) ??
    sessionStorage.getItem(REFRESH_TOKEN_KEY)
  );
}

export function setTokens(
  accessToken: string,
  refreshToken: string,
  remember = true,
): void {
  removeToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Refresh 실패 시 호출되는 콜백. AuthProvider가 mount될 때 실제 핸들러로 교체한다.
 * api-client는 호스트 앱의 React 상태에 직접 접근할 수 없으므로 이 indirection이 필요.
 */
let onAuthFailureHandler: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailureHandler = handler;
}

export const api = createApiClient({
  baseUrl,
  getToken,
  getRefreshToken,
  setTokens: (access, refresh) => {
    // Refresh로 받은 새 토큰은 원래 저장소(localStorage vs sessionStorage)를 유지해야 한다.
    const wasRemembered = localStorage.getItem(TOKEN_KEY) !== null;
    setTokens(access, refresh, wasRemembered);
  },
  onAuthFailure: () => {
    onAuthFailureHandler?.();
  },
});
