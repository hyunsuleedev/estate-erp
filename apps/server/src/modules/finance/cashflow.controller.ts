import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CashflowService } from './cashflow.service';

@ApiTags('재무 · 캐시플로우')
@ApiBearerAuth()
@Controller('finance/cashflow')
@UseGuards(JwtAuthGuard)
export class CashflowController {
  constructor(private readonly service: CashflowService) {}

  @Get()
  @Roles('owner', 'manager')
  @UseGuards(RolesGuard)
  getSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
  ) {
    // 비어 있거나 잘못된 값이면 한국 시각의 이번 달을 쓴다
    const [nowYear, nowMonth] = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7)
      .split('-')
      .map(Number);
    const y = yearStr ? parseInt(yearStr, 10) : NaN;
    const m = monthStr ? parseInt(monthStr, 10) : NaN;
    const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : nowYear;
    const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : nowMonth;
    return this.service.getSummary(user.officeId, year, month);
  }
}
