import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/react';
import {
  ApiError,
  type MeResponse,
} from '@estate-erp/api-client';
import {
  api,
  removeToken,
  setTokenProvider,
  setAuthFailureHandler,
} from '@/lib/api';
import { getRendererSurface } from '@/features/tabs/native/rendererSurface';
import { getDesktopAuthProvider } from '@/lib/desktop-auth-provider';
import type { DesktopAuthSessionSnapshot } from '../../common/desktopAuth';
import { queryClient } from '@/providers/query-provider';
import { useTabStore } from '@/features/tabs/store/useTabStore';

function authPrincipal(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;
  const candidate = user as { id?: unknown; office?: { id?: unknown } | null };
  if (typeof candidate.id !== 'string') return null;
  const officeId =
    candidate.office && typeof candidate.office.id === 'string'
      ? candidate.office.id
      : '';
  return `${candidate.id}\u0000${officeId}`;
}

interface AuthState {
  user: MeResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  /** 로그인은 됐지만 서버가 거절한 이유 등, 로그인 화면에 보여 줄 문구. */
  authError?: string | null;
  login: (
    loginId: string,
    password: string,
    remember?: boolean,
  ) => Promise<void>;
  register: (
    loginId: string,
    email: string,
    password: string,
    name: string,
    officeName: string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function ClerkShellAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { signOut, openSignIn, openSignUp } = useClerk();
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const principalRef = useRef<string | null>(null);
  const hasEstablishedPrincipalRef = useRef(false);
  const clerkSignOutRef = useRef<Promise<void> | null>(null);

  const applyShellState = useCallback((next: AuthState) => {
    const nextPrincipal = next.isAuthenticated
      ? authPrincipal(next.user)
      : null;
    if (
      hasEstablishedPrincipalRef.current &&
      principalRef.current !== nextPrincipal
    ) {
      void queryClient.cancelQueries();
      queryClient.clear();
      useTabStore.getState().resetWorkspaceForAuthChange();
    }
    principalRef.current = nextPrincipal;
    if (nextPrincipal !== null) hasEstablishedPrincipalRef.current = true;
    setState(next);
  }, []);

  const commitLocalSignedOut = useCallback(() => {
    setTokenProvider(null);
    removeToken();
    applyShellState({ user: null, isLoading: false, isAuthenticated: false });
  }, [applyShellState]);

  const signOutClerkAndCommitLocal = useCallback(() => {
    if (clerkSignOutRef.current) return clerkSignOutRef.current;
    const transaction = Promise.resolve()
      .then(() => signOut())
      .then(() => commitLocalSignedOut())
      .finally(() => {
        if (clerkSignOutRef.current === transaction) {
          clerkSignOutRef.current = null;
        }
      });
    clerkSignOutRef.current = transaction;
    return transaction;
  }, [commitLocalSignedOut, signOut]);

  const publishSignedOutSession = useCallback(async () => {
    const result = await window.electronBridge?.auth.publishSession({
      authenticated: false,
      user: null,
    });
    if (result && !result.ok) {
      throw new Error(result.error ?? 'failed to publish signed-out session');
    }
  }, []);

  const performLocalLogout = useCallback(async () => {
    // Clerk owns the credential. Only after it confirms sign-out do we clear
    // renderer state and commit the broker snapshot.
    await signOutClerkAndCommitLocal();
    await publishSignedOutSession();
  }, [publishSignedOutSession, signOutClerkAndCommitLocal]);

  const handleAuthFailure = useCallback(
    () => {
      void performLocalLogout().catch(() => {
        // Clerk may be temporarily unavailable. Keep the last authenticated
        // principal instead of publishing a logout that never happened.
        setState((previous) => ({ ...previous, isLoading: false }));
      });
    },
    [performLocalLogout],
  );

  // api-client의 onAuthFailure가 호출되면 React 상태를 비로그인으로 전환.
  useEffect(() => {
    setAuthFailureHandler(handleAuthFailure);
    return () => setAuthFailureHandler(null);
  }, [handleAuthFailure]);

  useEffect(() => {
    if (!isLoaded) {
      setState((prev) => ({ ...prev, isLoading: true }));
      return;
    }

    if (!isSignedIn) {
      // During a brokered sign-out, the in-flight Clerk promise owns commit
      // ordering and the ACK. Do not start a second transaction or publish
      // false early merely because the Clerk hook reflected its progress.
      if (clerkSignOutRef.current) return;
      commitLocalSignedOut();
      void publishSignedOutSession().catch(() => {
        // Clerk is already signed out. The shell lifecycle/publication retry
        // will reconcile main; restoring an authenticated local UI would be
        // less coherent than keeping the signed-out credential state.
      });
      return;
    }

    let cancelled = false;
    setTokenProvider(() => getToken());
    setState((prev) => ({ ...prev, isLoading: true }));

    api.auth
      .me()
      .then((user) => {
        if (cancelled) return;
        applyShellState({ user, isLoading: false, isAuthenticated: true });
        void window.electronBridge?.auth.publishSession({
          authenticated: true,
          user,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.statusCode === 401) {
          // The shared client already invoked onAuthFailure with bearer
          // context before constructing this ApiError.
          return;
        }
        setState((prev) => ({ ...prev, isLoading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    applyShellState,
    commitLocalSignedOut,
    getToken,
    isLoaded,
    isSignedIn,
    publishSignedOutSession,
  ]);

  const refresh = useCallback(async () => {
    const user = await api.auth.me();
    applyShellState({ user, isLoading: false, isAuthenticated: true });
    void window.electronBridge?.auth.publishSession({
      authenticated: true,
      user,
    });
  }, [applyShellState]);

  useEffect(() => {
    const bridge = window.electronBridge?.auth;
    if (!bridge) return;
    return bridge.onTokenRequest(({ requestId }) => {
      void getToken()
        .then((token) => bridge.resolveToken({ requestId, token }))
        .catch(() => bridge.resolveToken({ requestId, token: null }));
    });
  }, [getToken]);

  const login = useCallback(
    async (loginId: string, password: string, remember = true) => {
      void loginId;
      void password;
      void remember;
      openSignIn();
    },
    [openSignIn],
  );

  const register = useCallback(
    async (
      loginId: string,
      email: string,
      password: string,
      name: string,
      officeName: string,
    ) => {
      void loginId;
      void email;
      void password;
      void name;
      void officeName;
      openSignUp();
    },
    [openSignUp],
  );

  const logout = useCallback(async () => {
    const bridge = window.electronBridge?.auth;
    if (!bridge) {
      await performLocalLogout();
      return;
    }
    const result = await bridge.requestSignOut();
    if (!result.ok) {
      throw new Error(result.error ?? 'sign-out was not confirmed');
    }
  }, [performLocalLogout]);

  useEffect(() => {
    const bridge = window.electronBridge?.auth;
    if (!bridge) return;
    return bridge.onSignOutRequest(({ requestId }) => {
      // The main-process broker commits its false snapshot only after this ACK.
      // Cleanup requests use the same idempotent Clerk transaction.
      void signOutClerkAndCommitLocal()
        .then(() => bridge.resolveSignOut({ requestId, ok: true }))
        .catch((error) =>
          bridge.resolveSignOut({
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'sign-out failed',
          }),
        );
    });
  }, [signOutClerkAndCommitLocal]);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Auth0 모드의 셸. 로그인 화면이 받은 아이디·비밀번호를 main에 넘기면 main이
 * Auth0 토큰을 받아 갖는다. 셸은 main에 토큰을 받아 /auth/me로 사용자를 확인한
 * 뒤 broker에 세션을 알린다(탭 화면이 그 세션을 쓴다).
 */
function Auth0ShellAuthProvider({ children }: { children: ReactNode }) {
  const bridge = window.electronBridge?.auth;
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [authError, setAuthError] = useState<string | null>(null);
  /** 올릴 때마다 main 세션을 다시 확인한다(로그인, 다른 창의 세션 변경). */
  const [sessionVersion, setSessionVersion] = useState(0);
  /**
   * 이 화면이 보여 주는 계정의 main 세션 번호. 토큰은 이 번호로만 받으므로,
   * 다른 창에서 계정이 바뀌어도 이 화면이 새 계정 토큰으로 요청하지 않는다.
   */
  const sessionIdRef = useRef<number | null>(null);
  const principalRef = useRef<string | null>(null);
  const hasEstablishedPrincipalRef = useRef(false);
  const signOutRef = useRef<Promise<void> | null>(null);

  const applyShellState = useCallback((next: AuthState) => {
    const nextPrincipal = next.isAuthenticated
      ? authPrincipal(next.user)
      : null;
    if (
      hasEstablishedPrincipalRef.current &&
      principalRef.current !== nextPrincipal
    ) {
      void queryClient.cancelQueries();
      queryClient.clear();
      useTabStore.getState().resetWorkspaceForAuthChange();
    }
    principalRef.current = nextPrincipal;
    if (nextPrincipal !== null) hasEstablishedPrincipalRef.current = true;
    setState(next);
  }, []);

  const commitLocalSignedOut = useCallback(() => {
    setTokenProvider(null);
    removeToken();
    applyShellState({ user: null, isLoading: false, isAuthenticated: false });
  }, [applyShellState]);

  const publishSignedOutSession = useCallback(async () => {
    const result = await bridge?.publishSession({
      authenticated: false,
      user: null,
    });
    if (result && !result.ok) {
      throw new Error(result.error ?? 'failed to publish signed-out session');
    }
  }, [bridge]);

  /**
   * 이 화면이 보여 주는 계정의 세션을 로그아웃한다(main이 refresh token을 지우고
   * Auth0에서도 폐기). 로그아웃을 기다리는 사이 새로 로그인해 다른 세션을 보여
   * 주고 있으면, 늦게 끝난 이 로그아웃이 새 로그인 화면을 지우지 않는다.
   */
  const signOutProviderAndCommitLocal = useCallback(() => {
    if (signOutRef.current) return signOutRef.current;
    const target = sessionIdRef.current;
    const transaction = Promise.resolve()
      .then(async () => {
        if (target === null) return;
        const result = await bridge?.providerLogout?.({ sessionId: target });
        if (result && !result.ok) {
          throw new Error(result.error ?? 'sign-out failed');
        }
      })
      .then(() => {
        if (isShowingNewerSession(target)) return;
        commitLocalSignedOut();
      })
      .finally(() => {
        if (signOutRef.current === transaction) signOutRef.current = null;
      });
    signOutRef.current = transaction;
    return transaction;
  }, [bridge, commitLocalSignedOut]);

  /** 로그아웃을 시작한 세션(target)보다 새 세션의 계정을 이미 보여 주고 있다. */
  function isShowingNewerSession(target: number | null): boolean {
    return principalRef.current !== null && sessionIdRef.current !== target;
  }

  const performLocalLogout = useCallback(async () => {
    const target = sessionIdRef.current;
    await signOutProviderAndCommitLocal();
    if (isShowingNewerSession(target)) return;
    await publishSignedOutSession();
  }, [publishSignedOutSession, signOutProviderAndCommitLocal]);

  useEffect(() => {
    setAuthFailureHandler(({ hadBearer }) => {
      if (!hadBearer) {
        // 토큰 없이 나간 요청: 다른 창의 로그아웃·로그인으로 이 화면의 세션 번호가
        // 지나간 경우다. 이 PC의 세션을 끝내지 않고, 바뀌었으면 다시 확인해 따라간다.
        void bridge
          ?.getProviderState?.()
          .then(({ sessionId }) => {
            if (sessionId !== sessionIdRef.current) {
              setSessionVersion((version) => version + 1);
            }
          })
          .catch(() => undefined);
        return;
      }
      // 서버가 이 계정의 토큰을 거절했다(계정 차단·연결 안 됨 등). 로그인을 끝낸다.
      void performLocalLogout().catch(() => {
        setState((previous) => ({ ...previous, isLoading: false }));
      });
    });
    return () => setAuthFailureHandler(null);
  }, [bridge, performLocalLogout]);

  useEffect(() => {
    const getProviderState = bridge?.getProviderState;
    if (!bridge || !getProviderState) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, isLoading: true }));

    const showSignedOut = () => {
      commitLocalSignedOut();
      void publishSignedOutSession().catch(() => undefined);
    };

    void (async () => {
      let sessionId: number | null = null;
      try {
        const state = await getProviderState();
        if (cancelled) return;
        sessionId = state.sessionId;
        if (!state.hasSession || sessionId === null) {
          sessionIdRef.current = sessionId;
          showSignedOut();
          return;
        }
        const scope = { sessionId };
        const token = await bridge.getToken(scope);
        if (cancelled) return;
        if (!token) {
          const latest = await getProviderState();
          if (cancelled) return;
          // 그사이 세션이 또 바뀌었다. 바뀐 세션 알림으로 다시 확인한다.
          if (latest.sessionId !== sessionId) return;
          // 같은 세션인데 토큰을 못 받았다: 로그인 서버에 닿지 못한 경우다.
          sessionIdRef.current = sessionId;
          setAuthError('로그인 정보를 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 로그인해 주세요.');
          showSignedOut();
          return;
        }
        // 이 세션 번호로만 토큰을 받는다. 화면의 계정과 요청의 계정이 늘 같다.
        sessionIdRef.current = sessionId;
        setTokenProvider(() => bridge.getToken(scope));
        const user = await api.auth.me();
        if (cancelled) return;
        setAuthError(null);
        applyShellState({ user, isLoading: false, isAuthenticated: true });
        void bridge.publishSession({
          authenticated: true,
          user,
          providerSessionId: sessionId,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.statusCode === 401) {
          // 이 세션 토큰을 서버가 거절했으면 onAuthFailure가 로그아웃을 진행한다.
          // 세션이 바뀌어 토큰 없이 나간 경우는 다시 확인하므로 문구를 띄우지 않는다.
          const latest = await getProviderState().catch(() => null);
          if (cancelled || latest?.sessionId !== sessionId) return;
          setAuthError(error.message);
          return;
        }
        setState((previous) => ({ ...previous, isLoading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyShellState,
    bridge,
    commitLocalSignedOut,
    publishSignedOutSession,
    sessionVersion,
  ]);

  useEffect(() => {
    if (!bridge?.onProviderSessionChanged) return;
    // 세션 주인은 main 하나다. 어느 창에서든 로그인·로그아웃해서 main 세션 번호가
    // 바뀌면 이 창도 다시 확인해 따라간다. 그 전까지는 토큰이 세션 번호에 묶여 있어
    // 이 창이 새 계정 토큰으로 요청하지 않는다.
    return bridge.onProviderSessionChanged(({ sessionId }) => {
      if (sessionId !== sessionIdRef.current) {
        setSessionVersion((version) => version + 1);
      }
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge?.onProviderSessionEnded) return;
    return bridge.onProviderSessionEnded(() => {
      // main이 refresh token 거절을 확인하고 이미 지웠다. 바로 지우지 않고 main
      // 세션을 다시 확인한다(그사이 새로 로그인했으면 그 계정을 따라간다).
      setAuthError('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      setSessionVersion((version) => version + 1);
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onSignOutRequest(({ requestId }) => {
      void signOutProviderAndCommitLocal()
        .then(() => bridge.resolveSignOut({ requestId, ok: true }))
        .catch((error) =>
          bridge.resolveSignOut({
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'sign-out failed',
          }),
        );
    });
  }, [bridge, signOutProviderAndCommitLocal]);

  const login = useCallback(
    async (loginId: string, password: string) => {
      if (!bridge?.providerLogin) {
        throw new Error('이 환경에서는 Auth0 로그인을 쓸 수 없습니다.');
      }
      setAuthError(null);
      const result = await bridge.providerLogin({ username: loginId, password });
      // 이미 다른 창에서 로그인했으면 그 세션을 확인해 따라간다(계정은 로그아웃으로만 바뀐다).
      if (!result.ok && !result.alreadySignedIn) throw new Error(result.error);
      setSessionVersion((version) => version + 1);
    },
    [bridge],
  );

  const register = useCallback(async () => {
    throw new Error('Auth0 시험 모드에서는 앱에서 회원가입을 지원하지 않습니다.');
  }, []);

  const refresh = useCallback(async () => {
    const user = await api.auth.me();
    applyShellState({ user, isLoading: false, isAuthenticated: true });
    void bridge?.publishSession({
      authenticated: true,
      user,
      providerSessionId: sessionIdRef.current,
    });
  }, [applyShellState, bridge]);

  const logout = useCallback(async () => {
    if (!bridge) {
      await performLocalLogout();
      return;
    }
    const result = await bridge.requestSignOut();
    if (!result.ok) {
      throw new Error(result.error ?? 'sign-out was not confirmed');
    }
  }, [bridge, performLocalLogout]);

  return (
    <AuthContext.Provider
      value={{ ...state, authError, login, register, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function BrokeredTabAuthProvider({ children }: { children: ReactNode }) {
  const bridge = window.electronBridge?.auth;
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const latestRevisionRef = useRef(-1);
  const principalRef = useRef<string | null>(null);
  const bearerFailureRef = useRef<Promise<void> | null>(null);

  const applySession = useCallback(
    (snapshot: DesktopAuthSessionSnapshot) => {
      if (snapshot.revision < latestRevisionRef.current) return;
      latestRevisionRef.current = snapshot.revision;
      const nextPrincipal = snapshot.authenticated
        ? authPrincipal(snapshot.user)
        : null;
      if (principalRef.current !== nextPrincipal) {
        void queryClient.cancelQueries();
        queryClient.clear();
        useTabStore.getState().resetWorkspaceForAuthChange();
      }
      principalRef.current = nextPrincipal;
      setState({
        user: snapshot.authenticated ? (snapshot.user as MeResponse) : null,
        isLoading: false,
        isAuthenticated: snapshot.authenticated,
      });
    },
    [],
  );

  useEffect(() => {
    if (!bridge) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
      return;
    }
    setTokenProvider(() => bridge.getToken());
    const failClosed = () => {
      void queryClient.cancelQueries();
      queryClient.clear();
      useTabStore.getState().resetWorkspaceForAuthChange();
      principalRef.current = null;
      setState({ user: null, isLoading: false, isAuthenticated: false });
    };
    const reapplyBrokerSession = () =>
      bridge.getSession().then(applySession).catch(failClosed);
    setAuthFailureHandler(({ hadBearer }) => {
      if (!hadBearer) {
        // No bearer means the authority transport was unavailable while the
        // request was being assembled. Preserve the brokered principal while
        // the pending token request/future query retries fail over.
        void reapplyBrokerSession();
        return;
      }

      // A server-rejected bearer is not an authority handoff. Ask Clerk's
      // authoritative shell to end/revalidate the credential instead of
      // immediately copying the still-authenticated broker snapshot back in.
      if (bearerFailureRef.current) return;
      setState((previous) => ({ ...previous, isLoading: true }));
      const transaction = bridge
        .requestSignOut()
        .then(async (result) => {
          if (!result.ok) await reapplyBrokerSession();
        })
        .catch(reapplyBrokerSession)
        .finally(() => {
          if (bearerFailureRef.current === transaction) {
            bearerFailureRef.current = null;
          }
        });
      bearerFailureRef.current = transaction;
    });
    const cleanup = bridge.onSession(applySession);
    void bridge.getSession().then(applySession);
    return () => {
      cleanup();
      setTokenProvider(null);
      setAuthFailureHandler(null);
    };
  }, [applySession, bridge]);

  const refresh = useCallback(async () => {
    const user = await api.auth.me();
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);
  const login = useCallback(async () => {
    throw new Error('로그인은 메인 창에서 진행해 주세요.');
  }, []);
  const register = useCallback(async () => {
    throw new Error('회원가입은 메인 창에서 진행해 주세요.');
  }, []);
  const logout = useCallback(async () => {
    const result = await bridge?.requestSignOut();
    if (result && !result.ok) {
      throw new Error(result.error ?? 'sign-out was not confirmed');
    }
  }, [bridge]);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // 탭 화면과 전화 팝업 층은 셸의 로그인 세션을 main을 거쳐 빌려 쓴다.
  if (getRendererSurface().kind !== 'window-shell') {
    return <BrokeredTabAuthProvider>{children}</BrokeredTabAuthProvider>;
  }
  return getDesktopAuthProvider() === 'auth0' ? (
    <Auth0ShellAuthProvider>{children}</Auth0ShellAuthProvider>
  ) : (
    <ClerkShellAuthProvider>{children}</ClerkShellAuthProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
