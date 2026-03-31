import { createApiClient } from '@estate-erp/api-client';

const TOKEN_KEY = 'estate-erp-token';
const defaultBaseUrl =
  window.location.protocol === 'file:' ? 'http://localhost:3000' : '/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl;

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
  baseUrl,
  getToken,
});
