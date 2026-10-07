import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionPayload, User } from '../types';
import { api, onUnauthenticated, setCsrfToken } from './api';

type Status = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; user: User | null }>({ status: 'loading', user: null });

  const signIn = useCallback((session: SessionPayload) => {
    setCsrfToken(session.csrf_token);
    setState({ status: 'signed-in', user: session.user });
  }, []);

  const signOut = useCallback(() => {
    setCsrfToken(null);
    setState({ status: 'signed-out', user: null });
  }, []);

  useEffect(() => onUnauthenticated(signOut), [signOut]);

  useEffect(() => {
    let cancelled = false;
    api<SessionPayload>('GET', '/auth/me')
      .then((session) => !cancelled && signIn(session))
      .catch(() => !cancelled && signOut());
    return () => {
      cancelled = true;
    };
  }, [signIn, signOut]);

  const login = useCallback(
    async (email: string, password: string) => {
      signIn(await api<SessionPayload>('POST', '/auth/login', { email, password }));
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      // The session is gone either way.
    }
    signOut();
  }, [signOut]);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
