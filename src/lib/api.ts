import type { SupabaseClient } from '@supabase/supabase-js';
import type { Clinic, Invite, Locale, Member, Membership, Profile, Role } from './types';

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

    /** Vraća id ordinacije kojoj se korisnik pridružio. */
    async acceptInvite(token: string): Promise<string> {
      const { data, error } = await sb.rpc('accept_invite', { p_token: token });
      if (error) throw error;
      return data as string;
    },
  };
}

export type Api = ReturnType<typeof makeApi>;

/** Iz zalijepljenog linka ili samog koda izvlači kod pozivnice. */
export function parseInviteToken(input: string): string | null {
  const m = input.trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

export function inviteLink(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/invite/${token}`;
}
