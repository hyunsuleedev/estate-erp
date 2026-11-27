import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommentsService, type CommentTarget } from './comments.service';

@ApiTags('코멘트')
@ApiBearerAuth()
@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  findAll(
    @Query('projectId') projectId: string,
    @Query('propertyId') propertyId: string,
    @Query('listingIntakeId') listingIntakeId: string,
    @Query('buyerIntakeId') buyerIntakeId: string,
    @Query('dealId') dealId: string,
    @Query('before') before: string,
    @Query('limit') limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.findAll(
      { projectId, propertyId, listingIntakeId, buyerIntakeId, dealId },
      user.officeId,
      {
        before: before || undefined,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }

  @Post()
  create(
    @Body() dto: CommentTarget & { body?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const payload = dto ?? {};
    return this.comments.create(
      {
        projectId: payload.projectId,
        propertyId: payload.propertyId,
        listingIntakeId: payload.listingIntakeId,
        buyerIntakeId: payload.buyerIntakeId,
        dealId: payload.dealId,
      },
      user,
      { body: payload.body },
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { body?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.update(id, user, dto ?? {});
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.comments.remove(id, user);
  }
}
