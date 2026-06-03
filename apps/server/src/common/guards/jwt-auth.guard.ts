import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { setRequestContext } from '../request-context/request-context';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import {
  BearerAuthTimings,
  ClerkAuthService,
} from '../../modules/auth/clerk-auth.service';

type AuthenticatedRequest = {
  headers: { authorization?: string };
  method?: string;
  route?: { path?: string };
  url?: string;
  user?: CurrentUserPayload;
};

type TimingResponse = {
  setHeader?: (name: string, value: string) => void;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly clerkAuth: ClerkAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<TimingResponse>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const authStartedAt = Date.now();
    const authTimings: BearerAuthTimings = {};
    const currentUser = await this.clerkAuth.authenticateBearerToken(
      authHeader.slice(7),
      authTimings,
    );
    this.setServerTimingHeader(response, Date.now() - authStartedAt, authTimings);

    if (!currentUser.officeId && !this.allowsOfficeLessAccess(request)) {
      throw new ForbiddenException('사무소 생성이 필요합니다.');
    }

    request.user = currentUser;

    setRequestContext({
      userId: currentUser.userId,
      ...(currentUser.officeId ? { officeId: currentUser.officeId } : {}),
      role: currentUser.role,
      actor: 'user',
    });

    return true;
  }

  private allowsOfficeLessAccess(request: AuthenticatedRequest) {
    const method = request.method?.toUpperCase();
    const routePath = request.route?.path;
    const urlPath = request.url?.split('?')[0];
    const path = urlPath ?? routePath ?? '';

    return (
      (method === 'GET' && path === '/auth/me') ||
      (method === 'POST' && path === '/offices/me') ||
      (method === 'POST' && path === '/auth/logout')
    );
  }

  private setServerTimingHeader(
    response: TimingResponse,
    authMs: number,
    timings: BearerAuthTimings,
  ) {
    const parts = [`auth;dur=${authMs}`];
    if (timings.cacheHit) {
      parts.push('auth_cache;desc="hit"');
    } else {
      parts.push(`clerk_verify;dur=${timings.verifyTokenMs ?? 0}`);
      parts.push(`auth_user;dur=${timings.userLookupMs ?? 0}`);
    }
    response.setHeader?.('Server-Timing', parts.join(', '));
  }
}
