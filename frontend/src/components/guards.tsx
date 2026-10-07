import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { homeFor } from '../lib/roles';
import { NoAccess } from '../pages/NoAccess';
import type { Role } from '../types';
import { AppShell } from './AppShell';

export function RequireAuth() {
  const { status, endedBy } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-primary">
        Loading…
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={endedBy === 'logout' ? undefined : { from: location.pathname + location.search }} />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <NoAccess />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={homeFor(user.role)} replace /> : null;
}
