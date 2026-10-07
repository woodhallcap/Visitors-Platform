import { useRef, useState, type ReactNode } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { CheckInDialog } from '../../components/CheckInDialog';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { VisitStatusPill } from '../../components/VisitStatusPill';
import { api, messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';
import { VISITOR_TYPE_LABELS, matchesVisit, todayInLagos } from '../../lib/visits';
import type { Visit } from '../../types';

const byArrival = (a: Visit, b: Visit) => a.expected_arrival.localeCompare(b.expected_arrival);

function Column({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-brand bg-white p-5 shadow-card">
      <h2 className="mb-4 flex items-center justify-between text-xl">
        {title} <Pill>{count}</Pill>
      </h2>
      {count === 0 ? <p className="mb-0 text-sm text-ink/60">{empty}</p> : <ul className="m-0 list-none space-y-3 p-0">{children}</ul>}
    </section>
  );
}

function VisitCard({ visit, action }: { visit: Visit; action?: ReactNode }) {
  return (
    <li className={`rounded-2xl border p-4 ${visit.overstayed ? 'border-copper bg-copper/5' : 'border-bg-alt'}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="mb-1 text-base font-semibold">{visit.visitor_name}</h3>
        <VisitStatusPill visit={visit} />
      </div>
      <p className="mb-1 text-sm text-ink/70">
        {visit.host_name}
        {visit.visitor_company ? ` · ${visit.visitor_company}` : ''}
      </p>
      <p className="mb-0 text-sm text-ink/70">
        {VISITOR_TYPE_LABELS[visit.visitor_type]} · expected {visit.expected_arrival}
        {visit.expected_departure ? `–${visit.expected_departure}` : ''}
        {visit.checked_in_at ? ` · in ${formatTime(visit.checked_in_at)}` : ''}
        {visit.badge_number ? ` · badge ${visit.badge_number}` : ''}
        {visit.checked_out_at ? ` · out ${formatTime(visit.checked_out_at)}` : ''}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </li>
  );
}

export function TodayPage() {
  const { user } = useAuth();
  const today = todayInLagos();
  const day = useVisits(`?date_from=${today}&date_to=${today}`, 30_000);
  const onSite = useVisits('?status=checked_in', 30_000);
  // Visitors checked out today, including overnight visitors whose visit date was earlier.
  const gone = useVisits(`?status=checked_out&activity_date=${today}`, 30_000);
  const checkingOut = useRef(new Set<number>());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [checkingIn, setCheckingIn] = useState<Visit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAct = user?.role === 'reception';

  const merged = new Map<number, Visit>();
  for (const v of [...(day.visits ?? []), ...(gone.visits ?? []), ...(onSite.visits ?? [])]) merged.set(v.id, v);
  const visible = [...merged.values()].filter((v) => matchesVisit(v, query));
  const expected = visible.filter((v) => v.status === 'booked' && v.visit_date === today).sort(byArrival);
  const here = visible.filter((v) => v.status === 'checked_in').sort(byArrival);
  const left = visible
    .filter((v) => v.status === 'checked_out' && (v.checked_out_at ?? '').startsWith(today))
    .sort((a, b) => (b.checked_out_at ?? '').localeCompare(a.checked_out_at ?? ''));

  const applied = (v: Visit) => {
    day.replace(v);
    if (v.status === 'checked_in') onSite.upsert(v);
    else onSite.remove(v.id);
    if (v.status === 'checked_out') gone.upsert(v);
  };

  /** After a refused action (another desk got there first) the board is stale: fetch it again. */
  const reloadAll = () => Promise.all([day.reload(), onSite.reload(), gone.reload()]);

  const checkOut = async (v: Visit) => {
    // A ref, not state: a double click fires twice before React re-renders.
    if (checkingOut.current.has(v.id)) return;
    checkingOut.current.add(v.id);
    setBusyId(v.id);
    setError(null);
    try {
      applied((await api<{ visit: Visit }>('POST', `/visits/${v.id}/check-out`)).visit);
    } catch (err) {
      setError(messageOf(err));
      // Keep the card locked until the fresh board arrives, so a second click can't repeat the refused request.
      await reloadAll();
    } finally {
      checkingOut.current.delete(v.id);
      setBusyId(null);
    }
  };

  const loading = day.visits === null && onSite.visits === null && !day.error;

  return (
    <>
      <PageHeader title="Today" description={canAct ? 'Check visitors in when they arrive and out when they leave. Updates every 30 seconds.' : 'Who is expected, on site and gone today. Updates every 30 seconds.'} />
      {(error || day.error || onSite.error || gone.error) && <Banner tone="error" onDismiss={error ? () => setError(null) : undefined}>{error ?? day.error ?? onSite.error ?? gone.error}</Banner>}
      <div className="mb-6 max-w-sm">
        <input aria-label="Search today" placeholder="Search by visitor, company, phone or host" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass(false)} />
      </div>
      {loading ? (
        <p role="status">Loading…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Column title="Expected" count={expected.length} empty="No one else is expected today.">
            {expected.map((v) => (
              <VisitCard key={v.id} visit={v} action={canAct && <Button aria-label={`Check in ${v.visitor_name}`} onClick={() => setCheckingIn(v)}>Check in</Button>} />
            ))}
          </Column>
          <Column title="On site" count={here.length} empty="No visitors on site.">
            {here.map((v) => (
              <VisitCard key={v.id} visit={v} action={canAct && <Button variant="secondary" aria-label={`Check out ${v.visitor_name}`} disabled={busyId === v.id} onClick={() => checkOut(v)}>Check out</Button>} />
            ))}
          </Column>
          <Column title="Left" count={left.length} empty="No one has left yet.">
            {left.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </Column>
        </div>
      )}
      {checkingIn && (
        <CheckInDialog
          visit={checkingIn}
          onClose={() => setCheckingIn(null)}
          onRefused={() => void reloadAll()}
          onCheckedIn={(v) => {
            applied(v);
            setCheckingIn(null);
          }}
        />
      )}
    </>
  );
}
