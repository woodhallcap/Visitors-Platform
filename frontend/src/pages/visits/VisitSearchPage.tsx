import { useEffect, useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { TextInput } from '../../components/TextInput';
import { VisitTable } from '../../components/VisitTable';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useManageVisits } from '../../lib/useManageVisits';
import { useVisits } from '../../lib/useVisits';
import { addDays, todayInLagos, visitsQuery } from '../../lib/visits';
import type { Host } from '../../types';

export function VisitSearchPage({ title, description }: { title: string; description: string }) {
  const { user } = useAuth();
  const canManage = user?.role === 'reception' || user?.role === 'admin';
  const today = todayInLagos();
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(addDays(today, 30));
  const [q, setQ] = useState('');
  const [rangeError, setRangeError] = useState<string | undefined>();
  const [query, setQuery] = useState(() => visitsQuery({ date_from: addDays(today, -7), date_to: addDays(today, 30) }));
  const [hosts, setHosts] = useState<Host[] | undefined>();
  const { visits, error, replace } = useVisits(query);
  const { actions, dialogs } = useManageVisits({ onChanged: replace, hosts });

  useEffect(() => {
    if (!canManage) return;
    api<{ hosts: Host[] }>('GET', '/hosts')
      .then((r) => setHosts(r.hosts))
      .catch(() => setHosts([]));
  }, [canManage]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (from && to && to < from) {
      setRangeError('The end date must be on or after the start date.');
      return;
    }
    setRangeError(undefined);
    setQuery(visitsQuery({ date_from: from, date_to: to, q: q.trim() }));
  };

  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="mb-6">
        <form onSubmit={search} noValidate className="grid gap-x-5 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-start">
          <TextInput label="From" name="date_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="To" name="date_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={rangeError} />
          <TextInput label="Search" name="q" placeholder="Visitor, company, phone or host" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" className="sm:mt-8">
            Search
          </Button>
        </form>
      </Card>
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : (
          <VisitTable visits={visits ?? []} caption="Visits" empty="No visits match." showHost actions={canManage ? actions : undefined} />
        )}
        {visits && visits.length >= 500 && <p className="mt-4 mb-0 text-sm text-ink/60">Showing the first 500 visits. Narrow the dates to see the rest.</p>}
      </Card>
      {dialogs}
    </>
  );
}
