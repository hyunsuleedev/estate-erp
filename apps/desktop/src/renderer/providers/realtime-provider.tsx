import { useEffect, type ReactNode } from 'react';
import type {
  RealtimeEventMessage,
  RealtimeRoomKind,
} from '../../common/desktopRealtime';
import { useAuth } from '@/providers/auth-provider';
import { queryClient } from '@/providers/query-provider';

/**
 * 서버 실시간 연결은 main 프로세스에 하나뿐이다. 화면은 연결을 갖지 않고, main이
 * 모든 셸·탭 화면에 보내 주는 이벤트를 받아 자기 조회 결과만 새로 고친다.
 * 브라우저 미리보기(main 없음)에서는 동작하지 않는다.
 */

/** 연결이 (다시) 섰을 때 끊긴 동안 놓쳤을 수 있는 목록. */
const RECONNECT_QUERY_KEYS = [
  ['properties'],
  ['listings'],
  ['listing-intakes'],
  ['contacts'],
  ['tenants'],
  ['consultations'],
  ['matches'],
  ['deals'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 모든 화면이 main에서 같은 이벤트를 직접 받는다. 그래서 이 화면의 캐시만 고치고
 * 다른 화면으로 다시 퍼뜨리지 않는다.
 */
function invalidate(queryKey: readonly unknown[]) {
  void queryClient.invalidateQueriesFromRemote(queryKey);
}

function invalidateProperty(propertyId: unknown) {
  invalidate(['listings']);
  invalidate(['listing-intakes']);
  invalidate(['properties']);
  if (typeof propertyId === 'string') invalidate(['properties', propertyId]);
}

export function applyRealtimeEvent(event: RealtimeEventMessage): void {
  switch (event.name) {
    case 'realtime.connected':
      for (const key of RECONNECT_QUERY_KEYS) invalidate(key);
      return;
    case 'listing.updated':
    case 'listing-intake.updated': {
      if (!isRecord(event.payload)) return;
      invalidateProperty(event.payload.propertyId);
      if (typeof event.payload.intakeId === 'string') {
        invalidate(['listing-intakes', 'quick-sheet', event.payload.intakeId]);
      }
      return;
    }
    default:
      // 알림·중개방 채팅·전화 이벤트는 아직 화면에서 쓰지 않는다.
      return;
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  useEffect(
    () => window.electronBridge?.realtime?.onEvent(applyRealtimeEvent),
    [],
  );
  return children;
}

/**
 * 이 화면이 보는 방(매물 상세 등)의 이벤트를 main의 연결로 받는다. 화면이 닫히면
 * 구독을 놓는다. 화면이 갑자기 사라져도(탭 닫힘·새로 불러옴) main이 대신 놓는다.
 */
export function useRealtimeRoom(
  kind: RealtimeRoomKind,
  id: string | null | undefined,
): void {
  const { sessionId } = useAuth();

  useEffect(() => {
    const bridge = window.electronBridge?.realtime;
    if (!bridge || !id || sessionId === null || sessionId === undefined) return;
    const request = { room: { kind, id }, sessionId };
    let subscribed = false;
    let released = false;
    void bridge
      .subscribe(request)
      .then((result) => {
        if (!result.ok) return;
        // 구독이 서기 전에 화면이 닫혔으면 바로 놓는다.
        if (released) bridge.unsubscribe(request);
        else subscribed = true;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      if (subscribed) bridge.unsubscribe(request);
    };
  }, [id, kind, sessionId]);
}
