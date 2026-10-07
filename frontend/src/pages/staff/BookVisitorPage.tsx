import { useState } from 'react';
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitForm } from '../../components/VisitForm';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Visit } from '../../types';

export function BookVisitorPage() {
  const [booked, setBooked] = useState<Visit | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <PageHeader title="Book a visitor" description="You'll be recorded as the host. Reception will see the visit on the day." />
      {booked && (
        <Banner tone="success" onDismiss={() => setBooked(null)}>
          {booked.visitor_name} is booked for {formatDate(booked.visit_date)} at {booked.expected_arrival}.{' '}
          <Link to="/my-visitors" className="font-semibold underline underline-offset-2">
            See my visitors
          </Link>
        </Banner>
      )}
      <Card>
        <VisitForm
          key={formKey}
          submitLabel="Book visitor"
          onSubmit={async (payload) => {
            const r = await api<{ visit: Visit }>('POST', '/visits', payload);
            setBooked(r.visit);
            setFormKey((k) => k + 1);
          }}
        />
      </Card>
    </>
  );
}
