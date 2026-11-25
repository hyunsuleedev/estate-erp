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
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import {
  CreateMatchDto,
  UpdateMatchAgreedTermsDto,
  UpdateMatchMemoDto,
  UpdateMatchStageDto,
} from './dto/match.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id가 uuid 꼴이 아니면(잘못된 링크) DB 오류(500) 대신 "찾을 수 없습니다"로 답한다 */
const matchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundException('매칭을 찾을 수 없습니다'),
});

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
    @Param('id', matchIdPipe) id: string,
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
    @Param('id', matchIdPipe) id: string,
    @Body() dto: UpdateMatchStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.updateStage(id, user.officeId, dto);
  }

  @Patch(':id/memo')
  updateMemo(
    @Param('id', matchIdPipe) id: string,
    @Body() dto: UpdateMatchMemoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.updateMemo(id, user.officeId, dto);
  }

  @Patch(':id/agreed-terms')
  updateAgreedTerms(
    @Param('id', matchIdPipe) id: string,
    @Body() dto: UpdateMatchAgreedTermsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.updateAgreedTerms(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', matchIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.matchesService.remove(id, user.officeId);
  }
}
