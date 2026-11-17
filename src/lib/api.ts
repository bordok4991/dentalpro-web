import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  Clinic,
  EntryInput,
  Invite,
  Locale,
  MedicalInput,
  Member,
  Membership,
  Patient,
  PatientEntry,
  PatientInput,
  PatientMedical,
  Profile,
  Role,
  ToothInput,
  ToothStatus,
} from './types';

/**
 * Sve što aplikacija radi s bazom je ovdje, na jednom mjestu.
 * Klijent se prosljeđuje spolja, pa isti kod koriste i ekrani i testovi.
 */
export function makeApi(sb: SupabaseClient) {
  return {
    async profile(userId: string): Promise<Profile | null> {
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, phone, email, locale, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },

    async updateProfile(userId: string, patch: { full_name?: string; phone?: string | null; locale?: Locale }) {
      const { error } = await sb.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
    },

    /** Ordinacije u kojima je korisnik aktivan član. */
    async memberships(userId: string): Promise<Membership[]> {
      const { data, error } = await sb
        .from('clinic_members')
        .select('role, clinic:clinics(*)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as { role: Role; clinic: Clinic | null }[];
      return rows.filter((r) => r.clinic !== null).map((r) => ({ role: r.role, clinic: r.clinic as Clinic }));
    },

    async registerClinic(input: { name: string; doctorName?: string; city?: string; phone?: string; email?: string }): Promise<string> {
      const { data, error } = await sb.rpc('register_clinic', {
        p_name: input.name,
        p_doctor_name: input.doctorName || null,
        p_city: input.city || null,
        p_phone: input.phone || null,
        p_email: input.email || null,
      });
      if (error) throw error;
      return data as string;
    },

    async updateClinic(
      clinicId: string,
      patch: Partial<Pick<Clinic, 'name' | 'doctor_name' | 'address' | 'city' | 'phone' | 'email' | 'primary_color' | 'accent_color'>>,
    ): Promise<Clinic> {
      const { data, error } = await sb.from('clinics').update(patch).eq('id', clinicId).select('*').single();
      if (error) throw error;
      return data as Clinic;
    },

    async members(clinicId: string): Promise<Member[]> {
      const { data, error } = await sb
        .from('clinic_members')
        .select('id, user_id, role, specialty, is_active, created_at, profile:profiles(full_name, email, phone)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },

    async updateMember(memberId: string, patch: { role?: Role; specialty?: string | null; is_active?: boolean }) {
      const { data, error } = await sb.from('clinic_members').update(patch).eq('id', memberId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    async removeMember(memberId: string) {
      const { data, error } = await sb.from('clinic_members').delete().eq('id', memberId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    /** Pozivnice vidi samo vlasnik; ostalima baza vraća prazan spisak. */
    async invites(clinicId: string): Promise<Invite[]> {
      const { data, error } = await sb
        .from('clinic_invites')
        .select('id, clinic_id, email, role, specialty, token, expires_at, accepted_at, created_at')
        .eq('clinic_id', clinicId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },

    async createInvite(input: { clinicId: string; email: string; role: Role; specialty?: string }): Promise<Invite> {
      const { data, error } = await sb
        .from('clinic_invites')
        .insert({
          clinic_id: input.clinicId,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          specialty: input.specialty?.trim() || null,
        })
        .select('id, clinic_id, email, role, specialty, token, expires_at, accepted_at, created_at')
        .single();
      if (error) throw error;
      return data as Invite;
    },

    async revokeInvite(inviteId: string) {
      const { data, error } = await sb.from('clinic_invites').delete().eq('id', inviteId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    // ---------- Pacijenti ----------

    /** Spisak pacijenata; pretraga po imenu, prezimenu, telefonu, emailu ili broju kartona. */
    async patients(clinicId: string, opts: { query?: string; archived?: boolean; limit?: number } = {}): Promise<{ rows: Patient[]; more: boolean }> {
      const limit = opts.limit ?? 100;
      let q = sb
        .from('patients')
        .select(PATIENT_COLS)
        .eq('clinic_id', clinicId)
        .eq('is_archived', !!opts.archived)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(limit + 1);
      for (const term of searchTerms(opts.query ?? '')) {
        q = /^\d+$/.test(term) ? q.or(`search_key.ilike.*${term}*,card_number.eq.${term}`) : q.ilike('search_key', `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Patient[];
      return { rows: rows.slice(0, limit), more: rows.length > limit };
    },

    async patientCount(clinicId: string): Promise<number> {
      const { count, error } = await sb.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_archived', false);
      if (error) throw error;
      return count ?? 0;
    },

    async patient(id: string): Promise<Patient | null> {
      const { data, error } = await sb.from('patients').select(PATIENT_COLS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Patient | null;
    },

    async createPatient(clinicId: string, input: PatientInput): Promise<Patient> {
      const { data, error } = await sb
        .from('patients')
        .insert({ clinic_id: clinicId, ...cleanPatient(input) })
        .select(PATIENT_COLS)
        .single();
      if (error) throw error;
      return data as Patient;
    },

    async updatePatient(id: string, patch: Partial<PatientInput> & { is_archived?: boolean }): Promise<Patient> {
      // Šalju se samo kolone koje korisnik smije mijenjati.
      const body: Record<string, unknown> = 'first_name' in patch ? cleanPatient(patch as PatientInput) : {};
      if (typeof patch.is_archived === 'boolean') body.is_archived = patch.is_archived;
      const { data, error } = await sb.from('patients').update(body).eq('id', id).select(PATIENT_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as Patient;
    },

    async medical(patientId: string): Promise<PatientMedical | null> {
      const { data, error } = await sb
        .from('patient_medical')
        .select('patient_id, clinic_id, allergies, medical_history, dental_history, notes, updated_at')
        .eq('patient_id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data as PatientMedical | null;
    },

    async saveMedical(clinicId: string, patientId: string, input: MedicalInput): Promise<PatientMedical> {
      const body = {
        patient_id: patientId,
        clinic_id: clinicId,
        allergies: blank(input.allergies),
        medical_history: blank(input.medical_history),
        dental_history: blank(input.dental_history),
        notes: blank(input.notes),
      };
      const { data, error } = await sb
        .from('patient_medical')
        .upsert(body, { onConflict: 'patient_id' })
        .select('patient_id, clinic_id, allergies, medical_history, dental_history, notes, updated_at')
        .single();
      if (error) throw error;
      return data as PatientMedical;
    },

    async entries(patientId: string): Promise<PatientEntry[]> {
      const { data, error } = await sb
        .from('patient_entries')
        .select(ENTRY_COLS)
        .eq('patient_id', patientId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PatientEntry[];
    },

    // ---------- Stanje zuba ----------

    async teeth(patientId: string): Promise<ToothStatus[]> {
      const { data, error } = await sb.from('tooth_status').select(TOOTH_COLS).eq('patient_id', patientId);
      if (error) throw error;
      return (data ?? []) as ToothStatus[];
    },

    async saveTooth(clinicId: string, patientId: string, tooth: number, input: ToothInput): Promise<ToothStatus> {
      const surfaces = input.condition === 'nedostaje' ? {} : input.surfaces;
      const { data, error } = await sb
        .from('tooth_status')
        .upsert(
          {
            clinic_id: clinicId,
            patient_id: patientId,
            tooth,
            condition: input.condition,
            endo: input.condition === 'nedostaje' ? false : input.endo,
            surfaces,
            note: blank(input.note),
          },
          { onConflict: 'patient_id,tooth' },
        )
        .select(TOOTH_COLS)
        .single();
      if (error) throw error;
      return data as ToothStatus;
    },

    // ---------- Termini ----------

    /** Termini ordinacije koji počinju u zadatom periodu [od, do). */
    async appointments(clinicId: string, fromIso: string, toIso: string): Promise<Appointment[]> {
      const { data, error } = await sb
        .from('appointments')
        .select(APPT_COLS)
        .eq('clinic_id', clinicId)
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Appointment[];
    },

    /** Naredni termini jednog pacijenta (bez otkazanih). */
    async upcomingFor(patientId: string, limit = 5): Promise<Appointment[]> {
      const { data, error } = await sb
        .from('appointments')
        .select(APPT_COLS)
        .eq('patient_id', patientId)
        .gte('ends_at', new Date().toISOString())
        .not('status', 'in', '(otkazan,nije_dosao)')
        .order('starts_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Appointment[];
    },

    async createAppointment(clinicId: string, input: AppointmentInput): Promise<Appointment> {
      const { data, error } = await sb
        .from('appointments')
        .insert({ clinic_id: clinicId, ...cleanAppointment(input) })
        .select(APPT_COLS)
        .single();
      if (error) throw error;
      return data as unknown as Appointment;
    },

    async updateAppointment(id: string, patch: Partial<AppointmentInput> & { status?: AppointmentStatus }): Promise<Appointment> {
      const body: Record<string, unknown> = 'service' in patch ? cleanAppointment(patch as AppointmentInput) : {};
      if (patch.status) body.status = patch.status;
      const { data, error } = await sb.from('appointments').update(body).eq('id', id).select(APPT_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as unknown as Appointment;
    },

    async addEntry(clinicId: string, patientId: string, input: EntryInput): Promise<PatientEntry> {
      const { data, error } = await sb
        .from('patient_entries')
        .insert({ clinic_id: clinicId, patient_id: patientId, ...cleanEntry(input) })
        .select(ENTRY_COLS)
        .single();
      if (error) throw error;
      return data as unknown as PatientEntry;
    },

    async updateEntry(id: string, input: EntryInput): Promise<PatientEntry> {
      const { data, error } = await sb.from('patient_entries').update(cleanEntry(input)).eq('id', id).select(ENTRY_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as unknown as PatientEntry;
    },

    /** Vraća id ordinacije kojoj se korisnik pridružio. */
    async acceptInvite(token: string): Promise<string> {
      const { data, error } = await sb.rpc('accept_invite', { p_token: token });
      if (error) throw error;
      return data as string;
    },
  };
}

export type Api = ReturnType<typeof makeApi>;

const PATIENT_COLS =
  'id, clinic_id, card_number, first_name, last_name, date_of_birth, sex, phone, email, address, city, is_archived, created_at, updated_at';
const ENTRY_COLS =
  'id, clinic_id, patient_id, entry_date, tooth, diagnosis, treatment, note, author_id, created_at, updated_at, author:profiles!patient_entries_author_id_fkey(full_name)';

function blank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

function cleanPatient(p: PatientInput) {
  return {
    first_name: p.first_name.trim(),
    last_name: p.last_name.trim(),
    date_of_birth: blank(p.date_of_birth),
    sex: p.sex || null,
    phone: blank(p.phone),
    email: blank(p.email)?.toLowerCase() ?? null,
    address: blank(p.address),
    city: blank(p.city),
  };
}

function cleanEntry(e: EntryInput) {
  return { entry_date: e.entry_date, tooth: e.tooth ?? null, diagnosis: blank(e.diagnosis), treatment: blank(e.treatment), note: blank(e.note) };
}

/** Isto pravilo kao ključ pretrage u bazi: mala slova, bez kvačica. */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'd');
}

/** Riječi pretrage, očišćene od znakova koji imaju posebno značenje u upitu. */
export function searchTerms(q: string): string[] {
  return normalizeSearch(q)
    .replace(/[,()*%\\:"'.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/** Iz zalijepljenog linka ili samog koda izvlači kod pozivnice. */
export function parseInviteToken(input: string): string | null {
  const m = input.trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

export function inviteLink(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/invite/${token}`;
}

const TOOTH_COLS = 'patient_id, clinic_id, tooth, condition, endo, surfaces, note, updated_at';
const APPT_COLS =
  'id, clinic_id, patient_id, doctor_id, starts_at, ends_at, service, note, status, created_at, patient:patients(first_name, last_name, card_number, phone), doctor:profiles!appointments_doctor_id_fkey(full_name)';

function cleanAppointment(a: AppointmentInput) {
  return {
    patient_id: a.patient_id,
    doctor_id: a.doctor_id,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    service: a.service.trim(),
    note: blank(a.note),
  };
}
