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
import { DongsService } from './dongs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('동')
@ApiBearerAuth()
@Controller('dongs')
@UseGuards(JwtAuthGuard)
export class DongsController {
  constructor(private readonly dongsService: DongsService) {}

  @Get()
  findAll(
    @Query('siteId') siteId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dongsService.findAll(user.officeId, siteId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dongsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body() dto: { siteId: string; name: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dongsService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dongsService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dongsService.remove(id, user.officeId);
  }
}
