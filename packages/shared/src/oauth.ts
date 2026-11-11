/**
 * OAuth 2.1 / MCP resource identifiers.
 *
 * 외부 AI 클라이언트는 Auth0에서 MCP 전용 접근 토큰을 받아 `/mcp`에 접속한다.
 * 토큰의 대상(aud, RFC 8707 resource)은 MCP 주소다. 서버는 환경마다 다른 주소를
 * `MCP_RESOURCE_URL`로 받고, 값이 없을 때 아래 운영 주소를 쓴다.
 */

/**
 * 운영 환경의 MCP 자원 주소. 보호 자원 메타데이터와 Auth0 MCP API 식별자가
 * 이 값과 글자 그대로 같아야 한다(끝에 `/` 없음).
 */
export const MCP_RESOURCE_URI = 'https://api.estaitt.com/mcp';

/**
 * 운영 환경의 보호 자원 메타데이터 주소(RFC 9728, 경로 없는 형태).
 * 서버는 경로를 끼운 표준 형태(`/.well-known/oauth-protected-resource/mcp`)도
 * 함께 열고, 401 응답은 그 표준 형태를 가리킨다.
 */
export const MCP_PROTECTED_RESOURCE_METADATA_URL =
  'https://api.estaitt.com/.well-known/oauth-protected-resource';
