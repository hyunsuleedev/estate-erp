import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  /** 자체 DB User.id (모든 비즈니스 로직에서 userId로 사용) */
  userId: string;
  /** Supabase auth.users.id (logout, admin API 호출 시) */
  supabaseUserId: string;
  officeId: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    return data ? user[data] : user;
  },
);
