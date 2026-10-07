import { formatDateTime } from './format';

test('formats a WAT datetime without timezone conversion', () => {
  expect(formatDateTime('2026-10-07 14:05:00')).toBe('7 Oct 2026, 14:05');
  expect(formatDateTime('2026-01-31T09:00:00')).toBe('31 Jan 2026, 09:00');
});

test('shows a dash for null and passes through unknown formats', () => {
  expect(formatDateTime(null)).toBe('—');
  expect(formatDateTime('soon')).toBe('soon');
});
