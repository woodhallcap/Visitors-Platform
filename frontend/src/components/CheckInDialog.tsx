import { useState, type FormEvent } from 'react';
import { ApiError, api, messageOf } from '../lib/api';
import type { FieldErrors } from '../lib/validation';
import type { Visit } from '../types';
import { Banner } from './Banner';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextInput } from './TextInput';

interface CheckInDialogProps {
  visit: Visit;
  onClose: () => void;
  onCheckedIn: (v: Visit) => void;
}

export function CheckInDialog({ visit, onClose, onCheckedIn }: CheckInDialogProps) {
  const [badge, setBadge] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ visit: Visit }>('POST', `/visits/${visit.id}/check-in`, { badge_number: badge, id_type: idType, id_number: idNumber });
      onCheckedIn(r.visit);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Check in ${visit.visitor_name}`} onClose={onClose}>
      <p className="text-ink/70">
        Visiting {visit.host_name}
        {visit.visitor_company ? ` · ${visit.visitor_company}` : ''}
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate>
        <TextInput label="Badge or tag number (optional)" name="badge_number" maxLength={30} value={badge} onChange={(e) => setBadge(e.target.value)} error={errors.badge_number} autoFocus />
        <TextInput label="ID type seen (optional)" name="id_type" maxLength={40} placeholder="e.g. Passport, Driver's licence" value={idType} onChange={(e) => setIdType(e.target.value)} error={errors.id_type} />
        <TextInput label="ID number (optional)" name="id_number" maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} error={errors.id_number} />
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Checking in…' : 'Check in'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
