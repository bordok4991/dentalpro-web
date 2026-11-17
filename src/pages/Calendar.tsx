import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import { APPOINTMENT_STATUSES, CLINICAL_ROLES, type Appointment, type AppointmentStatus, type Patient } from '../lib/types';
import { Button, Field, Loading, Notice, SelectField, TextField } from '../components/ui';

const HOUR = 64; // visina jednog sata u kalendaru, u pikselima
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

interface Doctor {
  id: string;
  name: string;
}

interface FormInit {
  id?: string;
  patient: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'card_number'> | null;
  doctorId: string;
  day: string;
  time: string;
  minutes: number;
  service: string;
  note: string;
}

export function Calendar() {
  const { t } = useI18n();
  const { current } = useSession();
  const [params, setParams] = useSearchParams();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('dan') ?? '') ? (params.get('dan') as string) : todayIso();
  const preselect = params.get('pacijent');
  const clinicId = current?.clinic.id ?? '';

  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    api
      .members(clinicId)
      .then((ms) => {
        if (!alive) return;
        setDoctors(
          ms
            .filter((m) => m.is_active && CLINICAL_ROLES.includes(m.role))
            .map((m) => ({ id: m.user_id, name: m.profile?.full_name || m.profile?.email || '' })),
        );
      })
      .catch((e) => alive && setError(errorKey(e)));
    return () => {
      alive = false;
    };
  }, [clinicId]);

  const reload = useCallback(async () => {
    if (!clinicId) return;
    const from = new Date(day + 'T00:00:00');
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      setAppts(await api.appointments(clinicId, from.toISOString(), to.toISOString()));
    } catch (e) {
      setAppts([]);
      setError(errorKey(e));
    }
  }, [clinicId, day]);

  useEffect(() => {
    setAppts(null);
    setSelectedId(null);
    void reload();
  }, [reload]);

  // Iz kartona: "Zakaži termin" otvara obrazac s već izabranim pacijentom.
  useEffect(() => {
    if (!preselect || !doctors) return;
    let alive = true;
    api.patient(preselect).then((p) => {
      if (!alive || !p) return;
      setSelectedId(null);
      setForm(blankForm(day, doctors, p));
      const next = new URLSearchParams(params);
      next.delete('pacijent');
      setParams(next, { replace: true });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, doctors]);

  function goto(d: string) {
    const next = new URLSearchParams(params);
    if (d === todayIso()) next.delete('dan');
    else next.set('dan', d);
    setParams(next);
  }

  const columns = useMemo(() => {
    const cols = [...(doctors ?? [])];
    for (const a of appts ?? []) {
      if (!cols.some((c) => c.id === a.doctor_id)) cols.push({ id: a.doctor_id, name: a.doctor?.full_name ?? '' });
    }
    return cols;
  }, [doctors, appts]);

  if (!current) return null;

  const visible = (appts ?? []).filter((a) => showCancelled || a.status !== 'otkazan');
  const active = (appts ?? []).filter((a) => a.status !== 'otkazan' && a.status !== 'nije_dosao');
  const selected = (appts ?? []).find((a) => a.id === selectedId) ?? null;

  let startHour = 7;
  let endHour = 20;
  for (const a of visible) {
    const s = new Date(a.starts_at);
    const e = new Date(a.ends_at);
    startHour = Math.min(startHour, s.getHours());
    endHour = Math.max(endHour, e.getHours() + (e.getMinutes() > 0 ? 1 : 0));
  }
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const pos = (iso: string) => {
    const d = new Date(iso);
    return ((d.getHours() - startHour) * 60 + d.getMinutes()) * (HOUR / 60);
  };
  const isToday = day === todayIso();
  const now = new Date();
  const nowTop = ((now.getHours() - startHour) * 60 + now.getMinutes()) * (HOUR / 60);
  const dd = new Date(day + 'T00:00:00');
  const longDate = t('cal.long', {
    weekday: t('cal.weekdays').split('|')[dd.getDay()],
    day: dd.getDate(),
    month: t('cal.months').split('|')[dd.getMonth()],
    year: dd.getFullYear(),
  });

  function shift(n: number) {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + n);
    goto(isoDay(d));
  }

  function upsert(a: Appointment) {
    setAppts((list) => {
      const rest = (list ?? []).filter((x) => x.id !== a.id);
      return localDay(a.starts_at) === day ? [...rest, a].sort((x, y) => x.starts_at.localeCompare(y.starts_at)) : rest;
    });
  }

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1>{t('cal.title')}</h1>
          <p className="lead cal-date">{longDate}</p>
        </div>
        <Button
          onClick={() => {
            setSelectedId(null);
            setForm(blankForm(day, doctors ?? [], null));
          }}
          disabled={!doctors || doctors.length === 0}
        >
          {t('cal.new')}
        </Button>
      </header>

      <div className="cal-bar">
        <div className="row">
          <button type="button" className="icon-btn" aria-label={t('cal.prev')} onClick={() => shift(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <Button variant="quiet" onClick={() => goto(todayIso())} disabled={isToday}>
            {t('cal.today')}
          </Button>
          <button type="button" className="icon-btn" aria-label={t('cal.next')} onClick={() => shift(1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <label className="cal-pick">
            <span className="sr-only">{t('cal.pickDate')}</span>
            <input type="date" value={day} onChange={(e) => e.target.value && goto(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <span className="muted">{t('cal.count', { n: active.length })}</span>
          <label className="check">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            {t('cal.showCancelled')}
          </label>
        </div>
      </div>

      {error && <Notice kind="error">{t(error)}</Notice>}
      {doctors && doctors.length === 0 && <Notice kind="info">{t('cal.noDoctors')}</Notice>}

      <div className={form || selected ? 'cal-layout cal-layout-open' : 'cal-layout'}>
        <section className="block cal-board" aria-label={longDate}>
          {appts === null || doctors === null ? (
            <Loading />
          ) : (
            <div className="cal-scroll">
              <div className="cal-grid" style={{ ['--cols' as string]: Math.max(columns.length, 1) }}>
                <div className="cal-corner" />
                {columns.map((c) => (
                  <div key={c.id} className="cal-colhead">
                    <strong>{c.name}</strong>
                    <span className="muted">{t('cal.count', { n: active.filter((a) => a.doctor_id === c.id).length })}</span>
                  </div>
                ))}
                <div className="cal-times" style={{ height: hours.length * HOUR }} aria-hidden="true">
                  {hours.map((h) => (
                    <span key={h} style={{ top: (h - startHour) * HOUR }}>
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
                {columns.map((c) => (
                  <div key={c.id} className="cal-col" style={{ height: hours.length * HOUR, ['--hour' as string]: `${HOUR}px` }}>
                    {visible
                      .filter((a) => a.doctor_id === c.id)
                      .map((a) => {
                        const top = pos(a.starts_at);
                        const height = Math.max(pos(a.ends_at) - top - 3, 22);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={`appt appt-st-${a.status}${height < 44 ? ' appt-short' : ''}`}
                            style={{ top, height }}
                            aria-pressed={selectedId === a.id}
                            onClick={() => {
                              setForm(null);
                              setSelectedId(a.id);
                            }}
                          >
                            <strong>
                              {hhmm(a.starts_at)} {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : ''}
                            </strong>
                            <span>{a.service}</span>
                            {height >= 60 && <span className="appt-status">{t(`cal.status.${a.status}` as Key)}</span>}
                          </button>
                        );
                      })}
                  </div>
                ))}
                {isToday && nowTop > 0 && nowTop < hours.length * HOUR && <div className="cal-now" style={{ top: nowTop }} aria-hidden="true" />}
              </div>
              {visible.length === 0 && <p className="muted cal-empty">{t('cal.empty')}</p>}
            </div>
          )}
        </section>

        {form && doctors && (
          <AppointmentForm
            key={form.id ?? 'novi'}
            clinicId={clinicId}
            doctors={doctors}
            init={form}
            onCancel={() => setForm(null)}
            onSaved={(a) => {
              upsert(a);
              setForm(null);
              if (localDay(a.starts_at) !== day) goto(localDay(a.starts_at));
              setSelectedId(a.id);
            }}
          />
        )}

        {selected && !form && (
          <AppointmentDetails
            appt={selected}
            onClose={() => setSelectedId(null)}
            onChanged={upsert}
            onEdit={() => {
              const s = new Date(selected.starts_at);
              setForm({
                id: selected.id,
                patient: selected.patient ? { id: selected.patient_id, ...selected.patient } : null,
                doctorId: selected.doctor_id,
                day: localDay(selected.starts_at),
                time: hhmm(selected.starts_at),
                minutes: Math.round((new Date(selected.ends_at).getTime() - s.getTime()) / 60000),
                service: selected.service,
                note: selected.note ?? '',
              });
            }}
          />
        )}
      </div>
    </>
  );
}

function blankForm(day: string, doctors: Doctor[], patient: Patient | null): FormInit {
  return {
    patient: patient ? { id: patient.id, first_name: patient.first_name, last_name: patient.last_name, card_number: patient.card_number } : null,
    doctorId: doctors.length === 1 ? doctors[0].id : '',
    day,
    time: '10:00',
    minutes: 30,
    service: '',
    note: '',
  };
}

/* ---------- Detalji termina ---------- */

function AppointmentDetails({
  appt,
  onClose,
  onChanged,
  onEdit,
}: {
  appt: Appointment;
  onClose: () => void;
  onChanged: (a: Appointment) => void;
  onEdit: () => void;
}) {
  const { t, date } = useI18n();
  const [busy, setBusy] = useState<AppointmentStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function setStatus(s: AppointmentStatus) {
    setError(null);
    setBusy(s);
    try {
      onChanged(await api.updateAppointment(appt.id, { status: s }));
      setConfirming(false);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(null);
    }
  }

  const name = appt.patient ? `${appt.patient.first_name} ${appt.patient.last_name}` : '';
  return (
    <aside className="block cal-side" aria-label={t('cal.edit')}>
      <div className="block-head">
        <h2>{name}</h2>
        <button type="button" className="link-btn" onClick={onClose}>
          {t('cal.close')}
        </button>
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}
      <dl className="facts">
        <dt>{t('appt.date')}</dt>
        <dd>
          {date(appt.starts_at)}, {hhmm(appt.starts_at)}–{hhmm(appt.ends_at)}
        </dd>
        <dt>{t('appt.doctor')}</dt>
        <dd>{appt.doctor?.full_name}</dd>
        <dt>{t('appt.service')}</dt>
        <dd>{appt.service}</dd>
        {appt.patient?.phone && (
          <>
            <dt>{t('patient.phone')}</dt>
            <dd>
              <a href={`tel:${appt.patient.phone.replace(/\s+/g, '')}`}>{appt.patient.phone}</a>
            </dd>
          </>
        )}
        {appt.note && (
          <>
            <dt>{t('appt.note')}</dt>
            <dd>{appt.note}</dd>
          </>
        )}
      </dl>

      <fieldset className="seg">
        <legend>{t('cal.setStatus')}</legend>
        <div className="seg-row">
          {APPOINTMENT_STATUSES.filter((s) => s !== 'otkazan').map((s) => (
            <button key={s} type="button" aria-pressed={appt.status === s} disabled={busy !== null} onClick={() => void setStatus(s)}>
              {t(`cal.status.${s}` as Key)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row">
        <Link className="btn btn-quiet" to={`/patients/${appt.patient_id}`}>
          {t('cal.openKarton')}
        </Link>
        {appt.status !== 'otkazan' && (
          <Button variant="quiet" onClick={onEdit}>
            {t('cal.edit')}
          </Button>
        )}
      </div>
      {appt.status === 'otkazan' ? (
        <p className="muted">{t('cal.status.otkazan')}</p>
      ) : confirming ? (
        <div className="row">
          <Button variant="danger" busy={busy === 'otkazan'} onClick={() => void setStatus('otkazan')}>
            {t('cal.confirmCancel')}
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <button type="button" className="link-btn danger-link" onClick={() => setConfirming(true)}>
          {t('cal.cancel')}
        </button>
      )}
    </aside>
  );
}

/* ---------- Novi termin i izmjena ---------- */

function AppointmentForm({
  clinicId,
  doctors,
  init,
  onSaved,
  onCancel,
}: {
  clinicId: string;
  doctors: Doctor[];
  init: FormInit;
  onSaved: (a: Appointment) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<FormInit>(init);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Patient[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const services = t('appt.services').split('|');

  useEffect(() => {
    if (v.patient) return;
    const q = query.trim();
    if (!q) {
      setFound(null);
      return;
    }
    let alive = true;
    const id = window.setTimeout(() => {
      api
        .patients(clinicId, { query: q, limit: 8 })
        .then((r) => alive && setFound(r.rows))
        .catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query, clinicId, v.patient]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.patient) return setError('err.pickPatient');
    if (!v.doctorId) return setError('err.pickDoctor');
    if (!v.service.trim()) return setError('err.service');
    const start = new Date(`${v.day}T${v.time}:00`);
    if (Number.isNaN(start.getTime())) return setError('err.apptTime');
    const end = new Date(start.getTime() + v.minutes * 60000);
    const input = {
      patient_id: v.patient.id,
      doctor_id: v.doctorId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      service: v.service,
      note: v.note,
    };
    setBusy(true);
    try {
      onSaved(v.id ? await api.updateAppointment(v.id, input) : await api.createAppointment(clinicId, input));
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <aside className="block cal-side" aria-label={v.id ? t('cal.edit') : t('cal.new')}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <div className="block-head">
          <h2>{v.id ? t('cal.edit') : t('cal.new')}</h2>
          <button type="button" className="link-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
        {error && <Notice kind="error">{t(error)}</Notice>}

        {v.patient ? (
          <div className="picked">
            <span>
              <span className="muted">{t('appt.patient')}</span>
              <strong>
                {v.patient.last_name} {v.patient.first_name}
              </strong>
              <span className="muted">{t('patients.card', { n: v.patient.card_number })}</span>
            </span>
            {!v.id && (
              <button type="button" className="link-btn" onClick={() => setV({ ...v, patient: null })}>
                {t('appt.change')}
              </button>
            )}
          </div>
        ) : (
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
                    <button type="button" onClick={() => setV({ ...v, patient: p })}>
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
        )}

        <SelectField label={t('appt.doctor')} value={v.doctorId} onChange={(e) => setV({ ...v, doctorId: e.target.value })}>
          <option value="">{t('err.pickDoctor')}</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <div className="grid-2">
          <Field label={t('appt.date')} type="date" value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })} />
          <Field label={t('appt.time')} type="time" step={300} value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />
        </div>
        <SelectField label={t('appt.duration')} value={String(v.minutes)} onChange={(e) => setV({ ...v, minutes: Number(e.target.value) })}>
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {t('appt.minutes', { n: m })}
            </option>
          ))}
        </SelectField>
        <Field label={t('appt.service')} hint={t('appt.serviceHint')} list="appt-services" value={v.service} onChange={(e) => setV({ ...v, service: e.target.value })} />
        <datalist id="appt-services">
          {services.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <TextField label={t('appt.note')} rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        <div className="row">
          <Button type="submit" busy={busy}>
            {v.id ? t('appt.saveEdit') : t('appt.save')}
          </Button>
        </div>
      </form>
    </aside>
  );
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDay(iso: string): string {
  return isoDay(new Date(iso));
}
