import type { ReactNode } from 'react';
import { formatDate } from '../lib/format';
import { VISITOR_TYPE_LABELS } from '../lib/visits';
import type { Visit } from '../types';
import { VisitStatusPill } from './VisitStatusPill';

interface VisitTableProps {
  visits: Visit[];
  caption: string;
  empty: string;
  showHost?: boolean;
  actions?: (v: Visit) => ReactNode;
}

export function VisitTable({ visits, caption, empty, showHost = false, actions }: VisitTableProps) {
  if (visits.length === 0) return <p className="mb-0 text-ink/70">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table aria-label={caption} className="w-full border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b border-bg-alt text-sm text-ink/60">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Visitor</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            {showHost && <th className="py-2 pr-4 font-medium">Host</th>}
            <th className="py-2 pr-4 font-medium">Status</th>
            {actions && (
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id} className="border-b border-bg-alt align-top last:border-0">
              <td className="py-3 pr-4 whitespace-nowrap">
                <span className="block">{formatDate(v.visit_date)}</span>
                <span className="block text-sm text-ink/60">
                  {v.expected_arrival}
                  {v.expected_departure ? `–${v.expected_departure}` : ''}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="block font-medium">{v.visitor_name}</span>
                <span className="block text-sm text-ink/60">{v.visitor_company ?? v.visitor_phone}</span>
              </td>
              <td className="py-3 pr-4">{VISITOR_TYPE_LABELS[v.visitor_type]}</td>
              {showHost && (
                <td className="py-3 pr-4">
                  <span className="block">{v.host_name}</span>
                  {v.department_name && <span className="block text-sm text-ink/60">{v.department_name}</span>}
                </td>
              )}
              <td className="py-3 pr-4">
                <VisitStatusPill visit={v} />
              </td>
              {actions && <td className="py-3 text-right whitespace-nowrap">{actions(v)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
