import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitForm } from '../../components/VisitForm';
import { api, messageOf } from '../../lib/api';
import { timeInLagos, todayInLagos } from '../../lib/visits';
import type { Host, Visit } from '../../types';

export function WalkInPage() {
  const navigate = useNavigate();
  const [hosts, setHosts] = useState<Host[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ hosts: Host[] }>('GET', '/hosts')
      .then((r) => setHosts(r.hosts))
      .catch((err) => setError(messageOf(err)));
  }, []);

  return (
    <>
      <PageHeader title="Book a walk-in" description="For visitors who arrive without a booking. Check them in from Today once they're booked." />
      {error && <Banner tone="error">{error}</Banner>}
      <Card>
        {hosts === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : (
          <VisitForm
            hosts={hosts ?? []}
            defaults={{ visit_date: todayInLagos(), expected_arrival: timeInLagos() }}
            submitLabel="Book walk-in"
            onSubmit={async (payload) => {
              await api<{ visit: Visit }>('POST', '/visits', payload);
              navigate('/reception/today');
            }}
          />
        )}
      </Card>
    </>
  );
}
