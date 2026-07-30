/* eslint-disable import/no-unresolved -- MCP SDK documents ESM .js subpath imports; the legacy resolver cannot follow its package exports. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CpAuthManager,
  type CpAuthPrepareInput,
} from './cpAuthManager';
import {
  CP_CREDENTIAL_PROVIDERS,
  type CpCredentialProvider,
} from './cpCredentialVault';

const LOCAL_MCP_NAME = 'estate-erp-local';
const LOCAL_MCP_VERSION = '1.0.0';

export interface LocalCpMcpConnection {
  url: string;
  bearerToken: string;
}

export class LocalCpMcpServer {
  private readonly bearerToken = randomBytes(32).toString('base64url');
  private httpServer: HttpServer | null = null;
  private connection: LocalCpMcpConnection | null = null;

  constructor(private readonly cpAuth: CpAuthManager) {}

  async start(): Promise<LocalCpMcpConnection> {
    if (this.connection) return this.connection;

    const httpServer = createHttpServer(async (request, response) => {
      const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? '127.0.0.1'}`,
      );
      if (url.pathname !== '/mcp') {
        response.writeHead(404).end('Not found');
        return;
      }
      if (!this.isAuthorized(request.headers.authorization)) {
        response.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        });
        response.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const server = this.createProtocolServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(request, response);
      } catch (error) {
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!response.writableEnded) {
          response.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Local MCP request failed',
            }),
          );
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        httpServer.off('error', reject);
        resolve();
      });
    });

    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      httpServer.close();
      throw new Error('로컬 CP 인증 MCP 포트를 열지 못했습니다.');
    }

    this.httpServer = httpServer;
    this.connection = {
      url: `http://127.0.0.1:${address.port}/mcp`,
      bearerToken: this.bearerToken,
    };
    return this.connection;
  }

  getConnection(): LocalCpMcpConnection | null {
    return this.connection;
  }

  async stop(): Promise<void> {
    const httpServer = this.httpServer;
    this.connection = null;
    this.httpServer = null;
    if (!httpServer) return;
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections();
    });
  }

  private createProtocolServer(): Server {
    const server = new Server(
      { name: LOCAL_MCP_NAME, version: LOCAL_MCP_VERSION },
      {
        capabilities: { tools: { listChanged: false } },
        instructions:
          'This local server never returns CP passwords. Use it only to inspect local credential readiness and open an authenticated CP browser session on this device.',
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        {
          name: 'cp_auth_status',
          description:
            '이 PC의 CP 계정 저장 상태와 로컬 runner deviceId를 확인합니다. 비밀번호는 반환하지 않습니다.',
          inputSchema: {
            type: 'object',
            properties: {
              officeId: {
                type: 'string',
                description: 'Estate ERP office UUID',
              },
            },
            required: ['officeId'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        {
          name: 'cp_auth_prepare_session',
          description:
            '로컬 Vault의 암호화 자격증명으로 CP 로그인 창을 열고 자동 로그인합니다. 평문 자격증명은 반환하지 않습니다.',
          inputSchema: {
            type: 'object',
            properties: {
              officeId: {
                type: 'string',
                description: 'Estate ERP office UUID',
              },
              provider: {
                type: 'string',
                enum: [...CP_CREDENTIAL_PROVIDERS],
                description: 'esiljang 또는 budongsanbank',
              },
            },
            required: ['officeId', 'provider'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
      ],
    }));

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<CallToolResult> => {
        const args = request.params.arguments ?? {};
        try {
          if (request.params.name === 'cp_auth_status') {
            const officeId = readString(args, 'officeId');
            return jsonToolResult(await this.cpAuth.getStatus(officeId));
          }
          if (request.params.name === 'cp_auth_prepare_session') {
            const input: CpAuthPrepareInput = {
              officeId: readString(args, 'officeId'),
              provider: readProvider(args, 'provider'),
            };
            return jsonToolResult(await this.cpAuth.prepareSession(input));
          }
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Unknown local tool: ${request.params.name}`,
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  error instanceof Error
                    ? error.message
                    : 'Local CP authentication failed',
              },
            ],
          };
        }
      },
    );
    return server;
  }

  private isAuthorized(authorization: string | undefined): boolean {
    if (!authorization?.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(authorization.slice('Bearer '.length));
    const expected = Buffer.from(this.bearerToken);
    return (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  }
}

function readString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function readProvider(
  args: Record<string, unknown>,
  key: string,
): CpCredentialProvider {
  const value = readString(args, key);
  if (
    !CP_CREDENTIAL_PROVIDERS.includes(value as CpCredentialProvider)
  ) {
    throw new Error('Unsupported CP provider');
  }
  return value as CpCredentialProvider;
}

function jsonToolResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
  };
}
