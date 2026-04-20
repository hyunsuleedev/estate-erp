import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { LedgerService, LedgerPreset } from './ledger.service';

@ApiTags('Finance / Ledger')
@ApiBearerAuth()
@Controller('finance/ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly service: LedgerService) {}

  @Get()
  get(
    @CurrentUser() user: CurrentUserPayload,
    @Query('preset') preset?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const validPresets: LedgerPreset[] = ['upcoming', 'month', 'all'];
    const resolvedPreset: LedgerPreset = validPresets.includes(
      preset as LedgerPreset,
    )
      ? (preset as LedgerPreset)
      : 'upcoming';

    return this.service.getLedger(user.officeId, {
      preset: resolvedPreset,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }
}
