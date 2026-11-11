import {
  authSessionPrincipal,
  type DesktopAuthSessionSnapshot,
} from '../../common/desktopAuth';
import {
  REALTIME_SERVER_EVENTS,
  realtimeRoomKey,
  type RealtimeConnectionState,
  type RealtimeEventMessage,
  type RealtimeRoom,
  type RealtimeRoomKind,
  type RealtimeStatus,
} from '../../common/desktopRealtime';

/**
 * 앱 전체에 하나뿐인 서버 실시간 연결. 주인은 main 프로세스다.
 *
 * - 로그인한 세션이 있을 때만 연결한다. 세션이 바뀌면(로그아웃, 다른 사람·사무소)
 *   먼저 끊고 이전 계정의 방 구독을 모두 버린다.
 * - (다시) 연결할 때마다 그 세션의 접근 토큰을 새로 받는다.
 * - 네트워크가 끊기거나 서버가 다시 떠도 간격을 늘려 가며 스스로 다시 붙는다.
 * - 서버는 접근 토큰이 만료될 때마다(약 15분) 연결을 끊어 다시 인증하게 한다. 이어지던
 *   연결을 서버가 끝내면 평소 일로 보고 새 토큰으로 바로 다시 붙는다.
 * - 서버가 연결을 받아 주지 않으면(토큰 거절, 계정 차단, 비밀번호 재설정, 사무소 없음)
 *   바로 다시 붙지 않는다. 거절만으로 로그아웃시키지도 않는다. 로그인 세션 쪽에 그 세션을
 *   서버에 확인하게 하고, 세션이 그대로일 때만 간격을 두고 다시 시도한다.
 * - 화면이 요청한 방 구독은 요청한 화면(owner)별로 세고, 다시 연결될 때마다 다시 들어간다.
 *
 * Electron과 socket.io에 의존하지 않는다. 소켓은 만들어 주는 함수를 받아 쓴다.
 */

/** 이 코어가 쓰는 소켓의 부분. socket.io-client의 Socket이 그대로 맞는다. */
export interface RealtimeSocket {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  disconnect(): unknown;
}

export type RealtimeSocketFactory = (options: {
  url: string;
  token: string;
}) => RealtimeSocket;

/** 연결할 로그인 세션. principal은 사람·사무소가 같은지 가르는 열쇠다. */
export interface RealtimeSessionTarget {
  sessionId: number;
  principal: string;
}

