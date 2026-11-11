import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuthService } from '../modules/auth/staff-auth.service';
import { RealtimeService } from './realtime.service';
import {
  listingIntakeRoom,
  listingRoom,
  networkRoom,
  officeRoom,
  propertyRoom,
  userRoom,
} from './realtime.rooms';

interface AuthenticatedSocketData {
  userId: string;
  officeId: string;
  role: string;
}

/**
 * 클라이언트가 보내는 것은 토큰이 든 연결 요청과 작은 구독 메시지뿐이다.
 * socket.io 기본값(1MB)을 그대로 두면 인증 전에 큰 입력을 받아 주게 된다.
 */
export const REALTIME_MAX_MESSAGE_BYTES = 32_768;
/** setTimeout이 받는 최대 지연(약 24.8일). */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

@WebSocketGateway({
  namespace: '/realtime',
  cors: true,
  transports: ['websocket'],
  maxHttpBufferSize: REALTIME_MAX_MESSAGE_BYTES,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  /** 연결별 "토큰 만료 시 끊기" 타이머. socket.data에는 넣지 않는다(서버 간에 복사된다). */
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAuth: StaffAuthService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bindServer(server);
  }

  async handleConnection(socket: Socket) {
    try {
      const { user, expiresAtSeconds } = await this.authenticate(socket);
      // REST guard와 같은 기준: 사무소가 없는 계정은 업무 데이터에 접근하지 못한다.
      if (!user.officeId) {
        throw new Error('office is required');
      }
      socket.data.user = user;
      socket.join(officeRoom(user.officeId));
      socket.join(userRoom(user.userId));
      // 연결은 한 번 인증하면 계속 열려 있다. 토큰이 만료되는 순간 끊어서, 다시 연결할 때
      // 인증(활성 여부·사무소·토큰 유효성)을 처음부터 다시 거치게 한다.
      this.scheduleExpiryDisconnect(socket, expiresAtSeconds);
      socket.emit('realtime.ready', {
        userId: user.userId,
        officeId: user.officeId,
      });
    } catch (error) {
      this.logger.warn(
        `Rejected realtime socket ${socket.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const timer = this.expiryTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socket.id);
    }
    const user = this.getSocketUser(socket);
    if (!user) return;
    this.logger.debug(`Realtime socket disconnected: ${socket.id}`);
  }

  @SubscribeMessage('listing.join')
  async joinListing(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { listingId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.listingId) return { ok: false };

    const listing = await this.prisma.listing.findFirst({
      where: { id: payload.listingId, officeId: user.officeId },
      select: { id: true, propertyId: true, intakeId: true },
    });

    if (!listing) return { ok: false };

    socket.join(listingRoom(user.officeId, listing.id));
    socket.join(propertyRoom(user.officeId, listing.propertyId));
    socket.join(listingIntakeRoom(user.officeId, listing.intakeId));

    return { ok: true };
  }

  @SubscribeMessage('listing.leave')
  async leaveListing(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { listingId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.listingId) return { ok: false };

    socket.leave(listingRoom(user.officeId, payload.listingId));
    return { ok: true };
  }

  @SubscribeMessage('property.join')
  async joinProperty(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { propertyId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.propertyId) return { ok: false };

    const property = await this.prisma.property.findFirst({
      where: { id: payload.propertyId, officeId: user.officeId },
      select: { id: true },
    });

    if (!property) return { ok: false };

    socket.join(propertyRoom(user.officeId, property.id));
    return { ok: true };
  }

  @SubscribeMessage('listing-intake.join')
  async joinListingIntake(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { intakeId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.intakeId) return { ok: false };

    const intake = await this.prisma.listingIntake.findFirst({
      where: { id: payload.intakeId, officeId: user.officeId },
      select: { id: true, propertyId: true },
    });

    if (!intake) return { ok: false };

    socket.join(listingIntakeRoom(user.officeId, intake.id));
    socket.join(propertyRoom(user.officeId, intake.propertyId));
    return { ok: true };
  }

  /**
   * 공동중개 네트워크 중개방 채널 입장.
   * 크로스 오피스 채널이므로 approved 멤버십을 서비스 레벨에서 직접 검사한다.
   */
  @SubscribeMessage('network.room.join')
  async joinNetworkRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { roomId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.roomId) return { ok: false };

    const member = await this.prisma.networkRoomMember.findFirst({
      where: {
        roomId: payload.roomId,
        officeId: user.officeId,
        status: 'approved',
      },
      select: { id: true },
    });

    if (!member) return { ok: false };

    socket.join(networkRoom(payload.roomId));
    return { ok: true };
  }

  @SubscribeMessage('network.room.leave')
  async leaveNetworkRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { roomId?: string },
  ) {
    const user = this.getSocketUser(socket);
    if (!user || !payload?.roomId) return { ok: false };

    socket.leave(networkRoom(payload.roomId));
    return { ok: true };
  }

  private async authenticate(
    socket: Socket,
  ): Promise<{ user: AuthenticatedSocketData; expiresAtSeconds: number }> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new Error('missing token');
    }

    const { user, expiresAtSeconds } =
      await this.staffAuth.authenticateBearer(token);

    return {
      user: {
        userId: user.userId,
        officeId: user.officeId,
        role: user.role,
      },
      expiresAtSeconds,
    };
  }

  private scheduleExpiryDisconnect(socket: Socket, expiresAtSeconds: number) {
    const delayMs = Math.min(
      Math.max(expiresAtSeconds * 1000 - Date.now(), 0),
      MAX_TIMER_DELAY_MS,
    );
    const timer = setTimeout(() => {
      this.expiryTimers.delete(socket.id);
      socket.disconnect(true);
    }, delayMs);
    timer.unref?.();
    this.expiryTimers.set(socket.id, timer);
  }

  private extractToken(socket: Socket) {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }

    const authorization = socket.handshake.headers.authorization;
    if (typeof authorization === 'string') {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        return token;
      }
    }

    return null;
  }

  private getSocketUser(socket: Socket) {
    return socket.data.user as AuthenticatedSocketData | undefined;
  }
}
