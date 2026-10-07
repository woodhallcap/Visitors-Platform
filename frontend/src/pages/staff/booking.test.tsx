import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import { ADMIN, RECEPTION, STAFF, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const tomorrow = addDays(today, 1);

async function fillVisitor() {
  await userEvent.type(screen.getByLabelText("Visitor's full name"), 'Tola Ade');
  await userEvent.type(screen.getByLabelText('Phone'), '0803 123 4567');
  await userEvent.selectOptions(screen.getByLabelText('Visitor type'), 'client');
  await userEvent.selectOptions(screen.getByLabelText('Gender'), 'female');
  await userEvent.type(screen.getByLabelText('Expected arrival'), '10:30');
  await userEvent.type(screen.getByLabelText('Purpose of visit'), 'Quarterly review');
}

test('staff book a visitor for themselves', async () => {
  const created = makeVisit({ visit_date: today, expected_arrival: '10:30' });
  const { calls } = renderApp('/book', { ...signedInAs(STAFF), 'POST /visits': () => [201, { visit: created }] });
  await screen.findByRole('heading', { name: 'Book a visitor' });
  expect(screen.queryByLabelText('Person being visited')).not.toBeInTheDocument();
  await fillVisitor();
  await userEvent.click(screen.getByRole('button', { name: 'Book visitor' }));
  expect(await screen.findByText(/Tola Ade is booked for/)).toBeInTheDocument();
  const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>;
  expect(body).toMatchObject({ visitor_name: 'Tola Ade', visitor_type: 'client', visitor_gender: 'female', visit_date: today, expected_arrival: '10:30', party_size: 0, expected_departure: null });
  expect(body).not.toHaveProperty('host_user_id');
  expect(screen.getByLabelText("Visitor's full name")).toHaveValue('');
});

test('booking checks the form before calling the API', async () => {
  const { calls } = renderApp('/book', signedInAs(STAFF));
  await userEvent.click(await screen.findByRole('button', { name: 'Book visitor' }));
  expect(screen.getByText("Enter the visitor's full name (2–120 characters).")).toBeInTheDocument();
  expect(screen.getByText('Enter the expected arrival time (HH:MM).')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('server field errors appear on the form', async () => {
  renderApp('/book', {
    ...signedInAs(STAFF),
    'POST /visits': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { visitor_phone: 'Enter a valid phone number.' } } }],
  });
  await screen.findByRole('heading', { name: 'Book a visitor' });
  await fillVisitor();
  await userEvent.click(screen.getByRole('button', { name: 'Book visitor' }));
  expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument();
});

test('reception books a walk-in for a chosen host and returns to Today', async () => {
  const hosts = [{ id: 2, full_name: 'Chidi Okafor', department_name: 'Finance' }];
  const { calls } = renderApp('/reception/walk-in', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts }],
    'POST /visits': () => [201, { visit: makeVisit() }],
    'GET /visits': () => [200, { visits: [] }],
  });
  expect(await screen.findByLabelText('Visit date')).toHaveValue(today);
  expect(screen.getByLabelText('Expected arrival')).not.toHaveValue('');
  await userEvent.type(screen.getByLabelText("Visitor's full name"), 'Tola Ade');
  await userEvent.type(screen.getByLabelText('Phone'), '08031234567');
  await userEvent.selectOptions(screen.getByLabelText('Visitor type'), 'vendor');
  await userEvent.selectOptions(screen.getByLabelText('Gender'), 'male');
  await userEvent.selectOptions(screen.getByLabelText('Person being visited'), '2');
  await userEvent.type(screen.getByLabelText('Purpose of visit'), 'Delivery');
  await userEvent.click(screen.getByRole('button', { name: 'Book walk-in' }));
  await screen.findByRole('heading', { name: 'Today' });
  expect(window.location.pathname).toBe('/reception/today');
  expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ host_user_id: 2, visitor_type: 'vendor', visitor_gender: 'male', visit_date: today });
});

test('a walk-in needs a host', async () => {
  renderApp('/reception/walk-in', { ...signedInAs(ADMIN), 'GET /hosts': () => [200, { hosts: [] }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Book walk-in' }));
  expect(screen.getByText('Choose the person being visited.')).toBeInTheDocument();
});

test('My visitors splits upcoming and past visits', async () => {
  const upcoming = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow });
  const past = makeVisit({ visitor_name: 'Old Guest', visit_date: addDays(today, -2), status: 'checked_out' });
  renderApp('/my-visitors', { ...signedInAs(STAFF), 'GET /visits': () => [200, { visits: [past, upcoming] }] });
  const upcomingTable = await screen.findByRole('table', { name: 'Upcoming visits' });
  expect(within(upcomingTable).getByText('Future Guest')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Past visits' })).getByText('Old Guest')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Past visits' })).queryByRole('button', { name: /cancel visit/i })).not.toBeInTheDocument();
});

test('staff cancel a booked visit after confirming', async () => {
  const visit = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow });
  const { calls } = renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [200, { visits: [visit] }],
    [`PATCH /visits/${visit.id}`]: () => [200, { visit: { ...visit, status: 'cancelled' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel visit by Future Guest' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel visit' }));
  expect(await screen.findByText('Cancelled')).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'cancelled' });
});

test('staff edit a booked visit', async () => {
  const visit = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow, expected_arrival: '10:00' });
  const { calls } = renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [200, { visits: [visit] }],
    [`PATCH /visits/${visit.id}`]: (body) => [200, { visit: { ...visit, ...(body as object) } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Edit visit by Future Guest' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit visit' });
  const arrival = within(dialog).getByLabelText('Expected arrival');
  await userEvent.clear(arrival);
  await userEvent.type(arrival, '14:15');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('14:15')).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ expected_arrival: '14:15' });
});
