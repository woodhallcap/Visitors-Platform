import type { Visit } from '../types';
import { Pill } from './Pill';

// Spec §8: booked = tan, on site = brown, overstayed = copper, checked out = grey, cancelled/no-show = muted.
export function VisitStatusPill({ visit }: { visit: Visit }) {
  if (visit.status === 'checked_in' && visit.overstayed) return <Pill tone="copper">Overstayed</Pill>;
  switch (visit.status) {
    case 'booked':
      return <Pill tone="accent">Booked</Pill>;
    case 'checked_in':
      return <Pill tone="primary">On site</Pill>;
    case 'checked_out':
      return <Pill tone="muted">Checked out</Pill>;
    case 'cancelled':
      return <Pill tone="struck">Cancelled</Pill>;
    case 'no_show':
      return <Pill tone="muted">No-show</Pill>;
  }
}
