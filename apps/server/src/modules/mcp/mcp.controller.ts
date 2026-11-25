import {
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { McpAuthGuard } from './mcp-auth.guard';
import { ApiKeyService } from './api-key.service';
import { McpServerFactory } from './mcp-server.factory';

@ApiTags('MCP')
@ApiBearerAuth()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly serverFactory: McpServerFactory,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * Streamable HTTP MCP endpoint.
   *
   * Stateless mode (no Mcp-Session-Id header round-tripping):
   * - Each request creates a fresh Server + Transport pair.
   * - SDK handles JSON-RPC framing, initialize negotiation, error mapping.
   * - Auth context set by McpAuthGuard is visible inside tool handlers via
   *   AsyncLocalStorage (same async chain).
   *
   * No `@Body()` decorator: the SDK consumes the raw `req` body to support
   * both regular JSON and chunked responses transparently.
   */
  @Post()
  @UseGuards(McpAuthGuard)
  async handle(@Req() req: Request, @Res() res: Response) {
    const server = this.serverFactory.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /**
   * 상태 없는(stateless) 서버라 서버가 먼저 보내는 흐름(GET)과 세션 끝내기(DELETE)가 없다. 규격대로 405로 답한다.
   * (경로가 아예 없으면 404가 나가, GET으로 먼저 살펴보는 클라이언트가 "MCP 서버가 없다"로 읽는다.)
   */
  @Get()
  getNotAllowed(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Delete()
  deleteNotAllowed(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response) {
    res
      .status(405)
      .setHeader('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST.' }, id: null });
  }

  // --- API Key management (JWT auth only, not API key) ---

  @Get('api-key')
  @UseGuards(JwtAuthGuard)
  async getApiKeyStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.apiKeyService.getStatus(user.userId);
  }

  @Post('api-key')
  @UseGuards(JwtAuthGuard)
  async generateApiKey(@CurrentUser() user: CurrentUserPayload) {
    return this.apiKeyService.generate(user.userId, user.officeId);
  }

  @Delete('api-key')
  @UseGuards(JwtAuthGuard)
  async revokeApiKey(@CurrentUser() user: CurrentUserPayload) {
    await this.apiKeyService.revoke(user.userId);
    return { ok: true };
  }
}
