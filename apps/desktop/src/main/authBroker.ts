import type {
  DesktopAuthSessionSnapshot,
  DesktopAuthTokenRequest,
  DesktopAuthTokenResponse,
} from '../common/desktopAuth';

interface PendingTokenRequest {
  shellWebContentsId: number | null;
  requestId: string | null;
  promise: Promise<string | null>;
  resolve: (token: string | null) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function sessionPrincipal(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;
  const candidate = user as { id?: unknown; office?: unknown };
  if (typeof candidate.id !== 'string' || candidate.id.length === 0)
    return null;
  const office = candidate.office;
  const officeId =
    office &&
    typeof office === 'object' &&
    typeof (office as { id?: unknown }).id === 'string'
      ? (office as { id: string }).id
      : '';
  return `${candidate.id}\u0000${officeId}`;
}

export interface AuthBrokerOptions {
  sendTokenRequest: (
    shellWebContentsId: number,
    request: DesktopAuthTokenRequest,
  ) => boolean;
  createRequestId?: () => string;
  requestTimeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * Native tab renderer가 Clerk를 각각 부팅하지 않도록 shell의 인증 세션을
 * 중계한다. 토큰 소유와 갱신은 shell에 남기고 main은 짧은 burst cache만 둔다.
 */
export class AuthBroker {
  private readonly shells = new Map<
    number,
    { authenticated: boolean; principal: string | null; lastSeenAt: number }
  >();

  private readonly pending = new Map<string, PendingTokenRequest>();
  private inflight: PendingTokenRequest | null = null;
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private session: DesktopAuthSessionSnapshot = {
    authenticated: false,
    user: null,
    revision: 0,
  };
  private authorityWebContentsId: number | null = null;

  private readonly createRequestId: () => string;
  private readonly requestTimeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: AuthBrokerOptions) {
    this.createRequestId =
      options.createRequestId ??
      (() => `${Date.now()}_${Math.random().toString(36).slice(2)}`);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 2_000;
    this.now = options.now ?? Date.now;
  }

  registerShell(webContentsId: number): void {
    const current = this.shells.get(webContentsId);
    this.shells.set(webContentsId, {
      authenticated: current?.authenticated ?? false,
      principal: current?.principal ?? null,
      lastSeenAt: this.now(),
    });
    if (this.authorityWebContentsId === null) {
      this.authorityWebContentsId = webContentsId;
    }
    this.retryPendingTokenRequest();
  }

  publishSession(
    webContentsId: number,
    snapshot: Omit<DesktopAuthSessionSnapshot, 'revision'>,
  ): DesktopAuthSessionSnapshot | null {
    const shell = this.shells.get(webContentsId);
    if (!shell) return null;

    const publishedPrincipal = snapshot.authenticated
      ? sessionPrincipal(snapshot.user)
      : null;
    const authority = this.authoritativeShellId();
    const authorityShell =
      authority === null ? null : this.shells.get(authority);
    const currentPrincipal = this.getSessionPrincipal();
    // A suspended/crashed authority can leave a healthy same-principal shell
    // waiting behind it. Its publication is the point at which it becomes a
    // safe successor, even when it was not authenticated before the loss.
    if (
      authority !== null &&
      authority !== webContentsId &&
      !authorityShell?.authenticated &&
      currentPrincipal !== null &&
      publishedPrincipal === currentPrincipal
    ) {
      this.authorityWebContentsId = webContentsId;
    }
    const effectiveAuthority = this.authoritativeShellId();
    if (effectiveAuthority !== null && effectiveAuthority !== webContentsId) {
      shell.authenticated = snapshot.authenticated;
      shell.principal = publishedPrincipal;
      shell.lastSeenAt = this.now();
      this.retryPendingTokenRequest();
      return structuredClone(this.session);
    }

    shell.authenticated = snapshot.authenticated;
    shell.principal = publishedPrincipal;
    shell.lastSeenAt = this.now();
    const principalChanged = currentPrincipal !== publishedPrincipal;
    // Logout/account switch crosses a security boundary, so pending responses
    // and bearer cache must be revoked. A reload that republishes the exact
    // same principal is only a transport handoff: keep the caller's promise
    // alive and send a fresh request to the restored/successor authority.
    if (principalChanged) this.invalidateTokenState();
    this.session = {
      authenticated: snapshot.authenticated,
      user: snapshot.authenticated ? snapshot.user : null,
      revision: this.session.revision + 1,
    };
    this.retryPendingTokenRequest();
    return structuredClone(this.session);
  }

