import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';
const REFRESH_TOKEN_KEY = 'estate-erp-refresh';

export function getToken(): string | null {
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

let onAuthFailureHandler: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailureHandler = handler;
}

export const api = createApiClient({
  baseUrl: '/api',
  getToken,
  getRefreshToken,
  setTokens: (access, refresh) => {
    const wasRemembered = localStorage.getItem(TOKEN_KEY) !== null;
    setTokens(access, refresh, wasRemembered);
  },
  onAuthFailure: () => {
    onAuthFailureHandler?.();
  },
});
