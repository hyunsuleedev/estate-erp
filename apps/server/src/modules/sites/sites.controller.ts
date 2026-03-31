import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('사이트')
@ApiBearerAuth()
@Controller('sites')
@UseGuards(JwtAuthGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.sitesService.findAll(user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      type: string;
      name: string;
      wardCode: string;
      roadAddress?: string;
      jibunAddress?: string;
      lat?: number;
      lng?: number;
      builtYear?: number;
      totalUnits?: number;
      totalDongs?: number;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sitesService.remove(id, user.officeId);
  }
}
