import { io } from 'socket.io-client';
import type { RealtimeSocketFactory } from './realtimeConnection';

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * main 프로세스에서 쓰는 socket.io 연결. 다시 연결하는 일은 RealtimeConnection이
 * 직접 한다(시도할 때마다 토큰을 새로 받아야 해서 socket.io의 자동 재연결은 끈다).
 */
export const createSocketIoRealtimeSocket: RealtimeSocketFactory = ({
  url,
  token,
}) =>
  io(url, {
    // 연결 요청에는 토큰만 싣는다. gateway가 받는 크기를 작게 잡아 둔다.
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    // 시도마다 새 연결을 만든다. 같은 주소의 이전 연결 관리자를 다시 쓰지 않는다.
    forceNew: true,
    timeout: CONNECT_TIMEOUT_MS,
  });
