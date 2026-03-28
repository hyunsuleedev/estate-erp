import type { RequestFn } from '../client.js';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
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
    email: string;
    name: string;
    role: string;
  };
  office: {
    id: string;
    name: string;
    code: string;
  };
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  office: {
    id: string;
    name: string;
    code: string;
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
