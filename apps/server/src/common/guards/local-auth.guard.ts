import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { setRequestContext } from '../request-context/request-context';
import { AuthenticatedUser } from '../../modules/auth/auth.types';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err || !user) {
      throw (err as Error) ?? new UnauthorizedException();
    }

    const authUser = user as unknown as AuthenticatedUser;

    setRequestContext({
      userId: authUser.userId,
      officeId: authUser.officeId,
      role: authUser.role,
      actor: 'user',
    });

    return user;
  }
}
