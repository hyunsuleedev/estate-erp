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
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('호실')
@ApiBearerAuth()
@Controller('units')
@UseGuards(JwtAuthGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  findAll(
    @Query('siteId') siteId: string,
    @Query('dongId') dongId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.unitsService.findAll(user.officeId, { siteId, dongId });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.unitsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      siteId: string;
      dongId: string;
      siteUnitTypeId?: string;
      name: string;
      floor?: number;
      lineNo?: number;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.unitsService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      dongId?: string;
      siteUnitTypeId?: string | null;
      floor?: number | null;
      lineNo?: number | null;
      exclusiveAreaM2?: number | null;
      supplyAreaM2?: number | null;
      isPiloti?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.unitsService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.unitsService.remove(id, user.officeId);
  }
}
