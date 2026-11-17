import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/session';
import type { Patient } from '../lib/types';
import { Field } from './ui';

/** Pretraga i izbor pacijenta (po imenu, telefonu ili broju kartona). */
export function PatientPicker({
  clinicId,
  value,
  onChange,
}: {
  clinicId: string;
  value: Patient | null;
  onChange: (p: Patient | null) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Patient[] | null>(null);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setFound(null);
      return;
    }
    let alive = true;
    const h = setTimeout(() => {
      api
        .patients(clinicId, { query, limit: 8 })
        .then((r) => alive && setFound(r.rows))
        .catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [clinicId, query, value]);

  if (value) {
    return (
      <div className="picked">
        <span>
          <span className="muted">{t('appt.patient')}</span>
          <strong>
            {value.last_name} {value.first_name}
          </strong>
          <span className="muted">{t('patients.card', { n: value.card_number })}</span>
        </span>
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          {t('appt.change')}
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <Field label={t('appt.searchPatient')} hint={t('appt.searchHint')} type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      {found && found.length === 0 && (
        <p className="muted">
          {t('appt.noPatients')}{' '}
          <Link className="text-link" to="/patients/new">
            {t('appt.newPatient')}
          </Link>
        </p>
      )}
      {found && found.length > 0 && (
        <ul className="picker-list">
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)}>
                <strong>
                  {p.last_name} {p.first_name}
                </strong>
                <span className="muted">{t('patients.card', { n: p.card_number })}</span>
                {p.phone && <span className="muted">{p.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
