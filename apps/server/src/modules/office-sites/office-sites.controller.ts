import {
  Controller,
  Get,
  Post,
  Patch,
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

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  add(
    @Body() dto: { siteId: string; memo?: string; isFavorite?: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.add(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { memo?: string | null; isFavorite?: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, user.officeId);
  }
}