export interface RealtimeConnectionOptions {
  /** gateway 주소. 예: http://localhost:3000/realtime */
  url: string;
  createSocket: RealtimeSocketFactory;
  /** 그 세션의 접근 토큰. 세션이 지나갔거나 지금 받을 수 없으면 null. */
  getAccessToken: (sessionId: number) => Promise<string | null>;
  /**
   * 서버가 연결을 받아 주지 않았다. 로그인 세션 쪽이 그 세션을 서버에 직접 확인하게 한다.
   * 세션이 끝났다면 확인하는 쪽이 `setSession(null)`로 알려 준다. 거절 자체는 로그아웃이
   * 아니다(사무소가 없어 거절된 경우도 있다).
   */
  verifySession: (sessionId: number) => Promise<void>;
  /** 화면에 전할 이벤트. */
  onEvent: (event: RealtimeEventMessage) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
  /** 다시 연결을 시도하는 간격. 마지막 값을 계속 쓴다. 실제 간격은 ±20% 흩뜨린다. */
  reconnectDelaysMs?: readonly number[];
  /**
   * 서버가 연결을 거절한 뒤 다시 시도하는 간격. 마지막 값을 계속 쓴다. 거절은 기다린다고
   * 풀리는 일이 드물어 훨씬 길게 잡는다.
   */
  refusalDelaysMs?: readonly number[];
  /** 0 이상 1 미만. 간격을 흩뜨리는 데 쓴다. */
  random?: () => number;
  /** 소켓을 만든 뒤 `realtime.ready`를 기다리는 시간. 넘기면 그 시도를 버리고 다시 한다. */
  readyTimeoutMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

/**
 * 서버가 다시 뜬 뒤 늦어도 10초 남짓이면 다시 붙는다(화면이 직접 연결하던 때의
 * socket.io 기본값은 최대 5초였다).
 */
const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
/**
 * 서버가 연결을 거절했는데 로그인 세션은 멀쩡하다고 확인된 경우의 간격. 세션 확인
 * (`/auth/me`)이 매번 따라가므로 10초마다 영원히 두드리지 않고 10분까지 늘린다.
 */
const DEFAULT_REFUSAL_DELAYS_MS = [5_000, 30_000, 120_000, 600_000] as const;
/** 서버가 다시 떴을 때 모든 PC가 같은 순간에 몰리지 않게 간격을 ±20% 흩뜨린다. */
const RECONNECT_JITTER = 0.2;
/** 화면 하나가 방을 끝없이 늘리지 못하게 하는 상한. */
const MAX_ROOMS = 500;

/** socket.io가 "서버가 끊었다"고 알려 주는 사유. */
const SERVER_DISCONNECT_REASON = 'io server disconnect';
/**
 * 이만큼 이어진 연결은 자리 잡은 연결로 본다. 자리 잡은 연결이 끊기면 재시도 간격을
 * 처음으로 돌리고, 서버가 끝낸 경우에는 바로 다시 붙는다. 붙자마자 끊기는 연결이
 * 되풀이될 때는 간격이 계속 늘어난다.
 */
const SETTLED_CONNECTION_MS = 10_000;
const DEFAULT_READY_TIMEOUT_MS = 20_000;

const ROOM_MESSAGES: Record<
  RealtimeRoomKind,
  { join: string; leave: string | null; field: string }
> = {
  listing: { join: 'listing.join', leave: 'listing.leave', field: 'listingId' },
  // gateway에 나가기 메시지가 없는 방이다. 다시 연결할 때 다시 들어가지 않는 것으로 끝낸다.
  property: { join: 'property.join', leave: null, field: 'propertyId' },
  'listing-intake': { join: 'listing-intake.join', leave: null, field: 'intakeId' },
  network: {
    join: 'network.room.join',
    leave: 'network.room.leave',
    field: 'roomId',
  },
};

interface RoomEntry {
  room: RealtimeRoom;
  /** 구독을 요청한 화면(webContents id)별 요청 수. */
  owners: Map<number, number>;
}

export class RealtimeConnection {
  private target: RealtimeSessionTarget | null = null;
  private socket: RealtimeSocket | null = null;
  /** 서버가 인증을 마치고 `realtime.ready`를 보낸 뒤에만 true. */
  private ready = false;
  /** 지금 연결이 `realtime.ready`를 받은 시각. */
  private readyAt: number | null = null;
  private state: RealtimeConnectionState = 'offline';
  /** 연결 시도마다 올린다. 지난 시도의 소켓·응답은 무시한다. */
  private attempt = 0;
  private retryTimer: unknown = null;
  private retryIndex = 0;
  /** 연속으로 거절당한 횟수. 서버가 연결을 받아 주면 처음으로 돌아간다. */
  private refusalIndex = 0;
  private readyTimer: unknown = null;
  private readonly rooms = new Map<string, RoomEntry>();

  private readonly reconnectDelaysMs: readonly number[];
  private readonly refusalDelaysMs: readonly number[];
  private readonly readyTimeoutMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: RealtimeConnectionOptions) {
    this.reconnectDelaysMs =
      options.reconnectDelaysMs && options.reconnectDelaysMs.length > 0
        ? options.reconnectDelaysMs
        : DEFAULT_RECONNECT_DELAYS_MS;
    this.refusalDelaysMs =
      options.refusalDelaysMs && options.refusalDelaysMs.length > 0
        ? options.refusalDelaysMs
        : DEFAULT_REFUSAL_DELAYS_MS;
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  }

  /**
   * 연결할 세션을 정한다. 로그인 세션이 바뀔 때마다 부른다.
   * null이면(로그아웃, 확인 중, 서버에 닿지 못함) 끊고 연결하지 않는다.
   * 같은 세션·같은 사람이면 아무것도 하지 않는다.
   */
  setSession(target: RealtimeSessionTarget | null): void {
    const current = this.target;
    if (
      current === target ||
      (current &&
        target &&
        current.sessionId === target.sessionId &&
        current.principal === target.principal)
    ) {
      return;
    }
    this.teardown();
    // 방 구독은 이전 계정의 화면이 요청한 것이다. 다음 계정으로 넘기지 않는다.
    this.rooms.clear();
    this.target = target;
    this.retryIndex = 0;
    this.refusalIndex = 0;
    if (target) this.connect();
  }

  /** 화면(ownerId)이 방의 이벤트를 받고 싶다. 연결돼 있으면 바로 들어간다. */
  subscribe(ownerId: number, room: RealtimeRoom): boolean {
    if (!this.target) return false;
    const key = realtimeRoomKey(room);
    let entry = this.rooms.get(key);
    if (!entry) {
      if (this.rooms.size >= MAX_ROOMS) return false;
      entry = { room: { ...room }, owners: new Map() };
      this.rooms.set(key, entry);
      if (this.ready) this.join(entry.room);
    }
    entry.owners.set(ownerId, (entry.owners.get(ownerId) ?? 0) + 1);
    return true;
  }

