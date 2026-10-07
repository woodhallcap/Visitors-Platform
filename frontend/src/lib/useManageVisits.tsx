import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { VisitForm } from '../components/VisitForm';
import type { Host, Visit } from '../types';
import { api, messageOf } from './api';
import { formatDate } from './format';

const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

/** Edit and cancel for booked visits: the buttons for a row, plus the dialogs they open. */
export function useManageVisits({ onChanged, hosts }: { onChanged: (v: Visit) => void; hosts?: Host[] }): {
  actions: (v: Visit) => ReactNode;
  dialogs: ReactNode;
} {
  const [editing, setEditing] = useState<Visit | null>(null);
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = (v: Visit) =>
    v.status !== 'booked' ? null : (
      <span className="inline-flex gap-4">
        <button type="button" className={linkButton} aria-label={`Edit visit by ${v.visitor_name}`} onClick={() => setEditing(v)}>
          Edit
        </button>
        <button type="button" className={linkButton} aria-label={`Cancel visit by ${v.visitor_name}`} onClick={() => { setError(null); setCancelling(v); }}>
          Cancel
        </button>
      </span>
    );

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      const r = await api<{ visit: Visit }>('PATCH', `/visits/${cancelling.id}`, { status: 'cancelled' });
      onChanged(r.visit);
      setCancelling(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      {editing && (
        <Dialog title="Edit visit" onClose={() => setEditing(null)}>
          <VisitForm
            initial={editing}
            hosts={hosts}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={async (payload) => {
              const r = await api<{ visit: Visit }>('PATCH', `/visits/${editing.id}`, payload);
              onChanged(r.visit);
              setEditing(null);
            }}
          />
        </Dialog>
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel this visit?"
          body={`${cancelling.visitor_name} on ${formatDate(cancelling.visit_date)} at ${cancelling.expected_arrival} will be cancelled.`}
          confirmLabel="Cancel visit"
          cancelLabel="Keep it"
          busy={busy}
          error={error}
          onConfirm={confirmCancel}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );

  return { actions, dialogs };
}
