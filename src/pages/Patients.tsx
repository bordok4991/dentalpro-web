import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ageFrom, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import type { Patient, PatientInput } from '../lib/types';
import { Button, Field, Loading, Notice } from '../components/ui';
import { EMPTY_PATIENT, PatientForm } from '../components/PatientForm';

const LIMIT = 100;

export function Patients() {
  const { t, date, age } = useI18n();
  const { current } = useSession();
  const clinicId = current?.clinic.id ?? '';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const archived = params.get('arhiva') === '1';

  const [text, setText] = useState(q);
  const [list, setList] = useState<{ rows: Patient[]; more: boolean } | null>(null);
  const [error, setError] = useState<Key | null>(null);

  // Pretraga kreće kad korisnik zastane s kucanjem; upit ostaje u adresi.
  useEffect(() => {
    if (text.trim() === q.trim()) return;
    const id = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(id);
  }, [text, q, params, setParams]);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setError(null);
    api
      .patients(clinicId, { query: q, archived, limit: LIMIT })
      .then((r) => alive && setList(r))
      .catch((e) => {
        if (!alive) return;
        setList({ rows: [], more: false });
        setError(errorKey(e));
      });
    return () => {
      alive = false;
    };
  }, [clinicId, q, archived]);

  function toggleArchived(on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set('arhiva', '1');
    else next.delete('arhiva');
    setList(null);
    setParams(next, { replace: true });
  }

  if (!current) return null;
  const searching = q.trim() !== '';

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1>{t('patients.title')}</h1>
          <p className="lead">{t('patients.lead')}</p>
        </div>
        <Link className="btn btn-primary" to="/patients/new">
          {t('patients.new')}
        </Link>
      </header>

      <section className="block">
        <div className="search-row">
          <Field label={t('patients.search')} hint={t('patients.searchHint')} type="search" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={archived} onChange={(e) => toggleArchived(e.target.checked)} />
            {t('patients.showArchived')}
          </label>
        </div>

        {error && <Notice kind="error">{t(error)}</Notice>}

        {list === null ? (
          <Loading />
        ) : list.rows.length === 0 ? (
          !error && <p className="muted">{searching ? t('patients.noResults') : archived ? t('patients.emptyArchived') : t('patients.empty')}</p>
        ) : (
          <ul className="rows patient-rows">
            {list.rows.map((p) => (
              <li key={p.id}>
                <Link className="patient-link" to={`/patients/${p.id}`}>
                  <span className="patient-name">
                    {p.last_name} {p.first_name}
                    {p.is_archived && <span className="tag tag-warn">{t('patients.archived')}</span>}
                  </span>
                  <span className="meta">{t('patients.card', { n: p.card_number })}</span>
                  {p.date_of_birth && (
                    <span className="meta">
                      {date(p.date_of_birth)} ({age(ageFrom(p.date_of_birth))})
                    </span>
                  )}
                  {p.phone && <span className="meta">{p.phone}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list?.more && <p className="hint">{t('patients.more', { n: LIMIT })}</p>}
      </section>
    </>
  );
}

export function PatientNew() {
  const { t } = useI18n();
  const { current } = useSession();
  const navigate = useNavigate();
  if (!current) return null;

  async function create(input: PatientInput) {
    const p = await api.createPatient(current!.clinic.id, input);
    navigate(`/patients/${p.id}`, { replace: true });
  }

  return (
    <>
      <p>
        <Link className="text-link" to="/patients">
          {t('karton.back')}
        </Link>
      </p>
      <header className="page-head">
        <h1>{t('patient.newTitle')}</h1>
        <p className="lead">{t('patient.newLead')}</p>
      </header>
      <section className="block">
        <PatientForm
          initial={EMPTY_PATIENT}
          submitLabel={t('patient.create')}
          onSubmit={create}
          extra={
            <Button variant="quiet" onClick={() => navigate('/patients')}>
              {t('common.cancel')}
            </Button>
          }
        />
      </section>
    </>
  );
}
