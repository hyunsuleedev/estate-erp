import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EVENT_LINK_FIELDS,
  assertLinksInOffice,
  assertStaffInOffice,
  isUuid,
  parseDateInput,
} from '../tasks/linked-records';
import {
  contactPhonesSelectOrdered,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';

const defaultInclude = {
  user: { select: { id: true, name: true } },
  // 같은 단지의 여러 호실을 하루에 보러 가는 일이 많아 동·호까지 내려 준다 (단지 이름만으로는 구분이 안 된다).
  property: {
    select: {
      id: true,
      site: { select: { name: true } },
      unit: {
        select: {
          name: true,
          floor: true,
          floorEnd: true,
          floorLabel: true,
          dong: { select: { name: true, isPlaceholder: true } },
        },
      },
    },
  },
  listingIntake: {
    select: {
      id: true,
      ...LISTING_INTAKE_STATE_SELECT,
      propertyId: true,
      receivedAt: true,
    },
  },
  listing: {
    select: {
      id: true,
      transactionType: true,
      price: true,
      isPaused: true,
      intake: { select: LISTING_INTAKE_STATE_SELECT },
      deals: OCCUPYING_DEALS_SELECT,
    },
  },
  contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
  // 닫힌 매칭에 걸린 앞날의 임장은 화면이 '취소된 약속'으로 보인다. 그 판정에 닫힌 이유까지 함께 준다.
  // 끝난 거래의 일정인지는 화면이 거래의 단계와 거래를 만든 시각으로 가린다(shared의 findDealThatOutlivedEvent).
  match: {
    select: {
      id: true,
      stage: true,
      closedReason: true,
      deals: { select: { id: true, stage: true, createdAt: true, isCancelled: true } },
    },
  },
  deal: { select: { id: true, stage: true, createdAt: true, isCancelled: true } },
};

const EVENT_TYPES = ['general', 'viewing', 'contract', 'meeting', 'task'];
const TITLE_MAX = 200;

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('일정 제목을 입력해 주세요.');
  }
  const title = value.trim();
  if (title.length > TITLE_MAX) {
    throw new BadRequestException(`일정 제목은 ${TITLE_MAX}자까지 쓸 수 있습니다.`);
  }
  return title;
}

function assertPeriod(start: Date, end: Date | null) {
  if (end && end.getTime() < start.getTime()) {
    throw new BadRequestException('종료 시간은 시작 시간 이후여야 합니다.');
  }
}

function assertType(type: unknown) {
  if (type === undefined) return;
  if (typeof type !== 'string' || !EVENT_TYPES.includes(type)) {
    throw new BadRequestException('일정 종류 값이 올바르지 않습니다.');
  }
}

