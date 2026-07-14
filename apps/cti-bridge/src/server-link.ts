import { io, type Socket } from 'socket.io-client';
import type { BridgeConfig } from './config.js';
import type {
  CallEnded,
  DialRequest,
  ProviderStatus,
  RawIncoming,
} from './providers/provider.interface.js';
import type { CtiLineConfigWithCredential } from './providers/helper.provider.js';

/** 서버 미접속 중 착신을 잃지 않기 위한 오프라인 큐 상한 */
const OFFLINE_QUEUE_LIMIT = 200;

interface QueuedEvent {
  event: string;
  payload: Record<string, unknown>;
}

/**
 * 서버 업링크 (스펙 §8) — 레거시 평문 TCP(Packet.cs) 클라이언트의 대체.
 *
 * - socket.io /cti-bridge 네임스페이스, websocket 전용, auth.token = ctib_ 토큰
 * - officeId는 서버가 토큰에서 확정 — 브리지는 자기 사무소를 주장하지 않는다
 * - 재연결은 socket.io 내장 + 앱레벨 하트비트(cti.heartbeat)로 lastSeenAt 갱신
 * - 미접속 중 발생한 착신/종료 이벤트는 큐에 쌓았다가 재접속(ready) 후 flush
 */
export class ServerLink {
  private socket: Socket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private offlineQueue: QueuedEvent[] = [];
  private ready = false;

  /** 서버가 회선 설정을 내려주면 호출 (접속/재접속마다) */
  onReady: ((lines: CtiLineConfigWithCredential[]) => void) | null = null;
  /** 서버가 발신을 위임하면 호출 */
  onDialRequest: ((request: DialRequest) => void) | null = null;

  constructor(private readonly config: BridgeConfig) {}

  connect() {
    const socket = io(`${this.config.serverUrl}/cti-bridge`, {
      transports: ['websocket'],
      auth: { token: this.config.bridgeToken },
      reconnection: true,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      console.log('[server-link] connected');
    });

    socket.on('cti.bridge.ready', (payload: { lines?: CtiLineConfigWithCredential[] }) => {
      this.ready = true;
      console.log(
        `[server-link] ready — lines: ${payload?.lines?.length ?? 0}`,
      );
      this.flushOfflineQueue();
      this.onReady?.(payload?.lines ?? []);
    });

    socket.on('cti.dial.request', (payload: DialRequest) => {
      this.onDialRequest?.(payload);
    });

    socket.on('disconnect', (reason) => {
      this.ready = false;
      console.warn(`[server-link] disconnected: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      console.warn(`[server-link] connect error: ${error.message}`);
    });

    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) socket.emit('cti.heartbeat');
    }, this.config.heartbeatMs);
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.ready = false;
  }

  // ================================================================
  // 브리지 → 서버 이벤트
  // ================================================================

  sendIncoming(providerCode: string, e: RawIncoming) {
    this.emitOrQueue('cti.call.incoming', {
      providerCode,
      rawCid: e.rawCid,
      recvNo: e.recvNo,
      channelKey: e.channelKey,
      occurredAt: e.occurredAt,
    });
  }

  sendCallEnded(providerCode: string, e: CallEnded) {
    this.emitOrQueue('cti.call.ended', {
      providerCode,
      channelKey: e.channelKey,
      disposition: e.disposition,
      endedAt: new Date().toISOString(),
    });
  }

  sendDialResult(requestId: string, success: boolean, message?: string) {
    this.emitOrQueue('cti.dial.result', { requestId, success, message });
  }

  sendLineStatus(providerCode: string, status: ProviderStatus) {
    // 상태는 시점성 정보라 큐잉하지 않는다 — 접속 중일 때만 보고
    if (this.socket?.connected && this.ready) {
      this.socket.emit('cti.line.status', {
        providerCode,
        connected: status.connected,
        message: status.message,
      });
    }
  }

  // ================================================================
  // 내부
  // ================================================================

  private emitOrQueue(event: string, payload: Record<string, unknown>) {
    if (this.socket?.connected && this.ready) {
      this.socket.emit(event, payload);
      return;
    }

    this.offlineQueue.push({ event, payload });
    if (this.offlineQueue.length > OFFLINE_QUEUE_LIMIT) {
      this.offlineQueue.shift();
    }
  }

  private flushOfflineQueue() {
    if (!this.socket?.connected) return;
    const queued = this.offlineQueue;
    this.offlineQueue = [];
    for (const { event, payload } of queued) {
      this.socket.emit(event, payload);
    }
    if (queued.length > 0) {
      console.log(`[server-link] flushed ${queued.length} queued events`);
    }
  }
}
