import { ConfigService } from '@nestjs/config';
import { MCP_RESOURCE_URI } from '@estate-erp/shared';

/**
 * MCP 서버의 OAuth 설정 (resource server 쪽).
 *
 * 인가 서버는 Auth0다. MCP에는 직원 REST API와 별개의 Auth0 API(resource server)를
 * 두고, 그 식별자를 이 서버가 광고하는 MCP 주소와 똑같이 맞춘다. 외부 AI 클라이언트는
 * 그 주소를 RFC 8707 `resource`로 보내 MCP 전용 토큰을 받는다.
 */

/**
 * MCP 도구를 쓰려면 토큰에 있어야 하는 scope. Auth0 MCP API에 정의된 권한이고,
 * 동의 화면에 그 설명이 나온다. 도구별 권한은 여전히 우리 DB의 역할이 정한다.
 */
export const MCP_TOOLS_SCOPE = 'mcp:tools';

/**
 * 이 서버의 MCP 주소(= 토큰 대상, Auth0 MCP API 식별자). 환경마다 다르다.
 * 로컬은 `http://localhost:3000/mcp`, 운영은 `https://api.estaitt.com/mcp`(기본값).
 * 끝의 `/`는 뗀다(Auth0는 식별자와 글자 그대로 같은 값만 받는다).
 */
export function resolveMcpResourceUrl(config: ConfigService): string {
  const configured = config.get<string>('MCP_RESOURCE_URL')?.trim();
  return (configured || MCP_RESOURCE_URI).replace(/\/+$/, '');
}

/**
 * RFC 9728 보호 자원 메타데이터 주소. 자원 주소의 호스트와 경로 사이에 well-known
 * 접두사를 끼운다: `https://api.estaitt.com/mcp` →
 * `https://api.estaitt.com/.well-known/oauth-protected-resource/mcp`.
 */
export function protectedResourceMetadataUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}
