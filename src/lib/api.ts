import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  Balance,
  Clinic,
  Doctor,
  MyAppointment,
  MessageInput,
  MyTooth,
  Payment,
  PatientMessage,
  PaymentInput,
  PlanInput,
  PlanItem,
  PlanItemInput,
  PlanStatus,
  Post,
  PostInput,
  PostKind,
  Service,
  ServiceInput,
  TreatmentPlan,
  EntryInput,
  Invite,
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
        .select('id, full_name, phone, email, locale, avatar_url, bio, education, photo_url')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },

    async updateProfile(
      userId: string,
      patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'locale' | 'avatar_url' | 'bio' | 'education' | 'photo_url'>>,
    ) {
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
      patch: Partial<
        Pick<
          Clinic,
          | 'name'
          | 'doctor_name'
          | 'address'
          | 'city'
          | 'phone'
          | 'email'
          | 'primary_color'
          | 'accent_color'
          | 'logo_url'
          | 'currency'
          | 'online_booking'
          | 'working_hours'
          | 'about'
          | 'cover_url'
        >
      >,
    ): Promise<Clinic> {
      const { data, error } = await sb.from('clinics').update(patch).eq('id', clinicId).select('*').single();
      if (error) throw error;
      return data as Clinic;
    },

    async members(clinicId: string): Promise<Member[]> {
      const { data, error } = await sb
        .from('clinic_members')
        .select('id, user_id, role, specialty, is_active, created_at, profile:profiles(full_name, email, phone, avatar_url)')
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
        .select(INVITE_COLS)
        .eq('clinic_id', clinicId)
        .is('patient_id', null)
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
        .select(INVITE_COLS)
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

    // ---------- Cjenovnik ----------

    async services(clinicId: string): Promise<Service[]> {
      const { data, error } = await sb.from('services').select(SERVICE_COLS).eq('clinic_id', clinicId).order('name');
      if (error) throw error;
      return (data ?? []) as Service[];
    },

    async saveService(clinicId: string, input: ServiceInput, id?: string): Promise<Service> {
      const body = {
        name: input.name.trim(),
        price: round2(input.price),
        duration_min: input.duration_min,
        is_active: input.is_active,
        online: input.online,
      };
      const q = id
        ? sb.from('services').update(body).eq('id', id).select(SERVICE_COLS)
        : sb.from('services').insert({ clinic_id: clinicId, ...body }).select(SERVICE_COLS);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as Service;
    },

    // ---------- Plan terapije ----------

    async plans(patientId: string): Promise<TreatmentPlan[]> {
      const { data, error } = await sb
        .from('treatment_plans')
        .select(PLAN_COLS)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as TreatmentPlan[]).map(sortItems);
    },

    async plan(id: string): Promise<TreatmentPlan | null> {
      const { data, error } = await sb.from('treatment_plans').select(PLAN_COLS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? sortItems(data as unknown as TreatmentPlan) : null;
    },

    async createPlan(clinicId: string, patientId: string, title: string): Promise<TreatmentPlan> {
      const { data, error } = await sb
        .from('treatment_plans')
        .insert({ clinic_id: clinicId, patient_id: patientId, title: title.trim() })
        .select(PLAN_COLS)
        .single();
      if (error) throw error;
      return sortItems(data as unknown as TreatmentPlan);
    },

    async updatePlan(id: string, patch: Partial<PlanInput> & { status?: PlanStatus }): Promise<TreatmentPlan> {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title.trim();
      if (patch.note !== undefined) body.note = blank(patch.note);
      if (patch.discount_pct !== undefined) body.discount_pct = patch.discount_pct;
      if (patch.valid_until !== undefined) body.valid_until = patch.valid_until || null;
      if (patch.status) body.status = patch.status;
      const { data, error } = await sb.from('treatment_plans').update(body).eq('id', id).select(PLAN_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return sortItems(data[0] as unknown as TreatmentPlan);
    },

    async deletePlan(id: string) {
      const { data, error } = await sb.from('treatment_plans').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    async addPlanItem(plan: Pick<TreatmentPlan, 'id' | 'clinic_id' | 'patient_id'>, input: PlanItemInput, position: number): Promise<PlanItem> {
      const { data, error } = await sb
        .from('plan_items')
        .insert({ plan_id: plan.id, clinic_id: plan.clinic_id, patient_id: plan.patient_id, position, ...cleanItem(input) })
        .select(ITEM_COLS)
        .single();
      if (error) throw error;
      return data as PlanItem;
    },

    async updatePlanItem(id: string, input: PlanItemInput): Promise<PlanItem> {
      const { data, error } = await sb.from('plan_items').update(cleanItem(input)).eq('id', id).select(ITEM_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as PlanItem;
    },

    async setItemDone(id: string, done: boolean): Promise<PlanItem> {
      const { data, error } = await sb
        .from('plan_items')
        .update({ done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
        .select(ITEM_COLS);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as PlanItem;
    },

    async deletePlanItem(id: string) {
      const { data, error } = await sb.from('plan_items').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    /** Pacijent prihvata ili odbija poslani plan. */
    async respondPlan(id: string, accept: boolean) {
      const { error } = await sb.rpc('respond_plan', { p_plan: id, p_accept: accept });
      if (error) throw error;
    },

    // ---------- Uplate ----------

    /** Uplate ordinacije u periodu [od, do] (datumi YYYY-MM-DD). */
    async payments(clinicId: string, fromDay: string, toDay: string): Promise<Payment[]> {
      const { data, error } = await sb
        .from('payments')
        .select(PAYMENT_COLS + ', patient:patients(first_name, last_name, card_number)')
        .eq('clinic_id', clinicId)
        .gte('paid_on', fromDay)
        .lte('paid_on', toDay)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },

    async patientPayments(patientId: string): Promise<Payment[]> {
      const { data, error } = await sb
        .from('payments')
        .select(PAYMENT_COLS)
        .eq('patient_id', patientId)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },

    async createPayment(clinicId: string, input: PaymentInput): Promise<Payment> {
      const { data, error } = await sb
        .from('payments')
        .insert({
          clinic_id: clinicId,
          patient_id: input.patient_id,
          plan_id: input.plan_id,
          amount: round2(input.amount),
          method: input.method,
          paid_on: input.paid_on,
          note: blank(input.note),
        })
        .select(PAYMENT_COLS + ', patient:patients(first_name, last_name, card_number)')
        .single();
      if (error) throw error;
      return data as unknown as Payment;
    },

    async voidPayment(id: string, reason: string): Promise<Payment> {
      const { data, error } = await sb
        .from('payments')
        .update({ void_reason: reason.trim() })
        .eq('id', id)
        .select(PAYMENT_COLS + ', patient:patients(first_name, last_name, card_number)');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as unknown as Payment;
    },

    async balance(patientId: string): Promise<Balance | null> {
      const { data, error } = await sb.from('patient_balances').select('*').eq('patient_id', patientId).maybeSingle();
      if (error) throw error;
      return data as Balance | null;
    },

    /** Pacijenti s neplaćenim urađenim uslugama, najveći dug prvi. */
    async debts(clinicId: string): Promise<(Balance & { patient: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'card_number'> })[]> {
      const { data, error } = await sb
        .from('patient_balances')
        .select('*')
        .eq('clinic_id', clinicId)
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as Balance[];
      if (rows.length === 0) return [];
      const { data: ps, error: e2 } = await sb
        .from('patients')
        .select('id, first_name, last_name, card_number')
        .in('id', rows.map((r) => r.patient_id));
      if (e2) throw e2;
      const byId = new Map((ps ?? []).map((p) => [p.id as string, p as Pick<Patient, 'id' | 'first_name' | 'last_name' | 'card_number'>]));
      return rows.filter((r) => byId.has(r.patient_id)).map((r) => ({ ...r, patient: byId.get(r.patient_id)! }));
    },

    // ---------- Novosti i savjeti ----------

    async posts(clinicId: string, opts: { kind?: PostKind; publishedOnly?: boolean } = {}): Promise<Post[]> {
      let q = sb.from('clinic_posts').select(POST_COLS).eq('clinic_id', clinicId);
      if (opts.kind) q = q.eq('kind', opts.kind);
      if (opts.publishedOnly) q = q.eq('is_published', true);
      const { data, error } = await q.order('published_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Post[];
    },

    async post(id: string): Promise<Post | null> {
      const { data, error } = await sb.from('clinic_posts').select(POST_COLS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Post | null;
    },

    async savePost(clinicId: string, input: PostInput, id?: string): Promise<Post> {
      const body = {
        kind: input.kind,
        title: input.title.trim(),
        body: input.body.trim(),
        image_url: input.image_url || null,
        video_url: input.video_url?.trim() || null,
        valid_until: input.kind === 'novost' ? input.valid_until || null : null,
        is_published: input.is_published,
      };
      const q = id
        ? sb.from('clinic_posts').update(body).eq('id', id).select(POST_COLS)
        : sb.from('clinic_posts').insert({ clinic_id: clinicId, ...body }).select(POST_COLS);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
      return data[0] as Post;
    },

    async deletePost(id: string) {
      const { data, error } = await sb.from('clinic_posts').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    // ---------- Lični savjeti i poruke doktora ----------

    async messages(patientId: string): Promise<PatientMessage[]> {
      const { data, error } = await sb
        .from('patient_messages')
        .select(MESSAGE_COLS)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PatientMessage[];
    },

    async message(id: string): Promise<PatientMessage | null> {
      const { data, error } = await sb.from('patient_messages').select(MESSAGE_COLS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as PatientMessage | null;
    },

    async sendMessage(clinicId: string, patientId: string, input: MessageInput): Promise<PatientMessage> {
      const { data, error } = await sb
        .from('patient_messages')
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          kind: input.kind,
          title: input.title.trim(),
          body: input.body.trim(),
          video_url: input.video_url?.trim() || null,
        })
        .select(MESSAGE_COLS)
        .single();
      if (error) throw error;
      return data as PatientMessage;
    },

    async deleteMessage(id: string) {
      const { data, error } = await sb.from('patient_messages').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('NOT_ALLOWED');
    },

    async markMessageRead(id: string) {
      const { error } = await sb.rpc('mark_message_read', { p_id: id });
      if (error) throw error;
    },

    // ---------- Pacijentski nalog ----------

    async patientInvite(patientId: string): Promise<Invite | null> {
      const { data, error } = await sb
        .from('clinic_invites')
        .select(INVITE_COLS)
        .eq('patient_id', patientId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as Invite | undefined) ?? null;
    },

    async invitePatient(clinicId: string, patientId: string, email: string): Promise<Invite> {
      const { data, error } = await sb
        .from('clinic_invites')
        .insert({ clinic_id: clinicId, patient_id: patientId, email: email.trim().toLowerCase(), role: 'patient' })
        .select(INVITE_COLS)
        .single();
      if (error) throw error;
      return data as Invite;
    },

    async unlinkPatient(patientId: string) {
      const { error } = await sb.rpc('unlink_patient_account', { p_patient: patientId });
      if (error) throw error;
    },

    // ---------- Aplikacija za pacijente ----------

    async myPatient(clinicId: string, userId: string): Promise<Patient | null> {
      const { data, error } = await sb.from('patients').select(PATIENT_COLS).eq('clinic_id', clinicId).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data as Patient | null;
    },

    async clinicDoctors(clinicId: string): Promise<Doctor[]> {
      const { data, error } = await sb.rpc('clinic_doctors', { p_clinic: clinicId });
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },

    async myTeeth(clinicId: string): Promise<MyTooth[]> {
      const { data, error } = await sb.rpc('my_teeth', { p_clinic: clinicId });
      if (error) throw error;
      return (data ?? []) as MyTooth[];
    },

    async myAppointments(clinicId: string): Promise<MyAppointment[]> {
      const { data, error } = await sb.rpc('my_appointments', { p_clinic: clinicId });
      if (error) throw error;
      return (data ?? []) as MyAppointment[];
    },

    /** Termini pacijenta onako kako ih on vidi (za osoblje u pregledu "kao pacijent"). */
    async appointmentsAsPatient(patientId: string): Promise<MyAppointment[]> {
      const since = new Date(Date.now() - 2 * 365 * 86400_000).toISOString();
      const { data, error } = await sb
        .from('appointments')
        .select('id, starts_at, ends_at, service, status, doctor_id, booked_online, doctor:profiles!appointments_doctor_id_fkey(full_name)')
        .eq('patient_id', patientId)
        .gt('starts_at', since)
        .order('starts_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as (Omit<MyAppointment, 'doctor_name'> & { doctor: { full_name: string } | null })[]).map(
        ({ doctor, ...a }) => ({ ...a, doctor_name: doctor?.full_name ?? null }),
      );
    },

    async slots(clinicId: string, doctorId: string, day: string, minutes: number): Promise<string[]> {
      const { data, error } = await sb.rpc('available_slots', { p_clinic: clinicId, p_doctor: doctorId, p_day: day, p_minutes: minutes });
      if (error) throw error;
      return ((data ?? []) as (string | { available_slots: string })[]).map((x) => (typeof x === 'string' ? x : x.available_slots));
    },

    async book(input: { clinicId: string; doctorId: string; serviceId: string; start: string; note: string | null }): Promise<string> {
      const { data, error } = await sb.rpc('book_appointment', {
        p_clinic: input.clinicId,
        p_doctor: input.doctorId,
        p_service: input.serviceId,
        p_start: input.start,
        p_note: blank(input.note),
      });
      if (error) throw error;
      return data as string;
    },

    async cancelMyAppointment(id: string) {
      const { error } = await sb.rpc('cancel_my_appointment', { p_id: id });
      if (error) throw error;
    },

    async confirmMyAppointment(id: string) {
      const { error } = await sb.rpc('confirm_my_appointment', { p_id: id });
      if (error) throw error;
    },

    /** Nedavna online zakazivanja koja čekaju da ih ordinacija vidi. */
    async recentOnline(clinicId: string): Promise<Appointment[]> {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await sb
        .from('appointments')
        .select(APPT_COLS)
        .eq('clinic_id', clinicId)
        .eq('booked_online', true)
        .gte('created_at', since)
        .gte('starts_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as Appointment[];
    },

    // ---------- Slike ----------

    /** Postavlja sliku u javni bucket "media" i vraća njen javni link. */
    async uploadImage(path: string, blob: Blob): Promise<string> {
      const body = await blob.arrayBuffer();
      const { error } = await sb.storage.from('media').upload(path, body, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
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
  'id, clinic_id, card_number, first_name, last_name, date_of_birth, sex, phone, email, address, city, is_archived, created_at, updated_at, user_id';
const INVITE_COLS = 'id, clinic_id, email, role, specialty, token, expires_at, accepted_at, created_at, patient_id';
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
  'id, clinic_id, patient_id, doctor_id, starts_at, ends_at, service, note, status, created_at, booked_online, patient:patients(first_name, last_name, card_number, phone), doctor:profiles!appointments_doctor_id_fkey(full_name)';

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

const SERVICE_COLS = 'id, clinic_id, name, price, duration_min, is_active, online';
const ITEM_COLS = 'id, plan_id, service_id, tooth, description, unit_price, qty, position, done_at, created_at';
const PLAN_COLS = `id, clinic_id, patient_id, title, note, discount_pct, valid_until, status, created_at, updated_at, sent_at, responded_at, responded_by, items:plan_items(${ITEM_COLS})`;
const PAYMENT_COLS = 'id, clinic_id, patient_id, plan_id, amount, method, paid_on, note, created_by, created_at, voided_at, void_reason';
const POST_COLS = 'id, clinic_id, kind, title, body, image_url, video_url, valid_until, is_published, published_at, created_by, created_at, updated_at';
const MESSAGE_COLS = 'id, clinic_id, patient_id, kind, title, body, video_url, created_by, created_at, read_at';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cleanItem(i: PlanItemInput) {
  return {
    service_id: i.service_id || null,
    tooth: i.tooth ?? null,
    description: i.description.trim(),
    unit_price: round2(i.unit_price),
    qty: i.qty,
  };
}

function sortItems(p: TreatmentPlan): TreatmentPlan {
  const items = [...(p.items ?? [])].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return { ...p, items };
}

/** Iznos stavke s popustom plana, zaokružen kao u bazi. */
export function itemAmount(item: Pick<PlanItem, 'unit_price' | 'qty'>, discountPct: number): number {
  return round2(item.unit_price * item.qty * (1 - discountPct / 100));
}

export function planTotals(plan: Pick<TreatmentPlan, 'items' | 'discount_pct'>) {
  const subtotal = round2(plan.items.reduce((s, i) => s + i.unit_price * i.qty, 0));
  const total = round2(plan.items.reduce((s, i) => s + itemAmount(i, plan.discount_pct), 0));
  const done = round2(plan.items.filter((i) => i.done_at).reduce((s, i) => s + itemAmount(i, plan.discount_pct), 0));
  return { subtotal, discount: round2(subtotal - total), total, done };
}

/** Nasumično ime fajla koje prihvata pravilo za postavljanje slika. */
export function imageName(ext: 'jpg' | 'png'): string {
  const rnd = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 24);
  return `${rnd}.${ext}`;
}
