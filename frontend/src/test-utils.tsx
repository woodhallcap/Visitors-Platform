import { render } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import type { User } from './types';

export type MockRoutes = Record<string, (body: unknown) => [number, unknown]>;

export interface MockCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export function mockFetch(routes: MockRoutes): { calls: MockCall[] } {
  const calls: MockCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = String(input).replace(/^\/api/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> });
      const handler = routes[`${method} ${path}`];
      const [status, json] = handler ? handler(body) : [404, { error: { code: 'not_found', message: 'Not found.' } }];
      return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return { calls };
}

export function renderApp(path: string, routes: MockRoutes) {
  const mock = mockFetch(routes);
  window.history.pushState({}, '', path);
  return { ...render(<App />), ...mock };
}

const BASE_USER: User = {
  id: 0,
  full_name: '',
  email: '',
  phone: null,
  role: 'staff',
  department_id: null,
  department_name: null,
  active: true,
  has_password: true,
  last_login_at: '2026-10-07 09:00:00',
  created_at: '2026-10-01 09:00:00',
};

export const ADMIN: User = { ...BASE_USER, id: 1, full_name: 'Ada Obi', email: 'ada@woodhallcap.com', role: 'admin' };
export const STAFF: User = { ...BASE_USER, id: 2, full_name: 'Chidi Okafor', email: 'chidi@woodhallcap.com', role: 'staff', department_id: 1, department_name: 'Finance' };
export const IT: User = { ...BASE_USER, id: 4, full_name: 'Ife Eze', email: 'ife@woodhallcap.com', role: 'it' };

export const signedOut: MockRoutes = {
  'GET /auth/me': () => [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }],
};

export function signedInAs(user: User): MockRoutes {
  return {
    'GET /auth/me': () => [200, { user, csrf_token: 'tok' }],
    'POST /auth/logout': () => [200, { ok: true }],
  };
}
