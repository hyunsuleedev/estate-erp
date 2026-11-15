import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Auth0PasswordChangeService } from './auth0-password-change.service';

/**
 * Auth0 Action이 부르는 알림. 사용자 로그인 토큰이 아니라 공유 비밀값
 * (AUTH0_EVENT_SECRET, 헤더 x-auth0-event-secret)으로 확인한다.
 */
@ApiExcludeController()
@Controller('auth/auth0-events')
export class Auth0EventsController {
  constructor(private readonly passwordChange: Auth0PasswordChangeService) {}

  @Post('password-changed')
  @HttpCode(200)
  async passwordChanged(
    @Headers('x-auth0-event-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    // 비밀값이 틀리면 이 주소가 있는지도 알려 주지 않는다.
    if (!this.passwordChange.isAuthorized(secret)) throw new NotFoundException();

    const payload =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const userId = payload.userId;
    if (typeof userId !== 'string' || !userId || userId.length > 200) {
      throw new BadRequestException('userId is required');
    }
    const changedAt =
      typeof payload.changedAt === 'string' ? new Date(payload.changedAt) : null;

    const result = await this.passwordChange.handlePasswordChanged(
      userId,
      changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : null,
    );
    // refresh token 폐기가 아직 안 됐으면 Auth0 Action이 다시 부르게 한다.
    if (result === 'revoke-pending') {
      throw new ServiceUnavailableException('refresh token revocation is pending');
    }
    return { result };
  }
}
