import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesSelectOrdered,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';

const defaultInclude = {
  user: { select: { id: true, name: true } },
  // NOTE: Property 모델에는 memo 필드가 schema상 존재하지 않음 (docs/DATA_STRUCTURE.md와 불일치).
  // 별도 task로 추적 중. schema 기준으로 select 제한.
  property: { select: { id: true, site: { select: { name: true } } } },
  listingIntake: {
    select: {
      id: true,
      status: true,
      propertyId: true,
      receivedAt: true,
    },
  },
  listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
  contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
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

    // FullCalendar 범위의 end는 exclusive이다. 범위 안에서 시작한 이벤트뿐 아니라
    // 이전에 시작해 현재 범위까지 이어지는 멀티데이 이벤트도 조회한다.
    const rangeConditions: any[] = [];
    if (filters.end) rangeConditions.push({ start: { lt: new Date(filters.end) } });
    if (filters.start) {
      const rangeStart = new Date(filters.start);
      rangeConditions.push({
        OR: [
          { end: { gt: rangeStart } },
          { end: null, start: { gte: rangeStart } },
        ],
      });
    }
    if (rangeConditions.length > 0) where.AND = rangeConditions;

    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;

    const events = await this.prisma.calendarEvent.findMany({
      where,
      include: defaultInclude,
      orderBy: { start: 'asc' },
    });
    return events.map((event) => this.withContactPhone(event));
  }

  async findOne(id: string, officeId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, officeId },
      include: defaultInclude,
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.withContactPhone(event);
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
      listingIntakeId?: string;
      listingId?: string;
      contactId?: string;
      matchId?: string;
      dealId?: string;
    },
  ) {
    const event = await this.prisma.calendarEvent.create({
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
        listingIntakeId: dto.listingIntakeId,
        listingId: dto.listingId,
        contactId: dto.contactId,
        matchId: dto.matchId,
        dealId: dto.dealId,
      },
      include: defaultInclude,
    });
    return this.withContactPhone(event);
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
      listingIntakeId?: string | null;
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

    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: defaultInclude,
    });
    return this.withContactPhone(event);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  private withContactPhone<T>(event: T): T {
    const draft = event as Record<string, unknown>;
    const contact = draft.contact as ({ phones?: [] } & Record<string, unknown>) | null | undefined;
    if (contact) {
      draft.contact = withPrimaryPhone(contact);
    }
    return event;
  }
}
