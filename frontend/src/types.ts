export type Role = 'staff' | 'reception' | 'security' | 'it' | 'admin';
export const ROLES: Role[] = ['staff', 'reception', 'security', 'it', 'admin'];

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  department_id: number | null;
  department_name: string | null;
  active: boolean;
  has_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  active: boolean;
  user_count: number;
}

export interface SetPasswordLink {
  set_password_url: string;
  expires_at: string;
  purpose: 'invite' | 'reset';
}

export interface SessionPayload {
  user: User;
  csrf_token: string;
}
