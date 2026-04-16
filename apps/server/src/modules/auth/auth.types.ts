export const USER_ROLES = ['owner', 'manager', 'agent'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type JwtTokenType = 'access' | 'refresh';

export interface AuthenticatedUser {
  userId: string;
  officeId: string;
  loginId: string;
  email: string | null;
  name: string;
  role: UserRole;
  office: {
    id: string;
    name: string;
    isActive: boolean;
  };
}

export interface AuthTokenPayload {
  sub: string;
  officeId: string;
  role: UserRole;
  type: JwtTokenType;
}
