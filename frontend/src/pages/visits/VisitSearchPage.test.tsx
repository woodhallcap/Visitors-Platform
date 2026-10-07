import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import { IT, RECEPTION, SECURITY, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const defaultKey = `GET /visits?date_from=${addDays(today, -7)}&date_to=${addDays(today, 30)}`;
const booked = makeVisit({ visitor_name: 'Booked Person', visit_date: addDays(today, 2) });
const done = makeVisit({ visitor_name: 'Done Person', status: 'checked_out' });

test('All visits loads the default range and searches on submit', async () => {
  const { calls } = renderApp('/visits', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts: [] }],
    [defaultKey]: () => [200, { visits: [booked, done] }],
    [`GET /visits?date_from=${addDays(today, -7)}&date_to=${addDays(today, 30)}&q=done`]: () => [200, { visits: [done] }],
  });
  const table = await screen.findByRole('table', { name: 'Visits' });
  expect(within(table).getByText('Booked Person')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Search'), 'done');
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await within(screen.getByRole('table', { name: 'Visits' })).findByText('Done Person')).toBeInTheDocument();
  expect(screen.queryByText('Booked Person')).not.toBeInTheDocument();
  expect(calls.some((c) => c.path.includes('q=done'))).toBe(true);
});

test('reception can cancel a booked visit from the list', async () => {
  renderApp('/visits', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts: [] }],
    [defaultKey]: () => [200, { visits: [booked] }],
    [`PATCH /visits/${booked.id}`]: () => [200, { visit: { ...booked, status: 'cancelled' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel visit by Booked Person' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel visit' }));
  expect(await screen.findByText('Cancelled')).toBeInTheDocument();
});

test('IT sees visits read-only', async () => {
  renderApp('/visits', { ...signedInAs(IT), [defaultKey]: () => [200, { visits: [booked] }] });
  await screen.findByText('Booked Person');
  expect(screen.queryByRole('button', { name: /cancel visit/i })).not.toBeInTheDocument();
});

test('an end date before the start date is caught', async () => {
  renderApp('/visits', { ...signedInAs(IT), [defaultKey]: () => [200, { visits: [] }] });
  const to = await screen.findByLabelText('To');
  await userEvent.clear(to);
  await userEvent.type(to, addDays(today, -30));
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument();
});

test('security history is the same search, read-only', async () => {
  renderApp('/security/history', { ...signedInAs(SECURITY), [defaultKey]: () => [200, { visits: [booked] }] });
  expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
  await screen.findByText('Booked Person');
  expect(screen.queryByRole('button', { name: /edit visit/i })).not.toBeInTheDocument();
});
