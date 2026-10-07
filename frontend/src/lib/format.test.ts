import { formatDateTime, formatDuration, formatPercent, formatShortDate } from './format';

test('formats a WAT datetime without timezone conversion', () => {
  expect(formatDateTime('2026-10-07 14:05:00')).toBe('7 Oct 2026, 14:05');
  expect(formatDateTime('2026-01-31T09:00:00')).toBe('31 Jan 2026, 09:00');
});

test('shows a dash for null and passes through unknown formats', () => {
  expect(formatDateTime(null)).toBe('—');
  expect(formatDateTime('soon')).toBe('soon');
});

test('duration, percent and short date formatting', () => {
  expect(formatDuration(null)).toBe('—');
  expect(formatDuration(45)).toBe('45 min');
  expect(formatDuration(75)).toBe('1 h 15 min');
  expect(formatDuration(120)).toBe('2 h');
  expect(formatPercent(null)).toBe('—');
  expect(formatPercent(0.125)).toBe('13%');
  expect(formatPercent(0)).toBe('0%');
  expect(formatShortDate('2026-10-07')).toBe('7 Oct');
});
