import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '@estate-erp/api-client';
import { setAuthFailureHandler, setTokenProvider } from '@/lib/api';
import { getRendererSurface } from '@/features/tabs/native/rendererSurface';
import { getAuthBridge } from '@/lib/auth-bridge';
import {
  SIGNED_OUT_AUTH_SESSION,
  authSessionPrincipal,
  type DesktopAuthSessionSnapshot,
} from '../../common/desktopAuth';
import { queryClient } from '@/providers/query-provider';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { AuthWindowFrame } from '@/components/layout/auth-window-frame';
import { ServerUnreachableScreen } from '@/components/layout/server-unreachable-screen';

interface AuthState {
  user: MeResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  /** 로그인 화면에 보여 줄 문구(만료, 서버가 계정을 거절한 이유 등). */
  authError?: string | null;
  /**
   * 이 화면이 보여 주는 계정의 main 세션 번호. 세션에 묶인 요청(실시간 방 구독 등)에
   * 붙인다. 로그인 상태가 아니면 null이다.
   */
  sessionId?: number | null;
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

/** 가입 실패. 계정이 이미 만들어졌으면 다시 가입하지 말고 로그인으로 안내한다. */
export class AuthRegisterError extends Error {
  constructor(
    message: string,
    readonly continueAtLogin: boolean,
  ) {
    super(message);
    this.name = 'AuthRegisterError';
  }
}

/**
 * 로그인 세션의 주인은 main 프로세스다. 이 provider는 어느 화면(셸·탭 화면·전화
 * 팝업 층)에서든 main이 보내는 세션을 그대로 비추고, 로그인·로그아웃·새로 고침을
 * main에 요청만 한다. 화면이 세션을 만들거나 다른 화면에 알리지 않는다.
 *
 * 토큰은 "이 화면이 보여 주는 계정의 세션 번호"로만 받는다. 다른 창의 로그아웃·
 * 로그인으로 main 세션이 바뀌어도, 이 화면이 새 계정 토큰으로 요청하지 않는다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Electron에서는 main, 브라우저 미리보기(개발 전용)에서는 페이지 안의 같은 세션 코어.
  const bridge = getAuthBridge();
  const isShell = getRendererSurface().kind === 'window-shell';
  // 세션을 가진 쪽이 없으면(패키지 앱이 아닌 정적 미리보기 등) 로그인하지 않은 상태다.
  const [snapshot, setSnapshot] = useState<DesktopAuthSessionSnapshot | null>(
    bridge ? null : SIGNED_OUT_AUTH_SESSION,
  );
  const latestRevisionRef = useRef(-1);
  /** 토큰을 받을 세션: 사용자가 확인된(signed-in) 세션의 번호. */
  const tokenSessionIdRef = useRef<number | null>(null);
  /** main이 갖고 있는 세션 번호. 서버에 닿지 못한 상태에서도 로그아웃할 수 있다. */
  const heldSessionIdRef = useRef<number | null>(null);
  const principalRef = useRef<string | null>(null);
  const hasEstablishedPrincipalRef = useRef(false);

  const applySnapshot = useCallback(
    (next: DesktopAuthSessionSnapshot) => {
      if (next.revision < latestRevisionRef.current) return;
      latestRevisionRef.current = next.revision;
      const nextPrincipal = authSessionPrincipal(next);
      // 사람이나 사무소가 바뀌면 이전 계정의 조회 결과와 탭을 넘기지 않는다.
      // 셸은 처음 받은 세션(앱을 켰을 때의 복원)에서는 지우지 않는다. 그때 지우면
      // 넘겨받은 분리 창의 작업 공간까지 사라진다.
      const shouldReset =
        principalRef.current !== nextPrincipal &&
        (!isShell || hasEstablishedPrincipalRef.current);
      if (shouldReset) {
        void queryClient.cancelQueries();
        queryClient.clear();
        useTabStore.getState().resetWorkspaceForAuthChange();
      }
      principalRef.current = nextPrincipal;
      if (nextPrincipal !== null) hasEstablishedPrincipalRef.current = true;
      tokenSessionIdRef.current = next.authenticated
        ? next.providerSessionId
        : null;
      heldSessionIdRef.current = next.providerSessionId;
      setSnapshot(next);
    },
    [isShell],
  );

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    const resync = () =>
      bridge
        .getSession()
        .then((current) => {
          if (!cancelled) applySnapshot(current);
        })
        .catch(() => {
          // main에 닿지 못하면 로그인하지 않은 것으로 본다(토큰도 받지 않는다).
          if (cancelled) return;
          tokenSessionIdRef.current = null;
          heldSessionIdRef.current = null;
          setSnapshot(SIGNED_OUT_AUTH_SESSION);
        });

