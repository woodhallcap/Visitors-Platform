import { isValidPhone, validateDepartmentName, validatePassword, validateUserForm } from './validation';

const valid = { full_name: 'Ada Obi', email: 'ada@woodhallcap.com', phone: '', role: 'it' as const, department_id: '' };

test('password rules mirror the server', () => {
  expect(validatePassword('')).toBe('Enter a password.');
  expect(validatePassword('short')).toBe('Use at least 10 characters.');
  expect(validatePassword('a'.repeat(73))).toBe('Use 72 characters or fewer.');
  expect(validatePassword('é'.repeat(10))).toBeNull();
  expect(validatePassword('é'.repeat(37))).toBe('Use 72 characters or fewer.'); // 74 bytes
  expect(validatePassword('long enough pw')).toBeNull();
});

test('phone numbers allow spaces, dashes and a leading plus', () => {
  expect(isValidPhone('+234 802-829-7772')).toBe(true);
  expect(isValidPhone('12345')).toBe(false);
  expect(isValidPhone('080-CALL-NOW')).toBe(false);
});

test('a valid user form has no errors', () => {
  expect(validateUserForm(valid)).toEqual({});
});

test('user form errors use the server messages', () => {
  expect(validateUserForm({ full_name: 'A', email: 'nope', phone: '123', role: '', department_id: '' })).toEqual({
    full_name: 'Enter a full name (2–120 characters).',
    email: 'Enter a valid email address.',
    phone: 'Enter a valid phone number.',
    role: 'Choose a role.',
  });
});

test('staff need a department', () => {
  expect(validateUserForm({ ...valid, role: 'staff' })).toEqual({ department_id: 'Staff need a department.' });
  expect(validateUserForm({ ...valid, role: 'staff', department_id: '3' })).toEqual({});
});

test('department names must be 2–120 characters after trimming', () => {
  expect(validateDepartmentName('  A ')).toBe('Enter a department name (2–120 characters).');
  expect(validateDepartmentName('Finance')).toBeNull();
});
