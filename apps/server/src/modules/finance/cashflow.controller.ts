import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CashflowService } from './cashflow.service';

@ApiTags('Finance / Cashflow')
@ApiBearerAuth()
@Controller('finance/cashflow')
@UseGuards(JwtAuthGuard)
export class CashflowController {
  constructor(private readonly service: CashflowService) {}

  @Get()
  getSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
  ) {
    const now = new Date();
    const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
    const month = monthStr ? parseInt(monthStr, 10) : now.getMonth() + 1;
    return this.service.getSummary(user.officeId, year, month);
  }
}
