import type { RequestFn } from '../client.js';

export interface LoginDto {
  loginId: string;
  password: string;
}

export interface RegisterDto {
  loginId: string;
  email: string;
  password: string;
  name: string;
  officeName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    loginId: string;
    email: string | null;
    name: string;
    role: string;
  };
  office: {
    id: string;
    name: string;
  };
}

export interface MeResponse {
  id: string;
  loginId: string;
  email: string | null;
  name: string;
  role: string;
  office: {
    id: string;
    name: string;
  };
}

export function createAuthApi(request: RequestFn) {
  return {
    login: (dto: LoginDto) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: dto }),

    register: (dto: RegisterDto) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: dto }),

    me: () =>
      request<MeResponse>('/auth/me'),
  };
}
