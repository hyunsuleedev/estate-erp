import type { RequestFn } from '../client.js';

/**
 * 인앱 알림. DOM 전역 Notification 타입과의 충돌을 피하기 위해 AppNotification 으로 명명.
 */
export interface AppNotification {
  id: string;
  officeId: string;
  userId: string;
  type: string;
  title: string;
  content: string | null;
  linkType: string | null;
  linkId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsListFilter {
  /** 이전 페이지 마지막 알림 id (createdAt desc 커서) */
  cursor?: string;
  /** 기본 20, 최대 100 */
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationsListResponse {
  items: AppNotification[];
  /** 다음 페이지 커서. null 이면 마지막 페이지. */
  nextCursor: string | null;
}

/** 'notification.created' realtime 이벤트 payload (office room으로 emit, userId로 필터) */
export interface NotificationCreatedEvent {
  officeId: string;
  userId: string;
  notification: Pick<
    AppNotification,
    'id' | 'type' | 'title' | 'content' | 'linkType' | 'linkId' | 'isRead' | 'createdAt'
  >;
}

export function createNotificationsApi(request: RequestFn) {
  return {
    list: (filter: NotificationsListFilter = {}) =>
      request<NotificationsListResponse>('/notifications', {
        params: filter as Record<string, string | number | boolean | undefined>,
      }),

    unreadCount: () =>
      request<{ count: number }>('/notifications/unread-count'),

    markRead: (id: string) =>
      request<AppNotification>(`/notifications/${id}/read`, {
        method: 'PATCH',
      }),

    markAllRead: () =>
      request<{ count: number }>('/notifications/read-all', {
        method: 'POST',
      }),
  };
}
