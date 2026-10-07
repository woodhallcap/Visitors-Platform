import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { formatTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';
import { todayInLagos } from '../../lib/visits';
import type { Visit } from '../../types';

interface LogEvent {
  key: string;
  at: string;
  kind: 'in' | 'out';
  visit: Visit;
  by: string | null;
}

export function TodayLogPage() {
  const today = todayInLagos();
  const { visits, error } = useVisits(`?activity_date=${today}`, 30_000);

  const events: LogEvent[] = [];
  for (const v of visits ?? []) {
    if (v.checked_in_at?.startsWith(today)) events.push({ key: `${v.id}-in`, at: v.checked_in_at, kind: 'in', visit: v, by: v.checked_in_by_name });
    if (v.checked_out_at?.startsWith(today)) events.push({ key: `${v.id}-out`, at: v.checked_out_at, kind: 'out', visit: v, by: v.checked_out_by_name });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <PageHeader title="Today's log" description="Every check-in and check-out today, in time order. Updates every 30 seconds." />
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : events.length === 0 ? (
          <p className="mb-0 text-ink/70">No check-ins or check-outs yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Today's check-ins and check-outs" className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Visitor</th>
                  <th className="py-2 pr-4 font-medium">Host</th>
                  <th className="py-2 pr-4 font-medium">Badge</th>
                  <th className="py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.key} className="border-b border-bg-alt last:border-0">
                    <td className="py-3 pr-4 whitespace-nowrap">{formatTime(e.at)}</td>
                    <td className="py-3 pr-4">{e.kind === 'in' ? <Pill tone="primary">Checked in</Pill> : <Pill tone="muted">Checked out</Pill>}</td>
                    <td className="py-3 pr-4">{e.visit.visitor_name}</td>
                    <td className="py-3 pr-4">{e.visit.host_name}</td>
                    <td className="py-3 pr-4">{e.visit.badge_number ?? '—'}</td>
                    <td className="py-3">{e.by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
