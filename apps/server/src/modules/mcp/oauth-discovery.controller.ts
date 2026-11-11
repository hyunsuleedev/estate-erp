import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Auth0TokenVerifier } from '../auth/auth0-token-verifier';
import { MCP_TOOLS_SCOPE, resolveMcpResourceUrl } from './mcp-oauth.config';

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * MCP 클라이언트(Claude, ChatGPT, Codex CLI 등)는 여기서 다음을 알아낸다.
 *   - 토큰을 요청할 자원 식별자(= 이 서버의 MCP 주소)
 *   - 그 자원의 토큰을 발급하는 인가 서버(Auth0 테넌트)
 *   - 요청할 scope
 *
 * 인증 없이 열려 있어야 한다. 주소는 자원 주소의 호스트와 경로 사이에 well-known
 * 접두사를 끼운 형태(`/.well-known/oauth-protected-resource/mcp`)가 표준이고,
 * 401 응답의 `WWW-Authenticate`도 그 주소를 가리킨다. 경로 없는 형태는 그 주소를
 * 못 찾은 클라이언트가 두 번째로 시도하는 곳이라 같이 연다.
 */
@ApiTags('OAuth Discovery')
@Controller()
export class OAuthDiscoveryController {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: Auth0TokenVerifier,
  ) {}

  @Get([
    '.well-known/oauth-protected-resource/mcp',
    '.well-known/oauth-protected-resource',
  ])
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Access-Control-Allow-Origin', '*')
  protectedResourceMetadata() {
    // 인가 서버 식별자는 Auth0 메타데이터의 `issuer`와 글자 그대로 같아야 한다
    // (끝의 `/` 포함). 클라이언트가 둘을 문자열로 비교한다.
    const issuer = this.tokens.getIssuer();
    if (!issuer) {
      throw new ServiceUnavailableException('Auth0 설정이 없습니다.');
    }

    return {
      resource: resolveMcpResourceUrl(this.config),
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      // refresh token용 offline_access는 자원이 요구하는 권한이 아니라서 넣지 않는다.
      scopes_supported: [MCP_TOOLS_SCOPE],
      resource_name: '에스테잇플로우',
      resource_documentation: 'https://www.estaitt.com/features',
    };
  }
}
