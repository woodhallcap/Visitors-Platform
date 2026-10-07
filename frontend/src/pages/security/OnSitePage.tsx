import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitStatusPill } from '../../components/VisitStatusPill';
import { formatDateTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';

export function OnSitePage() {
  const { visits, error } = useVisits('?status=checked_in', 30_000);
  const rows = [...(visits ?? [])].sort((a, b) => (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? ''));

  return (
    <>
      <PageHeader title="On site now" description="Everyone checked in and not yet checked out. Updates every 30 seconds." actions={visits && <p className="mb-0 text-lg font-semibold text-primary">{rows.length} on site</p>} />
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mb-0 text-ink/70">No visitors on site.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Visitors on site" className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Visitor</th>
                  <th className="py-2 pr-4 font-medium">Host</th>
                  <th className="py-2 pr-4 font-medium">Checked in</th>
                  <th className="py-2 pr-4 font-medium">Badge</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className={`border-b border-bg-alt align-top last:border-0 ${v.overstayed ? 'bg-copper/5' : ''}`}>
                    <td className="py-3 pr-4">
                      <span className="block font-medium">{v.visitor_name}</span>
                      {v.visitor_company && <span className="block text-sm text-ink/60">{v.visitor_company}</span>}
                    </td>
                    <td className="py-3 pr-4">{v.host_name}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatDateTime(v.checked_in_at)}
                      {v.expected_departure && <span className="block text-sm text-ink/60">expected out {v.expected_departure}</span>}
                    </td>
                    <td className="py-3 pr-4">{v.badge_number ?? '—'}</td>
                    <td className="py-3">
                      <VisitStatusPill visit={v} />
                    </td>
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
