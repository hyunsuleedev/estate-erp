import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export const api = createApiClient({
  baseUrl: '/api',
  getToken,
});
