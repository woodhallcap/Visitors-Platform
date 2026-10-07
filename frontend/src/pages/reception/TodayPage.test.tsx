import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { addDays, todayInLagos } from '../../lib/visits';
import { ADMIN, IT, RECEPTION, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const dayKey = `GET /visits?date_from=${today}&date_to=${today}`;
const onSiteKey = 'GET /visits?status=checked_in';

const expected = makeVisit({ visitor_name: 'Ada Expected', expected_arrival: '11:00' });
const early = makeVisit({ visitor_name: 'Bola Early', expected_arrival: '09:00' });
const here = makeVisit({ visitor_name: 'Cole Here', status: 'checked_in', checked_in_at: `${today} 09:05:00`, badge_number: 'V-7' });
const late = makeVisit({ visitor_name: 'Dayo Late', status: 'checked_in', overstayed: true, checked_in_at: `${today} 08:00:00` });
const yesterdays = makeVisit({ visitor_name: 'Efe Overnight', status: 'checked_in', visit_date: addDays(today, -1), checked_in_at: `${addDays(today, -1)} 18:00:00` });
const gone = makeVisit({ visitor_name: 'Femi Gone', status: 'checked_out', checked_out_at: `${today} 10:00:00` });

const leftKey = `GET /visits?status=checked_out&activity_date=${today}`;
const routes = {
  [dayKey]: () => [200, { visits: [expected, early, here, late, gone] }] as [number, unknown],
  [onSiteKey]: () => [200, { visits: [here, late, yesterdays] }] as [number, unknown],
  [leftKey]: () => [200, { visits: [gone] }] as [number, unknown],
};

function column(name: string) {
  return screen.getByRole('region', { name });
}

test('the board sorts visits into Expected, On site and Left', async () => {
  renderApp('/reception/today', { ...signedInAs(RECEPTION), ...routes });
  await screen.findByText('Ada Expected');
  const expectedNames = within(column('Expected')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(expectedNames).toEqual(['Bola Early', 'Ada Expected']);
  expect(within(column('On site')).getByText('Efe Overnight')).toBeInTheDocument();
  expect(within(column('On site')).getByText('Overstayed')).toBeInTheDocument();
  expect(within(column('On site')).getByText(/V-7/)).toBeInTheDocument();
  expect(within(column('Left')).getByText('Femi Gone')).toBeInTheDocument();
});

test('reception checks a visitor in with a badge number', async () => {
  const { calls } = renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${expected.id}/check-in`]: () => [200, { visit: { ...expected, status: 'checked_in', badge_number: 'V-9', checked_in_at: `${today} 11:02:00` } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check in Ada Expected' }));
  const dialog = screen.getByRole('dialog', { name: 'Check in Ada Expected' });
  await userEvent.type(within(dialog).getByLabelText('Badge or tag number (optional)'), 'V-9');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Check in' }));
  expect(await within(column('On site')).findByText('Ada Expected')).toBeInTheDocument();
  expect(within(column('Expected')).queryByText('Ada Expected')).not.toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ badge_number: 'V-9', id_type: '', id_number: '' });
});

test('a failed check-in keeps the dialog open with the message', async () => {
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${expected.id}/check-in`]: () => [409, { error: { code: 'conflict', message: 'Only visitors booked for today can be checked in.' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check in Ada Expected' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check in' }));
  expect(await within(screen.getByRole('dialog')).findByText('Only visitors booked for today can be checked in.')).toBeInTheDocument();
});

test('reception checks a visitor out', async () => {
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${here.id}/check-out`]: () => [200, { visit: { ...here, status: 'checked_out', checked_out_at: `${today} 12:00:00` } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check out Cole Here' }));
  expect(await within(column('Left')).findByText('Cole Here')).toBeInTheDocument();
  expect(within(column('On site')).queryByText('Cole Here')).not.toBeInTheDocument();
});

test('search filters every column', async () => {
  renderApp('/reception/today', { ...signedInAs(RECEPTION), ...routes });
  await screen.findByText('Ada Expected');
  await userEvent.type(screen.getByLabelText('Search today'), 'cole');
  expect(screen.queryByText('Ada Expected')).not.toBeInTheDocument();
  expect(screen.getByText('Cole Here')).toBeInTheDocument();
});

test.each([['admin', ADMIN], ['IT', IT]])('%s sees the board without check-in or check-out', async (_label, user) => {
  renderApp('/reception/today', { ...signedInAs(user), ...routes });
  await screen.findByText('Ada Expected');
  expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /check out/i })).not.toBeInTheDocument();
});

test('a visitor checked in yesterday moves to Left when checked out today', async () => {
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${yesterdays.id}/check-out`]: () => [200, { visit: { ...yesterdays, status: 'checked_out', checked_out_at: `${today} 08:10:00` } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check out Efe Overnight' }));
  expect(await within(column('Left')).findByText('Efe Overnight')).toBeInTheDocument();
});

test('a check-out another desk already did refreshes the board and is sent only once on a double click', async () => {
  let checkOuts = 0;
  let refused = false;
  const outElsewhere = { ...here, status: 'checked_out' as const, checked_out_at: `${today} 11:55:00` };
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    [dayKey]: () => [200, { visits: refused ? [expected, early, outElsewhere, late, gone] : [expected, early, here, late, gone] }],
    [onSiteKey]: () => [200, { visits: refused ? [late, yesterdays] : [here, late, yesterdays] }],
    [leftKey]: () => [200, { visits: refused ? [gone, outElsewhere] : [gone] }],
    [`POST /visits/${here.id}/check-out`]: () => {
      checkOuts++;
      refused = true;
      return [409, { error: { code: 'conflict', message: 'Only visitors on site can be checked out.' } }];
    },
  });
  await userEvent.dblClick(await screen.findByRole('button', { name: 'Check out Cole Here' }));
  expect(await screen.findByText('Only visitors on site can be checked out.')).toBeInTheDocument();
  expect(await within(column('Left')).findByText('Cole Here')).toBeInTheDocument();
  expect(within(column('On site')).queryByText('Cole Here')).not.toBeInTheDocument();
  expect(checkOuts).toBe(1);
});

test('a check-in another desk already did refreshes the board', async () => {
  const { calls } = renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${expected.id}/check-in`]: () => [409, { error: { code: 'conflict', message: 'Only visitors booked for today can be checked in.' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check in Ada Expected' }));
  const before = calls.filter((c) => c.method === 'GET' && c.path.startsWith('/visits')).length;
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check in' }));
  await vi.waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path.startsWith('/visits')).length).toBeGreaterThanOrEqual(before + 3));
});
