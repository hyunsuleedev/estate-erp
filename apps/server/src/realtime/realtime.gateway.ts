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
import { ClerkAuthService } from '../modules/auth/clerk-auth.service';
import { RealtimeService } from './realtime.service';
import {
  listingIntakeRoom,
  listingRoom,
  officeRoom,
  propertyRoom,
} from './realtime.rooms';

interface AuthenticatedSocketData {
  userId: string;
  officeId: string;
  role: string;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: true,
  transports: ['websocket'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkAuth: ClerkAuthService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bindServer(server);
  }

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticate(socket);
      socket.data.user = user;
      socket.join(officeRoom(user.officeId));
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

  private async authenticate(socket: Socket): Promise<AuthenticatedSocketData> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new Error('missing token');
    }

    const user = await this.clerkAuth.authenticateBearerToken(token);

    return {
      userId: user.userId,
      officeId: user.officeId,
      role: user.role,
    };
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
