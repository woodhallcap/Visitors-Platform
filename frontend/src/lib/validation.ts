import type { Role } from '../types';

// Mirrors lib/validator.php for inline feedback; the server stays authoritative.
export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(password: string): string | null {
  if (password === '') return 'Enter a password.';
  if ([...password].length < 10) return 'Use at least 10 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Use 72 characters or fewer.';
  return null;
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{7,20}$/.test(phone.trim().replace(/[\s-]/g, ''));
}

export interface UserFormValues {
  full_name: string;
  email: string;
  phone: string;
  role: Role | '';
  department_id: string;
}

export function validateUserForm(v: UserFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const name = v.full_name.trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 120) errors.full_name = 'Enter a full name (2–120 characters).';
  const email = v.email.trim();
  if (!EMAIL_RE.test(email) || email.length > 190) errors.email = 'Enter a valid email address.';
  if (v.phone.trim() !== '' && !isValidPhone(v.phone)) errors.phone = 'Enter a valid phone number.';
  if (v.role === '') errors.role = 'Choose a role.';
  if (v.role === 'staff' && v.department_id === '') errors.department_id = 'Staff need a department.';
  return errors;
}

export function validateDepartmentName(name: string): string | null {
  const length = [...name.trim().replace(/\s+/g, ' ')].length;
  return length < 2 || length > 120 ? 'Enter a department name (2–120 characters).' : null;
}
