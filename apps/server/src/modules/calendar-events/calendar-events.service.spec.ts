import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CalendarEventsService } from './calendar-events.service';

const STAFF = '11111111-1111-4111-8111-111111111111';
const CONTACT = '77777777-7777-4777-8777-777777777777';

function createService() {
  const count = () => jest.fn().mockResolvedValue(1);
  const prisma = {
    calendarEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      update: jest.fn().mockResolvedValue({ id: 'event-1' }),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { count: count() },
    contact: { count: count() },
    property: { count: count() },
    listingIntake: { count: count() },
    listing: { count: count() },
    match: { count: count() },
    deal: { count: count() },
  };
  return { prisma, service: new CalendarEventsService(prisma as never) };
}

describe('CalendarEventsService', () => {
  it('조회 범위와 겹치는 멀티데이 이벤트를 포함하는 조건을 사용한다', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { calendarEvent: { findMany } };
    const service = new CalendarEventsService(prisma as never);
    const rangeStart = '2026-07-01T00:00:00.000Z';
    const rangeEnd = '2026-08-01T00:00:00.000Z';

    await service.findAll('office-1', { start: rangeStart, end: rangeEnd });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          officeId: 'office-1',
          AND: [
            { start: { lt: new Date(rangeEnd) } },
            {
              OR: [
                { end: { gt: new Date(rangeStart) } },
                { end: null, start: { gte: new Date(rangeStart) } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('끝이 시작보다 앞인 일정은 저장하지 않는다', async () => {
    const { prisma, service } = createService();
    await expect(
      service.create('office-1', STAFF, {
        title: '임장',
        start: '2026-11-28T05:00:00.000Z',
        end: '2026-11-28T04:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('제목이 없거나 시작 일시를 읽을 수 없으면 400으로 답한다', async () => {
    const { service } = createService();
    await expect(service.create('office-1', STAFF, { title: '', start: '2026-11-28T05:00:00.000Z' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('office-1', STAFF, { title: '임장', start: 'garbage' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('다른 사무소의 연락처는 연결하지 않는다', async () => {
    const { prisma, service } = createService();
    prisma.contact.count.mockResolvedValue(0);
    await expect(
      service.create('office-1', STAFF, { title: '임장', start: '2026-11-28T05:00:00.000Z', contactId: CONTACT }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('담당 직원을 따로 고르면 그 사람의 일정으로 만든다', async () => {
    const { prisma, service } = createService();
    const other = '22222222-2222-4222-8222-222222222222';
    await service.create('office-1', STAFF, { title: '임장', start: '2026-11-28T05:00:00.000Z', userId: other });
    expect(prisma.calendarEvent.create.mock.calls[0][0].data.userId).toBe(other);
  });

  it('수정할 때 받은 칸을 그대로 넘기지 않는다 (officeId 바꾸기 차단)', async () => {
    const { prisma, service } = createService();
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      userId: STAFF,
      start: new Date('2026-11-28T05:00:00.000Z'),
      end: new Date('2026-11-28T07:00:00.000Z'),
    });
    await service.update('event-1', 'office-1', { title: '임장', officeId: 'office-2' } as never);
    expect(prisma.calendarEvent.update.mock.calls[0][0].data).not.toHaveProperty('officeId', 'office-2');
  });

  it('끝만 옮겨도 시작보다 앞이면 거절한다', async () => {
    const { prisma, service } = createService();
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      userId: STAFF,
      start: new Date('2026-11-28T05:00:00.000Z'),
      end: new Date('2026-11-28T07:00:00.000Z'),
    });
    await expect(
      service.update('event-1', 'office-1', { end: '2026-11-28T04:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('직원은 다른 직원의 일정을 지우지 못한다', async () => {
    const { prisma, service } = createService();
    prisma.calendarEvent.findFirst.mockResolvedValue({ id: 'event-1', userId: 'someone-else' });
    await expect(
      service.remove('event-1', 'office-1', { userId: STAFF, role: 'agent' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.calendarEvent.deleteMany).not.toHaveBeenCalled();
  });

  it('닫힌 매칭의 앞날 일정을 화면이 알아보게 매칭의 단계와 닫힌 이유를 함께 준다', async () => {
    const { prisma, service } = createService();
    await service.findAll('office-1', {});
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          // 끝난 거래의 일정을 가리도록 거래의 단계와 거래를 만든 시각도 함께 준다
          match: {
            select: {
              id: true,
              stage: true,
              closedReason: true,
              deals: { select: { id: true, stage: true, createdAt: true, isCancelled: true } },
            },
          },
          deal: { select: { id: true, stage: true, createdAt: true, isCancelled: true } },
        }),
      }),
    );
  });

  describe('남의 일정의 담당 바꾸기', () => {
    const OWNER = '33333333-3333-4333-8333-333333333333';
    const event = {
      id: 'event-1',
      userId: OWNER,
      start: new Date('2026-11-28T05:00:00.000Z'),
      end: new Date('2026-11-28T07:00:00.000Z'),
    };

    it('중개사가 대표 일정의 담당을 자기로 바꿔 지우기 규칙을 우회하지 못한다', async () => {
      const { prisma, service } = createService();
      prisma.calendarEvent.findFirst.mockResolvedValue(event);
      await expect(
        service.update('event-1', 'office-1', { userId: STAFF }, { userId: STAFF, role: 'agent' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    });

    it('남의 일정이라도 시간·메모는 함께 고칠 수 있다 (사무소가 함께 보는 일정)', async () => {
      const { prisma, service } = createService();
      prisma.calendarEvent.findFirst.mockResolvedValue(event);
      await service.update('event-1', 'office-1', { description: '3곳 보기' }, { userId: STAFF, role: 'agent' });
      expect(prisma.calendarEvent.update).toHaveBeenCalled();
    });

    it('자기 일정은 남에게 넘길 수 있고, 대표·매니저는 남의 일정 담당도 바꾼다', async () => {
      const { prisma, service } = createService();
      prisma.calendarEvent.findFirst.mockResolvedValue({ ...event, userId: STAFF });
      await service.update('event-1', 'office-1', { userId: OWNER }, { userId: STAFF, role: 'agent' });
      prisma.calendarEvent.findFirst.mockResolvedValue(event);
      await service.update('event-1', 'office-1', { userId: STAFF }, { userId: OWNER, role: 'manager' });
      expect(prisma.calendarEvent.update).toHaveBeenCalledTimes(2);
    });

    it('지우는 순간 담당이 바뀌었으면 중개사의 지우기는 실패한다', async () => {
      const { prisma, service } = createService();
      prisma.calendarEvent.findFirst.mockResolvedValue({ ...event, userId: STAFF });
      prisma.calendarEvent.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.remove('event-1', 'office-1', { userId: STAFF, role: 'agent' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
        where: { id: 'event-1', officeId: 'office-1', userId: STAFF },
      });
    });
  });
});
