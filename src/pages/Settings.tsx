import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import { CURRENCIES, LOCALES, type Clinic, type Currency, type Locale, type WorkingHours } from '../lib/types';
import { Button, Field, Notice, SelectField, TextField } from '../components/ui';
import { ImageUpload } from '../components/ImageUpload';

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
        <>
          <ClinicForm key={current.clinic.id} clinic={current.clinic} />
          <HoursForm key={`h-${current.clinic.id}`} clinic={current.clinic} />
        </>
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

export function ProfileForm({ withPhoto = true }: { withPhoto?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const { profile, user, refresh, current } = useSession();
  const presents = withPhoto && !!current && ['owner', 'doctor', 'specialist'].includes(current.role);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [education, setEducation] = useState(profile?.education ?? '');
  const [lang, setLang] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setBio(profile?.bio ?? '');
    setEducation(profile?.education ?? '');
  }, [profile?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMsg(null);
    setBusy(true);
    try {
      await api.updateProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        locale: lang,
        ...(presents ? { bio: bio.trim() || null, education: education.trim() || null } : {}),
      });
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
      {withPhoto && user && (
        <ImageUpload
          label={t('settings.photo')}
          hint={t('settings.photoHint')}
          url={profile?.avatar_url ?? null}
          name={profile?.full_name || ''}
          folder={`users/${user.id}`}
          kind="photo"
          onChange={async (url) => {
            await api.updateProfile(user.id, { avatar_url: url });
            await refresh();
          }}
        />
      )}
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
      {presents && user && (
        <fieldset className="present">
          <legend>{t('settings.present')}</legend>
          <p className="hint">{t('settings.presentLead')}</p>
          <ImageUpload
            label={t('settings.bigPhoto')}
            hint={t('settings.bigPhotoHint')}
            url={profile?.photo_url ?? null}
            name={profile?.full_name || ''}
            folder={`users/${user.id}`}
            kind="cover"
            onChange={async (url) => {
              await api.updateProfile(user.id, { photo_url: url });
              await refresh();
            }}
          />
          <TextField label={t('settings.bio')} hint={t('settings.bioHint')} rows={4} maxLength={1500} value={bio} onChange={(e) => setBio(e.target.value)} />
          <TextField
            label={t('settings.education')}
            hint={t('settings.educationHint')}
            rows={5}
            maxLength={2000}
            value={education}
            onChange={(e) => setEducation(e.target.value)}
          />
        </fieldset>
      )}
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
    currency: clinic.currency,
    about: clinic.about ?? '',
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
        currency: f.currency as Currency,
        about: f.about.trim() || null,
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
      <ImageUpload
        label={t('settings.logo')}
        hint={t('settings.logoHint')}
        url={clinic.logo_url}
        name={clinic.name}
        folder={`clinics/${clinic.id}/logo`}
        kind="logo"
        onChange={async (url) => {
          await api.updateClinic(clinic.id, { logo_url: url });
          await refresh();
        }}
      />
      <div className="grid-2">
        <Field label={t('clinic.name')} required value={f.name} onChange={(e) => set('name')(e.target.value)} />
        <Field label={t('clinic.doctorName')} value={f.doctor_name} onChange={(e) => set('doctor_name')(e.target.value)} />
        <Field label={t('clinic.address')} autoComplete="street-address" value={f.address} onChange={(e) => set('address')(e.target.value)} />
        <Field label={t('clinic.city')} autoComplete="address-level2" value={f.city} onChange={(e) => set('city')(e.target.value)} />
        <Field label={t('clinic.phone')} type="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
        <Field label={t('clinic.email')} type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} />
        <ColorField label={t('settings.primaryColor')} value={f.primary_color} onChange={set('primary_color')} />
        <ColorField label={t('settings.accentColor')} value={f.accent_color} onChange={set('accent_color')} />
        <SelectField label={t('settings.currency')} value={f.currency} onChange={(e) => set('currency')(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={t('settings.clinicAbout')}
        hint={t('settings.clinicAboutHint')}
        rows={4}
        maxLength={2000}
        value={f.about}
        onChange={(e) => set('about')(e.target.value)}
      />
      <ImageUpload
        label={t('settings.cover')}
        hint={t('settings.coverHint')}
        url={clinic.cover_url}
        name={clinic.name}
        folder={`clinics/${clinic.id}/logo`}
        kind="cover"
        onChange={async (url) => {
          await api.updateClinic(clinic.id, { cover_url: url });
          await refresh();
        }}
      />
      <Button type="submit" busy={busy}>
        {t('settings.saveClinic')}
      </Button>
    </form>
  );
}

const DAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'] as const;

/** Radno vrijeme ordinacije i online zakazivanje za pacijente. */
function HoursForm({ clinic }: { clinic: Clinic }) {
  const { t } = useI18n();
  const { refresh } = useSession();
  const names = t('cal.weekdays').split('|');
  const [online, setOnline] = useState(clinic.online_booking);
  const [days, setDays] = useState(() =>
    Object.fromEntries(
      DAY_ORDER.map((d) => {
        const h = clinic.working_hours?.[d];
        return [d, { open: !!h, from: h?.[0] ?? '08:00', to: h?.[1] ?? '16:00' }];
      }),
    ) as Record<(typeof DAY_ORDER)[number], { open: boolean; from: string; to: string }>,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const hours: WorkingHours = {};
    for (const d of DAY_ORDER) {
      const v = days[d];
      if (!v.open) continue;
      if (!/^\d{2}:\d{2}$/.test(v.from) || !/^\d{2}:\d{2}$/.test(v.to) || v.from >= v.to) return setMsg({ kind: 'error', key: 'err.hours' });
      hours[d] = [v.from, v.to];
    }
    if (online && Object.keys(hours).length === 0) return setMsg({ kind: 'error', key: 'err.hoursEmpty' });
    setBusy(true);
    try {
      await api.updateClinic(clinic.id, { working_hours: hours, online_booking: online });
      await refresh();
      setMsg({ kind: 'ok', key: 'settings.hoursSaved' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="block" onSubmit={submit} noValidate>
      <h2>{t('settings.hours')}</h2>
      <p className="lead">{t('settings.hoursLead')}</p>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}
      <div className="hours">
        {DAY_ORDER.map((d) => {
          const v = days[d];
          const upd = (patch: Partial<typeof v>) => setDays((all) => ({ ...all, [d]: { ...all[d], ...patch } }));
          return (
            <div className="hours-row" key={d}>
              <label className="check">
                <input type="checkbox" checked={v.open} onChange={(e) => upd({ open: e.target.checked })} />
                <span className="hours-day">{names[Number(d)]}</span>
              </label>
              {v.open ? (
                <span className="hours-times">
                  <input type="time" step={900} aria-label={t('settings.hoursFrom', { day: names[Number(d)] })} value={v.from} onChange={(e) => upd({ from: e.target.value })} />
                  <span aria-hidden="true">–</span>
                  <input type="time" step={900} aria-label={t('settings.hoursTo', { day: names[Number(d)] })} value={v.to} onChange={(e) => upd({ to: e.target.value })} />
                </span>
              ) : (
                <span className="muted">{t('settings.closed')}</span>
              )}
            </div>
          );
        })}
      </div>
      <label className="check">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        {t('settings.onlineBooking')}
      </label>
      <p className="hint">{t('settings.onlineBookingHint')}</p>
      <Button type="submit" busy={busy}>
        {t('settings.saveHours')}
      </Button>
    </form>
  );
}
