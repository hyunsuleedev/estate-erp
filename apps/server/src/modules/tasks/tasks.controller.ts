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
      dueDate?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.create(user.officeId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      title?: string;
      content?: string;
      isDone?: boolean;
      dueDate?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasksService.remove(id, user.officeId);
  }
}
