import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitTable } from '../../components/VisitTable';
import { useManageVisits } from '../../lib/useManageVisits';
import { useVisits } from '../../lib/useVisits';
import { todayInLagos } from '../../lib/visits';

export function MyVisitorsPage() {
  const today = todayInLagos();
  const { visits, error, replace } = useVisits('');
  const { actions, dialogs } = useManageVisits({ onChanged: replace });

  const all = visits ?? [];
  const upcoming = all
    .filter((v) => v.visit_date >= today && (v.status === 'booked' || v.status === 'checked_in'))
    .sort((a, b) => (a.visit_date + a.expected_arrival).localeCompare(b.visit_date + b.expected_arrival));
  const past = all
    .filter((v) => !upcoming.includes(v))
    .sort((a, b) => (b.visit_date + b.expected_arrival).localeCompare(a.visit_date + a.expected_arrival));

  return (
    <>
      <PageHeader
        title="My visitors"
        description="Visitors booked with you as the host."
        actions={
          <Link to="/book" className="inline-flex items-center rounded-full bg-primary px-7 py-3 text-[15px] font-semibold text-white no-underline hover:bg-primary-dark">
            Book a visitor
          </Link>
        }
      />
      {error && <Banner tone="error">{error}</Banner>}
      {visits === null && !error ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-4 text-xl">Upcoming</h2>
            <VisitTable visits={upcoming} caption="Upcoming visits" empty="No upcoming visitors." actions={actions} />
          </Card>
          <Card>
            <h2 className="mb-4 text-xl">Past</h2>
            <VisitTable visits={past} caption="Past visits" empty="No past visitors yet." />
          </Card>
        </>
      )}
      {dialogs}
    </>
  );
}
