import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CtiBridgeTokenService } from './cti-bridge-token.service';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  CallEndedDto,
  CtiService,
  DialResultDto,
  IncomingCallDto,
} from './cti.service';

export const ctiBridgeRoom = (officeId: string) => `cti-bridge:office:${officeId}`;

interface BridgeSocketData {
  bridgeId: string;
  officeId: string;
}

export interface LineStatus {
  connected: boolean;
  message: string | null;
  updatedAt: string;
}

/**
 * CTI Bridge 업링크 게이트웨이 — 레거시 평문 TCP(Packet.cs) 서버 대체.
 *
 * - 네임스페이스 /cti-bridge: 마스터 PC의 cti-bridge 프로세스 전용.
 *   사용자 앱 브로드캐스트는 기존 /realtime 네임스페이스를 그대로 쓴다.
 * - 인증: 핸드셰이크 auth.token의 ctib_ 토큰만 신뢰. officeId는 토큰에서 확정
 *   (클라이언트가 보낸 officeId는 무시 — 레거시 INFO 메시지 위조 표면 제거).
 * - 사무소당 활성 브리지 1개 원칙: 새 브리지가 붙으면 기존 소켓을 끊는다(last-wins).
 */
@WebSocketGateway({
  namespace: '/cti-bridge',
  cors: true,
  transports: ['websocket'],
})
export class CtiBridgeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(CtiBridgeGateway.name);

  /** officeId → providerCode → 회선 상태 (GET /cti/master/status 용 인메모리 캐시) */
  private readonly lineStatuses = new Map<string, Map<string, LineStatus>>();

  constructor(
    private readonly tokenService: CtiBridgeTokenService,
    private readonly ctiService: CtiService,
    private readonly realtime: RealtimeService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = this.extractToken(socket);
      const resolved = token
        ? await this.tokenService.validateAndResolve(token)
        : null;
      if (!resolved) {
        throw new Error('invalid bridge token');
      }

      // 사무소당 브리지 1개 — 기존 접속을 끊고 최신 접속만 유지
      const room = ctiBridgeRoom(resolved.officeId);
      const existing = await this.server.in(room).fetchSockets();
      for (const old of existing) {
        old.disconnect(true);
      }

      socket.data.bridge = resolved satisfies BridgeSocketData;
      socket.join(room);
      await this.tokenService.touchLastSeen(resolved.bridgeId);

      // 접속 직후 회선 설정 전달 (자격증명 제외)
      const lines = await this.ctiService.getBridgeLineConfigs(resolved.officeId);
      socket.emit('cti.bridge.ready', { lines });

      this.logger.log(
        `CTI bridge connected: office=${resolved.officeId} socket=${socket.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected CTI bridge socket ${socket.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const bridge = this.getBridge(socket);
    if (!bridge) return;

    this.lineStatuses.delete(bridge.officeId);
    // 사무소 앱에 브리지 다운 알림 (레거시 frmMyCallMessage 재연결 UX의 안전한 대체)
    this.realtime.emitCallLineStatus({
      officeId: bridge.officeId,
      providerCode: '*',
      connected: false,
      message: 'CTI 브리지 연결이 끊어졌습니다.',
    });
    this.logger.log(`CTI bridge disconnected: office=${bridge.officeId}`);
  }

  // ================================================================
  // 브리지 → 서버 이벤트
  // ================================================================

  @SubscribeMessage('cti.call.incoming')
  async onIncoming(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: IncomingCallDto,
  ) {
    const bridge = this.getBridge(socket);
    if (!bridge || !payload?.providerCode) return { ok: false };

    const { callEvent } = await this.ctiService.recordIncoming(
      bridge.officeId,
      payload,
    );
    return { ok: true, callEventId: callEvent.id };
  }

  @SubscribeMessage('cti.call.answered')
  async onAnswered(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { channelKey?: string },
  ) {
    const bridge = this.getBridge(socket);
    if (!bridge || !payload?.channelKey) return { ok: false };

    await this.ctiService.markAnswered(bridge.officeId, payload.channelKey);
    return { ok: true };
  }

  @SubscribeMessage('cti.call.ended')
  async onEnded(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CallEndedDto,
  ) {
    const bridge = this.getBridge(socket);
    if (!bridge || !payload?.channelKey) return { ok: false };

    await this.ctiService.markEnded(bridge.officeId, payload);
    return { ok: true };
  }

  @SubscribeMessage('cti.dial.result')
  async onDialResult(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DialResultDto,
  ) {
    const bridge = this.getBridge(socket);
    if (!bridge || !payload?.requestId) return { ok: false };

    await this.ctiService.recordDialResult(bridge.officeId, payload);
    return { ok: true };
  }

  @SubscribeMessage('cti.line.status')
  onLineStatus(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { providerCode?: string; connected?: boolean; message?: string },
  ) {
    const bridge = this.getBridge(socket);
    if (!bridge || !payload?.providerCode) return { ok: false };

    let officeStatuses = this.lineStatuses.get(bridge.officeId);
    if (!officeStatuses) {
      officeStatuses = new Map();
      this.lineStatuses.set(bridge.officeId, officeStatuses);
    }
    officeStatuses.set(payload.providerCode, {
      connected: payload.connected ?? false,
      message: payload.message ?? null,
      updatedAt: new Date().toISOString(),
    });

    this.realtime.emitCallLineStatus({
      officeId: bridge.officeId,
      providerCode: payload.providerCode,
      connected: payload.connected ?? false,
      message: payload.message ?? null,
    });
    return { ok: true };
  }

  @SubscribeMessage('cti.heartbeat')
  async onHeartbeat(@ConnectedSocket() socket: Socket) {
    const bridge = this.getBridge(socket);
    if (!bridge) return { ok: false };
    await this.tokenService.touchLastSeen(bridge.bridgeId);
    return { ok: true };
  }

  // ================================================================
  // 서버 → 브리지 (REST 컨트롤러에서 호출)
  // ================================================================

  /** 발신 위임. 브리지 미접속이면 false 반환. */
  async requestDial(
    officeId: string,
    payload: {
      requestId: string;
      phoneNumber: string;
      line: {
        id: string;
        providerCode: string;
        externalId: string | null;
        internalNo: string | null;
      };
      credential: unknown;
    },
  ): Promise<boolean> {
    const room = ctiBridgeRoom(officeId);
    const sockets = await this.server.in(room).fetchSockets();
    if (sockets.length === 0) return false;

    this.server.to(room).emit('cti.dial.request', payload);
    return true;
  }

  /** 활성 브리지 접속 여부 (레거시 CIDS003Q01 checkMainConnect 대체) */
  async isBridgeConnected(officeId: string): Promise<boolean> {
    const sockets = await this.server
      .in(ctiBridgeRoom(officeId))
      .fetchSockets();
    return sockets.length > 0;
  }

  getLineStatuses(officeId: string): Record<string, LineStatus> {
    return Object.fromEntries(this.lineStatuses.get(officeId) ?? []);
  }

  // ================================================================
  // 내부 헬퍼
  // ================================================================

  private extractToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth?.token;
    return typeof authToken === 'string' && authToken ? authToken : null;
  }

  private getBridge(socket: Socket): BridgeSocketData | undefined {
    return socket.data.bridge as BridgeSocketData | undefined;
  }
}
