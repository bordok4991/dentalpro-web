import { useState, type FormEvent, type ReactNode } from 'react';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import type { PatientInput, Sex } from '../lib/types';
import { Button, Field, Notice, SelectField } from './ui';

export const EMPTY_PATIENT: PatientInput = {
  first_name: '',
  last_name: '',
  date_of_birth: null,
  sex: null,
  phone: null,
  email: null,
  address: null,
  city: null,
};

/** Lični podaci pacijenta: isti obrazac za novog pacijenta i za izmjenu u kartonu. */
export function PatientForm({
  initial,
  submitLabel,
  savedLabel,
  onSubmit,
  extra,
}: {
  initial: PatientInput;
  submitLabel: string;
  savedLabel?: string;
  onSubmit: (input: PatientInput) => Promise<void>;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<PatientInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof PatientInput>(k: K, value: PatientInput[K]) {
    setV((p) => ({ ...p, [k]: value }));
    setSaved(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!v.first_name.trim() || !v.last_name.trim()) return setError('err.patientName');
    if (v.email && v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return setError('err.email');
    if (v.date_of_birth && v.date_of_birth > todayIso()) return setError('err.dob');
    setBusy(true);
    try {
      await onSubmit(v);
      setSaved(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      {error && <Notice kind="error">{t(error)}</Notice>}
      <div className="grid-2">
        <Field label={t('patient.firstName')} required autoComplete="off" value={v.first_name} onChange={(e) => set('first_name', e.target.value)} />
        <Field label={t('patient.lastName')} required autoComplete="off" value={v.last_name} onChange={(e) => set('last_name', e.target.value)} />
        <Field
          label={t('patient.dob')}
          type="date"
          min="1900-01-01"
          max={todayIso()}
          value={v.date_of_birth ?? ''}
          onChange={(e) => set('date_of_birth', e.target.value || null)}
        />
        <SelectField label={t('patient.sex')} value={v.sex ?? ''} onChange={(e) => set('sex', (e.target.value || null) as Sex | null)}>
          <option value="">{t('patient.sexNone')}</option>
          <option value="f">{t('patient.sexF')}</option>
          <option value="m">{t('patient.sexM')}</option>
        </SelectField>
        <Field label={t('patient.phone')} type="tel" autoComplete="off" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <Field label={t('patient.email')} type="email" autoComplete="off" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        <Field label={t('patient.address')} autoComplete="off" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        <Field label={t('patient.city')} autoComplete="off" value={v.city ?? ''} onChange={(e) => set('city', e.target.value)} />
      </div>
      <div className="row">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        {extra}
      </div>
      {saved && savedLabel && <Notice kind="ok">{savedLabel}</Notice>}
    </form>
  );
}
