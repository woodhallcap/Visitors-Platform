import { vi } from 'vitest';
import { ApiError, api, messageOf, onUnauthenticated, setCsrfToken } from './api';

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

test('GET requests go to /api without a body or CSRF header', async () => {
  setCsrfToken('tok');
  const fetchMock = stubFetch(200, { ok: true });
  await expect(api('GET', '/health')).resolves.toEqual({ ok: true });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/health');
  expect(init.body).toBeUndefined();
  expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
});

test('writes send JSON and the CSRF token', async () => {
  setCsrfToken('tok');
  const fetchMock = stubFetch(201, { department: { id: 1 } });
  await api('POST', '/departments', { name: 'Finance' });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  expect(init.method).toBe('POST');
  expect(init.body).toBe(JSON.stringify({ name: 'Finance' }));
  expect(headers['Content-Type']).toBe('application/json');
  expect(headers['X-CSRF-Token']).toBe('tok');
});

test('error envelopes become ApiError with fields', async () => {
  stubFetch(422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { name: 'Enter a name.' } } });
  const err = await api('POST', '/departments', { name: '' }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 422, code: 'validation_failed', fields: { name: 'Enter a name.' } });
  expect(messageOf(err)).toBe('Please correct the highlighted fields.');
});

test('a network failure becomes a friendly ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  const err = await api('GET', '/users').catch((e: unknown) => e);
  expect(err).toMatchObject({ status: 0, code: 'network_error' });
});

test('a non-JSON error response still becomes an ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
  const err = await api('GET', '/users').catch((e: unknown) => e);
  expect(err).toMatchObject({ status: 502, code: 'server_error', message: 'Something went wrong. Please try again.' });
});

test('only code "unauthenticated" notifies listeners', async () => {
  const listener = vi.fn();
  const stop = onUnauthenticated(listener);
  stubFetch(401, { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } });
  await api('POST', '/auth/login', {}).catch(() => undefined);
  expect(listener).not.toHaveBeenCalled();
  stubFetch(401, { error: { code: 'unauthenticated', message: 'Please sign in.' } });
  await api('GET', '/auth/me').catch(() => undefined);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
});

test('messageOf falls back for unknown errors', () => {
  expect(messageOf(new Error('x'))).toBe('Something went wrong. Please try again.');
});
