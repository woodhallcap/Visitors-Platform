import { render, screen } from '@testing-library/react';
import { makeVisit } from '../test-utils';
import { VisitStatusPill } from './VisitStatusPill';

test.each([
  [{ status: 'booked' as const }, 'Booked'],
  [{ status: 'checked_in' as const }, 'On site'],
  [{ status: 'checked_in' as const, overstayed: true }, 'Overstayed'],
  [{ status: 'checked_out' as const }, 'Checked out'],
  [{ status: 'cancelled' as const }, 'Cancelled'],
  [{ status: 'no_show' as const }, 'No-show'],
])('%o shows %s', (overrides, label) => {
  render(<VisitStatusPill visit={makeVisit(overrides)} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
