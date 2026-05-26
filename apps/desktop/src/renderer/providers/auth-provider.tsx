import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/react';
import type { MeResponse } from '@estate-erp/api-client';
import {
  api,
  removeToken,
  setTokenProvider,
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
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { signOut, openSignIn, openSignUp } = useClerk();
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const handleAuthFailure = useCallback(() => {
    setTokenProvider(null);
    removeToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

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
      handleAuthFailure();
      return;
    }

    let cancelled = false;
    setTokenProvider(() => getToken());
    setState((prev) => ({ ...prev, isLoading: true }));

    api.auth.me()
      .then((user) => {
        if (cancelled) return;
        setState({ user, isLoading: false, isAuthenticated: true });
      })
      .catch(() => {
        if (cancelled) return;
        handleAuthFailure();
      });
    return () => {
      cancelled = true;
    };
  }, [getToken, handleAuthFailure, isLoaded, isSignedIn]);

  const refresh = useCallback(async () => {
    const user = await api.auth.me();
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const login = useCallback(async (loginId: string, password: string, remember = true) => {
    void loginId;
    void password;
    void remember;
    openSignIn();
  }, [openSignIn]);

  const register = useCallback(async (loginId: string, email: string, password: string, name: string, officeName: string) => {
    void loginId;
    void email;
    void password;
    void name;
    void officeName;
    openSignUp();
  }, [openSignUp]);

  const logout = useCallback(async () => {
    setTokenProvider(null);
    removeToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
    await signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