    setTokenProvider(async () => {
      const sessionId = tokenSessionIdRef.current;
      return sessionId === null ? null : bridge.getToken({ sessionId });
    });
    setAuthFailureHandler(({ hadBearer }) => {
      const sessionId = tokenSessionIdRef.current;
      if (hadBearer && sessionId !== null) {
        // 서버가 이 화면의 토큰을 거절했다. 로그아웃할지는 main이 직접 확인해 정한다.
        void bridge.reportUnauthorized({ sessionId }).catch(() => undefined);
        return;
      }
      // 토큰 없이 나간 요청: 이 화면의 세션이 지나갔다. main의 세션을 다시 읽는다.
      void resync();
    });
    const stopListening = bridge.onSession(applySnapshot);
    void resync();
    return () => {
      cancelled = true;
      stopListening();
      setTokenProvider(null);
      setAuthFailureHandler(null);
    };
  }, [applySnapshot, bridge]);

  const login = useCallback(
    async (loginId: string, password: string) => {
      if (!bridge) {
        throw new Error('데스크톱 앱에서만 로그인할 수 있습니다.');
      }
      if (!bridge.login) {
        throw new Error('로그인은 메인 창에서 진행해 주세요.');
      }
      const result = await bridge.login({ username: loginId, password });
      if (!result.ok) throw new Error(result.error);
      applySnapshot(await bridge.getSession());
    },
    [applySnapshot, bridge],
  );

  // 사장님 가입: 계정을 만들고 바로 로그인한다. 이메일과 사무소는 여기서 받지 않는다
  // (사무소는 로그인 뒤 사무소 만들기 화면에서 만든다).
  const register = useCallback(
    async (loginId: string, _email: string, password: string, name: string) => {
      if (!bridge) {
        throw new Error('데스크톱 앱에서만 가입할 수 있습니다.');
      }
      if (!bridge.signup) {
        throw new Error('회원가입은 메인 창에서 진행해 주세요.');
      }
      const result = await bridge.signup({ username: loginId, password, name });
      if (!result.ok) {
        throw new AuthRegisterError(result.error, result.continueAtLogin === true);
      }
      applySnapshot(await bridge.getSession());
    },
    [applySnapshot, bridge],
  );

  const refresh = useCallback(async () => {
    if (!bridge) return;
    const result = await bridge.refreshUser();
    applySnapshot(result.snapshot);
    if (!result.ok) {
      throw new Error(result.error ?? '사용자 정보를 새로 받지 못했습니다.');
    }
  }, [applySnapshot, bridge]);

  const logout = useCallback(async () => {
    const sessionId = heldSessionIdRef.current;
    if (!bridge || sessionId === null) return;
    const result = await bridge.logout({ sessionId });
    if (!result.ok) {
      throw new Error(result.error ?? '로그아웃하지 못했습니다.');
    }
  }, [bridge]);

  const retry = useCallback(async () => {
    await bridge?.retry?.();
  }, [bridge]);

  const status = snapshot?.status ?? 'loading';
  const value = useMemo<AuthContextValue>(
    () => ({
      user: snapshot?.authenticated ? (snapshot.user as MeResponse) : null,
      // 탭 화면·팝업 층은 서버에 닿지 못한 동안 기다린다. 안내와 다시 시도는 셸이 맡는다.
      isLoading: status === 'loading' || (!isShell && status === 'unreachable'),
      isAuthenticated: snapshot?.authenticated ?? false,
      authError: snapshot?.error ?? null,
      sessionId: snapshot?.authenticated ? snapshot.providerSessionId : null,
      login,
      register,
      refresh,
      logout,
    }),
    [isShell, login, logout, refresh, register, snapshot, status],
  );

  return (
    <AuthContext.Provider value={value}>
      {isShell && status === 'unreachable' ? (
        // main은 로그인을 갖고 있지만 서버에서 사용자를 확인하지 못했다. 로그인
        // 화면으로 보내지 않고, 다시 시도할 수 있게 알린다(main도 자동으로 재시도한다).
        <AuthWindowFrame>
          <ServerUnreachableScreen onRetry={retry} onLogout={logout} />
        </AuthWindowFrame>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
