import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { CreateMatchDto, UpdateMatchStageDto } from './dto/match.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('매칭')
@ApiBearerAuth()
@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('propertyId') propertyId?: string,
    @Query('listingId') listingId?: string,
    @Query('buyerReqId') buyerReqId?: string,
    @Query('stage') stage?: string,
  ) {
    return this.matchesService.findAll(user.officeId, {
      propertyId,
      listingId,
      buyerReqId,
      stage,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body() dto: CreateMatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.create(user.officeId, dto);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateMatchStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.updateStage(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.remove(id, user.officeId);
  }
}
