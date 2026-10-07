import { useEffect, useState, type FormEvent } from 'react';
import { BarList } from '../../components/BarList';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ColumnChart } from '../../components/ColumnChart';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { formatDate, formatDuration, formatPercent, formatShortDate } from '../../lib/format';
import { VISITOR_GENDER_LABELS, VISITOR_TYPE_LABELS, addDays, todayInLagos, visitsQuery } from '../../lib/visits';
import type { Stats } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** "Female 42% · Male 58% of recorded visits", or undefined when no visit has a gender yet. */
function genderSummary(byGender: Stats['by_gender']): string | undefined {
  const count = (g: string) => byGender.find((x) => x.gender === g)?.count ?? 0;
  const recorded = count('female') + count('male');
  if (recorded === 0) return undefined;
  const female = Math.round((count('female') / recorded) * 100);
  return `Female ${female}% · Male ${100 - female}% of recorded visits`;
}
const MAX_DAYS = 366;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function DashboardPage() {
  const today = todayInLagos();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const [rangeErrors, setRangeErrors] = useState<{ from?: string; to?: string }>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = visitsQuery({ from: range.from, to: range.to });

  useEffect(() => {
    let cancelled = false;
    api<Stats>('GET', `/stats${query}`)
      .then((s) => {
        if (!cancelled) {
          setStats(s);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && Object.keys(err.fields).length) setRangeErrors(err.fields);
        else setError(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (from && to && to < from) {
      setRangeErrors({ to: 'The end date must be on or after the start date.' });
      return;
    }
    if (from && to && daysBetween(from, to) > MAX_DAYS) {
      setRangeErrors({ from: 'Choose a range of at most 366 days.' });
      return;
    }
    setRangeErrors({});
    setRange({ from, to });
  };

  const noVisits = stats !== null && stats.cards.visits_in_range === 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={stats ? `${formatDate(stats.from)} – ${formatDate(stats.to)}` : 'Visitor statistics'}
        actions={
          <a href={`/api/visits/export.csv${stats ? visitsQuery({ from: stats.from, to: stats.to }) : query}`} download className="inline-flex items-center rounded-full border border-primary px-6 py-2.5 text-[15px] font-semibold text-primary no-underline hover:bg-primary/5">
            Download CSV
          </a>
        }
      />
      <Card className="mb-6">
        <form onSubmit={apply} noValidate className="grid gap-x-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <TextInput label="From" name="from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} error={rangeErrors.from} />
          <TextInput label="To" name="to" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} error={rangeErrors.to} />
          <Button type="submit" className="sm:mt-8">
            Apply
          </Button>
        </form>
      </Card>
      {error && <Banner tone="error">{error}</Banner>}
      {stats === null && !error ? (
        <p role="status">Loading…</p>
      ) : (
        stats && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Visitors today" value={String(stats.cards.visitors_today)} />
              <StatCard label="On site now" value={String(stats.cards.on_site_now)} />
              <StatCard label="Visits in range" value={String(stats.cards.visits_in_range)} hint="Cancelled visits excluded" />
              <StatCard label="Average visit" value={formatDuration(stats.cards.average_visit_minutes)} hint="Check-in to check-out" />
              <StatCard label="No-show rate" value={formatPercent(stats.cards.no_show_rate)} hint="Of visits whose day has come" />
            </div>
            {noVisits && <Banner tone="info">No visits in this range yet.</Banner>}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <ColumnChart
                  title="Visits per day"
                  data={stats.per_day.map((d) => ({ label: formatShortDate(d.date), value: d.count, tooltip: `${formatDate(d.date)} · ${d.count} ${d.count === 1 ? 'visit' : 'visits'}` }))}
                />
              </div>
              <div className="grid gap-5 lg:col-span-2 lg:grid-cols-3">
                <BarList title="By visitor type" data={stats.by_type.map((t) => ({ label: VISITOR_TYPE_LABELS[t.type], value: t.count }))} empty="No visits yet." />
                <BarList
                  title="By gender"
                  summary={genderSummary(stats.by_gender)}
                  data={stats.by_gender.filter((g) => g.gender !== 'not_recorded' || g.count > 0).map((g) => ({ label: VISITOR_GENDER_LABELS[g.gender], value: g.count }))}
                  empty="No visits yet."
                />
                <BarList title="Top departments" data={stats.by_department.map((d) => ({ label: d.department, value: d.count }))} empty="No visits yet." />
              </div>
              <div className="lg:col-span-2">
                <ColumnChart
                  title="Arrivals by hour"
                  description="When visitors actually checked in"
                  labelEvery={3}
                  data={stats.by_hour.map((h) => ({ label: pad(h.hour), value: h.count, tooltip: `${pad(h.hour)}:00–${pad((h.hour + 1) % 24)}:00 · ${h.count} ${h.count === 1 ? 'arrival' : 'arrivals'}` }))}
                />
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
