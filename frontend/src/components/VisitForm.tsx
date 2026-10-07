import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, messageOf } from '../lib/api';
import type { FieldErrors } from '../lib/validation';
import {
  VISITOR_GENDER_LABELS, VISITOR_TYPE_LABELS, emptyVisitForm, todayInLagos, validateVisitForm, visitPayload, visitToForm,
  type VisitFormValues, type VisitPayload,
} from '../lib/visits';
import { VISITOR_GENDERS, VISITOR_TYPES, type Host, type Visit } from '../types';
import { Banner } from './Banner';
import { Button } from './Button';
import { SelectInput } from './SelectInput';
import { TextInput } from './TextInput';

interface VisitFormProps {
  initial?: Visit;
  /** Given for reception and admin: shows the host picker. */
  hosts?: Host[];
  defaults?: Partial<VisitFormValues>;
  submitLabel: string;
  onSubmit: (payload: VisitPayload) => Promise<void>;
  onCancel?: () => void;
}

export function VisitForm({ initial, hosts, defaults, submitLabel, onSubmit, onCancel }: VisitFormProps) {
  const today = todayInLagos();
  const needsHost = hosts !== undefined;
  const [values, setValues] = useState<VisitFormValues>(() => ({
    ...emptyVisitForm(today),
    ...(initial ? visitToForm(initial) : {}),
    ...defaults,
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof VisitFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next = validateVisitForm(values, { needsHost, today });
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onSubmit(visitPayload(values, needsHost));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {error && <Banner tone="error">{error}</Banner>}
      <h3 className="mb-4 text-lg">Visitor</h3>
      <div className="grid gap-x-5 sm:grid-cols-2">
        <TextInput label="Visitor's full name" name="visitor_name" value={values.visitor_name} onChange={set('visitor_name')} error={errors.visitor_name} autoComplete="off" />
        <TextInput label="Phone" name="visitor_phone" type="tel" value={values.visitor_phone} onChange={set('visitor_phone')} error={errors.visitor_phone} autoComplete="off" />
        <TextInput label="Email (optional)" name="visitor_email" type="email" value={values.visitor_email} onChange={set('visitor_email')} error={errors.visitor_email} autoComplete="off" />
        <TextInput label="Company or organization (optional)" name="visitor_company" value={values.visitor_company} onChange={set('visitor_company')} error={errors.visitor_company} />
        <SelectInput label="Visitor type" name="visitor_type" value={values.visitor_type} onChange={set('visitor_type')} error={errors.visitor_type}>
          <option value="">Choose a type</option>
          {VISITOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {VISITOR_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Gender" name="visitor_gender" value={values.visitor_gender} onChange={set('visitor_gender')} error={errors.visitor_gender}>
          <option value="">Choose</option>
          {VISITOR_GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {VISITOR_GENDER_LABELS[gender]}
            </option>
          ))}
        </SelectInput>
      </div>
      <h3 className="mt-2 mb-4 text-lg">Visit</h3>
      <div className="grid gap-x-5 sm:grid-cols-2">
        {needsHost && (
          <SelectInput label="Person being visited" name="host_user_id" value={values.host_user_id} onChange={set('host_user_id')} error={errors.host_user_id}>
            <option value="">Choose a person</option>
            {hosts.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.department_name ? `${h.full_name} — ${h.department_name}` : h.full_name}
              </option>
            ))}
          </SelectInput>
        )}
        <TextInput label="Visit date" name="visit_date" type="date" min={today} value={values.visit_date} onChange={set('visit_date')} error={errors.visit_date} />
        <TextInput label="Expected arrival" name="expected_arrival" type="time" value={values.expected_arrival} onChange={set('expected_arrival')} error={errors.expected_arrival} hint="24-hour, Lagos time." />
        <TextInput label="Expected departure (optional)" name="expected_departure" type="time" value={values.expected_departure} onChange={set('expected_departure')} error={errors.expected_departure} />
        <TextInput label="Purpose of visit" name="purpose" value={values.purpose} onChange={set('purpose')} error={errors.purpose} />
        <TextInput label="Accompanying people" name="party_size" type="number" min={0} max={50} inputMode="numeric" value={values.party_size} onChange={set('party_size')} error={errors.party_size} />
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