/** 남의 일정을 지우거나 담당을 바꿀 수 있는 역할 */
function canManageOthersEvents(role: string | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

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
    // 형식이 틀린 직원 id로는 아무것도 찾지 않는다(DB의 uuid 변환 오류를 500으로 내지 않는다).
    if (filters.userId && !isUuid(filters.userId)) return [];

    // FullCalendar 범위의 end는 exclusive이다. 범위 안에서 시작한 이벤트뿐 아니라
    // 이전에 시작해 현재 범위까지 이어지는 멀티데이 이벤트도 조회한다.
    const rangeConditions: any[] = [];
    const rangeEnd = parseDateInput(filters.end, '조회 끝');
    const rangeStart = parseDateInput(filters.start, '조회 시작');
    if (rangeEnd) rangeConditions.push({ start: { lt: rangeEnd } });
    if (rangeStart) {
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
    if (!event) throw new NotFoundException('일정을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    return this.withContactPhone(event);
  }

  /**
   * @param userId 일정을 만든 사람. dto.userId(담당 직원)를 따로 보내지 않으면 이 사람이 담당이다.
   */
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
    /** id: 같은 요청을 다시 보내도 한 건만 생기게 할 때 (통화 분석 제안 반영) */
    options: { id?: string } = {},
  ) {
    const title = parseTitle(dto.title);
    const start = parseDateInput(dto.start, '시작 일시');
    if (!start) throw new BadRequestException('시작 날짜와 시간을 입력해 주세요.');
    const end = parseDateInput(dto.end, '종료 일시');
    assertPeriod(start, end ?? null);
    assertType(dto.type);
    const ownerId = dto.userId || userId;
    await Promise.all([
      dto.userId ? assertStaffInOffice(this.prisma, officeId, dto.userId) : undefined,
      assertLinksInOffice(this.prisma, officeId, dto, EVENT_LINK_FIELDS),
    ]);

    const event = await this.prisma.calendarEvent.create({
      data: {
        ...(options.id ? { id: options.id } : {}),
        officeId,
        userId: ownerId,
        title,
        description: dto.description?.trim() || undefined,
        type: dto.type ?? 'general',
        allDay: dto.allDay ?? false,
        start,
        end,
        color: dto.color,
        propertyId: dto.propertyId || undefined,
        listingIntakeId: dto.listingIntakeId || undefined,
        listingId: dto.listingId || undefined,
        contactId: dto.contactId || undefined,
        buyerIntakeId: dto.buyerIntakeId || undefined,
        matchId: dto.matchId || undefined,
        dealId: dto.dealId || undefined,
        projectId: dto.projectId || undefined,
      },
      include: defaultInclude,
    });
    return this.withContactPhone(event);
  }

  /**
   * 보낸 칸만 고친다. 끌어서 옮길 때는 start/end만 보낸다.
   * end·연결 칸에 null을 보내면 지운다.
   */
  async update(
    id: string,
    officeId: string,
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
    /** 고치는 사람. 넘기지 않으면(내부 호출) 역할 검사를 하지 않는다 */
    actor?: { userId: string; role?: string },
  ) {
    const current = await this.findOne(id, officeId);
    // 담당 바꾸기: 남의 일정의 담당은 대표·매니저만 바꾼다. 자기 일정을 남에게 넘기는 것은 본인도 된다.
    // (막지 않으면 중개사가 남의 일정 담당을 자기로 바꾼 뒤 지울 수 있다 — 지우기 규칙을 우회한다.)
    // 시간·메모 같은 다른 칸은 사무소가 함께 보는 일정이라 지금처럼 누구나 고친다.
    if (
      actor &&
      dto.userId &&
      dto.userId !== current.userId &&
      !canManageOthersEvents(actor.role) &&
      current.userId !== actor.userId
    ) {
      throw new ForbiddenException('다른 직원의 일정 담당은 대표·매니저만 바꿀 수 있습니다.');
    }

    const title = dto.title === undefined ? undefined : parseTitle(dto.title);
    const start = dto.start === undefined ? undefined : parseDateInput(dto.start, '시작 일시');
    if (dto.start !== undefined && !start) {
      throw new BadRequestException('시작 날짜와 시간을 입력해 주세요.');
    }
    const end =
      dto.end === undefined ? undefined : dto.end === null || dto.end === '' ? null : parseDateInput(dto.end, '종료 일시');
    // 한쪽만 바꿔도 저장될 모양(바뀐 값 + 그대로인 값)으로 앞뒤를 확인한다
    assertPeriod(start ?? current.start, end === undefined ? current.end : end);
    assertType(dto.type);
    await Promise.all([
      dto.userId ? assertStaffInOffice(this.prisma, officeId, dto.userId) : undefined,
      assertLinksInOffice(this.prisma, officeId, dto, EVENT_LINK_FIELDS),
    ]);

    // 받은 칸을 그대로 넘기지 않는다 (officeId 같은 칸을 바꿔 다른 사무소로 옮기는 일을 막는다)
    const link = (value: string | null | undefined) => (value === '' ? null : value);
    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        type: dto.type,
        allDay: typeof dto.allDay === 'boolean' ? dto.allDay : undefined,
        start,
        end,
        color: dto.color,
        userId: dto.userId || undefined,
        propertyId: link(dto.propertyId),
        listingIntakeId: link(dto.listingIntakeId),
        listingId: link(dto.listingId),
        contactId: link(dto.contactId),
        buyerIntakeId: link(dto.buyerIntakeId),
        matchId: link(dto.matchId),
        dealId: link(dto.dealId),
        projectId: link(dto.projectId),
      },
      include: defaultInclude,
    });
    return this.withContactPhone(event);
  }

  /** 중개사(agent)는 자기 일정만 지운다. 대표·매니저는 사무소 일정을 정리할 수 있다. */
  async remove(id: string, officeId: string, actor?: { userId: string; role?: string }) {
    const event = await this.findOne(id, officeId);
    const ownOnly = actor && !canManageOthersEvents(actor.role);
    if (ownOnly && event.userId !== actor.userId) {
      throw new ForbiddenException('다른 직원의 일정은 대표·매니저만 지울 수 있습니다.');
    }
    // 읽은 담당과 지우는 순간의 담당이 같을 때만 지운다 (그 사이에 담당이 바뀌었으면 지우지 않는다)
    const { count } = await this.prisma.calendarEvent.deleteMany({
      where: { id, officeId, ...(ownOnly ? { userId: actor.userId } : {}) },
    });
    if (count === 0) {
      if (ownOnly) throw new ForbiddenException('다른 직원의 일정은 대표·매니저만 지울 수 있습니다.');
      throw new NotFoundException('일정을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    }
    return event;
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
