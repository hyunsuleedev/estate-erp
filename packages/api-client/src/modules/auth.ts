import type { RequestFn } from '../client.js';

export interface MeResponse {
  id: string;
  loginId: string;
  email: string | null;
  name: string;
  role: string;
  isPlatformAdmin: boolean;
  office: {
    id: string;
    name: string;
  } | null;
  onboardingRequired: boolean;
}

export function createAuthApi(request: RequestFn) {
  return {
    logout: () =>
      request<{ success: true }>('/auth/logout', { method: 'POST' }),

    me: () =>
      request<MeResponse>('/auth/me'),
  };
}
