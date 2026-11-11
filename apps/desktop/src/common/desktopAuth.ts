export interface DesktopAuthSessionSnapshot {
  authenticated: boolean;
  /** MeResponse is JSON-only; preload deliberately keeps this transport generic. */
  user: unknown | null;
  revision: number;
  /**
   * Auth0 모드: 이 사용자를 확인할 때 쓴 main 로그인 세션 번호. 탭 화면은
   * main의 현재 세션 번호가 이 값과 같을 때만 토큰을 받는다.
   */
  providerSessionId?: number | null;
}

export interface DesktopAuthTokenScope {
  /** Auth0 모드의 셸: 화면에 보여 주는 계정의 main 세션 번호. */
  sessionId: number;
}

export interface DesktopAuthTokenRequest {
  requestId: string;
}

export interface DesktopAuthTokenResponse extends DesktopAuthTokenRequest {
  token: string | null;
}

export interface DesktopAuthSignOutRequest {
  requestId: string;
}

export interface DesktopAuthSignOutResponse extends DesktopAuthSignOutRequest {
  ok: boolean;
  error?: string;
}
