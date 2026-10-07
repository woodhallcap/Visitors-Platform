import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <Sidebar user={user} onSignOut={logout} />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
