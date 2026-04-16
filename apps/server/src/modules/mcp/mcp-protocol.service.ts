import { Injectable, Logger } from '@nestjs/common';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  jsonRpcResult,
  jsonRpcError,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INTERNAL_ERROR,
} from './json-rpc.dto';
import { McpToolsService } from './mcp-tools.service';

const MCP_SERVER_NAME = 'estate-erp';
const MCP_SERVER_VERSION = '1.0.0';
const MCP_PROTOCOL_VERSION = '2025-03-26';

@Injectable()
export class McpProtocolService {
  private readonly logger = new Logger(McpProtocolService.name);

  constructor(private readonly toolsService: McpToolsService) {}

  async handleRequest(
    body: JsonRpcRequest,
    ctx: { officeId: string; userId: string },
  ): Promise<JsonRpcResponse | null> {
    const { method, params, id } = body;

    if (id === undefined || id === null) {
      this.logger.debug(`MCP notification: ${method}`);
      return null;
    }

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id);

        case 'ping':
          return jsonRpcResult(id, {});

        case 'notifications/initialized':
          return null;

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return await this.handleToolCall(id, params ?? {}, ctx);

        case 'prompts/list':
          return jsonRpcResult(id, { prompts: [] });

        case 'resources/list':
          return jsonRpcResult(id, { resources: [] });

        default:
          return jsonRpcError(
            id,
            JSON_RPC_METHOD_NOT_FOUND,
            `Method not found: ${method}`,
          );
      }
    } catch (err) {
      this.logger.error(`MCP error in ${method}: ${err}`);
      return jsonRpcError(
        id,
        JSON_RPC_INTERNAL_ERROR,
        err instanceof Error ? err.message : 'Internal error',
      );
    }
  }

  private handleInitialize(id: string | number): JsonRpcResponse {
    return jsonRpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
    });
  }

  private handleToolsList(id: string | number): JsonRpcResponse {
    const tools = this.toolsService.getToolDefinitions();
    return jsonRpcResult(id, { tools });
  }

  private async handleToolCall(
    id: string | number,
    params: Record<string, unknown>,
    ctx: { officeId: string; userId: string },
  ): Promise<JsonRpcResponse> {
    const toolName = params.name as string | undefined;
    if (!toolName) {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'Missing tool name');
    }

    const args = (params.arguments as Record<string, unknown>) ?? {};
    const result = await this.toolsService.executeTool(toolName, args, ctx);
    return jsonRpcResult(id, result);
  }
}
