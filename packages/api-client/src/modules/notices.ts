import type { RequestFn } from '../client.js';

/**
 * 공지사항. 에스테잇플로우가 모든 사용자에게 알리는 공지다 (사무소 공지가 아니다).
 * 올리고 고치는 API(/notices/admin)는 운영자 전용이고 데스크톱 앱에서는 부르지 않으므로 여기에 두지 않는다.
 */
export interface Notice {
  id: string;
  title: string;
  /** 줄바꿈이 있는 일반 글 */
  body: string;
  /** 필독 */
  isRequired: boolean;
  publishedAt: string;
  /** 내가 읽은 시각. 안 읽었으면 null. */
  readAt: string | null;
}

export interface NoticeList {
  /** 안 읽은 필독이 먼저, 그다음 최근 것부터 */
  items: Notice[];
  /**
   * 안 읽은 공지 전체 수. 안 읽은 공지는 오래됐어도 items 에 들어 있지만 아주 많으면 일부만 담긴다.
   * items 의 안 읽은 줄을 다 읽고도 이 수가 남으면 목록을 다시 불러 나머지를 받는다.
   */
  unreadCount: number;
}

export function createNoticesApi(request: RequestFn) {
  return {
    list: () => request<NoticeList>('/notices'),
    markRead: (id: string) =>
      request<{ noticeId: string; readAt: string }>(`/notices/${id}/read`, { method: 'POST', body: {} }),
  };
}
