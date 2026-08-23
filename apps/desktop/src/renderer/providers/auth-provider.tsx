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
  return getRendererSurface().kind === 'native-tab' ? (
    <BrokeredTabAuthProvider>{children}</BrokeredTabAuthProvider>
  ) : (
    <ClerkShellAuthProvider>{children}</ClerkShellAuthProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
