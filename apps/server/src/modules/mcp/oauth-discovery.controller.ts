import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  constructor(private readonly config: ConfigService) {}

  @Get('.well-known/oauth-protected-resource')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('Access-Control-Allow-Origin', '*')
  protectedResourceMetadata() {
    return {
      resource: MCP_RESOURCE_URI,
      authorization_servers: [this.getClerkAuthorizationServer()],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'email', 'profile'],
      resource_documentation: 'https://www.estaitt.com/features',
    };
  }

  private getClerkAuthorizationServer() {
    const configured =
      this.config.get<string>('CLERK_OAUTH_AUTHORIZATION_SERVER') ??
      this.config.get<string>('CLERK_FRONTEND_API_URL') ??
      this.config.get<string>('CLERK_FRONTEND_API');

    if (configured) {
      return configured.replace(/\/$/, '');
    }

    const publishableKey =
      this.config.get<string>('CLERK_PUBLISHABLE_KEY') ??
      this.config.get<string>('VITE_CLERK_PUBLISHABLE_KEY');
    const decoded = this.decodeClerkPublishableKeyHost(publishableKey);
    if (decoded) return `https://${decoded}`;

    return 'https://useful-dolphin-37.clerk.accounts.dev';
  }

  private decodeClerkPublishableKeyHost(key?: string) {
    const payload = key?.replace(/^pk_(test|live)_/, '');
    if (!payload || payload === key) return null;

    try {
      return Buffer.from(payload, 'base64url').toString('utf8').replace(/\$$/, '');
    } catch {
      return null;
    }
  }
}
