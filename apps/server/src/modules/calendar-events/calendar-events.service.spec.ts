import { CalendarEventsService } from './calendar-events.service';

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
});
