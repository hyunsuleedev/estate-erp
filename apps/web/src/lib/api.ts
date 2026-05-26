import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';
type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;

/**
 * 기본 baseUrl은 Vite dev proxy(/api)지만, VITE_API_BASE_URL이 있으면 원격 서버를 직접 호출.
 * desktop과 같은 패턴 — .env.local에 https://api.estaitt.com 등을 지정해 원격 검증 가능.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function getToken(): Promise<string | null> {
  if (tokenProvider) {
    return tokenProvider();
  }
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(accessToken: string, remember = true): void {
  removeToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, accessToken);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

let onAuthFailureHandler: (() => void) | null = null;

export function setAuthFailureHandler(handler: (() => void) | null): void {
  onAuthFailureHandler = handler;
}

export const api = createApiClient({
  baseUrl,
  getToken,
  onAuthFailure: () => {
    onAuthFailureHandler?.();
  },
});
