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
  timezone: string;
  currency: Currency;
  online_booking: boolean;
  working_hours: WorkingHours;
}

export type Currency = 'KM' | 'EUR' | 'RSD';
export const CURRENCIES: Currency[] = ['KM', 'EUR', 'RSD'];
/** Radno vrijeme po danu u sedmici ("0" = nedjelja … "6" = subota). Dan bez ključa je neradni. */
export type WorkingHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', [string, string]>>;

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
  profile: { full_name: string; email: string | null; phone: string | null; avatar_url: string | null } | null;
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
  patient_id: string | null;
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
  user_id: string | null;
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

// ---------- Stanje zuba ----------
export type ToothCondition = 'zdrav' | 'nedostaje' | 'krunica' | 'implantat';
export type SurfaceKey = 'M' | 'O' | 'D' | 'B' | 'L';
export type SurfaceMark = 'karijes' | 'ispun' | 'plan';
export const TOOTH_CONDITIONS: ToothCondition[] = ['zdrav', 'nedostaje', 'krunica', 'implantat'];
export const SURFACE_MARKS: SurfaceMark[] = ['karijes', 'ispun', 'plan'];

export interface ToothStatus {
  patient_id: string;
  clinic_id: string;
  tooth: number;
  condition: ToothCondition;
  endo: boolean;
  surfaces: Partial<Record<SurfaceKey, SurfaceMark>>;
  note: string | null;
  updated_at: string;
}

export type ToothInput = Pick<ToothStatus, 'condition' | 'endo' | 'surfaces' | 'note'>;

// ---------- Termini ----------
export type AppointmentStatus = 'zakazan' | 'potvrdjen' | 'stigao' | 'u_toku' | 'zavrsen' | 'otkazan' | 'nije_dosao';
export const APPOINTMENT_STATUSES: AppointmentStatus[] = ['zakazan', 'potvrdjen', 'stigao', 'u_toku', 'zavrsen', 'nije_dosao', 'otkazan'];
/** Termini koji zauzimaju vrijeme doktora. */
export const BUSY_STATUSES: AppointmentStatus[] = ['zakazan', 'potvrdjen', 'stigao', 'u_toku', 'zavrsen'];

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  service: string;
  note: string | null;
  status: AppointmentStatus;
  created_at: string;
  booked_online: boolean;
  patient: { first_name: string; last_name: string; card_number: number; phone: string | null } | null;
  doctor: { full_name: string } | null;
}

export interface AppointmentInput {
  patient_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  service: string;
  note: string | null;
}

// ---------- Cjenovnik ----------
export interface Service {
  id: string;
  clinic_id: string;
  name: string;
  price: number;
  duration_min: number;
  is_active: boolean;
  online: boolean;
}
export type ServiceInput = Pick<Service, 'name' | 'price' | 'duration_min' | 'is_active' | 'online'>;

// ---------- Plan terapije ----------
export type PlanStatus = 'nacrt' | 'poslan' | 'prihvacen' | 'odbijen' | 'zavrsen';

export interface PlanItem {
  id: string;
  plan_id: string;
  service_id: string | null;
  tooth: number | null;
  description: string;
  unit_price: number;
  qty: number;
  position: number;
  done_at: string | null;
  created_at: string;
}
export type PlanItemInput = Pick<PlanItem, 'service_id' | 'tooth' | 'description' | 'unit_price' | 'qty'>;

export interface TreatmentPlan {
  id: string;
  clinic_id: string;
  patient_id: string;
  title: string;
  note: string | null;
  discount_pct: number;
  valid_until: string | null;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  responded_at: string | null;
  responded_by: string | null;
  items: PlanItem[];
}
export type PlanInput = Pick<TreatmentPlan, 'title' | 'note' | 'discount_pct' | 'valid_until'>;

// ---------- Uplate ----------
export type PaymentMethod = 'gotovina' | 'kartica' | 'prenos';
export const PAYMENT_METHODS: PaymentMethod[] = ['gotovina', 'kartica', 'prenos'];

export interface Payment {
  id: string;
  clinic_id: string;
  patient_id: string;
  plan_id: string | null;
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  patient?: { first_name: string; last_name: string; card_number: number } | null;
}
export interface PaymentInput {
  patient_id: string;
  plan_id: string | null;
  amount: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
}

export interface Balance {
  patient_id: string;
  clinic_id: string;
  charged: number;
  paid: number;
  balance: number;
}

// ---------- Novosti i savjeti ----------
export type PostKind = 'novost' | 'savjet';
export interface Post {
  id: string;
  clinic_id: string;
  kind: PostKind;
  title: string;
  body: string;
  image_url: string | null;
  valid_until: string | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export type PostInput = Pick<Post, 'kind' | 'title' | 'body' | 'image_url' | 'valid_until' | 'is_published'>;

// ---------- Aplikacija za pacijente ----------
export interface Doctor {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  specialty: string | null;
  role: Role;
}

export interface MyAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  service: string;
  status: AppointmentStatus;
  doctor_id: string;
  doctor_name: string | null;
  booked_online: boolean;
}

export interface MyTooth {
  tooth: number;
  condition: ToothCondition;
  endo: boolean;
  surfaces: Partial<Record<SurfaceKey, SurfaceMark>>;
}
