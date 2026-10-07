import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, renderApp, signedInAs } from '../../test-utils';

const FINANCE = { id: 1, name: 'Finance', active: true, user_count: 3 };
const LEGAL = { id: 2, name: 'Legal', active: false, user_count: 0 };
const list = { 'GET /departments': () => [200, { departments: [FINANCE, LEGAL] }] as [number, unknown] };

test('lists departments with user counts and status', async () => {
  renderApp('/departments', { ...signedInAs(ADMIN), ...list });
  const finance = await screen.findByRole('row', { name: /Finance/ });
  expect(within(finance).getByText('3')).toBeInTheDocument();
  expect(within(finance).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Legal/ })).getByText('Inactive')).toBeInTheDocument();
});

test('shows an empty state when there are no departments', async () => {
  renderApp('/departments', { ...signedInAs(ADMIN), 'GET /departments': () => [200, { departments: [] }] });
  expect(await screen.findByText('No departments yet. Add the first one above.')).toBeInTheDocument();
});

test('adds a department', async () => {
  const { calls } = renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'POST /departments': () => [201, { department: { id: 3, name: 'Operations', active: true, user_count: 0 } }],
  });
  await userEvent.type(await screen.findByLabelText('New department'), 'Operations');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(await screen.findByRole('row', { name: /Operations/ })).toBeInTheDocument();
  expect(screen.getByText('Added Operations.')).toBeInTheDocument();
  const post = calls.find((c) => c.method === 'POST');
  expect(post?.body).toEqual({ name: 'Operations' });
  expect(post?.headers['X-CSRF-Token']).toBe('tok');
});

test('shows the server error for a duplicate name', async () => {
  renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'POST /departments': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { name: 'A department with this name already exists.' } } }],
  });
  await userEvent.type(await screen.findByLabelText('New department'), 'finance');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(await screen.findByText('A department with this name already exists.')).toBeInTheDocument();
});

test('blocks a too-short name without calling the API', async () => {
  const { calls } = renderApp('/departments', { ...signedInAs(ADMIN), ...list });
  await userEvent.type(await screen.findByLabelText('New department'), 'A');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(screen.getByText('Enter a department name (2–120 characters).')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('renames a department', async () => {
  const { calls } = renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'PATCH /departments/1': () => [200, { department: { ...FINANCE, name: 'Finance & Accounts' } }],
  });
  const row = await screen.findByRole('row', { name: /Finance/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Rename' }));
  const input = screen.getByLabelText('Department name');
  await userEvent.clear(input);
  await userEvent.type(input, 'Finance & Accounts');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('row', { name: /Finance & Accounts/ })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'Finance & Accounts' });
});

test('deactivates a department', async () => {
  renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'PATCH /departments/1': () => [200, { department: { ...FINANCE, active: false } }],
  });
  const row = await screen.findByRole('row', { name: /Finance/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Deactivate' }));
  expect(await within(screen.getByRole('row', { name: /Finance/ })).findByText('Inactive')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Finance/ })).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
});
