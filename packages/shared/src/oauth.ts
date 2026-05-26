/**
 * OAuth 2.1 / MCP resource identifiers.
 *
 * Phase 1 scope: only the discovery surface
 *   (/.well-known/oauth-protected-resource + WWW-Authenticate header)
 *
 * Audience-binding (RFC 8707) is intentionally deferred. Clerk session
 * tokens remain the trust boundary for the time being.
 */

/**
 * Canonical MCP resource URI advertised in protected-resource metadata
 * and the WWW-Authenticate header. Must match the public HTTPS URL of
 * the MCP endpoint exactly (no trailing slash).
 */
export const MCP_RESOURCE_URI = 'https://api.estaitt.com/mcp';

/**
 * Well-known protected-resource metadata URL (per RFC 9728).
 * Lives at the API host, not the marketing host.
 */
export const MCP_PROTECTED_RESOURCE_METADATA_URL =
  'https://api.estaitt.com/.well-known/oauth-protected-resource';
