import type { FieldErrors } from './validation';
import { isValidPhone } from './validation';
import { VISITOR_TYPES, type Visit, type VisitorType } from '../types';

export const VISITOR_TYPE_LABELS: Record<VisitorType, string> = {
  client: 'Client',
  vendor: 'Vendor',
  interviewee: 'Interviewee',
  contractor: 'Contractor',
  guest: 'Guest',
};

const LAGOS = 'Africa/Lagos';

/** "Today" for the office, whatever timezone the device is set to. */
export function todayInLagos(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function timeInLagos(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: LAGOS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface VisitFormValues {
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  visitor_company: string;
  visitor_type: VisitorType | '';
  host_user_id: string;
  visit_date: string;
  expected_arrival: string;
  expected_departure: string;
  purpose: string;
  party_size: string;
}

export function emptyVisitForm(today: string): VisitFormValues {
  return {
    visitor_name: '', visitor_phone: '', visitor_email: '', visitor_company: '', visitor_type: '', host_user_id: '',
    visit_date: today, expected_arrival: '', expected_departure: '', purpose: '', party_size: '0',
  };
}

export function visitToForm(v: Visit): VisitFormValues {
  return {
    visitor_name: v.visitor_name,
    visitor_phone: v.visitor_phone,
    visitor_email: v.visitor_email ?? '',
    visitor_company: v.visitor_company ?? '',
    visitor_type: v.visitor_type,
    host_user_id: String(v.host_user_id),
    visit_date: v.visit_date,
    expected_arrival: v.expected_arrival,
    expected_departure: v.expected_departure ?? '',
    purpose: v.purpose,
    party_size: String(v.party_size),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const length = (s: string) => [...s.trim().replace(/\s+/g, ' ')].length;

/** Mirrors validate_visit() in lib/validator.php; the server stays authoritative. */
export function validateVisitForm(v: VisitFormValues, opts: { needsHost: boolean; today: string }): FieldErrors {
  const e: FieldErrors = {};
  if (length(v.visitor_name) < 2 || length(v.visitor_name) > 120) e.visitor_name = "Enter the visitor's full name (2–120 characters).";
  if (!isValidPhone(v.visitor_phone)) e.visitor_phone = 'Enter a valid phone number.';
  if (v.visitor_email.trim() !== '' && !EMAIL_RE.test(v.visitor_email.trim())) e.visitor_email = 'Enter a valid email address.';
  if (length(v.visitor_company) > 120) e.visitor_company = 'Use 120 characters or fewer.';
  if (!VISITOR_TYPES.includes(v.visitor_type as VisitorType)) e.visitor_type = 'Choose a visitor type.';
  if (opts.needsHost && v.host_user_id === '') e.host_user_id = 'Choose the person being visited.';
  if (!DATE_RE.test(v.visit_date) || Number.isNaN(Date.parse(`${v.visit_date}T00:00:00Z`))) e.visit_date = 'Enter a valid date.';
  else if (v.visit_date < opts.today) e.visit_date = 'Choose today or a later date.';
  if (!TIME_RE.test(v.expected_arrival)) e.expected_arrival = 'Enter the expected arrival time (HH:MM).';
  if (v.expected_departure !== '') {
    if (!TIME_RE.test(v.expected_departure)) e.expected_departure = 'Enter a valid time (HH:MM).';
    else if (TIME_RE.test(v.expected_arrival) && v.expected_departure <= v.expected_arrival) e.expected_departure = 'Departure must be after arrival.';
  }
  if (length(v.purpose) < 3 || length(v.purpose) > 255) e.purpose = 'Enter the purpose of the visit (3–255 characters).';
  // Optional with a default of 0 (spec §5): an empty field is fine.
  if (v.party_size !== '' && (!/^\d+$/.test(v.party_size) || Number(v.party_size) > 50)) e.party_size = 'Enter a number from 0 to 50.';
  return e;
}

export interface VisitPayload {
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  visitor_company: string;
  visitor_type: VisitorType | '';
  visit_date: string;
  expected_arrival: string;
  expected_departure: string | null;
  purpose: string;
  party_size: number;
  host_user_id?: number;
}

export function visitPayload(v: VisitFormValues, needsHost: boolean): VisitPayload {
  const payload: VisitPayload = {
    visitor_name: v.visitor_name,
    visitor_phone: v.visitor_phone,
    visitor_email: v.visitor_email,
    visitor_company: v.visitor_company,
    visitor_type: v.visitor_type,
    visit_date: v.visit_date,
    expected_arrival: v.expected_arrival,
    expected_departure: v.expected_departure === '' ? null : v.expected_departure,
    purpose: v.purpose,
    party_size: Number(v.party_size || 0),
  };
  if (needsHost) payload.host_user_id = Number(v.host_user_id);
  return payload;
}

export function visitsQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function matchesVisit(v: Visit, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [v.visitor_name, v.visitor_company ?? '', v.visitor_phone, v.host_name].some((s) => s.toLowerCase().includes(q));
}
