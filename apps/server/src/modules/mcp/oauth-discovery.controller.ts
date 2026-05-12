import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MCP_RESOURCE_URI } from '@estate-erp/shared';

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * MCP clients (Claude Desktop, Cursor, etc.) hit this endpoint to discover:
 *   - The canonical resource identifier they should request tokens for.
 *   - Which authorization server(s) issue tokens for that resource.
 *   - Supported bearer token presentation methods.
 *
 * Must be publicly accessible (no auth). Cache-friendly: response is static.
 *
 * The path is registered without the `/mcp` prefix because RFC 9728 specifies
 * the well-known location relative to the resource URL's origin.
 */
@ApiTags('OAuth Discovery')
@Controller()
export class OAuthDiscoveryController {
  @Get('.well-known/oauth-protected-resource')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Access-Control-Allow-Origin', '*')
  protectedResourceMetadata() {
    return {
      resource: MCP_RESOURCE_URI,
      authorization_servers: [
        'https://xdwfflqrovrqouhcammh.supabase.co/auth/v1',
      ],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'email', 'profile'],
      resource_documentation: 'https://www.estaitt.com/features',
    };
  }
}
