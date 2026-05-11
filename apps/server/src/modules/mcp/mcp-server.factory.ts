import { Injectable, Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolsService } from './mcp-tools.service';
import { getRequestContext } from '../../common/request-context/request-context';

const MCP_SERVER_NAME = 'estate-erp';
const MCP_SERVER_VERSION = '1.0.0';

/**
 * Factory creating one fresh `Server` instance per HTTP request.
 *
 * Stateless mode: the SDK's `StreamableHTTPServerTransport` is used in
 * `sessionIdGenerator: undefined` mode, so no cross-request state lives
 * on the Server object. We rebuild it per request to keep the model
 * trivially correct — no concurrent handler invocations sharing state.
 *
 * The audit-log invariant (ActivityLog.actor = 'mcp:claude') is preserved
 * because the SDK invokes our handlers in the same async chain that called
 * `transport.handleRequest()`, so AsyncLocalStorage context set by
 * McpAuthGuard is still visible inside the tool handler.
 */
@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger(McpServerFactory.name);

  constructor(private readonly tools: McpToolsService) {}

  create(): Server {
    const server = new Server(
      {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
      {
        capabilities: {
          tools: { listChanged: false },
        },
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.tools.getToolDefinitions(),
    }));

    server.setRequestHandler(
      CallToolRequestSchema,
      async (req): Promise<CallToolResult> => {
        const { name, arguments: args } = req.params;
        const ctx = getRequestContext();
        if (!ctx?.userId || !ctx?.officeId) {
          throw new Error('Missing request context (auth guard did not run?)');
        }
        const result = await this.tools.executeTool(name, args ?? {}, {
          userId: ctx.userId,
          officeId: ctx.officeId,
        });
        return result satisfies CallToolResult;
      },
    );

    return server;
  }
}