  unsubscribe(ownerId: number, room: RealtimeRoom): void {
    const key = realtimeRoomKey(room);
    const entry = this.rooms.get(key);
    const count = entry?.owners.get(ownerId);
    if (!entry || !count) return;
    if (count > 1) entry.owners.set(ownerId, count - 1);
    else entry.owners.delete(ownerId);
    this.dropRoomIfUnused(key, entry);
  }

  /** 화면이 사라졌다(닫힘·새로 불러옴·다른 문서로 이동). 그 화면의 구독을 모두 놓는다. */
  releaseOwner(ownerId: number): void {
    for (const [key, entry] of [...this.rooms]) {
      if (entry.owners.delete(ownerId)) this.dropRoomIfUnused(key, entry);
    }
  }

  getStatus(): RealtimeStatus {
    return {
      state: this.state,
      rooms: [...this.rooms].map(([room, entry]) => ({
        room,
        subscribers: entry.owners.size,
      })),
    };
  }

  dispose(): void {
    this.teardown();
    this.rooms.clear();
    this.target = null;
  }

  private dropRoomIfUnused(key: string, entry: RoomEntry): void {
    if (entry.owners.size > 0) return;
    this.rooms.delete(key);
    if (this.ready) this.leave(entry.room);
  }

  private connect(): void {
    const target = this.target;
    if (!target) return;
    const attempt = ++this.attempt;
    this.setState('connecting');
    void (async () => {
      let token: string | null;
      try {
        token = await this.options.getAccessToken(target.sessionId);
      } catch {
        token = null;
      }
      if (attempt !== this.attempt) return;
      // 토큰을 못 받았다(로그인 서버에 닿지 못함 등). 세션이 끝난 것이면 setSession이 알려 준다.
      if (!token) {
        this.scheduleReconnect();
        return;
      }
      let socket: RealtimeSocket;
      try {
        socket = this.options.createSocket({ url: this.options.url, token });
      } catch {
        this.scheduleReconnect();
        return;
      }
      this.socket = socket;
      this.bind(socket, attempt, target);
      // 연결은 열렸는데 서버가 인증 결과를 주지 않으면 앱 전체가 조용히 이벤트를 못 받는다.
      this.readyTimer = this.setTimer(() => {
        this.readyTimer = null;
        if (attempt !== this.attempt || this.socket !== socket || this.ready) return;
        this.dropSocket(socket);
        this.scheduleReconnect();
      }, this.readyTimeoutMs);
    })();
  }

  private bind(
    socket: RealtimeSocket,
    attempt: number,
    target: RealtimeSessionTarget,
  ): void {
    const live = () => attempt === this.attempt && this.socket === socket;

    socket.on('realtime.ready', () => {
      if (!live()) return;
      this.clearReadyTimer();
      this.ready = true;
      this.refusalIndex = 0;
      this.readyAt = this.now();
      this.setState('connected');
      for (const entry of this.rooms.values()) this.join(entry.room);
      // 끊긴 동안 놓친 변경을 화면이 다시 읽게 한다.
      this.options.onEvent({ name: 'realtime.connected', payload: null });
    });

    socket.on('connect_error', (error) => {
      if (!live()) return;
      this.dropSocket(socket);
      if (isGatewayRefusal(error)) void this.handleRefusedConnection(target, attempt);
      else this.scheduleReconnect();
    });

    socket.on('disconnect', (reason) => {
      if (!live()) return;
      const accepted = this.ready;
      const settled =
        this.readyAt !== null && this.now() - this.readyAt >= SETTLED_CONNECTION_MS;
      this.dropSocket(socket);
      if (settled) this.retryIndex = 0;
      if (reason !== SERVER_DISCONNECT_REASON) {
        this.scheduleReconnect();
      } else if (!accepted) {
        void this.handleRefusedConnection(target, attempt);
      } else if (settled) {
        // 이어지던 연결을 서버가 끝냈다. 접근 토큰이 만료될 때마다 있는 일이다.
        // 새 토큰으로 바로 다시 붙는다. 그 연결이 거절되면 위의 거절 처리로 간다.
        this.connect();
      } else {
        this.scheduleReconnect();
      }
    });

    for (const name of REALTIME_SERVER_EVENTS) {
      socket.on(name, (payload) => {
        if (live()) this.options.onEvent({ name, payload });
      });
    }
  }

