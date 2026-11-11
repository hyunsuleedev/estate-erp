import { UnauthorizedException } from '@nestjs/common';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import {
  REALTIME_MAX_MESSAGE_BYTES,
  RealtimeGateway,
} from './realtime.gateway';

function createSocket(handshake: Record<string, unknown> = { auth: { token: 'token' }, headers: {} }) {
  return {
    id: `socket-${Math.random().toString(36).slice(2)}`,
    handshake,
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function createGateway(options: {
  user?: Record<string, unknown>;
  expiresInSeconds?: number;
  authError?: Error;
} = {}) {
  const authenticateBearer = options.authError
    ? jest.fn().mockRejectedValue(options.authError)
    : jest.fn().mockImplementation(async () => ({
        user: options.user ?? {
          userId: 'user-1',
          auth0UserId: 'auth0|u1',
          officeId: 'office-1',
          role: 'agent',
        },
        expiresAtSeconds:
          Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 900),
      }));
  const gateway = new RealtimeGateway(
    {} as never,
    { authenticateBearer } as never,
    { bindServer: jest.fn() } as never,
  );
  return { gateway, authenticateBearer };
}

describe('RealtimeGateway', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('authenticates the handshake token and joins the office and per-user rooms', async () => {
    const { gateway, authenticateBearer } = createGateway();
    const socket = createSocket();

    await gateway.handleConnection(socket as never);

    expect(authenticateBearer).toHaveBeenCalledWith('token');
    expect(socket.join).toHaveBeenCalledWith('office:office-1');
    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.data.user).toEqual({
      userId: 'user-1',
      officeId: 'office-1',
      role: 'agent',
    });
    expect(socket.emit).toHaveBeenCalledWith('realtime.ready', {
      userId: 'user-1',
      officeId: 'office-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket as never);
  });

  it('also reads the token from an Authorization header', async () => {
    const { gateway, authenticateBearer } = createGateway();
    const socket = createSocket({
      auth: {},
      headers: { authorization: 'Bearer header-token' },
    });
    await gateway.handleConnection(socket as never);
    expect(authenticateBearer).toHaveBeenCalledWith('header-token');
    gateway.handleDisconnect(socket as never);
  });

  it('disconnects a connection without a token or with a rejected one', async () => {
    const missing = createGateway();
    const noToken = createSocket({ auth: {}, headers: {} });
    await missing.gateway.handleConnection(noToken as never);
    expect(missing.authenticateBearer).not.toHaveBeenCalled();
    expect(noToken.disconnect).toHaveBeenCalledWith(true);
    expect(noToken.join).not.toHaveBeenCalled();

    const rejected = createGateway({
      authError: new UnauthorizedException('비활성화된 계정입니다.'),
    });
    const socket = createSocket();
    await rejected.gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.data.user).toBeUndefined();
  });

  it('refuses office-less users, like the REST guard', async () => {
    const { gateway } = createGateway({
      user: { userId: 'user-1', auth0UserId: 'auth0|u1', officeId: '', role: 'owner' },
    });
    const socket = createSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.data.user).toBeUndefined();
  });

  it('drops the connection when its token expires so the reconnect re-authenticates', async () => {
    jest.useFakeTimers();
    const { gateway } = createGateway({ expiresInSeconds: 120 });
    const socket = createSocket();
    await gateway.handleConnection(socket as never);

    await jest.advanceTimersByTimeAsync(119_000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('cancels the expiry timer when the socket disconnects first', async () => {
    jest.useFakeTimers();
    const { gateway } = createGateway({ expiresInSeconds: 120 });
    const socket = createSocket();
    await gateway.handleConnection(socket as never);

    gateway.handleDisconnect(socket as never);
    await jest.advanceTimersByTimeAsync(200_000);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('caps the size of what an unauthenticated client can send', () => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, RealtimeGateway);
    expect(options.maxHttpBufferSize).toBe(REALTIME_MAX_MESSAGE_BYTES);
    expect(REALTIME_MAX_MESSAGE_BYTES).toBeLessThanOrEqual(64 * 1024);
  });
});
