import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { uuidParam } from './finance-params';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SettlementService } from './settlement.service';

/**
 * 직원 정산. 직원별 지급액이 드러나므로 정산 조회·확정·지급은 대표만 한다
 * (급여와 배분율을 대표만 보는 것과 같은 기준). 직원 본인은 /mine 으로 자기 것만 본다.
 */
@ApiTags('Finance / Settlement')
@ApiBearerAuth()
@Controller('finance/settlements')
@UseGuards(JwtAuthGuard)
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

  @Get('settings')
  @Roles('owner')
  @UseGuards(RolesGuard)
  getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getSettings(user.officeId);
  }

  @Patch('settings')
  @Roles('owner')
  @UseGuards(RolesGuard)
  updateSettings(@CurrentUser() user: CurrentUserPayload, @Body() body: { timing?: string }) {
    return this.service.updateSettings(user.officeId, body ?? {});
  }

  @Get('mine')
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listMine(user.officeId, user.userId);
  }

  /** 아직 확정하지 않은 다음 정산의 내 몫 (본인 줄만, 바뀔 수 있음) */
  @Get('mine/preview')
  previewMine(@CurrentUser() user: CurrentUserPayload) {
    return this.service.previewMine(user.officeId, user.userId);
  }

  // 담당 배분에는 직원 몫(%)이 함께 나오므로 대표만 본다
  @Get('deals/:dealId/participants')
  @Roles('owner')
  @UseGuards(RolesGuard)
  getParticipants(@CurrentUser() user: CurrentUserPayload, @Param('dealId', uuidParam('거래')) dealId: string) {
    return this.service.getParticipants(user.officeId, dealId);
  }

  @Put('deals/:dealId/participants')
  @Roles('owner')
  @UseGuards(RolesGuard)
  setParticipants(
    @CurrentUser() user: CurrentUserPayload,
    @Param('dealId', uuidParam('거래')) dealId: string,
    @Body() body: { items: Array<{ userId: string; sharePercent: number; ratio?: number | null }> },
  ) {
    return this.service.setParticipants(user.officeId, dealId, body?.items);
  }

  @Post('lines/:lineId/pay')
  @Roles('owner')
  @UseGuards(RolesGuard)
  markPaid(
    @CurrentUser() user: CurrentUserPayload,
    @Param('lineId', uuidParam('정산 내역')) lineId: string,
    @Body() body: { paidAt?: string },
  ) {
    return this.service.markPaid(user.officeId, lineId, user.userId, body?.paidAt);
  }

  @Post('lines/:lineId/unpay')
  @Roles('owner')
  @UseGuards(RolesGuard)
  unmarkPaid(@CurrentUser() user: CurrentUserPayload, @Param('lineId', uuidParam('정산 내역')) lineId: string) {
    return this.service.unmarkPaid(user.officeId, lineId);
  }

  @Get(':month')
  @Roles('owner')
  @UseGuards(RolesGuard)
  get(@CurrentUser() user: CurrentUserPayload, @Param('month') month: string) {
    return this.service.get(user.officeId, month);
  }

  @Post(':month/confirm')
  @Roles('owner')
  @UseGuards(RolesGuard)
  confirm(@CurrentUser() user: CurrentUserPayload, @Param('month') month: string) {
    return this.service.confirm(user.officeId, month, user.userId);
  }

  @Post(':month/unconfirm')
  @Roles('owner')
  @UseGuards(RolesGuard)
  unconfirm(@CurrentUser() user: CurrentUserPayload, @Param('month') month: string) {
    return this.service.unconfirm(user.officeId, month);
  }
}
