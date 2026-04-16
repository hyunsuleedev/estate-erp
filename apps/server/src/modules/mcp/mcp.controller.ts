import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JsonRpcRequest } from './json-rpc.dto';
import { McpProtocolService } from './mcp-protocol.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { ApiKeyService } from './api-key.service';

@ApiTags('MCP')
@ApiBearerAuth()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly protocolService: McpProtocolService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(McpAuthGuard)
  async handle(
    @Body() body: JsonRpcRequest,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.protocolService.handleRequest(body, {
      officeId: user.officeId,
      userId: user.userId,
    });

    if (result === null) {
      res.status(HttpStatus.ACCEPTED);
      return;
    }

    return result;
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
