/**
 * 공지사항의 읽음 상태를 한 곳에서 다룬다. 대시보드의 목록과 앱을 열 때 뜨는 필독 팝업이 같이 쓴다.
 *
 * 탭마다 화면(WebContentsView)이 따로 떠 있고 캐시도 따로다. 한 탭에서 공지를 읽거나 팝업을
 * 확인하면 BroadcastChannel로 다른 탭에 알려, 탭을 옮길 때마다 같은 팝업이 다시 뜨지 않게 한다.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NoticeList } from '@estate-erp/api-client';

export type { NoticeList };

export const NOTICES_QUERY_KEY = ['notices'] as const;
/** 공지는 자주 바뀌지 않는다. 5분 안에는 다시 묻지 않는다. */
export const NOTICES_STALE_MS = 5 * 60_000;

/**
 * 이 화면이 읽었다고 알고 있는 공지 (id → 읽은 시각). 목록 캐시와 따로 둔다.
 * 읽기 전에 떠난 목록 응답이 늦게 도착하면 캐시가 예전 값으로 덮여 방금 읽은 공지가 다시
 * '안 읽음'이 된다. 목록을 그릴 때 이 기록을 위에 얹어, 한 번 읽은 것은 되돌아가지 않게 한다.
 * 같은 QueryClient 안에 두므로 로그아웃으로 캐시를 비우면 함께 사라진다 (다른 사람에게 넘어가지 않는다).
 */
export const NOTICE_READS_KEY = ['notice-reads-known'] as const;
export type KnownNoticeReads = Readonly<Record<string, string>>;
const NO_READS: KnownNoticeReads = {};

/** 이 화면이 읽었다고 알고 있는 공지. 팝업과 대시보드 목록이 같은 기록을 본다. */
export function useKnownNoticeReads(): KnownNoticeReads {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: NOTICE_READS_KEY,
    // 서버에서 받아 오는 값이 아니다. applyNoticeRead 가 적어 넣는다.
    queryFn: () => queryClient.getQueryData<KnownNoticeReads>(NOTICE_READS_KEY) ?? NO_READS,
    enabled: false,
    initialData: NO_READS,
    staleTime: Infinity,
    gcTime: Infinity,
  }).data;
}

/** 목록에 읽음 기록을 얹는다. 안 읽은 수는 캐시에 아직 안 읽음으로 남은 만큼 뺀다. */
export function withKnownReads(list: NoticeList | undefined, known: KnownNoticeReads): NoticeList {
  if (!list) return { items: [], unreadCount: 0 };
  let stale = 0;
  const items = list.items.map((item) => {
    if (item.readAt || !known[item.id]) return item;
    stale += 1;
    return { ...item, readAt: known[item.id] };
  });
  return stale === 0 ? list : { items, unreadCount: Math.max(0, list.unreadCount - stale) };
}

/**
 * 그 공지를 읽음으로 바꾼다: 읽음 기록에 적고, 목록 캐시에서도 그 줄만 바꾸고 안 읽은 수를 하나 줄인다.
 * 이미 읽음이면 두 번 세지 않는다.
 */
export function applyNoticeRead(queryClient: QueryClient, noticeId: string, readAt: string) {
  queryClient.setQueryData<KnownNoticeReads>(NOTICE_READS_KEY, (prev = NO_READS) =>
    prev[noticeId] ? prev : { ...prev, [noticeId]: readAt },
  );
  queryClient.setQueryData<NoticeList>(NOTICES_QUERY_KEY, (prev) => {
    if (!prev) return prev;
    const target = prev.items.find((item) => item.id === noticeId);
    if (!target || target.readAt) return prev;
    return {
      unreadCount: Math.max(0, prev.unreadCount - 1),
      items: prev.items.map((item) => (item.id === noticeId ? { ...item, readAt } : item)),
    };
  });
}

/**
 * read: 서버에 읽음이 저장됐다 (다른 탭도 캐시를 읽음으로 바꾼다)
 * confirmed: 팝업에서 확인을 눌렀다 (저장 결과와 상관없이 다른 탭의 팝업도 닫는다)
 */
export type NoticeSignal =
  | { type: 'read'; noticeId: string; readAt: string }
  | { type: 'confirmed'; noticeId: string };

const CHANNEL_NAME = 'estate-erp:notices';

function isNoticeSignal(value: unknown): value is NoticeSignal {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Record<string, unknown>;
  if (typeof signal.noticeId !== 'string') return false;
  return signal.type === 'confirmed' || (signal.type === 'read' && typeof signal.readAt === 'string');
}

/** 다른 탭에 알린다. BroadcastChannel이 없는 환경에서는 조용히 넘어간다 (이 탭의 동작에는 영향이 없다). */
export function announceNotice(signal: NoticeSignal) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(signal);
  channel.close();
}

/** 다른 탭이 보낸 알림을 듣는다. 돌려주는 함수를 부르면 그만 듣는다. 자기가 보낸 것은 오지 않는다. */
export function listenToNotices(handler: (signal: NoticeSignal) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (isNoticeSignal(event.data)) handler(event.data);
  };
  return () => channel.close();
}
