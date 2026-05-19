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
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('업무')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.tasksService.findAll(user.officeId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
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
      buyerReqId?: string;
      matchId?: string;
      dealId?: string;
      contractId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.create(user.officeId, dto, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
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
      buyerReqId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
      contractId?: string | null;
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
    return this.tasksService.bulkDelete(dto.ids, user.officeId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.remove(id, user.officeId);
  }
}
