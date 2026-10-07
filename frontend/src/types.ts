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

export type VisitorType = 'client' | 'vendor' | 'interviewee' | 'contractor' | 'guest';
export const VISITOR_TYPES: VisitorType[] = ['client', 'vendor', 'interviewee', 'contractor', 'guest'];
export type VisitStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Visit {
  id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;
  visitor_company: string | null;
  visitor_type: VisitorType;
  host_user_id: number;
  host_name: string;
  department_id: number | null;
  department_name: string | null;
  booked_by_user_id: number;
  booked_by_name: string;
  channel: 'staff' | 'reception';
  visit_date: string;
  expected_arrival: string;
  expected_departure: string | null;
  purpose: string;
  party_size: number;
  status: VisitStatus;
  checked_in_at: string | null;
  checked_in_by_name: string | null;
  checked_out_at: string | null;
  checked_out_by_name: string | null;
  badge_number: string | null;
  id_type: string | null;
  id_number: string | null;
  cancelled_at: string | null;
  created_at: string;
  overstayed: boolean;
}

export interface Host {
  id: number;
  full_name: string;
  department_name: string | null;
}
