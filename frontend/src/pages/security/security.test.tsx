import { act, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { todayInLagos } from '../../lib/visits';
import { SECURITY, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const onSite = [
  makeVisit({ visitor_name: 'Second In', status: 'checked_in', checked_in_at: `${today} 10:00:00`, badge_number: 'V-2' }),
  makeVisit({ visitor_name: 'First In', status: 'checked_in', checked_in_at: `${today} 08:30:00`, overstayed: true }),
];

afterEach(() => vi.useRealTimers());

test('On site now lists checked-in visitors, earliest first, with overstay flags', async () => {
  renderApp('/security/on-site', { ...signedInAs(SECURITY), 'GET /visits?status=checked_in': () => [200, { visits: onSite }] });
  const table = await screen.findByRole('table', { name: 'Visitors on site' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([expect.stringContaining('First In'), expect.stringContaining('Second In')]);
  expect(within(rows[0]).getByText('Overstayed')).toBeInTheDocument();
  expect(within(rows[1]).getByText('V-2')).toBeInTheDocument();
  expect(screen.getByText('2 on site')).toBeInTheDocument();
});

test('On site now refreshes every 30 seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { calls } = renderApp('/security/on-site', { ...signedInAs(SECURITY), 'GET /visits?status=checked_in': () => [200, { visits: onSite }] });
  await screen.findByText('First In');
  const before = calls.filter((c) => c.path === '/visits?status=checked_in').length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(calls.filter((c) => c.path === '/visits?status=checked_in').length).toBe(before + 1);
});

test("Today's log shows every check-in and check-out in time order", async () => {
  const visit = makeVisit({ visitor_name: 'Tola Ade', status: 'checked_out', checked_in_at: `${today} 09:00:00`, checked_out_at: `${today} 11:30:00`, checked_in_by_name: 'Rita Desk', checked_out_by_name: 'Rita Desk' });
  const other = makeVisit({ visitor_name: 'Uche Obi', status: 'checked_in', checked_in_at: `${today} 10:15:00`, checked_in_by_name: 'Rita Desk' });
  renderApp('/security/log', { ...signedInAs(SECURITY), [`GET /visits?activity_date=${today}`]: () => [200, { visits: [visit, other] }] });
  const table = await screen.findByRole('table', { name: "Today's check-ins and check-outs" });
  const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
  expect(rows).toEqual([
    expect.stringMatching(/09:00.*Checked in.*Tola Ade/),
    expect.stringMatching(/10:15.*Checked in.*Uche Obi/),
    expect.stringMatching(/11:30.*Checked out.*Tola Ade/),
  ]);
});
