import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { setRequestContext } from '../request-context/request-context';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = CurrentUserPayload>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      throw (err as Error) ?? new UnauthorizedException();
    }

    const currentUser = user as unknown as CurrentUserPayload;

    setRequestContext({
      userId: currentUser.userId,
      officeId: currentUser.officeId,
      role: currentUser.role,
      actor: 'user',
    });

    return user;
  }
}
