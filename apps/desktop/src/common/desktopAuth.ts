/**
 * 데스크톱 로그인 세션 계약.
 *
 * 세션의 주인은 main 프로세스 하나다. main이 Auth0 토큰과 로그인한 사용자
 * (`GET /auth/me`)를 함께 갖고, 바뀔 때마다 모든 화면(셸·탭 화면·전화 팝업 층)에
 * 같은 snapshot을 보낸다. 화면은 세션을 만들거나 알리지 않고, 로그인·로그아웃·
 * 새로 고침을 main에 요청만 한다.
 */

export type DesktopAuthStatus =
  /** main이 저장된 로그인을 읽거나 사용자를 확인하는 중. */
  | 'loading'
  | 'signed-out'
  | 'signed-in'
  /**
   * main은 로그인(refresh token)을 갖고 있지만 서버에서 사용자를 확인하지 못했다
   * (네트워크·서버 오류). 로그아웃이 아니다. main이 자동으로 다시 시도한다.
   */
  | 'unreachable';

export interface DesktopAuthSessionSnapshot {
  status: DesktopAuthStatus;
  /** status === 'signed-in' */
  authenticated: boolean;
  /** MeResponse(JSON). signed-in일 때만 있다. */
  user: unknown | null;
  /** main 안에서 단조 증가. 화면은 더 낮은 번호의 snapshot을 버린다. */
  revision: number;
  /**
   * main 로그인 세션 번호. 로그인·로그아웃마다 바뀌고 토큰 갱신으로는 바뀌지
   * 않는다. main이 로그인을 갖고 있는 동안(loading·signed-in·unreachable) 있다.
   * 화면은 이 번호로 토큰을 받고 로그아웃을 요청한다.
   */
  providerSessionId: number | null;
  /** 로그인 화면에 보여 줄 문구(만료, 서버가 계정을 거절한 이유 등). */
  error: string | null;
}

export const SIGNED_OUT_AUTH_SESSION: DesktopAuthSessionSnapshot = {
  status: 'signed-out',
  authenticated: false,
  user: null,
  revision: 0,
  providerSessionId: null,
  error: null,
};

/** 화면이 보여 주는 계정의 main 세션 번호. 토큰·로그아웃·401 신고에 붙인다. */
export interface DesktopAuthSessionScope {
  sessionId: number;
}

export interface DesktopAuthCredentials {
  username: string;
  password: string;
}

export type DesktopAuthLoginResult = { ok: true } | { ok: false; error: string };

export interface DesktopAuthSignupInput {
  username: string;
  password: string;
  /** 표시 이름. 비우면 아이디가 이름이 된다. */
  name: string;
}

export type DesktopAuthSignupResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** 계정은 만들어졌다. 다시 가입하지 말고 로그인 화면에서 로그인하면 된다. */
      continueAtLogin?: boolean;
    };

export interface DesktopAuthActionResult {
  ok: boolean;
  error?: string;
}

export interface DesktopAuthRefreshResult extends DesktopAuthActionResult {
  snapshot: DesktopAuthSessionSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 같은 사람·같은 사무소인지 가르는 열쇠. 이 값이 바뀌면 탭 화면, 작업 공간,
 * 조회 캐시를 다음 계정으로 넘기지 않는다.
 */
export function authUserPrincipal(user: unknown): string | null {
  if (!isRecord(user) || typeof user.id !== 'string' || user.id.length === 0) {
    return null;
  }
  const officeId =
    isRecord(user.office) && typeof user.office.id === 'string'
      ? user.office.id
      : '';
  return `${user.id}\u0000${officeId}`;
}

export function authSessionPrincipal(
  snapshot: Pick<DesktopAuthSessionSnapshot, 'authenticated' | 'user'> | null,
): string | null {
  return snapshot?.authenticated ? authUserPrincipal(snapshot.user) : null;
}

/** IPC로 들어온 세션 번호. 없거나 형식이 다르면 null이다. */
export function parseAuthSessionScope(payload: unknown): number | null {
  return isRecord(payload) &&
    typeof payload.sessionId === 'number' &&
    Number.isSafeInteger(payload.sessionId)
    ? payload.sessionId
    : null;
}

const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;

/** IPC로 들어온 로그인 입력을 확인한다. 비밀번호는 다듬지 않는다. */
export function parseAuthCredentials(
  value: unknown,
): DesktopAuthCredentials | null {
  if (!isRecord(value)) return null;
  const { username, password } = value;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const trimmed = username.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_USERNAME_LENGTH ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return null;
  }
  return { username: trimmed, password };
}

const MAX_NAME_LENGTH = 200;

/** IPC로 들어온 가입 입력의 형식만 확인한다. 규칙 확인은 main의 세션 코어가 한다. */
export function parseAuthSignupInput(value: unknown): DesktopAuthSignupInput | null {
  const credentials = parseAuthCredentials(value);
  if (!credentials || !isRecord(value)) return null;
  const name = value.name === undefined ? '' : value.name;
  if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH) return null;
  return { ...credentials, name: name.trim() };
}