  getSession(): DesktopAuthSessionSnapshot {
    return structuredClone(this.session);
  }

  getSessionPrincipal(): string | null {
    return this.session.authenticated ? sessionPrincipal(this.session.user) : null;
  }

  unregister(webContentsId: number): DesktopAuthSessionSnapshot | null {
    const wasAuthority = this.authorityWebContentsId === webContentsId;
    this.shells.delete(webContentsId);
    let changedSession: DesktopAuthSessionSnapshot | null = null;
    if (wasAuthority) {
      const expectedPrincipal = this.getSessionPrincipal();
      this.authorityWebContentsId = this.findSuccessor(expectedPrincipal);
      this.cachedToken = null;
      const successor =
        this.authorityWebContentsId === null
          ? null
          : this.shells.get(this.authorityWebContentsId);
      if (
        !successor ||
        !successor.authenticated ||
        expectedPrincipal === null ||
        successor.principal !== expectedPrincipal
      ) {
        this.session = {
          authenticated: false,
          user: null,
          revision: this.session.revision + 1,
        };
        this.invalidateTokenState();
        changedSession = structuredClone(this.session);
      }
    }
    this.reroutePendingTokenRequest(webContentsId);
    return changedSession;
  }

  /** A renderer reload keeps the same BrowserWindow/webContents identity.
   * Temporarily revoke token authority without turning a global authenticated
   * session into a logout; the fresh frame must publish the same principal. */
  suspendShell(webContentsId: number): void {
    const shell = this.shells.get(webContentsId);
    if (!shell) return;
    shell.authenticated = false;
    shell.lastSeenAt = this.now();
    this.cachedToken = null;
    if (this.authorityWebContentsId === webContentsId) {
      const successor = this.findSuccessor(
        this.getSessionPrincipal(),
        webContentsId,
      );
      if (successor !== null) this.authorityWebContentsId = successor;
    }
    this.reroutePendingTokenRequest(webContentsId);
  }

  isAuthoritativeShell(webContentsId: number): boolean {
    return this.authoritativeShellId() === webContentsId;
  }

  getAuthoritativeShellId(): number | null {
    return this.authoritativeShellId();
  }

  isShellAuthenticated(webContentsId: number): boolean {
    const shell = this.shells.get(webContentsId);
    const principal = this.session.authenticated
      ? sessionPrincipal(this.session.user)
      : null;
    return Boolean(
      shell?.authenticated &&
      principal !== null &&
      shell.principal === principal,
    );
  }

  requestToken(): Promise<string | null> {
    const now = this.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return Promise.resolve(this.cachedToken.value);
    }
    this.cachedToken = null;
    if (this.inflight) return this.inflight.promise;

    if (!this.session.authenticated || this.getSessionPrincipal() === null) {
      return Promise.resolve(null);
    }

    let resolve!: (token: string | null) => void;
    const promise = new Promise<string | null>((accept) => {
      resolve = accept;
    });
    const pending: PendingTokenRequest = {
      shellWebContentsId: null,
      requestId: null,
      promise,
      resolve,
      timeout: setTimeout(() => {
        if (this.inflight !== pending) return;
        this.settlePendingTokenRequest(pending, null);
      }, this.requestTimeoutMs),
    };

    this.inflight = pending;
    this.retryPendingTokenRequest();
    return promise;
  }

