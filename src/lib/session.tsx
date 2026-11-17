import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { makeApi } from './api';
import { useI18n } from './i18n';
import { LOCALES, type Membership, type Profile } from './types';

export const api = makeApi(supabase);

const CLINIC_KEY = 'dp.clinic';
const INVITE_KEY = 'dp.invite';

/** Pozivnica koju je korisnik otvorio prije prijave čeka ovdje dok se ne prijavi. */
export const pendingInvite = {
  get(): string | null {
    try {
      return sessionStorage.getItem(INVITE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(INVITE_KEY, token);
    } catch {
      /* bez pohrane */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(INVITE_KEY);
    } catch {
      /* bez pohrane */
    }
  },
};

interface SessionState {
  /** undefined dok se sesija još provjerava */
  session: Session | null | undefined;
  user: User | null;
  profile: Profile | null;
  /** null dok se podaci učitavaju */
  memberships: Membership[] | null;
  current: Membership | null;
  loadError: unknown;
  selectClinic: (clinicId: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useI18n();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [clinicId, setClinicId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLINIC_KEY);
    } catch {
      return null;
    }
  });
  const localeApplied = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    // U ovom callbacku se samo postavlja stanje; upiti idu iz efekta ispod.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const [p, m] = await Promise.all([api.profile(userId), api.memberships(userId)]);
      setProfile(p);
      setMemberships(m);
      // Jezik iz profila važi jednom po prijavi; dalje ga mijenja korisnik.
      if (p && LOCALES.includes(p.locale) && localeApplied.current !== userId) {
        localeApplied.current = userId;
        setLocale(p.locale);
      }
    } catch (e) {
      setLoadError(e);
    }
  }, [userId, setLocale]);

  useEffect(() => {
    if (session === undefined) return;
    if (!userId) {
      setProfile(null);
      setMemberships(null);
      localeApplied.current = null;
      return;
    }
    setMemberships(null);
    void load();
  }, [session === undefined, userId, load]);

  const selectClinic = useCallback((id: string) => {
    setClinicId(id);
    try {
      localStorage.setItem(CLINIC_KEY, id);
    } catch {
      /* bez pohrane */
    }
  }, []);

  const signOut = useCallback(async () => {
    pendingInvite.clear();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<SessionState>(() => {
    const current = memberships?.find((m) => m.clinic.id === clinicId) ?? memberships?.[0] ?? null;
    return {
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      current,
      loadError,
      selectClinic,
      refresh: load,
      signOut,
    };
  }, [session, profile, memberships, clinicId, loadError, selectClinic, load, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession izvan SessionProvider');
  return v;
}
