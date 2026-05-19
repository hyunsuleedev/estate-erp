import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { MeResponse } from '@estate-erp/api-client';
import {
  api,
  setTokens,
  removeToken,
  getToken,
  setAuthFailureHandler,
} from '@/lib/api';

interface AuthState {
  user: MeResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (loginId: string, password: string, remember?: boolean) => Promise<void>;
  register: (loginId: string, email: string, password: string, name: string, officeName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: !!getToken(),
    isAuthenticated: false,
  });

  const handleAuthFailure = useCallback(() => {
    removeToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  // api-client의 onAuthFailure가 호출되면 React 상태를 비로그인으로 전환.
  useEffect(() => {
    setAuthFailureHandler(handleAuthFailure);
    return () => setAuthFailureHandler(null);
  }, [handleAuthFailure]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // 만료된 access token이라도 api-client 인터셉터가 자동 refresh 시도.
    // 둘 다 만료/폐기면 onAuthFailure → handleAuthFailure로 떨어진다.
    api.auth.me()
      .then((user) => {
        setState({ user, isLoading: false, isAuthenticated: true });
      })
      .catch(() => {
        // onAuthFailure가 이미 처리했을 수 있지만, network 에러 등 다른 실패도 동일하게 처리.
        handleAuthFailure();
      });
  }, [handleAuthFailure]);

  const login = useCallback(async (loginId: string, password: string, remember = true) => {
    const res = await api.auth.login({ loginId, password });
    setTokens(res.accessToken, res.refreshToken, remember);
    const user = await api.auth.me();
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const register = useCallback(async (loginId: string, email: string, password: string, name: string, officeName: string) => {
    const res = await api.auth.register({ loginId, email, password, name, officeName });
    setTokens(res.accessToken, res.refreshToken);
    const user = await api.auth.me();
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
