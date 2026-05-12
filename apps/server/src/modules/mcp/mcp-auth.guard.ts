import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MCP_PROTECTED_RESOURCE_METADATA_URL } from '@estate-erp/shared';
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
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      this.setBearerChallenge(response);
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);

    // API Key path: tokens starting with "esk_"
    if (token.startsWith('esk_')) {
      const resolved = await this.apiKeyService.validateAndResolve(token);
      if (!resolved) {
        this.setBearerChallenge(response, 'invalid_token');
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

    // JWT path: delegate to existing guard. If it rejects, attach the
    // challenge header so MCP clients can discover the resource metadata.
    try {
      return (await this.jwtGuard.canActivate(context)) as boolean;
    } catch (err) {
      this.setBearerChallenge(response, 'invalid_token');
      throw err;
    }
  }

  /**
   * RFC 9728 §5.1 — `WWW-Authenticate` Bearer challenge pointing MCP
   * clients at our protected-resource metadata document. Clients use that
   * to discover the authorization server and start the OAuth flow.
   */
  private setBearerChallenge(response: Response, error?: string) {
    const parts = [`Bearer resource_metadata="${MCP_PROTECTED_RESOURCE_METADATA_URL}"`];
    if (error) {
      parts.push(`error="${error}"`);
    }
    response.setHeader('WWW-Authenticate', parts.join(', '));
  }
}
