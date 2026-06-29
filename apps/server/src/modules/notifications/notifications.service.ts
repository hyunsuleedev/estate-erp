import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListNotificationsOptions {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}

/**
 * 다른 모듈에서 NotificationsService.notify()로 알림을 생성할 때 쓰는 입력.
 * 수신자는 userIds 직접 지정 또는 roles(owner/manager/agent)로 해석.
 * 둘 다 주면 합집합.
 */
export interface NotifyInput {
  officeId: string;
  userIds?: string[];
  roles?: string[];
  type: string;
  title: string;
  content?: string | null;
  linkType?: string | null;
  linkId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async list(
    officeId: string,
    userId: string,
    options: ListNotificationsOptions = {},
  ) {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const rows = await this.prisma.notification.findMany({
      where: {
        officeId,
        userId,
        ...(options.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async unreadCount(officeId: string, userId: string) {
    const count = await this.prisma.notification.count({
      where: { officeId, userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, officeId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, officeId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(officeId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { officeId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * 알림 생성 헬퍼 — 다른 모듈에서 주입해 사용.
   * 생성 즉시 realtime gateway로 'notification.created' 이벤트를 push한다.
   * (사용자별 room이 없어 office room으로 emit, payload.userId로 클라이언트 필터)
   */
  async notify(input: NotifyInput) {
    const recipientIds = new Set(input.userIds ?? []);

    if (input.roles?.length) {
      const users = await this.prisma.user.findMany({
        where: {
          officeId: input.officeId,
          role: { in: input.roles },
          isActive: true,
        },
        select: { id: true },
      });
      for (const user of users) {
        recipientIds.add(user.id);
      }
    }

    if (recipientIds.size === 0) {
      return [];
    }

    const notifications = await this.prisma.notification.createManyAndReturn({
      data: Array.from(recipientIds).map((userId) => ({
        officeId: input.officeId,
        userId,
        type: input.type,
        title: input.title,
        content: input.content ?? null,
        linkType: input.linkType ?? null,
        linkId: input.linkId ?? null,
      })),
    });

    for (const notification of notifications) {
      this.realtime?.emitNotificationCreated({
        officeId: notification.officeId,
        userId: notification.userId,
        notification: {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          content: notification.content,
          linkType: notification.linkType,
          linkId: notification.linkId,
          isRead: notification.isRead,
          createdAt: notification.createdAt.toISOString(),
        },
      });
    }

    return notifications;
  }
}
