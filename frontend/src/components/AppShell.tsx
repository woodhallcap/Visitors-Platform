import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  // Large screens: a fixed frame where the sidebar stays put and only the content scrolls.
  return (
    <div className="min-h-screen lg:grid lg:h-dvh lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
      <Sidebar user={user} onSignOut={logout} />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:overflow-y-auto lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
