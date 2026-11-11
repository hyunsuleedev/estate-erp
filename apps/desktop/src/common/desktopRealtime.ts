/**
 * 실시간 연결 계약.
 *
 * 서버와의 실시간 연결(Socket.io)은 앱 전체에 하나이고 주인은 main 프로세스다.
 * 화면(셸·탭 화면)은 연결을 갖지 않는다. main이 보내 주는 이벤트를 받고, 특정
 * 방(매물 상세 등)의 이벤트가 필요하면 main에 구독을 요청한다.
 */

/** 서버 gateway가 받는 방 종류. */
export const REALTIME_ROOM_KINDS = [
  'listing',
  'property',
  'listing-intake',
  'network',
] as const;
export type RealtimeRoomKind = (typeof REALTIME_ROOM_KINDS)[number];

export interface RealtimeRoom {
  kind: RealtimeRoomKind;
  id: string;
}

/** 화면이 방 구독을 요청할 때 보내는 값. 화면이 보여 주는 세션의 요청만 받는다. */
export interface RealtimeRoomRequest {
  room: RealtimeRoom;
  sessionId: number;
}

/** 서버가 보내는 이벤트 이름. main은 이 목록만 화면에 전달한다. */
export const REALTIME_SERVER_EVENTS = [
  'listing.updated',
  'listing-intake.updated',
  'network.message.created',
  'notification.created',
  'cti.incoming',
  'cti.call.updated',
] as const;
export type RealtimeServerEventName = (typeof REALTIME_SERVER_EVENTS)[number];

/**
 * main이 화면에 보내는 이벤트.
 * `realtime.connected`는 서버 이벤트가 아니라 main이 만든다. 연결이 (다시) 서면
 * 화면이 끊긴 동안 놓친 변경을 다시 읽게 한다.
 */
export type RealtimeEventMessage =
  | { name: 'realtime.connected'; payload: null }
  | { name: RealtimeServerEventName; payload: unknown };

export type RealtimeConnectionState = 'offline' | 'connecting' | 'connected';

export interface RealtimeStatus {
  state: RealtimeConnectionState;
  /** 지금 구독 중인 방과, 그 방을 구독한 화면 수. */
  rooms: Array<{ room: string; subscribers: number }>;
}

const MAX_ROOM_ID_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function realtimeRoomKey(room: RealtimeRoom): string {
  return `${room.kind}:${room.id}`;
}

export function parseRealtimeRoom(value: unknown): RealtimeRoom | null {
  if (!isRecord(value)) return null;
  const { kind, id } = value;
  if (
    typeof kind !== 'string' ||
    !(REALTIME_ROOM_KINDS as readonly string[]).includes(kind) ||
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_ROOM_ID_LENGTH
  ) {
    return null;
  }
  return { kind: kind as RealtimeRoomKind, id };
}

export function parseRealtimeRoomRequest(
  value: unknown,
): RealtimeRoomRequest | null {
  if (!isRecord(value)) return null;
  const room = parseRealtimeRoom(value.room);
  if (
    !room ||
    typeof value.sessionId !== 'number' ||
    !Number.isSafeInteger(value.sessionId)
  ) {
    return null;
  }
  return { room, sessionId: value.sessionId };
}
