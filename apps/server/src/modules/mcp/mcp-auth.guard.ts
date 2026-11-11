import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { setRequestContext } from '../../common/request-context/request-context';
import { Auth0TokenVerifier } from '../auth/auth0-token-verifier';
import { StaffAuthService } from '../auth/staff-auth.service';
import { ApiKeyService } from './api-key.service';
import {
  MCP_TOOLS_SCOPE,
  protectedResourceMetadataUrl,
  resolveMcpResourceUrl,
} from './mcp-oauth.config';

/**
 * `/mcp`가 받는 자격은 두 가지뿐이다.
 *
 * 1. `esk_` API 키 — 자동화용 장기 키. 우리 DB에서 확인한다.
 * 2. Auth0가 발급한 MCP 전용 접근 토큰 — 외부 AI 클라이언트가 OAuth로 받는다.
 *    대상(aud)이 이 서버의 MCP 주소인 토큰만 받는다.
 *
 * 데스크톱 앱의 직원 REST 토큰(대상이 REST API)은 여기서 받지 않고, 반대로 MCP
 * 토큰은 REST API에서 받지 않는다. MCP 로그인으로는 ERP 사용자를 새로 만들지 않는다.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: Auth0TokenVerifier,
    private readonly staffAuth: StaffAuthService,
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
        this.setBearerChallenge(response, { error: 'invalid_token' });
        throw new UnauthorizedException('유효하지 않은 API 키입니다.');
      }

      this.setMcpContext(request, {
        userId: resolved.userId,
        officeId: resolved.officeId,
        role: resolved.role,
      });

      return true;
    }

    // OAuth path: Auth0가 이 MCP 주소를 대상으로 발급한 접근 토큰.
    let user: CurrentUserPayload;
    let scopes: Set<string>;
    try {
      const claims = await this.tokens.verifyAccessToken(token, {
        audience: resolveMcpResourceUrl(this.config),
      });
      scopes = new Set(
        typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
      );
      // MCP 로그인은 이미 있는 직원만 통과시킨다. 처음 보는 계정을 owner로 만들지 않는다.
      // 비활성 직원과, 비밀번호 재설정·비활성화 이전에 발급된 토큰도 여기서 걸러진다.
      user = await this.staffAuth.resolveStaffUser(claims, {
        allowProvisioning: false,
      });
    } catch (error) {
      // 토큰이 틀렸거나, 만료됐거나, 다른 대상용이거나, 비활성 계정이다.
      if (error instanceof UnauthorizedException) {
        this.setBearerChallenge(response, { error: 'invalid_token' });
      }
      throw error;
    }

    if (!scopes.has(MCP_TOOLS_SCOPE)) {
      this.setBearerChallenge(response, { error: 'insufficient_scope' });
      throw new ForbiddenException(
        'MCP 도구 사용 권한(mcp:tools)에 동의하지 않은 토큰입니다.',
      );
    }
    if (!user.officeId) {
      throw new ForbiddenException('사무소 생성이 필요합니다.');
    }

    this.setMcpContext(request, user);
    return true;
  }

  private setMcpContext(request: Request, user: CurrentUserPayload) {
    (request as unknown as { user: CurrentUserPayload }).user = user;
    setRequestContext({
      userId: user.userId,
      officeId: user.officeId,
      role: user.role,
      actor: 'mcp:claude',
    });
  }

  /**
   * RFC 9728 §5.1 — `WWW-Authenticate` Bearer challenge. MCP 클라이언트는
   * `resource_metadata`에서 인가 서버(Auth0)를 찾고, `scope`의 권한을 요청한다.
   * refresh token용 `offline_access`는 자원이 요구하는 권한이 아니므로 넣지 않는다
   * (클라이언트가 인가 서버 메타데이터를 보고 스스로 붙인다).
   */
  private setBearerChallenge(
    response: Response,
    options: { error?: 'invalid_token' | 'insufficient_scope' } = {},
  ) {
    const metadataUrl = protectedResourceMetadataUrl(
      resolveMcpResourceUrl(this.config),
    );
    const parts: string[] = [];
    if (options.error) parts.push(`error="${options.error}"`);
    parts.push(`resource_metadata="${metadataUrl}"`);
    parts.push(`scope="${MCP_TOOLS_SCOPE}"`);
    if (options.error === 'insufficient_scope') {
      // 헤더 값은 ASCII만 안전해서 영문 고정 문구를 쓴다. 한국어 안내는 응답 본문에 있다.
      parts.push('error_description="The mcp:tools scope is required"');
    }
    response.setHeader('WWW-Authenticate', `Bearer ${parts.join(', ')}`);
  }
}
