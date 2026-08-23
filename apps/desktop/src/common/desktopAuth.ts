export interface DesktopAuthSessionSnapshot {
  authenticated: boolean;
  /** MeResponse is JSON-only; preload deliberately keeps this transport generic. */
  user: unknown | null;
  revision: number;
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
