import type { Role, User } from '../types';

export const ROLE_LABELS: Record<Role, string> = {
  staff: 'Staff',
  reception: 'Reception',
  security: 'Security',
  it: 'IT',
  admin: 'Admin',
};

export interface NavItem {
  to: string;
  label: string;
}

// Spec §8. Pages other than Users and Departments arrive in later plans and show "Coming soon" until then.
export const NAV: Record<Role, NavItem[]> = {
  staff: [
    { to: '/my-visitors', label: 'My visitors' },
    { to: '/book', label: 'Book a visitor' },
  ],
  reception: [
    { to: '/reception/today', label: 'Today' },
    { to: '/reception/walk-in', label: 'Book walk-in' },
    { to: '/visits', label: 'All visits' },
  ],
  security: [
    { to: '/security/on-site', label: 'On site now' },
    { to: '/security/log', label: "Today's log" },
    { to: '/security/history', label: 'History' },
  ],
  it: [
    { to: '/it/dashboard', label: 'Dashboard' },
    { to: '/users', label: 'Users' },
    { to: '/reception/today', label: 'Today' },
    { to: '/visits', label: 'All visits' },
  ],
  admin: [
    { to: '/users', label: 'Users' },
    { to: '/departments', label: 'Departments' },
    { to: '/reception/today', label: 'Today' },
    { to: '/reception/walk-in', label: 'Book walk-in' },
    { to: '/visits', label: 'All visits' },
    { to: '/it/dashboard', label: 'Dashboard' },
  ],
};

export function homeFor(role: Role): string {
  return NAV[role][0].to;
}

export const PRIVILEGED_ROLES: Role[] = ['admin', 'it'];

/** Spec §3: only IT manages admin and IT accounts. The server enforces this; the UI only mirrors it. */
export function canManage(actor: User, targetRole: Role): boolean {
  return actor.role === 'it' || !PRIVILEGED_ROLES.includes(targetRole);
}
