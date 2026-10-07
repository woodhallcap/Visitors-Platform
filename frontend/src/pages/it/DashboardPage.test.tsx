import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import type { Stats } from '../../types';
import { ADMIN, IT, SECURITY, STAFF, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const from = addDays(today, -29);
const defaultKey = `GET /stats?from=${from}&to=${today}`;

function stats(overrides: Partial<Stats> = {}, days = 30, start = from): Stats {
  return {
    from: start,
    to: today,
    cards: { visitors_today: 4, on_site_now: 2, visits_in_range: 57, average_visit_minutes: 75, no_show_rate: 0.125 },
    per_day: Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), count: i === days - 1 ? 6 : i % 3 })),
    by_type: [
      { type: 'client', count: 20 }, { type: 'vendor', count: 15 }, { type: 'interviewee', count: 10 },
      { type: 'contractor', count: 7 }, { type: 'guest', count: 5 },
    ],
    by_department: [{ department: 'Finance', count: 30 }, { department: 'No department', count: 4 }],
    by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 9 ? 12 : 0 })),
    ...overrides,
  };
}

test('the dashboard shows stat cards for the last 30 days', async () => {
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  const card = (label: string) => screen.getByRole('group', { name: label });
  expect(await screen.findByRole('group', { name: 'Visitors today' })).toHaveTextContent('4');
  expect(card('On site now')).toHaveTextContent('2');
  expect(card('Visits in range')).toHaveTextContent('57');
  expect(card('Average visit')).toHaveTextContent('1 h 15 min');
  expect(card('No-show rate')).toHaveTextContent('13%');
});

test('each chart has a data table and the category bars show values', async () => {
  renderApp('/it/dashboard', { ...signedInAs(ADMIN), [defaultKey]: () => [200, stats()] });
  const perDay = await screen.findByRole('table', { name: 'Visits per day' });
  expect(within(perDay).getAllByRole('row')).toHaveLength(31);
  expect(within(screen.getByRole('table', { name: 'Arrivals by hour' })).getAllByRole('row')).toHaveLength(25);
  const types = screen.getByRole('list', { name: 'By visitor type' });
  expect(within(types).getByText('Client')).toBeInTheDocument();
  expect(within(types).getByText('20')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Top departments' })).getByText('No department')).toBeInTheDocument();
});

test('hovering a column shows its tooltip', async () => {
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  await screen.findByRole('table', { name: 'Arrivals by hour' });
  const column = screen.getByRole('img', { name: /09:00.*12 arrivals/ });
  fireEvent.mouseEnter(column);
  expect(screen.getByRole('tooltip')).toHaveTextContent('09:00–10:00 · 12 arrivals');
});

test('an empty install shows zeros and dashes, not errors', async () => {
  const empty = stats({
    cards: { visitors_today: 0, on_site_now: 0, visits_in_range: 0, average_visit_minutes: null, no_show_rate: null },
    per_day: Array.from({ length: 30 }, (_, i) => ({ date: addDays(from, i), count: 0 })),
    by_type: stats().by_type.map((t) => ({ ...t, count: 0 })),
    by_department: [],
    by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  });
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, empty] });
  expect(await screen.findByRole('group', { name: 'Average visit' })).toHaveTextContent('—');
  expect(screen.getByRole('group', { name: 'No-show rate' })).toHaveTextContent('—');
  expect(screen.getByText('No visits in this range yet.')).toBeInTheDocument();
});

test('changing the range reloads the stats and the export link follows it', async () => {
  const newFrom = addDays(today, -6);
  const { calls } = renderApp('/it/dashboard', {
    ...signedInAs(IT),
    [defaultKey]: () => [200, stats()],
    [`GET /stats?from=${newFrom}&to=${today}`]: () => [200, stats({}, 7, newFrom)],
  });
  await screen.findByRole('table', { name: 'Visits per day' });
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/api/visits/export.csv?from=${from}&to=${today}`);
  const fromInput = screen.getByLabelText('From');
  await userEvent.clear(fromInput);
  await userEvent.type(fromInput, newFrom);
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await within(await screen.findByRole('table', { name: 'Visits per day' })).findAllByRole('row')).toHaveLength(8);
  expect(calls.some((c) => c.path === `/stats?from=${newFrom}&to=${today}`)).toBe(true);
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/api/visits/export.csv?from=${newFrom}&to=${today}`);
});

test('a backwards range is caught before any request', async () => {
  const { calls } = renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  await screen.findByRole('table', { name: 'Visits per day' });
  const before = calls.length;
  const toInput = screen.getByLabelText('To');
  await userEvent.clear(toInput);
  await userEvent.type(toInput, addDays(today, -40));
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument();
  expect(calls.length).toBe(before);
});

test('a year of days thins the date labels', async () => {
  const yearFrom = addDays(today, -365);
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats({}, 366, yearFrom)] });
  const chart = await screen.findByRole('figure', { name: 'Visits per day' });
  expect(within(chart).getAllByTestId('x-label').length).toBeLessThanOrEqual(12);
});

test.each([['staff', STAFF], ['security', SECURITY]])('%s cannot open the dashboard', async (_label, user) => {
  renderApp('/it/dashboard', signedInAs(user));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});

test('a range longer than 366 days is caught before any request', async () => {
  const { calls } = renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  await screen.findByRole('table', { name: 'Visits per day' });
  const before = calls.length;
  const fromInput = screen.getByLabelText('From');
  await userEvent.clear(fromInput);
  await userEvent.type(fromInput, addDays(today, -400));
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByText('Choose a range of at most 366 days.')).toBeInTheDocument();
  expect(calls.length).toBe(before);
});

test('server field errors appear on the inputs and the download link keeps the last loaded range', async () => {
  const newFrom = addDays(today, -10);
  renderApp('/it/dashboard', {
    ...signedInAs(IT),
    [defaultKey]: () => [200, stats()],
    [`GET /stats?from=${newFrom}&to=${today}`]: () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { from: 'Enter a valid date.' } } }],
  });
  await screen.findByRole('table', { name: 'Visits per day' });
  const fromInput = screen.getByLabelText('From');
  await userEvent.clear(fromInput);
  await userEvent.type(fromInput, newFrom);
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('Enter a valid date.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/api/visits/export.csv?from=${from}&to=${today}`);
});
