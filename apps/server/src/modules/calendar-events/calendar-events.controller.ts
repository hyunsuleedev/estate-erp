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
import { CalendarEventsService } from './calendar-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@ApiTags('캘린더')
@ApiBearerAuth()
@Controller('calendar-events')
@UseGuards(JwtAuthGuard)
export class CalendarEventsController {
  constructor(private readonly calendarEventsService: CalendarEventsService) {}

  /**
   * FullCalendar이 뷰 전환 시 자동 호출하는 엔드포인트
   * GET /calendar-events?start=2026-03-01T00:00:00&end=2026-04-01T00:00:00
   */
  @Get()
  findAll(
    @Query() query: { start?: string; end?: string; userId?: string; type?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.findAll(user.officeId, query);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      title: string;
      description?: string;
      type?: string;
      allDay?: boolean;
      start: string;
      end?: string;
      color?: string;
      propertyId?: string;
      listingId?: string;
      contactId?: string;
      matchId?: string;
      dealId?: string;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.create(user.officeId, user.userId, dto);
  }

  /**
   * FullCalendar eventDrop/eventResize 시 호출
   * start/end만 보내도 됨
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      title?: string;
      description?: string;
      type?: string;
      allDay?: boolean;
      start?: string;
      end?: string;
      color?: string;
      propertyId?: string | null;
      listingId?: string | null;
      contactId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.update(id, user.officeId, dto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.remove(id, user.officeId);
  }
}
