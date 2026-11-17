import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ageFrom, todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import {
  CLINICAL_ROLES,
  type Appointment,
  type EntryInput,
  type MedicalInput,
  type Patient,
  type PatientEntry,
  type PatientMedical,
  type ToothStatus,
} from '../lib/types';
import { Button, Loading, Notice, TextField } from '../components/ui';
import { PatientForm } from '../components/PatientForm';
import { Odontogram, ToothEditor } from '../components/Odontogram';
import { ToothSelect } from '../components/ToothSelect';
import { PatientAccess } from '../components/PatientAccess';
import { PlansBlock } from './Plans';
import { PatientFinance } from './Finances';

export function Karton() {
  const { id = '' } = useParams();
  const { t, date, age } = useI18n();
  const { current, user } = useSession();
  const clinical = !!current && CLINICAL_ROLES.includes(current.role);
  const isOwner = current?.role === 'owner';

  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [medical, setMedical] = useState<PatientMedical | null>(null);
  const [entries, setEntries] = useState<PatientEntry[] | null>(null);
  const [teeth, setTeeth] = useState<Map<number, ToothStatus>>(new Map());
  const [upcoming, setUpcoming] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [tooth, setTooth] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, m, e, ts, ap] = await Promise.all([
        api.patient(id),
        clinical ? api.medical(id) : Promise.resolve(null),
        clinical ? api.entries(id) : Promise.resolve([] as PatientEntry[]),
        clinical ? api.teeth(id) : Promise.resolve([] as ToothStatus[]),
        api.upcomingFor(id),
      ]);
      setPatient(p);
      setMedical(m);
      setEntries(e);
      setTeeth(new Map(ts.map((x) => [x.tooth, x])));
      setUpcoming(ap);
    } catch (err) {
      setError(errorKey(err));
      setPatient((prev) => (prev === undefined ? null : prev));
    }
  }, [id, clinical]);

  useEffect(() => {
    setPatient(undefined);
    setEntries(null);
    setUpcoming(null);
    setTooth(null);
    setAdding(false);
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of entries ?? []) if (e.tooth != null) m.set(e.tooth, (m.get(e.tooth) ?? 0) + 1);
    return m;
  }, [entries]);

  if (!current) return null;
  if (patient === undefined) return <Loading />;

  const back = (
    <p>
      <Link className="text-link" to="/patients">
        {t('karton.back')}
      </Link>
    </p>
  );

  if (patient === null) {
    return (
      <>
        {back}
        <Notice kind="error">{t(error ?? 'karton.notFound')}</Notice>
      </>
    );
  }

  const clinicId = current.clinic.id;
  const shown = (entries ?? []).filter((e) => tooth == null || e.tooth === tooth);
  const allergies = medical?.allergies?.trim();

  return (
    <>
      {back}
      <header className="page-head karton-head">
        <h1>
          {patient.first_name} {patient.last_name}
        </h1>
        <ul className="karton-facts">
          <li>{t('patients.card', { n: patient.card_number })}</li>
          {patient.date_of_birth && <li>{t('karton.born', { date: date(patient.date_of_birth), age: age(ageFrom(patient.date_of_birth)) })}</li>}
          {patient.phone && (
            <li>
              <a href={`tel:${patient.phone.replace(/\s+/g, '')}`}>{patient.phone}</a>
            </li>
          )}
        </ul>
      </header>

      {error && <Notice kind="error">{t(error)}</Notice>}
      {patient.is_archived && <Notice kind="info">{t('karton.archivedBanner')}</Notice>}

      {allergies && (
        <section className="allergy" aria-label={t('karton.allergies')}>
          <strong>{t('karton.allergies')}</strong>
          <p>{allergies}</p>
        </section>
      )}

      <section className="block" aria-labelledby="k-appts">
        <div className="block-head">
          <h2 id="k-appts">{t('karton.appointments')}</h2>
          {!patient.is_archived && (
            <Link className="btn btn-primary" to={`/calendar?pacijent=${patient.id}`}>
              {t('karton.book')}
            </Link>
          )}
        </div>
        {upcoming === null ? (
          <Loading />
        ) : upcoming.length === 0 ? (
          <p className="muted">{t('karton.noAppointments')}</p>
        ) : (
          <ul className="rows appt-rows">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link className="appt-row" to={`/calendar?dan=${localDay(a.starts_at)}`}>
                  <strong>{date(a.starts_at)}</strong>
                  <span>
                    {hhmm(a.starts_at)}–{hhmm(a.ends_at)}
                  </span>
                  <span>{a.service}</span>
                  <span className="muted">{a.doctor?.full_name}</span>
                  <span className={`tag appt-st-${a.status}`}>{t(`cal.status.${a.status}` as Key)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clinical ? (
        <>
          <section className="block">
            <h2>{t('karton.teeth')}</h2>
            <p className="hint">{t('karton.teethHintEdit')}</p>
            <div className={tooth == null ? 'teeth-layout' : 'teeth-layout teeth-layout-open'}>
              <Odontogram statuses={teeth} counts={counts} selected={tooth} onSelect={(n) => setTooth(n === tooth ? null : n)} />
              {tooth != null && (
                <ToothEditor
                  key={tooth}
                  clinicId={clinicId}
                  patientId={patient.id}
                  tooth={tooth}
                  status={teeth.get(tooth)}
                  onClose={() => setTooth(null)}
                  onSaved={(st) => setTeeth((m) => new Map(m).set(st.tooth, st))}
                />
              )}
            </div>
          </section>

          <PlansBlock patient={patient} />
          <PatientFinance patient={patient} />

          <section className="block">
            <div className="block-head">
              <h2>{tooth == null ? t('karton.history') : t('karton.toothFilter', { n: tooth })}</h2>
              <div className="row">
                {tooth != null && (
                  <button type="button" className="link-btn" onClick={() => setTooth(null)}>
                    {t('karton.showAll')}
                  </button>
                )}
                {!adding && <Button onClick={() => setAdding(true)}>{t('karton.addEntry')}</Button>}
              </div>
            </div>

            {adding && (
              <EntryForm
                initial={{ entry_date: todayIso(), tooth, diagnosis: null, treatment: null, note: null }}
                submitLabel={t('entry.save')}
                onCancel={() => setAdding(false)}
                onSubmit={async (input) => {
                  const e = await api.addEntry(clinicId, patient.id, input);
                  setEntries((list) => sortEntries([e, ...(list ?? [])]));
                  setAdding(false);
                }}
              />
            )}

            {entries === null ? (
              <Loading />
            ) : shown.length === 0 ? (
              <p className="muted">{tooth == null ? t('karton.noEntries') : t('karton.noToothEntries', { n: tooth })}</p>
            ) : (
              <ol className="entries">
                {shown.map((e) => (
                  <EntryItem
                    key={e.id}
                    entry={e}
                    canEdit={e.author_id === user?.id || isOwner}
                    onTooth={setTooth}
                    onSaved={(next) => setEntries((list) => sortEntries((list ?? []).map((x) => (x.id === next.id ? next : x))))}
                  />
                ))}
              </ol>
            )}
          </section>

          <section className="block">
            <div className="block-head">
              <h2>{t('karton.medical')}</h2>
              {medical && <span className="meta">{t('karton.medicalUpdated', { date: date(medical.updated_at) })}</span>}
            </div>
            <MedicalForm initial={medical} onSave={async (input) => setMedical(await api.saveMedical(clinicId, patient.id, input))} />
          </section>
        </>
      ) : (
        <>
          <PlansBlock patient={patient} />
          <PatientFinance patient={patient} />
          <Notice kind="info">{t('karton.clinicalOnly')}</Notice>
        </>
      )}

      <section className="block">
        <h2>{t('karton.personal')}</h2>
        <PatientForm
          initial={{
            first_name: patient.first_name,
            last_name: patient.last_name,
            date_of_birth: patient.date_of_birth,
            sex: patient.sex,
            phone: patient.phone,
            email: patient.email,
            address: patient.address,
            city: patient.city,
          }}
          submitLabel={t('karton.savePersonal')}
          savedLabel={t('karton.personalSaved')}
          onSubmit={async (input) => setPatient(await api.updatePatient(patient.id, input))}
        />
      </section>

      <PatientAccess patient={patient} onChange={setPatient} />

      <ArchiveBlock patient={patient} onChange={setPatient} />
    </>
  );
}

function sortEntries(list: PatientEntry[]): PatientEntry[] {
  return [...list].sort((a, b) => (a.entry_date === b.entry_date ? b.created_at.localeCompare(a.created_at) : b.entry_date.localeCompare(a.entry_date)));
}

function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: EntryInput;
  submitLabel: string;
  onSubmit: (input: EntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<EntryInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (![v.diagnosis, v.treatment, v.note].some((x) => x && x.trim())) return setError('err.entryEmpty');
    if (!v.entry_date || v.entry_date > todayIso()) return setError('err.entryDate');
    setBusy(true);
    try {
      await onSubmit(v);
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit} noValidate>
      {error && <Notice kind="error">{t(error)}</Notice>}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="entry-date">{t('entry.date')}</label>
          <input id="entry-date" type="date" max={todayIso()} required value={v.entry_date} onChange={(e) => setV({ ...v, entry_date: e.target.value })} />
        </div>
        <ToothSelect value={v.tooth} onChange={(n) => setV({ ...v, tooth: n })} />
      </div>
      <TextField label={t('entry.diagnosis')} rows={2} value={v.diagnosis ?? ''} onChange={(e) => setV({ ...v, diagnosis: e.target.value })} />
      <TextField label={t('entry.treatment')} rows={2} value={v.treatment ?? ''} onChange={(e) => setV({ ...v, treatment: e.target.value })} />
      <TextField label={t('entry.note')} rows={2} value={v.note ?? ''} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <div className="row">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function EntryItem({
  entry,
  canEdit,
  onTooth,
  onSaved,
}: {
  entry: PatientEntry;
  canEdit: boolean;
  onTooth: (n: number) => void;
  onSaved: (e: PatientEntry) => void;
}) {
  const { t, date } = useI18n();
  const [editing, setEditing] = useState(false);
  const edited = new Date(entry.updated_at).getTime() - new Date(entry.created_at).getTime() > 2000;

  if (editing) {
    return (
      <li className="entry entry-editing">
        <EntryForm
          initial={{ entry_date: entry.entry_date, tooth: entry.tooth, diagnosis: entry.diagnosis, treatment: entry.treatment, note: entry.note }}
          submitLabel={t('entry.saveEdit')}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            onSaved(await api.updateEntry(entry.id, input));
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="entry">
      <div className="entry-head">
        <time dateTime={entry.entry_date}>{date(entry.entry_date)}</time>
        {entry.tooth != null && (
          <button type="button" className="tag tag-tooth" onClick={() => onTooth(entry.tooth!)}>
            {t('entry.toothLabel', { n: entry.tooth })}
          </button>
        )}
        {edited && <span className="meta">{t('entry.edited')}</span>}
        {canEdit && (
          <button type="button" className="link-btn entry-edit" onClick={() => setEditing(true)}>
            {t('entry.edit')}
          </button>
        )}
      </div>
      <dl className="entry-body">
        {entry.diagnosis && (
          <>
            <dt>{t('entry.diagnosis')}</dt>
            <dd>{entry.diagnosis}</dd>
          </>
        )}
        {entry.treatment && (
          <>
            <dt>{t('entry.treatment')}</dt>
            <dd>{entry.treatment}</dd>
          </>
        )}
        {entry.note && (
          <>
            <dt>{t('entry.note')}</dt>
            <dd>{entry.note}</dd>
          </>
        )}
      </dl>
      {entry.author?.full_name && <span className="meta">{t('entry.authorLabel', { name: entry.author.full_name })}</span>}
    </li>
  );
}

function MedicalForm({ initial, onSave }: { initial: PatientMedical | null; onSave: (input: MedicalInput) => Promise<void> }) {
  const { t } = useI18n();
  const [v, setV] = useState<MedicalInput>({
    allergies: initial?.allergies ?? null,
    medical_history: initial?.medical_history ?? null,
    dental_history: initial?.dental_history ?? null,
    notes: initial?.notes ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSave(v);
      setSaved(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  function field(k: keyof MedicalInput, label: string, hint?: string) {
    return (
      <TextField
        label={label}
        hint={hint}
        value={v[k] ?? ''}
        onChange={(e) => {
          setV({ ...v, [k]: e.target.value });
          setSaved(false);
        }}
      />
    );
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {field('allergies', t('karton.allergies'), t('karton.allergiesHint'))}
      {field('medical_history', t('karton.medicalHistory'), t('karton.medicalHint'))}
      {field('dental_history', t('karton.dentalHistory'))}
      {field('notes', t('karton.notes'))}
      <div className="row">
        <Button type="submit" busy={busy}>
          {t('karton.saveMedical')}
        </Button>
      </div>
      {saved && <Notice kind="ok">{t('karton.medicalSaved')}</Notice>}
    </form>
  );
}

function ArchiveBlock({ patient, onChange }: { patient: Patient; onChange: (p: Patient) => void }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function set(archived: boolean) {
    setError(null);
    setBusy(true);
    try {
      onChange(await api.updatePatient(patient.id, { is_archived: archived }));
      setConfirming(false);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="block">
      {error && <Notice kind="error">{t(error)}</Notice>}
      <p className="hint">{t('karton.archiveNote')}</p>
      <div className="row">
        {patient.is_archived ? (
          <Button variant="quiet" busy={busy} onClick={() => void set(false)}>
            {t('karton.unarchive')}
          </Button>
        ) : confirming ? (
          <>
            <Button variant="danger" busy={busy} onClick={() => void set(true)}>
              {t('karton.confirmArchive')}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            {t('karton.archive')}
          </Button>
        )}
      </div>
    </section>
  );
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
