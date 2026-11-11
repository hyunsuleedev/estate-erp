import {
  parseCtiBridgeStatus,
  parseCtiCallEvent,
  type CtiBridgeStatus,
  type CtiCallEvent,
  type CtiStatus,
} from '../../common/desktopCti';

/**
 * CTI Bridge 로컬 WebSocket 클라이언트.
 *
 * 같은 PC에서 상주하는 cti-bridge(ws://127.0.0.1:{port})에 붙어 통화 이벤트
 * (ring/terminate)와 통신사 연결 상태를 받는다. Bridge 미실행은 정상 상태(설치 안 된
 * 사무소)이므로 조용히 재시도만 한다.
 *
 * 와이어 계약: packages/shared/src/cti.ts (docs/CTI_BRIDGE_PLAN.md §4.2)
 * Electron에 의존하지 않는다. 소켓은 만들어 주는 함수를 받아 쓴다.
 */

const DEFAULT_BRIDGE_PORT = 45332;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** 이 클라이언트가 쓰는 소켓의 부분. 표준 WebSocket이 그대로 맞는다. */
export interface CtiBridgeSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface CtiBridgeClientOptions {
  url: string;
  createSocket?: (url: string) => CtiBridgeSocket;
  onEvent: (event: CtiCallEvent) => void;
  onStatus: (status: CtiStatus) => void;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function resolveCtiBridgeUrl(
  env: Record<string, string | undefined>,
): string {
  const port = Number(env.ESTATE_CTI_BRIDGE_PORT ?? '') || DEFAULT_BRIDGE_PORT;
  return `ws://127.0.0.1:${port}/`;
}

export class CtiBridgeClient {
  private socket: CtiBridgeSocket | null = null;
  private reconnectTimer: unknown = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private started = false;
  private bridgeConnected = false;
  private lastBridgeStatus: CtiBridgeStatus | null = null;

  private readonly createSocket: (url: string) => CtiBridgeSocket;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: CtiBridgeClientOptions) {
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as CtiBridgeSocket);
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.bridgeConnected = false;
    try {
      socket?.close();
    } catch {
      // 이미 닫힌 소켓이다.
    }
  }

  getStatus(): CtiStatus {
    return {
      bridgeConnected: this.bridgeConnected,
      bridge: this.lastBridgeStatus,
    };
  }

  /** 클릭투콜 발신을 Bridge에 보낸다. Bridge가 붙어 있지 않으면 false. */
  dial(command: { callee: string; caller?: string }): boolean {
    if (!this.bridgeConnected || !this.socket) return false;
    try {
      this.socket.send(
        JSON.stringify({
          type: 'dial',
          callee: command.callee,
          ...(command.caller ? { caller: command.caller } : {}),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private connect(): void {
    if (!this.started) return;

    let socket: CtiBridgeSocket;
    try {
      socket = this.createSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    const live = () => this.socket === socket;

    socket.onopen = () => {
      if (!live()) return;
      this.bridgeConnected = true;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.publishStatus();
    };

    socket.onmessage = (event) => {
      if (!live() || typeof event.data !== 'string') return;
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const status = parseCtiBridgeStatus(message);
      if (status) {
        this.lastBridgeStatus = status;
        this.publishStatus();
        return;
      }
      const callEvent = parseCtiCallEvent(message);
      if (callEvent) this.options.onEvent(callEvent);
    };

    socket.onerror = () => {
      // 연결 실패 로그는 재연결 루프에서 소음이 되므로 무시
    };

    socket.onclose = () => {
      if (!live()) return;
      const wasConnected = this.bridgeConnected;
      this.bridgeConnected = false;
      this.socket = null;
      if (wasConnected) this.publishStatus();
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer !== null) return;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      MAX_RECONNECT_DELAY_MS,
    );
  }

  private publishStatus(): void {
    try {
      this.options.onStatus(this.getStatus());
    } catch (error) {
      console.warn('[cti] status listener failed', error);
    }
  }
}
