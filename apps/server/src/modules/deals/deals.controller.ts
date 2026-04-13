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
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('거래')
@ApiBearerAuth()
@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.dealsService.findAll(user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      propertyId?: string;
      listingId?: string;
      price?: number;
      memo?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.create(user.officeId, dto);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: { stage: string; price?: number; memo?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.updateStage(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dealsService.remove(id, user.officeId);
  }
}
