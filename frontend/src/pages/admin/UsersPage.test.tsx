import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '../../types';
import { ADMIN, IT, STAFF, renderApp, signedInAs } from '../../test-utils';

const INVITED: User = { ...STAFF, id: 3, full_name: 'Bisi Ade', email: 'bisi@woodhallcap.com', role: 'reception', department_id: null, department_name: null, has_password: false, last_login_at: null };
const DEPARTMENTS = [{ id: 1, name: 'Finance', active: true, user_count: 1 }];
const base = {
  ...signedInAs(ADMIN),
  'GET /users': () => [200, { users: [ADMIN, INVITED, STAFF, IT] }] as [number, unknown],
  'GET /departments': () => [200, { departments: DEPARTMENTS }] as [number, unknown],
};
const LINK = { set_password_url: 'https://visitor.woodhallcap.com/set-password?token=abc', expires_at: '2026-10-10 12:00:00', purpose: 'invite' };

test('lists users with role, department and status', async () => {
  renderApp('/users', base);
  const chidi = await screen.findByRole('row', { name: /Chidi Okafor/ });
  expect(within(chidi).getByText('Staff')).toBeInTheDocument();
  expect(within(chidi).getByText('Finance')).toBeInTheDocument();
  expect(within(chidi).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Bisi Ade/ })).getByText('Invited')).toBeInTheDocument();
});

test('search filters by name, email, role or department', async () => {
  renderApp('/users', base);
  await screen.findByRole('row', { name: /Chidi Okafor/ });
  await userEvent.type(screen.getByLabelText('Search users'), 'finance');
  expect(screen.getByRole('row', { name: /Chidi Okafor/ })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /Bisi Ade/ })).not.toBeInTheDocument();
});

test('inviting a user shows a one-time set-password link', async () => {
  const created: User = { ...STAFF, id: 9, full_name: 'Tunde Bakare', email: 'tunde@woodhallcap.com', has_password: false, last_login_at: null };
  const { calls } = renderApp('/users', { ...base, 'POST /users': () => [201, { user: created, link: LINK }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Tunde Bakare');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'tunde@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'staff');
  await userEvent.selectOptions(within(dialog).getByLabelText('Department'), '1');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));

  const linkDialog = await screen.findByRole('dialog', { name: 'Set-password link' });
  expect(within(linkDialog).getByLabelText('Set-password link')).toHaveValue(LINK.set_password_url);
  expect(within(linkDialog).getByText(/Tunde Bakare/)).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
    full_name: 'Tunde Bakare', email: 'tunde@woodhallcap.com', phone: '', role: 'staff', department_id: 1,
  });
  await userEvent.click(within(linkDialog).getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('row', { name: /Tunde Bakare/ })).toBeInTheDocument();
});

test('staff need a department before the invite is sent', async () => {
  const { calls } = renderApp('/users', base);
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Tunde Bakare');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'tunde@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'staff');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
  expect(within(dialog).getByText('Staff need a department.')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('server field errors appear in the form', async () => {
  renderApp('/users', {
    ...base,
    ...signedInAs(IT),
    'POST /users': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { email: 'A user with this email already exists.' } } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Ada Again');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'ada@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'it');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
  expect(await within(dialog).findByText('A user with this email already exists.')).toBeInTheDocument();
});

test('a new link for an invited user', async () => {
  renderApp('/users', { ...base, 'POST /users/3/reset-link': () => [200, { link: LINK }] });
  const row = await screen.findByRole('row', { name: /Bisi Ade/ });
  await userEvent.click(within(row).getByRole('button', { name: 'New invite link' }));
  expect(await screen.findByRole('dialog', { name: 'Set-password link' })).toBeInTheDocument();
});

test('admins cannot change their own account, but can disable staff', async () => {
  renderApp('/users', { ...base, 'PATCH /users/2': () => [200, { user: { ...STAFF, active: false } }] });
  const me = await screen.findByRole('row', { name: /Ada Obi/ });
  expect(within(me).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  expect(within(me).getByText('Managed by IT')).toBeInTheDocument();
  const chidi = screen.getByRole('row', { name: /Chidi Okafor/ });
  await userEvent.click(within(chidi).getByRole('button', { name: 'Disable' }));
  expect(await within(screen.getByRole('row', { name: /Chidi Okafor/ })).findByText('Disabled')).toBeInTheDocument();
  expect(screen.getByText('Chidi Okafor is now disabled.')).toBeInTheDocument();
});

test('editing yourself locks the role field', async () => {
  renderApp('/users', { ...base, ...signedInAs(IT) });
  const me = await screen.findByRole('row', { name: /Ife Eze/ });
  expect(within(me).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  await userEvent.click(within(me).getByRole('button', { name: 'Edit' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit Ife Eze' });
  expect(within(dialog).getByLabelText('Role')).toBeDisabled();
  expect(within(dialog).getByText("You can't change your own role.")).toBeInTheDocument();
});

test('for an admin, admin and IT accounts are read-only and those roles cannot be assigned', async () => {
  renderApp('/users', base);
  const it = await screen.findByRole('row', { name: /Ife Eze/ });
  expect(within(it).getByText('Managed by IT')).toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
  const options = within(screen.getByRole('dialog', { name: 'Invite a user' })).getAllByRole('option').map((o) => o.textContent);
  expect(options).toEqual(['Choose a role', 'Staff', 'Reception', 'Security', 'No department', 'Finance']);
});

test('IT can manage admins and assign every role', async () => {
  renderApp('/users', { ...base, ...signedInAs(IT) });
  const admin = await screen.findByRole('row', { name: /Ada Obi/ });
  expect(within(admin).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(within(admin).getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
  const role = within(screen.getByRole('dialog', { name: 'Invite a user' })).getByLabelText('Role');
  expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a role', 'Staff', 'Reception', 'Security', 'IT', 'Admin']);
});
