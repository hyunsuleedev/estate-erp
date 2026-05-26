export const USER_ROLES = ['owner', 'manager', 'agent'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type JwtTokenType = 'access' | 'refresh';

export interface AuthenticatedUser {
  userId: string;
  officeId: string | null;
  loginId: string;
  email: string | null;
  name: string;
  role: UserRole;
  office: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
}

export interface AuthTokenPayload {
  sub: string;
  officeId?: string | null;
  role: UserRole;
  type: JwtTokenType;
}
