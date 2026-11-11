import { ServiceUnavailableException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { OAuthDiscoveryController } from './oauth-discovery.controller';
import {
  protectedResourceMetadataUrl,
  resolveMcpResourceUrl,
} from './mcp-oauth.config';

function createController(env: Record<string, string | undefined>, issuer: string | null) {
  return new OAuthDiscoveryController(
    { get: (key: string) => env[key] } as never,
    { getIssuer: () => issuer } as never,
  );
}

describe('OAuthDiscoveryController', () => {
  it('points MCP clients at the Auth0 tenant for the configured MCP resource', () => {
    const controller = createController(
      { MCP_RESOURCE_URL: 'http://localhost:3000/mcp' },
      'https://estait.jp.auth0.com/',
    );

    expect(controller.protectedResourceMetadata()).toEqual({
      resource: 'http://localhost:3000/mcp',
      // Auth0 메타데이터의 issuer와 글자 그대로 같아야 한다(끝의 / 포함).
      authorization_servers: ['https://estait.jp.auth0.com/'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
      resource_name: '에스테잇플로우',
      resource_documentation: 'https://www.estaitt.com/features',
    });
  });

  it('does not advertise offline_access as a resource scope', () => {
    const controller = createController({}, 'https://estait.jp.auth0.com/');
    expect(controller.protectedResourceMetadata().scopes_supported).not.toContain(
      'offline_access',
    );
  });

  it('defaults to the production MCP address when nothing is configured', () => {
    const controller = createController({}, 'https://estait.jp.auth0.com/');
    expect(controller.protectedResourceMetadata().resource).toBe(
      'https://api.estaitt.com/mcp',
    );
  });

  it('answers 503 instead of naming a wrong authorization server when Auth0 is not configured', () => {
    const controller = createController({}, null);
    expect(() => controller.protectedResourceMetadata()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('is served at the path-inserted and the root well-known addresses', () => {
    const paths = Reflect.getMetadata(
      PATH_METADATA,
      OAuthDiscoveryController.prototype.protectedResourceMetadata,
    );
    expect(paths).toEqual([
      '.well-known/oauth-protected-resource/mcp',
      '.well-known/oauth-protected-resource',
    ]);
  });
});

describe('MCP OAuth config', () => {
  const config = (value?: string) =>
    ({ get: () => value }) as never;

  it('strips a trailing slash so the value equals the Auth0 API identifier', () => {
    expect(resolveMcpResourceUrl(config('https://api.estaitt.com/mcp/'))).toBe(
      'https://api.estaitt.com/mcp',
    );
    expect(resolveMcpResourceUrl(config('  '))).toBe('https://api.estaitt.com/mcp');
  });

  it('builds the RFC 9728 metadata address by inserting the well-known prefix before the path', () => {
    expect(protectedResourceMetadataUrl('https://api.estaitt.com/mcp')).toBe(
      'https://api.estaitt.com/.well-known/oauth-protected-resource/mcp',
    );
    expect(protectedResourceMetadataUrl('http://localhost:3000/mcp')).toBe(
      'http://localhost:3000/.well-known/oauth-protected-resource/mcp',
    );
    expect(protectedResourceMetadataUrl('https://mcp.example.com')).toBe(
      'https://mcp.example.com/.well-known/oauth-protected-resource',
    );
  });
});
