import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const defaultInclude = {
  user: { select: { id: true, name: true } },
  // NOTE: Property 모델에는 memo 필드가 schema상 존재하지 않음 (docs/DATA_STRUCTURE.md와 불일치).
  // 별도 task로 추적 중. schema 기준으로 select 제한.
  property: { select: { id: true, site: { select: { name: true } } } },
  listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
  contact: { select: { id: true, name: true, phone: true } },
  match: { select: { id: true, stage: true } },
  deal: { select: { id: true, stage: true } },
};

@Injectable()
export class CalendarEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FullCalendar 호환 목록 조회
   * GET /calendar-events?start=2026-03-01&end=2026-03-31&userId=xxx
   */
  async findAll(
    officeId: string,
    filters: {
      start?: string;
      end?: string;
      userId?: string;
      type?: string;
    },
  ) {
    const where: any = { officeId };

    // FullCalendar은 start/end 범위로 이벤트 요청
    if (filters.start || filters.end) {
      where.start = {};
      if (filters.start) where.start.gte = new Date(filters.start);
      if (filters.end) where.start.lte = new Date(filters.end);
    }

    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;

    return this.prisma.calendarEvent.findMany({
      where,
      include: defaultInclude,
      orderBy: { start: 'asc' },
    });
  }

  async findOne(id: string, officeId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, officeId },
      include: defaultInclude,
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async create(
    officeId: string,
    userId: string,
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
  ) {
    return this.prisma.calendarEvent.create({
      data: {
        officeId,
        userId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? 'general',
        allDay: dto.allDay ?? false,
        start: new Date(dto.start),
        end: dto.end ? new Date(dto.end) : undefined,
        color: dto.color,
        propertyId: dto.propertyId,
        listingId: dto.listingId,
        contactId: dto.contactId,
        matchId: dto.matchId,
        dealId: dto.dealId,
      },
      include: defaultInclude,
    });
  }

  /**
   * FullCalendar 드래그앤드롭 대응 - start/end만 업데이트
   */
  async update(
    id: string,
    officeId: string,
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
  ) {
    await this.findOne(id, officeId);

    const data: any = { ...dto };
    if (dto.start) data.start = new Date(dto.start);
    if (dto.end) data.end = new Date(dto.end);
    // null 전달 시 연결 해제
    if (dto.end === undefined) delete data.end;

    return this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: defaultInclude,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.calendarEvent.delete({ where: { id } });
  }
}
