import { BrowserWindow, ipcMain } from 'electron';

/**
 * CTI Bridge 로컬 WebSocket 클라이언트.
 *
 * 같은 PC에서 상주하는 cti-bridge(ws://127.0.0.1:{port})에 붙어
 * 통화 이벤트(ring/terminate)를 받아 모든 renderer에 IPC로 중계한다.
 * Bridge 미실행은 정상 상태(설치 안 된 사무소)이므로 조용히 재시도만 한다.
 *
 * 와이어 계약: packages/shared/src/cti.ts (docs/CTI_BRIDGE_PLAN.md §4.2)
 */

const DEFAULT_BRIDGE_PORT = 45332;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface BridgeStatusMessage {
  type: 'status';
  vendor: string;
  connected: boolean;
  loggedIn: boolean;
  lines: string[];
  bridgeVersion: string;
}

export interface CtiClientStatus {
  /** Electron ↔ Bridge 로컬 소켓 연결 여부 */
  bridgeConnected: boolean;
  /** Bridge가 마지막으로 보고한 통신사 상태 (연결 전이면 null) */
  bridge: BridgeStatusMessage | null;
}

export class CtiClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private stopped = false;
  private bridgeConnected = false;
  private lastBridgeStatus: BridgeStatusMessage | null = null;

  private readonly url: string;

  constructor(port?: number) {
    const resolvedPort =
      port ?? (Number(process.env.ESTATE_CTI_BRIDGE_PORT ?? '') || DEFAULT_BRIDGE_PORT);
    this.url = `ws://127.0.0.1:${resolvedPort}/`;
  }

  start() {
    this.registerIpcHandlers();
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  getStatus(): CtiClientStatus {
    return { bridgeConnected: this.bridgeConnected, bridge: this.lastBridgeStatus };
  }

  private registerIpcHandlers() {
    ipcMain.handle('cti:getStatus', () => this.getStatus());
    ipcMain.handle(
      'cti:dial',
      (_event, payload: { callee: string; caller?: string }) => {
        if (!this.bridgeConnected || !this.ws) {
          return { ok: false as const, error: 'bridge-disconnected' };
        }
        this.ws.send(
          JSON.stringify({
            type: 'dial',
            callee: payload.callee,
            ...(payload.caller ? { caller: payload.caller } : {}),
          }),
        );
        return { ok: true as const };
      },
    );
  }

  private connect() {
    if (this.stopped) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.bridgeConnected = true;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.broadcast('cti:status', this.getStatus());
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let message: { type?: string } & Record<string, unknown>;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'status') {
        this.lastBridgeStatus = message as unknown as BridgeStatusMessage;
        this.broadcast('cti:status', this.getStatus());
        return;
      }
      // ring / terminate / ctc_result → renderer가 팝업 + 서버 POST /cti/call-events 처리
      this.broadcast('cti:event', message);
    };

    ws.onerror = () => {
      // 연결 실패 로그는 재연결 루프에서 소음이 되므로 무시
    };

    ws.onclose = () => {
      const wasConnected = this.bridgeConnected;
      this.bridgeConnected = false;
      this.ws = null;
      if (wasConnected) {
        this.broadcast('cti:status', this.getStatus());
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  private broadcast(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    }
  }
}
