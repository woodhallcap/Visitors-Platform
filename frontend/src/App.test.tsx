import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ADMIN, IT, STAFF, mockFetch, renderApp, signedInAs, signedOut } from './test-utils';

test('signed-out visitors are sent to sign in', async () => {
  renderApp('/users', signedOut);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('Forgot your password? Ask an administrator to reset it.')).toBeInTheDocument();
});

test('signing in takes staff to their home page with their navigation', async () => {
  const { calls } = renderApp('/login', { ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('heading', { name: 'My visitors' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/my-visitors');
  expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Book a visitor' })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ email: 'chidi@woodhallcap.com', password: 'correct horse battery' });
});

test('after sign-in the user returns to the page they first asked for', async () => {
  renderApp('/book', { ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('heading', { name: 'Book a visitor' });
  expect(window.location.pathname).toBe('/book');
});

test('a wrong password shows the server message and stays on sign in', async () => {
  renderApp('/login', {
    ...signedOut,
    'POST /auth/login': () => [401, { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } }],
  });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('empty fields show inline errors without calling the API', async () => {
  const { calls } = renderApp('/login', signedOut);
  await userEvent.click(await screen.findByRole('button', { name: /sign in/i }));
  expect(screen.getByText('Enter your email.')).toBeInTheDocument();
  expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('staff cannot open user management', async () => {
  renderApp('/users', signedInAs(STAFF));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});

test('admins land on Users and see admin navigation', async () => {
  renderApp('/', signedInAs(ADMIN));
  expect(await screen.findByRole('link', { name: 'Departments' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/users');
});

test('IT lands on the dashboard, can reach Users, but not Departments', async () => {
  renderApp('/', signedInAs(IT));
  expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Departments' })).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/it/dashboard');
});

test('IT cannot open Departments', async () => {
  renderApp('/departments', signedInAs(IT));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});

test('signing out returns to the sign-in page', async () => {
  const { calls } = renderApp('/my-visitors', signedInAs(STAFF));
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(calls.find((c) => c.path === '/auth/logout')?.headers['X-CSRF-Token']).toBe('tok');
});

test('a failed sign-out request that leaves the session alive keeps the user signed in', async () => {
  renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'POST /auth/logout': () => [500, { error: { code: 'server_error', message: 'Boom.' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'My visitors' });
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
});

test('after an explicit sign-out the next user does not land on the previous page', async () => {
  let signedIn = true;
  renderApp('/users', {
    'GET /auth/me': () => (signedIn ? [200, { user: ADMIN, csrf_token: 'tok' }] : [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }]),
    'POST /auth/logout': () => {
      signedIn = false;
      return [200, { ok: true }];
    },
    'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok2' }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('heading', { name: 'My visitors' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/my-visitors');
  expect(screen.queryByRole('heading', { name: 'No access' })).not.toBeInTheDocument();
});

test('a crafted redirect target that leaves the site is ignored after sign-in', async () => {
  mockFetch({ ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  window.history.pushState({ usr: { from: '//evil.example' }, key: 'k', idx: 0 }, '', '/login');
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('heading', { name: 'My visitors' });
  expect(window.location.pathname).toBe('/my-visitors');
  expect(window.location.host).not.toBe('evil.example');
});

test('a session that expires mid-use returns to sign in', async () => {
  renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }],
  });
  // My visitors loads /visits on mount; a 401 there must end the session.
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('set-password checks that the passwords match before calling the API', async () => {
  const { calls } = renderApp('/set-password?token=abc', signedOut);
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'different pw!!');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('set-password sends the token and confirms success', async () => {
  const { calls } = renderApp('/set-password?token=abc', { ...signedOut, 'POST /auth/set-password': () => [200, { ok: true }] });
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'long enough pw');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(await screen.findByRole('heading', { name: 'Password set' })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ token: 'abc', password: 'long enough pw' });
});

test('set-password shows the expired-link message', async () => {
  renderApp('/set-password?token=abc', {
    ...signedOut,
    'POST /auth/set-password': () => [422, { error: { code: 'token_invalid', message: 'This link has expired or has already been used. Ask an administrator for a new one.' } }],
  });
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'long enough pw');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(await screen.findByText(/This link has expired/)).toBeInTheDocument();
});

test('set-password without a token explains the link is incomplete', async () => {
  renderApp('/set-password', signedOut);
  expect(await screen.findByRole('heading', { name: 'Link incomplete' })).toBeInTheDocument();
});

test('a from path starting with a backslash is ignored after sign-in', async () => {
  mockFetch({ ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  window.history.pushState({ usr: { from: '/\\evil.example' }, key: 'b', idx: 0 }, '', '/login');
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('heading', { name: 'My visitors' });
  expect(window.location.pathname).toBe('/my-visitors');
});

test('admins can reach the walk-in booking page from the sidebar', async () => {
  renderApp('/users', { ...signedInAs(ADMIN), 'GET /users': () => [200, { users: [] }], 'GET /departments': () => [200, { departments: [] }] });
  expect(await within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('link', { name: 'Book walk-in' })).toBeInTheDocument();
});
