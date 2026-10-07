import { addDays, matchesVisit, timeInLagos, todayInLagos, validateVisitForm, visitPayload, visitsQuery, emptyVisitForm } from './visits';
import { formatDate, formatTime } from './format';
import { makeVisit } from '../test-utils';

const valid = {
  ...emptyVisitForm('2026-10-07'),
  visitor_name: 'Tola Ade', visitor_phone: '0803 123 4567', visitor_type: 'client' as const, visitor_gender: 'female' as const,
  expected_arrival: '10:30', purpose: 'Quarterly review',
};

test('today and now follow Lagos, not the device clock', () => {
  expect(todayInLagos(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08');
  expect(timeInLagos(new Date('2026-10-07T23:30:00Z'))).toBe('00:30');
  expect(timeInLagos(new Date('2026-10-07T08:05:00Z'))).toBe('09:05');
});

test('addDays crosses month ends', () => {
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2026-10-01', -7)).toBe('2026-09-24');
});

test('a valid form has no errors', () => {
  expect(validateVisitForm(valid, { needsHost: false, today: '2026-10-07' })).toEqual({});
});

test('form errors match the server messages', () => {
  expect(
    validateVisitForm(
      { visitor_name: 'A', visitor_phone: '1', visitor_email: 'x', visitor_company: 'c'.repeat(121), visitor_type: '', visitor_gender: '', host_user_id: '',
        visit_date: '2026-10-06', expected_arrival: '', expected_departure: '9am', purpose: 'hi', party_size: '51' },
      { needsHost: true, today: '2026-10-07' },
    ),
  ).toEqual({
    visitor_name: "Enter the visitor's full name (2–120 characters).",
    visitor_phone: 'Enter a valid phone number.',
    visitor_email: 'Enter a valid email address.',
    visitor_company: 'Use 120 characters or fewer.',
    visitor_type: 'Choose a visitor type.',
    visitor_gender: "Choose the visitor's gender.",
    host_user_id: 'Choose the person being visited.',
    visit_date: 'Choose today or a later date.',
    expected_arrival: 'Enter the expected arrival time (HH:MM).',
    expected_departure: 'Enter a valid time (HH:MM).',
    purpose: 'Enter the purpose of the visit (3–255 characters).',
    party_size: 'Enter a number from 0 to 50.',
  });
});

test('departure must be after arrival', () => {
  expect(validateVisitForm({ ...valid, expected_departure: '10:30' }, { needsHost: false, today: '2026-10-07' })).toEqual({
    expected_departure: 'Departure must be after arrival.',
  });
});

test('the payload converts numbers and blanks', () => {
  expect(visitPayload({ ...valid, host_user_id: '7', party_size: '2' }, true)).toEqual({
    visitor_name: 'Tola Ade', visitor_phone: '0803 123 4567', visitor_email: '', visitor_company: '', visitor_type: 'client', visitor_gender: 'female',
    visit_date: '2026-10-07', expected_arrival: '10:30', expected_departure: null, purpose: 'Quarterly review',
    party_size: 2, host_user_id: 7,
  });
  expect('host_user_id' in visitPayload(valid, false)).toBe(false);
});

test('visitsQuery skips empty values', () => {
  expect(visitsQuery({})).toBe('');
  expect(visitsQuery({ date_from: '2026-10-07', q: '', status: 'booked' })).toBe('?date_from=2026-10-07&status=booked');
});

test('matchesVisit searches visitor, company, phone and host', () => {
  const v = makeVisit({ visitor_name: 'Tola Ade', visitor_company: 'Acme', host_name: 'Chidi Okafor', visitor_phone: '08031234567' });
  expect(matchesVisit(v, 'acme')).toBe(true);
  expect(matchesVisit(v, 'chidi')).toBe(true);
  expect(matchesVisit(v, '0803')).toBe(true);
  expect(matchesVisit(v, 'zeta')).toBe(false);
  expect(matchesVisit(v, '  ')).toBe(true);
});

test('date and time formatting', () => {
  expect(formatDate('2026-10-07')).toBe('7 Oct 2026');
  expect(formatTime('2026-10-07 14:05:00')).toBe('14:05');
  expect(formatTime(null)).toBe('—');
});

test('an empty accompanying-people field counts as 0', () => {
  expect(validateVisitForm({ ...valid, party_size: '' }, { needsHost: false, today: '2026-10-07' })).toEqual({});
  expect(visitPayload({ ...valid, party_size: '' }, false).party_size).toBe(0);
});
