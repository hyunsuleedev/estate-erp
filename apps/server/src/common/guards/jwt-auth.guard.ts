import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { setRequestContext } from '../request-context/request-context';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { ClerkAuthService } from '../../modules/auth/clerk-auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly clerkAuth: ClerkAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: CurrentUserPayload;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const currentUser = await this.clerkAuth.authenticateBearerToken(
      authHeader.slice(7),
    );
    request.user = currentUser;

    setRequestContext({
      userId: currentUser.userId,
      officeId: currentUser.officeId,
      role: currentUser.role,
      actor: 'user',
    });

    return true;
  }
}
