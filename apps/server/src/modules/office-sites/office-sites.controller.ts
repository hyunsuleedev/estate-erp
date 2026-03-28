import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OfficeSitesService } from './office-sites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('사무소-사이트')
@ApiBearerAuth()
@Controller('office-sites')
@UseGuards(JwtAuthGuard)
export class OfficeSitesController {
  constructor(private readonly service: OfficeSitesService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findAll(user.officeId);
  }

  @Get('search')
  searchCentral(@Query('q') query: string) {
    return this.service.searchCentralSites(query || '');
  }

  @Post()
  add(
    @Body() dto: { siteId: string; memo?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.add(user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
