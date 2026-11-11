import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  /** 자체 DB User.id (모든 비즈니스 로직에서 userId로 사용) */
  userId: string;
  /** Auth0 user_id. API 키로 들어온 요청에는 없다. */
  auth0UserId?: string;
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
