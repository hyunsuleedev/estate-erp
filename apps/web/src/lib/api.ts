import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, remember = true): void {
  removeToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export const api = createApiClient({
  baseUrl: '/api',
  getToken,
});
