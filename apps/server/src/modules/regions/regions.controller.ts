import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('법정동 지역')
@ApiBearerAuth()
@Controller('regions')
@UseGuards(JwtAuthGuard)
export class RegionsController {
  constructor(private readonly service: RegionsService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.service.search(q ?? '', limit ? Number(limit) : undefined);
  }
}
