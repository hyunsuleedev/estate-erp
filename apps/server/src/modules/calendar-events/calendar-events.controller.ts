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
import { CalendarEventsService } from './calendar-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/** 주소의 id 형식이 틀리면 DB까지 가지 않고 400으로 돌려준다 (그대로 두면 uuid 변환 오류로 500이 난다). */
const EventIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('잘못된 일정 주소입니다.'),
});

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
    @Param('id', EventIdPipe) id: string,
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
      /** 담당 직원. 비우면 만든 사람 */
      userId?: string;
      propertyId?: string;
      listingIntakeId?: string;
      listingId?: string;
      contactId?: string;
      buyerIntakeId?: string;
      matchId?: string;
      dealId?: string;
      projectId?: string;
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
    @Param('id', EventIdPipe) id: string,
    @Body()
    dto: {
      title?: string;
      description?: string | null;
      type?: string;
      allDay?: boolean;
      start?: string;
      end?: string | null;
      color?: string | null;
      /** 담당 직원 바꾸기 */
      userId?: string;
      propertyId?: string | null;
      listingIntakeId?: string | null;
      listingId?: string | null;
      contactId?: string | null;
      buyerIntakeId?: string | null;
      matchId?: string | null;
      dealId?: string | null;
      projectId?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.update(id, user.officeId, dto, {
      userId: user.userId,
      role: user.role,
    });
  }

  @Delete(':id')
  remove(
    @Param('id', EventIdPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.calendarEventsService.remove(id, user.officeId, {
      userId: user.userId,
      role: user.role,
    });
  }
}