  acceptToken(
    webContentsId: number,
    response: DesktopAuthTokenResponse,
  ): boolean {
    const pending = this.pending.get(response.requestId);
    if (
      !pending ||
      pending.shellWebContentsId !== webContentsId ||
      pending.requestId !== response.requestId
    ) {
      return false;
    }

    if (response.token) {
      this.cachedToken = {
        value: response.token,
        expiresAt: this.now() + this.cacheTtlMs,
      };
    } else {
      this.cachedToken = null;
    }
    this.settlePendingTokenRequest(pending, response.token);
    return true;
  }

  dispose(): void {
    this.invalidateTokenState();
    this.shells.clear();
    this.authorityWebContentsId = null;
    this.session = { authenticated: false, user: null, revision: 0 };
  }

  private pickShell(): number | null {
    const authority = this.authoritativeShellId();
    return authority !== null && this.isShellAuthenticated(authority)
      ? authority
      : null;
  }

  private authoritativeShellId(): number | null {
    return this.authorityWebContentsId;
  }

  private findSuccessor(
    expectedPrincipal: string | null,
    exceptWebContentsId?: number,
  ): number | null {
    if (expectedPrincipal !== null) {
      return (
        [...this.shells.entries()].find(
          ([candidateId, candidate]) =>
            candidateId !== exceptWebContentsId &&
            candidate.authenticated &&
            candidate.principal === expectedPrincipal,
        )?.[0] ?? null
      );
    }
    return (
      [...this.shells.keys()].find(
        (candidateId) => candidateId !== exceptWebContentsId,
      ) ?? null
    );
  }

  private clearPendingTokenTransport(pending: PendingTokenRequest): void {
    if (
      pending.requestId !== null &&
      this.pending.get(pending.requestId) === pending
    ) {
      this.pending.delete(pending.requestId);
    }
    pending.requestId = null;
    pending.shellWebContentsId = null;
  }

  private settlePendingTokenRequest(
    pending: PendingTokenRequest,
    token: string | null,
  ): void {
    if (this.inflight !== pending) return;
    clearTimeout(pending.timeout);
    this.clearPendingTokenTransport(pending);
    this.inflight = null;
    pending.resolve(token);
  }

  private reroutePendingTokenRequest(lostWebContentsId: number): void {
    const pending = this.inflight;
    if (!pending || pending.shellWebContentsId !== lostWebContentsId) return;
    this.clearPendingTokenTransport(pending);
    this.retryPendingTokenRequest();
  }

  private retryPendingTokenRequest(): void {
    const pending = this.inflight;
    if (!pending || pending.requestId !== null) return;
    const shellWebContentsId = this.pickShell();
    if (shellWebContentsId === null) return;

    const requestId = this.createRequestId();
    pending.shellWebContentsId = shellWebContentsId;
    pending.requestId = requestId;
    this.pending.set(requestId, pending);
    if (this.options.sendTokenRequest(shellWebContentsId, { requestId })) return;

    this.clearPendingTokenTransport(pending);
    const shell = this.shells.get(shellWebContentsId);
    if (shell) shell.authenticated = false;
    if (this.authorityWebContentsId === shellWebContentsId) {
      const successor = this.findSuccessor(
        this.getSessionPrincipal(),
        shellWebContentsId,
      );
      if (successor !== null) this.authorityWebContentsId = successor;
    }
    // sendTokenRequest can fail synchronously for a destroyed authority. Move
    // through the finite shell set without waiting for its lifecycle event.
    if (this.pickShell() !== shellWebContentsId) this.retryPendingTokenRequest();
  }

  private invalidateTokenState(): void {
    for (const pending of new Set(this.pending.values())) {
      this.settlePendingTokenRequest(pending, null);
    }
    if (this.inflight) this.settlePendingTokenRequest(this.inflight, null);
    this.pending.clear();
    this.inflight = null;
    this.cachedToken = null;
  }
}