  /**
   * 서버가 연결을 받아 주지 않았다(`realtime.ready` 없이 끊음): 토큰이 거절됐거나, 계정이
   * 차단됐거나, 사무소가 없다. 바로 다시 붙으면 거절이 반복될 뿐이다. 세션을 확인하게
   * 하고, 세션이 그대로면 간격을 두고 다시 시도한다. 거절이 이어지면 간격을 10분까지
   * 늘린다(로그인이나 화면 사용은 실시간 연결을 기다리지 않는다).
   */
  private async handleRefusedConnection(
    target: RealtimeSessionTarget,
    attempt: number,
  ): Promise<void> {
    try {
      await this.options.verifySession(target.sessionId);
    } catch {
      // 확인하지 못해도 아래에서 간격을 두고 다시 시도한다.
    }
    if (attempt !== this.attempt || this.target !== target) return;
    this.scheduleReconnect('refused');
  }

  private scheduleReconnect(after: 'failure' | 'refused' = 'failure'): void {
    if (!this.target || this.retryTimer !== null) return;
    let base: number;
    if (after === 'refused') {
      base =
        this.refusalDelaysMs[
          Math.min(this.refusalIndex, this.refusalDelaysMs.length - 1)
        ] ?? DEFAULT_REFUSAL_DELAYS_MS[0];
      this.refusalIndex += 1;
    } else {
      base =
        this.reconnectDelaysMs[
          Math.min(this.retryIndex, this.reconnectDelaysMs.length - 1)
        ] ?? DEFAULT_RECONNECT_DELAYS_MS[0];
      this.retryIndex += 1;
    }
    const delay = Math.round(base * (1 + RECONNECT_JITTER * (this.random() * 2 - 1)));
    const attempt = this.attempt;
    this.setState('connecting');
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (attempt !== this.attempt || !this.target) return;
      this.connect();
    }, delay);
  }

  private dropSocket(socket: RealtimeSocket): void {
    if (this.socket !== socket) return;
    this.clearReadyTimer();
    this.socket = null;
    this.ready = false;
    this.readyAt = null;
    try {
      socket.disconnect();
    } catch {
      // 이미 닫힌 소켓이다.
    }
    this.setState(this.target ? 'connecting' : 'offline');
  }

  /** 지금 연결과 예약된 재시도를 모두 버린다. */
  private teardown(): void {
    this.attempt += 1;
    if (this.retryTimer !== null) {
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
    this.clearReadyTimer();
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    this.readyAt = null;
    if (socket) {
      try {
        socket.disconnect();
      } catch {
        // 이미 닫힌 소켓이다.
      }
    }
    this.setState('offline');
  }

  private clearReadyTimer(): void {
    if (this.readyTimer === null) return;
    this.clearTimer(this.readyTimer);
    this.readyTimer = null;
  }

  private join(room: RealtimeRoom): void {
    const message = ROOM_MESSAGES[room.kind];
    this.socket?.emit(message.join, { [message.field]: room.id });
  }

  private leave(room: RealtimeRoom): void {
    const message = ROOM_MESSAGES[room.kind];
    if (message.leave) this.socket?.emit(message.leave, { [message.field]: room.id });
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    try {
      this.options.onStateChange?.(state);
    } catch (error) {
      console.warn('[realtime] state listener failed', error);
    }
  }
}

/**
 * 서버가 연결을 거절해서 난 connect_error인가. socket.io는 서버가 거절하면(gateway
 * 미들웨어가 오류를 돌려줌) 서버가 보낸 문구를 가진 Error를 준다. 서버에 닿지 못한
 * 경우는 `type: 'TransportError'`이거나 문구가 `timeout`이다.
 */
export function isGatewayRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { type, message } = error as { type?: unknown; message?: unknown };
  return type !== 'TransportError' && typeof message === 'string' && message !== 'timeout';
}

/**
 * 그 로그인 세션으로 연결해도 되는지 정한다. 확인된 사용자가 있고 사무소가 있을 때만
 * 연결한다. gateway는 사무소 없는 사용자를 거절하므로 온보딩 전에는 연결하지 않는다.
 * 사무소가 생기면 principal이 바뀌어 그때 연결된다.
 */
export function realtimeTargetForSession(
  session: DesktopAuthSessionSnapshot,
): RealtimeSessionTarget | null {
  const principal = authSessionPrincipal(session);
  const user = session.user as { office?: { id?: unknown } | null } | null;
  if (
    !principal ||
    session.status !== 'signed-in' ||
    session.providerSessionId === null ||
    typeof user?.office?.id !== 'string' ||
    user.office.id.length === 0
  ) {
    return null;
  }
  return { sessionId: session.providerSessionId, principal };
}

/** API 서버 주소에서 gateway 주소를 만든다. 화면이 쓰던 규칙과 같다. */
export function resolveRealtimeUrl(apiBaseUrl: string): string {
  return `${new URL(apiBaseUrl).origin}/realtime`;
}
