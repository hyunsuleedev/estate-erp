import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CtiService, UpsertCtiLineDto } from './cti.service';
import { CtiBridgeGateway } from './cti-bridge.gateway';
import { CtiBridgeTokenService } from './cti-bridge-token.service';

@ApiTags('CTI')
@ApiBearerAuth()
@Controller('cti')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CtiController {
  constructor(
    private readonly service: CtiService,
    private readonly gateway: CtiBridgeGateway,
    private readonly bridgeTokens: CtiBridgeTokenService,
  ) {}

  // ================================================================
  // 회선 관리 (레거시 MCDS004Q01 / CIDS*)
  // ================================================================

  @Get('lines')
  listLines(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listLines(user.officeId);
  }

  @Post('lines')
  @Roles('owner', 'manager')
  createLine(
    @Body() dto: UpsertCtiLineDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createLine(user.officeId, dto);
  }

  @Patch('lines/:id')
  @Roles('owner', 'manager')
  updateLine(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertCtiLineDto>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateLine(user.officeId, id, dto);
  }

  @Delete('lines/:id')
  @Roles('owner', 'manager')
  @HttpCode(204)
  async deleteLine(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.service.deleteLine(user.officeId, id);
  }

  // ================================================================
  // 브리지 토큰 (마스터 PC 설치 시 발급)
  // ================================================================

  @Get('bridge/token')
  @Roles('owner', 'manager')
  getBridgeTokenStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.bridgeTokens.getStatus(user.officeId);
  }

  @Post('bridge/token')
  @Roles('owner', 'manager')
  issueBridgeToken(
    @Body() dto: { name?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.bridgeTokens.issue(user.officeId, dto?.name);
  }

  @Delete('bridge/token')
  @Roles('owner', 'manager')
  @HttpCode(204)
  async revokeBridgeToken(@CurrentUser() user: CurrentUserPayload) {
    await this.bridgeTokens.revoke(user.officeId);
  }

  // ================================================================
  // 마스터 브리지 상태 (레거시 CIDS003Q01 checkMainConnect)
  // ================================================================

  @Get('master/status')
  async getMasterStatus(@CurrentUser() user: CurrentUserPayload) {
    const [connected, tokenStatus] = await Promise.all([
      this.gateway.isBridgeConnected(user.officeId),
      this.bridgeTokens.getStatus(user.officeId),
    ]);
    return {
      connected,
      lastSeenAt: tokenStatus.lastSeenAt,
      lines: this.gateway.getLineStatuses(user.officeId),
    };
  }

  // ================================================================
  // 통합 조회 (레거시 MCLS002Q01)
  // ================================================================

  @Get('lookup')
  lookup(
    @Query('phone') phone: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.lookup(user.officeId, phone ?? '');
  }

  // ================================================================
  // 통화 이력 (레거시 MCLS001Q01 / MCDS001U01 / MCDS001U02 / MCDS001D01)
  // ================================================================

  @Get('calls')
  listCalls(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('direction') direction: string,
    @Query('status') status: string,
    @Query('phone') phone: string,
    @Query('contactId') contactId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.listCalls(user.officeId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      direction: direction || undefined,
      status: status || undefined,
      phone: phone || undefined,
      contactId: contactId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }

  @Patch('calls/:id')
  updateCall(
    @Param('id') id: string,
    @Body() dto: { status?: string; endedAt?: string; userId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateCall(user.officeId, id, dto);
  }

  /** 명시적 [이 고객으로 연결] 버튼 전용 (레거시 팝업 닫힘 부작용 제거) */
  @Patch('calls/:id/link')
  linkContact(
    @Param('id') id: string,
    @Body() dto: { contactId: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.linkContact(
      user.officeId,
      user.userId,
      id,
      dto?.contactId ?? null,
    );
  }

  @Delete('calls/:id')
  @HttpCode(204)
  async deleteCall(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.service.softDeleteCall(user.officeId, id);
  }

  // ================================================================
  // 발신 (레거시 FC 위임 → 서버 경유. 워커 PC도 항상 이 경로)
  // ================================================================

  @Post('dial')
  async dial(
    @Body() dto: { phoneNumber: string; lineId?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { callEvent, line, credential } = await this.service.createDialRequest(
      user.officeId,
      user.userId,
      dto,
    );

    const delivered = await this.gateway.requestDial(user.officeId, {
      requestId: callEvent.id,
      phoneNumber: callEvent.phoneNumber,
      line: {
        id: line.id,
        providerCode: line.providerCode,
        externalId: line.externalId,
        internalNo: line.internalNo,
      },
      credential,
    });

    if (!delivered) {
      await this.service.recordDialResult(user.officeId, {
        requestId: callEvent.id,
        success: false,
        message: 'CTI 브리지가 연결되어 있지 않습니다.',
      });
      throw new BadRequestException(
        'CTI 브리지가 연결되어 있지 않습니다. 마스터 PC의 브리지 상태를 확인하세요.',
      );
    }

    return { callEventId: callEvent.id, status: 'dialing' };
  }
}
