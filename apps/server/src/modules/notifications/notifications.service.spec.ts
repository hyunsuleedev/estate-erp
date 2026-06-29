import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function createService() {
    const prisma = {
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };
    const realtime = {
      emitNotificationCreated: jest.fn(),
    };

    return {
      prisma,
      realtime,
      service: new NotificationsService(prisma as never, realtime as never),
    };
  }

  function buildNotification(overrides: Record<string, unknown> = {}) {
    return {
      id: 'notification-1',
      officeId: 'office-1',
      userId: 'user-1',
      type: 'task_assigned',
      title: '새 업무가 배정되었습니다',
      content: '매수자 콜백',
      linkType: 'task',
      linkId: 'task-1',
      isRead: false,
      readAt: null,
      createdAt: new Date('2026-06-10T09:00:00.000Z'),
      ...overrides,
    };
  }

  it('lists own notifications newest first with cursor pagination', async () => {
    const { prisma, service } = createService();
    const rows = [
      buildNotification({ id: 'n-3' }),
      buildNotification({ id: 'n-2' }),
      buildNotification({ id: 'n-1' }),
    ];
    prisma.notification.findMany.mockResolvedValue(rows);

    const result = await service.list('office-1', 'user-1', {
      limit: 2,
      cursor: 'n-4',
      unreadOnly: true,
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { officeId: 'office-1', userId: 'user-1', isRead: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      cursor: { id: 'n-4' },
      skip: 1,
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('n-2');
  });

  it('returns null nextCursor when there is no further page', async () => {
    const { prisma, service } = createService();
    prisma.notification.findMany.mockResolvedValue([buildNotification()]);

    const result = await service.list('office-1', 'user-1', { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('counts only unread notifications of the requesting user', async () => {
    const { prisma, service } = createService();
    prisma.notification.count.mockResolvedValue(4);

    await expect(service.unreadCount('office-1', 'user-1')).resolves.toEqual({
      count: 4,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { officeId: 'office-1', userId: 'user-1', isRead: false },
    });
  });

  it('marks a notification as read after verifying ownership', async () => {
    const { prisma, service } = createService();
    prisma.notification.findFirst.mockResolvedValue(buildNotification());
    prisma.notification.update.mockResolvedValue(
      buildNotification({ isRead: true }),
    );

    await service.markRead('notification-1', 'office-1', 'user-1');

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notification-1', officeId: 'office-1', userId: 'user-1' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('rejects marking a notification owned by another user', async () => {
    const { prisma, service } = createService();
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.markRead('notification-1', 'office-1', 'other-user'),
    ).rejects.toThrow('Notification not found');
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('marks all unread notifications as read', async () => {
    const { prisma, service } = createService();
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.markAllRead('office-1', 'user-1')).resolves.toEqual({
      count: 3,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { officeId: 'office-1', userId: 'user-1', isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('creates notifications for explicit userIds and pushes realtime events', async () => {
    const { prisma, realtime, service } = createService();
    prisma.notification.createManyAndReturn.mockResolvedValue([
      buildNotification({ id: 'n-1', userId: 'user-1' }),
      buildNotification({ id: 'n-2', userId: 'user-2' }),
    ]);

    await service.notify({
      officeId: 'office-1',
      userIds: ['user-1', 'user-2', 'user-1'],
      type: 'task_assigned',
      title: '새 업무가 배정되었습니다',
      content: '매수자 콜백',
      linkType: 'task',
      linkId: 'task-1',
    });

    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ officeId: 'office-1', userId: 'user-1' }),
        expect.objectContaining({ officeId: 'office-1', userId: 'user-2' }),
      ],
    });
    expect(realtime.emitNotificationCreated).toHaveBeenCalledTimes(2);
    expect(realtime.emitNotificationCreated).toHaveBeenCalledWith({
      officeId: 'office-1',
      userId: 'user-2',
      notification: expect.objectContaining({
        id: 'n-2',
        type: 'task_assigned',
        title: '새 업무가 배정되었습니다',
        isRead: false,
        createdAt: '2026-06-10T09:00:00.000Z',
      }),
    });
  });

  it('resolves recipients from roles when userIds are not given', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([{ id: 'owner-1' }, { id: 'manager-1' }]);
    prisma.notification.createManyAndReturn.mockResolvedValue([
      buildNotification({ id: 'n-1', userId: 'owner-1' }),
      buildNotification({ id: 'n-2', userId: 'manager-1' }),
    ]);

    await service.notify({
      officeId: 'office-1',
      roles: ['owner', 'manager'],
      type: 'inquiry_received',
      title: '새 문의가 도착했습니다',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        role: { in: ['owner', 'manager'] },
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'owner-1' }),
        expect.objectContaining({ userId: 'manager-1' }),
      ],
    });
  });

  it('skips creation when no recipient resolves', async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.notify({
      officeId: 'office-1',
      roles: ['manager'],
      type: 'inquiry_received',
      title: '새 문의가 도착했습니다',
    });

    expect(result).toEqual([]);
    expect(prisma.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
});
