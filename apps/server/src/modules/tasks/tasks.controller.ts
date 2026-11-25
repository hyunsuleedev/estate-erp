import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 uuid 변환 오류로 500이 난다). */
const TaskIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 업무 주소입니다.'),
});

@ApiTags('업무')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasksService.findAll(user.officeId, {
      status: status || undefined,
      category: category || undefined,
      assignedToId: assignedToId || undefined,
      projectId: projectId || undefined,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', TaskIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      title: string;
      content?: string;
      source?: string;
      status?: string;
      priority?: string;
      category?: string;
      dueDate?: string;
      assignedToId?: string;
      contactId?: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      consultationId?: string;
      buyerIntakeId?: string;
      buyerReqId?: string;
      matchId?: string;
      dealId?: string;
      contractId?: string;
      projectId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.create(user.officeId, dto, user.userId);
  }

  @Post(':id/claim')
  claim(
    @Param('id', TaskIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.claim(id, user.officeId, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id', TaskIdPipe) id: string,
    @Body()
    dto: {
      title?: string;
      content?: string;
      status?: string;
      priority?: string;
      category?: string;
      dueDate?: string | null;
      assignedToId?: string | null;
      contactId?: string | null;
      propertyId?: string | null;
      listingIntakeId?: string | null;
      listingId?: string | null;
      consultationId?: string | null;
      buyerIntakeId?: string | null;
      buyerReqId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
      contractId?: string | null;
      projectId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.update(id, user.officeId, dto, user.userId);
  }

  @Post('reorder')
  reorder(
    @Body() dto: { orderedIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.reorder(user.officeId, dto.orderedIds);
  }

  @Post('bulk-status')
  bulkUpdateStatus(
    @Body() dto: { ids: string[]; status: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.bulkUpdateStatus(dto.ids, user.officeId, dto.status);
  }

  @Post('bulk-delete')
  bulkDelete(
    @Body() dto: { ids: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.bulkDelete(dto.ids, user.officeId, user.role);
  }

  @Delete(':id')
  remove(
    @Param('id', TaskIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.remove(id, user.officeId, user.role);
  }
}
