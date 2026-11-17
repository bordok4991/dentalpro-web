export type Role = 'owner' | 'doctor' | 'specialist' | 'assistant' | 'reception' | 'patient';
export type ClinicStatus = 'trial' | 'active' | 'suspended';
export type Locale = 'bs' | 'hr' | 'sr' | 'en';

export const LOCALES: Locale[] = ['bs', 'hr', 'sr', 'en'];
export const ROLES: Role[] = ['owner', 'doctor', 'specialist', 'assistant', 'reception', 'patient'];
/** Uloge koje se mogu dodijeliti pozivnicom (vlasnik nastaje registracijom ordinacije). */
export const INVITABLE_ROLES: Role[] = ['doctor', 'specialist', 'assistant', 'reception', 'patient'];

export interface Clinic {
  id: string;
  name: string;
  doctor_name: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  status: ClinicStatus;
  trial_ends_at: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  locale: Locale;
  avatar_url: string | null;
}

export interface Membership {
  role: Role;
  clinic: Clinic;
}

export interface Member {
  id: string;
  user_id: string;
  role: Role;
  specialty: string | null;
  is_active: boolean;
  created_at: string;
  profile: { full_name: string; email: string | null; phone: string | null } | null;
}

export interface Invite {
  id: string;
  clinic_id: string;
  email: string;
  role: Role;
  specialty: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}
