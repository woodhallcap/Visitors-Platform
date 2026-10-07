import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionPayload, User } from '../types';
import { ApiError, api, onUnauthenticated, setCsrfToken } from './api';

type Status = 'loading' | 'signed-out' | 'signed-in';
/** Why the session ended: a deliberate sign-out, or the server dropping it (expiry, disabled account, signed out elsewhere). */
export type EndedBy = 'logout' | 'expired' | null;

interface AuthContextValue {
  status: Status;
  user: User | null;
  endedBy: EndedBy;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; user: User | null; endedBy: EndedBy }>({ status: 'loading', user: null, endedBy: null });

  const signIn = useCallback((session: SessionPayload) => {
    setCsrfToken(session.csrf_token);
    setState({ status: 'signed-in', user: session.user, endedBy: null });
  }, []);

  const signOut = useCallback((endedBy: Exclude<EndedBy, null>) => {
    setCsrfToken(null);
    setState({ status: 'signed-out', user: null, endedBy });
  }, []);

  useEffect(() => onUnauthenticated(() => signOut('expired')), [signOut]);

  useEffect(() => {
    let cancelled = false;
    api<SessionPayload>('GET', '/auth/me')
      .then((session) => !cancelled && signIn(session))
      .catch(() => !cancelled && signOut('expired'));
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
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthenticated')) {
        // The request failed, so only believe the session is gone if the server says so.
        try {
          signIn(await api<SessionPayload>('GET', '/auth/me'));
          return;
        } catch (meErr) {
          if (!(meErr instanceof ApiError && meErr.code === 'unauthenticated')) return;
        }
      }
    }
    signOut('logout');
  }, [signIn, signOut]);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
