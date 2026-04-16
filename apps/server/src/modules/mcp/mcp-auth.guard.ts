import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { setRequestContext } from '../../common/request-context/request-context';
import { ApiKeyService } from './api-key.service';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);

    // API Key path: tokens starting with "esk_"
    if (token.startsWith('esk_')) {
      const resolved = await this.apiKeyService.validateAndResolve(token);
      if (!resolved) {
        throw new UnauthorizedException('유효하지 않은 API 키입니다.');
      }

      // Mimic what JwtAuthGuard does: set request.user + request context
      (request as any).user = {
        userId: resolved.userId,
        officeId: resolved.officeId,
        role: resolved.role,
      };

      setRequestContext({
        userId: resolved.userId,
        officeId: resolved.officeId,
        role: resolved.role,
        actor: 'mcp:claude',
      });

      return true;
    }

    // JWT path: delegate to existing guard
    return this.jwtGuard.canActivate(context) as Promise<boolean>;
  }
}
