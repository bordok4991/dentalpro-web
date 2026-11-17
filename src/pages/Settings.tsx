import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import { LOCALES, type Clinic, type Locale } from '../lib/types';
import { Button, Field, Notice, SelectField } from '../components/ui';

export function Settings() {
  const { t } = useI18n();
  const { current } = useSession();
  if (!current) return null;
  return (
    <>
      <header className="page-head">
        <h1>{t('settings.title')}</h1>
      </header>
      <ProfileForm />
      {current.role === 'owner' ? (
        <ClinicForm key={current.clinic.id} clinic={current.clinic} />
      ) : (
        current.role !== 'patient' && (
          <section className="block">
            <h2>{t('settings.clinic')}</h2>
            <p className="muted">{t('settings.ownerOnly')}</p>
          </section>
        )
      )}
    </>
  );
}

function ProfileForm() {
  const { t, locale, setLocale } = useI18n();
  const { profile, user, refresh } = useSession();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [lang, setLang] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMsg(null);
    setBusy(true);
    try {
      await api.updateProfile(user.id, { full_name: fullName.trim(), phone: phone.trim() || null, locale: lang });
      setLocale(lang);
      await refresh();
      setMsg({ kind: 'ok', key: 'settings.profileSaved' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="block" onSubmit={submit}>
      <h2>{t('settings.profile')}</h2>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}
      <div className="grid-2">
        <Field label={t('auth.fullName')} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Field label={t('auth.phoneOptional')} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <SelectField label={t('settings.language')} value={lang} onChange={(e) => setLang(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </SelectField>
        <Field label={t('settings.loginEmail')} value={user?.email ?? ''} readOnly />
      </div>
      <Button type="submit" busy={busy}>
        {t('settings.saveProfile')}
      </Button>
    </form>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="color">
        <input type="color" aria-label={label} value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input aria-label={`${label} (#RRGGBB)`} value={value} maxLength={7} spellCheck={false} onChange={(e) => onChange(e.target.value.trim())} />
      </div>
    </div>
  );
}

function ClinicForm({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n();
  const { refresh } = useSession();
  const [f, setF] = useState({
    name: clinic.name,
    doctor_name: clinic.doctor_name ?? '',
    address: clinic.address ?? '',
    city: clinic.city ?? '',
    phone: clinic.phone ?? '',
    email: clinic.email ?? '',
    primary_color: clinic.primary_color,
    accent_color: clinic.accent_color,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (f.name.trim().length < 2) return setMsg({ kind: 'error', key: 'err.clinicName' });
    if (!HEX.test(f.primary_color) || !HEX.test(f.accent_color)) return setMsg({ kind: 'error', key: 'err.color' });
    setBusy(true);
    try {
      await api.updateClinic(clinic.id, {
        name: f.name.trim(),
        doctor_name: f.doctor_name.trim() || null,
        address: f.address.trim() || null,
        city: f.city.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        primary_color: f.primary_color.toUpperCase(),
        accent_color: f.accent_color.toUpperCase(),
      });
      await refresh();
      setMsg({ kind: 'ok', key: 'settings.clinicSaved' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="block" onSubmit={submit}>
      <h2>{t('settings.clinic')}</h2>
      <p className="lead">{t('settings.clinicLead')}</p>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}
      <div className="grid-2">
        <Field label={t('clinic.name')} required value={f.name} onChange={(e) => set('name')(e.target.value)} />
        <Field label={t('clinic.doctorName')} value={f.doctor_name} onChange={(e) => set('doctor_name')(e.target.value)} />
        <Field label={t('clinic.address')} autoComplete="street-address" value={f.address} onChange={(e) => set('address')(e.target.value)} />
        <Field label={t('clinic.city')} autoComplete="address-level2" value={f.city} onChange={(e) => set('city')(e.target.value)} />
        <Field label={t('clinic.phone')} type="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
        <Field label={t('clinic.email')} type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} />
        <ColorField label={t('settings.primaryColor')} value={f.primary_color} onChange={set('primary_color')} />
        <ColorField label={t('settings.accentColor')} value={f.accent_color} onChange={set('accent_color')} />
      </div>
      <Button type="submit" busy={busy}>
        {t('settings.saveClinic')}
      </Button>
    </form>
  );
}
