import { render } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import { todayInLagos } from './lib/visits';
import type { User, Visit } from './types';

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
      const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
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

export const RECEPTION: User = { ...BASE_USER, id: 5, full_name: 'Rita Desk', email: 'rita@woodhallcap.com', role: 'reception' };
export const SECURITY: User = { ...BASE_USER, id: 6, full_name: 'Sam Guard', email: 'sam@woodhallcap.com', role: 'security' };

let nextVisitId = 100;
export function makeVisit(o: Partial<Visit> = {}): Visit {
  return {
    id: nextVisitId++,
    visitor_name: 'Tola Ade',
    visitor_phone: '08031234567',
    visitor_email: null,
    visitor_company: 'Acme Ltd',
    visitor_type: 'client',
    visitor_gender: 'female',
    host_user_id: STAFF.id,
    host_name: STAFF.full_name,
    department_id: 1,
    department_name: 'Finance',
    booked_by_user_id: STAFF.id,
    booked_by_name: STAFF.full_name,
    channel: 'staff',
    visit_date: todayInLagos(),
    expected_arrival: '10:00',
    expected_departure: null,
    purpose: 'Quarterly review',
    party_size: 0,
    status: 'booked',
    checked_in_at: null,
    checked_in_by_name: null,
    checked_out_at: null,
    checked_out_by_name: null,
    badge_number: null,
    id_type: null,
    id_number: null,
    cancelled_at: null,
    created_at: '2026-10-01 09:00:00',
    overstayed: false,
    ...o,
  };
}

export const signedOut: MockRoutes = {
  'GET /auth/me': () => [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }],
};

export function signedInAs(user: User): MockRoutes {
  return {
    'GET /auth/me': () => [200, { user, csrf_token: 'tok' }],
    'POST /auth/logout': () => [200, { ok: true }],
  };
}
