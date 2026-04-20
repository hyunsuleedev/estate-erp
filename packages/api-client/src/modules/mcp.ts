import type { RequestFn } from '../client.js';

export interface McpApiKeyStatus {
  hasKey: boolean;
  prefix: string | null;
}

export interface McpApiKeyGenerateResponse {
  key: string;
  prefix: string;
}

export function createMcpApi(request: RequestFn) {
  return {
    getApiKeyStatus: () =>
      request<McpApiKeyStatus>('/mcp/api-key'),
    generateApiKey: () =>
      request<McpApiKeyGenerateResponse>('/mcp/api-key', { method: 'POST' }),
    revokeApiKey: () =>
      request<{ ok: true }>('/mcp/api-key', { method: 'DELETE' }),
  };
}
