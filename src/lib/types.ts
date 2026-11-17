export type Role = 'owner' | 'doctor' | 'specialist' | 'assistant' | 'reception' | 'patient';
export type ClinicStatus = 'trial' | 'active' | 'suspended';
export type Locale = 'bs' | 'hr' | 'sr' | 'en';

export const LOCALES: Locale[] = ['bs', 'hr', 'sr', 'en'];
export const ROLES: Role[] = ['owner', 'doctor', 'specialist', 'assistant', 'reception', 'patient'];
/** Uloge koje se mogu dodijeliti pozivnicom (vlasnik nastaje registracijom ordinacije). */
export const INVITABLE_ROLES: Role[] = ['doctor', 'specialist', 'assistant', 'reception', 'patient'];
/** Uloge koje vide medicinske podatke i historiju kartona (recepcija ne). */
export const CLINICAL_ROLES: Role[] = ['owner', 'doctor', 'specialist', 'assistant'];

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

export type Sex = 'f' | 'm';

export interface Patient {
  id: string;
  clinic_id: string;
  card_number: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  sex: Sex | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type PatientInput = Pick<Patient, 'first_name' | 'last_name' | 'date_of_birth' | 'sex' | 'phone' | 'email' | 'address' | 'city'>;

export interface PatientMedical {
  patient_id: string;
  clinic_id: string;
  allergies: string | null;
  medical_history: string | null;
  dental_history: string | null;
  notes: string | null;
  updated_at: string;
}

export type MedicalInput = Pick<PatientMedical, 'allergies' | 'medical_history' | 'dental_history' | 'notes'>;

export interface PatientEntry {
  id: string;
  clinic_id: string;
  patient_id: string;
  entry_date: string;
  tooth: number | null;
  diagnosis: string | null;
  treatment: string | null;
  note: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  author: { full_name: string } | null;
}

export type EntryInput = Pick<PatientEntry, 'entry_date' | 'tooth' | 'diagnosis' | 'treatment' | 'note'>;

/** FDI oznake: stalni zubi 11–48, mliječni 51–85. */
export const FDI_PERMANENT: number[] = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => q * 10 + t));
export const FDI_DECIDUOUS: number[] = [5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((t) => q * 10 + t));
