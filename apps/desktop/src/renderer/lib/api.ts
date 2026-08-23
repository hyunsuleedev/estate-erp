import {
  createApiClient,
  type AuthFailureContext,
} from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';
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

export function setToken(accessToken: string, remember = true): void {
  removeToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, accessToken);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
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
