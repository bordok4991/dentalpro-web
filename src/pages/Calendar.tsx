import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api, useSession } from '../lib/session';
import { addDays, shiftMonth } from '../lib/format';
import { calendarRange, clinicInstant, clinicTime, validDay, validDuration, type CalendarView } from '../lib/schedule';
import { APPOINTMENT_STATUSES, CLINICAL_ROLES, type Appointment, type AppointmentStatus, type Patient, type Service } from '../lib/types';
import { Button, Field, Loading, Notice, SelectField, TextField } from '../components/ui';
import { CalendarBoard, type CalendarDoctor } from '../components/CalendarBoard';

interface FormInit {
  id?: string;
  block: boolean;
  patient: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'card_number'> | null;
  doctorId: string;
  day: string;
  time: string;
  minutes: number;
  service: string;
  note: string;
}

export function Calendar() {
  const { t, date } = useI18n();
  const { current, user } = useSession();
  const [params, setParams] = useSearchParams();
  const zone = current?.clinic.timezone || 'Europe/Sarajevo';
  const today = clinicTime(new Date(), zone).day;
  const requestedDay = params.get('dan');
  const day = validDay(requestedDay) ? requestedDay : today;
  const requestedView = params.get('prikaz');
  const view: CalendarView = requestedView === 'dan' || requestedView === 'mjeseci' ? requestedView : 'sedmica';
  const { from, to } = calendarRange(day, view);
  const preselect = params.get('pacijent');
  const clinicId = current?.clinic.id ?? '';
  const [doctors, setDoctors] = useState<CalendarDoctor[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [loadError, setLoadError] = useState<Key | null>(null);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const side = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setError(null);
    api.members(clinicId).then((members) => {
      if (alive) setDoctors(members.filter((m) => m.is_active && CLINICAL_ROLES.includes(m.role)).map((m) =>
        ({ id: m.user_id, name: m.profile?.full_name || m.profile?.email || '', active: true })));
    }).catch((err) => alive && setError(errorKey(err)));
    api.services(clinicId).then((list) => alive && setServices(list.filter((s) => s.is_active)))
      .catch((err) => alive && setError(errorKey(err)));
    return () => { alive = false; };
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setAppts(null);
    setLoadError(null);
    const start = clinicInstant(from, '00:00', zone);
    const end = clinicInstant(to, '00:00', zone);
    if (!start || !end) { setLoadError('cal.timeInvalid'); return; }
    api.appointments(clinicId, start.toISOString(), end.toISOString())
      .then((rows) => alive && setAppts(rows))
      .catch((err) => alive && setLoadError(errorKey(err)));
    return () => { alive = false; };
  }, [clinicId, from, to, zone, revision]);

  function newForm(d: string, time: string, doctorId: string, block = false, patient: FormInit['patient'] = null) {
    const self = doctors?.find((m) => m.id === user?.id);
    setSelectedId(null);
    setForm({ block, patient, doctorId: doctorId || filter || self?.id || (doctors?.length === 1 ? doctors[0].id : ''),
      day: d, time, minutes: block ? 60 : 30, service: '', note: '' });
  }

  useEffect(() => {
    if (!preselect || !doctors) return;
    let alive = true;
    api.patient(preselect).then((p) => {
      if (!alive || !p) return;
      newForm(day, '10:00', '', false, p);
      const next = new URLSearchParams(params);
      next.delete('pacijent');
      setParams(next, { replace: true });
    }).catch((err) => alive && setError(errorKey(err)));
    return () => { alive = false; };
  }, [preselect, doctors]);

  useEffect(() => {
    if ((form || selectedId) && window.matchMedia('(max-width: 1050px)').matches) side.current?.scrollIntoView({ block: 'start' });
  }, [form, selectedId]);

  function navigate(d: string, mode = view) {
    const next = new URLSearchParams(params);
    if (d === today) next.delete('dan'); else next.set('dan', d);
    if (mode === 'sedmica') next.delete('prikaz'); else next.set('prikaz', mode);
    setForm(null);
    setSelectedId(null);
    setParams(next);
  }

  const providers = useMemo(() => {
    const list = [...(doctors ?? [])];
    for (const a of appts ?? []) {
      if (!list.some((d) => d.id === a.doctor_id)) list.push({ id: a.doctor_id, name: a.doctor?.full_name ?? '', active: false });
    }
    return list;
  }, [doctors, appts]);

  const visible = useMemo(() => (appts ?? []).filter((a) =>
    (!filter || filter === a.doctor_id) && (showCancelled || a.status !== 'otkazan')), [appts, filter, showCancelled]);
  if (!current) return null;
  const active = visible.filter((a) => !['otkazan', 'nije_dosao'].includes(a.status));
  const selected = appts?.find((a) => a.id === selectedId);
  const last = addDays(to, -1);
  const monthLabel = (d: string) => t('cal.months').split('|')[Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4);
  const title = view === 'mjeseci' ? monthLabel(from) + ' – ' + monthLabel(last) :
    view === 'sedmica' ? date(from) + ' – ' + date(last) : date(day);
  function shift(n: number) {
    navigate(view === 'mjeseci' ? shiftMonth(day, n) : addDays(day, n * (view === 'sedmica' ? 7 : 1)));
  }

  function saved(a: Appointment) {
    const d = clinicTime(a.starts_at, zone).day;
    if (d !== day) navigate(d);
    if (filter && filter !== a.doctor_id) setFilter(a.doctor_id);
    setForm(null);
    setSelectedId(a.id);
    setRevision((v) => v + 1);
  }

  return <>
    <header className="page-head cal-header">
      <div><h1>{t('cal.title')}</h1><p className="lead cal-date">{title}</p></div>
      <div className="row">
        <Button variant="quiet" onClick={() => newForm(day, '10:00', '', true)} disabled={!doctors?.length}>{t('cal.block')}</Button>
        <Button onClick={() => newForm(day, '10:00', '')} disabled={!doctors?.length}>{t('cal.new')}</Button>
      </div>
    </header>
    <div className="cal-tools">
      <div className="cal-bar">
        <div className="row cal-navigation">
          <button type="button" className="icon-btn" aria-label={t('cal.prevRange')} onClick={() => shift(-1)}>‹</button>
          <Button variant="quiet" onClick={() => navigate(today)}>{t('cal.today')}</Button>
          <button type="button" className="icon-btn" aria-label={t('cal.nextRange')} onClick={() => shift(1)}>›</button>
          <label className="cal-pick"><span className="sr-only">{t('cal.pickDate')}</span>
            <input type="date" value={day} onChange={(e) => validDay(e.target.value) && navigate(e.target.value)} /></label>
        </div>
        <div className="cal-views" role="group" aria-label={t('cal.views')}>
          {(['dan', 'sedmica', 'mjeseci'] as const).map((mode) => <button key={mode} type="button" aria-pressed={mode === view}
            onClick={() => navigate(day, mode)}>{t(mode === 'dan' ? 'cal.dayView' : mode === 'sedmica' ? 'cal.weekView' : 'cal.monthView')}</button>)}
        </div>
      </div>
      <div className="cal-bar cal-filters">
        <div className="row">
          {providers.length > 1 && <label><span className="sr-only">{t('appt.doctor')}</span><select value={filter}
            onChange={(e) => { setFilter(e.target.value); setSelectedId(null); setForm(null); }}>
            <option value="">{t('cal.allDoctors')}</option>{providers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>}
          {providers.length === 1 && <strong>{providers[0].name}</strong>}
          {appts && <span>{t('cal.count', { n: active.filter((a) => !a.is_private_block).length })} · {t('cal.blocksCount', { n: active.filter((a) => a.is_private_block).length })}</span>}
        </div>
        <div className="row">
        {current.role === 'owner' && <Link className="text-link" to="/settings#trajanje-usluga">{t('cal.viewSettings')}</Link>}
        <label className="check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{t('cal.showCancelled')}</label></div>
      </div>
    </div>
    {error && <Notice kind="error">{t(error)}</Notice>}
    {doctors?.length === 0 && <Notice kind="info">{t('cal.noDoctors')}</Notice>}
    <div className={'cal-layout' + (form || selected ? ' cal-layout-open' : '')}>
      <section className="block cal-board" aria-label={title}>
        {loadError ? <Notice kind="error">{t(loadError)} <button type="button" className="link-btn" onClick={() => setRevision((v) => v + 1)}>{t('common.retry')}</button></Notice> : !appts || !doctors ? <Loading /> : <>
          <CalendarBoard view={view} from={from} today={today} zone={zone} doctors={providers.filter((d) => !filter || d.id === filter)}
            events={visible} workingHours={current.clinic.working_hours ?? {}} selected={selectedId}
            onNew={(d, time, doctor) => newForm(d, time, doctor)} onDay={(d) => navigate(d, 'dan')}
            onOpen={(id) => { setForm(null); setSelectedId(id); }}/>
          <p className="muted cal-footer">{!visible.length && <span>{t('cal.rangeEmpty')}</span>}<span>{t('cal.zone', { zone })}</span></p>
        </>}
      </section>
      {(form || selected) && <div className="cal-inspector" ref={side}>
        {form && doctors ? <AppointmentForm key={[form.id, form.block, form.day, form.time, form.doctorId].join('/')} init={form}
          clinicId={clinicId} doctors={doctors} services={services} zone={zone} onCancel={() => setForm(null)} onSaved={saved} /> :
          selected && <AppointmentDetails key={selected.id} appt={selected} zone={zone} onClose={() => setSelectedId(null)}
            onChanged={saved} onEdit={() => {
              const wall = clinicTime(selected.starts_at, zone);
              setForm({ ...wall, id: selected.id, block: selected.is_private_block,
                patient: selected.patient_id && selected.patient ? { id: selected.patient_id, ...selected.patient } : null,
                doctorId: selected.doctor_id, service: selected.service, note: selected.note ?? '',
                minutes: (Date.parse(selected.ends_at) - Date.parse(selected.starts_at)) / 60000 });
            }}/>}
      </div>}
    </div>
  </>;
}
/* ---------- Detalji termina ---------- */

function AppointmentDetails({
  appt,
  zone,
  onClose,
  onChanged,
  onEdit,
}: {
  appt: Appointment;
  zone: string;
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

  const name = appt.is_private_block ? t('cal.blocked') : appt.patient ? `${appt.patient.first_name} ${appt.patient.last_name}` : '';
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
          {date(clinicTime(appt.starts_at, zone).day)}, {clinicTime(appt.starts_at, zone).time}–{clinicTime(appt.ends_at, zone).time}
        </dd>
        <dt>{t('appt.doctor')}</dt>
        <dd>{appt.doctor?.full_name}</dd>
        {!appt.is_private_block && <><dt>{t('appt.service')}</dt>
        <dd>
          {appt.service}
          {appt.booked_online && <span className="tag">{t('cal.bookedOnline')}</span>}
        </dd>
        </>}
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

      {!appt.is_private_block && <fieldset className="seg">
        <legend>{t('cal.setStatus')}</legend>
        <div className="seg-row">
          {APPOINTMENT_STATUSES.filter((s) => s !== 'otkazan').map((s) => (
            <button key={s} type="button" aria-pressed={appt.status === s} disabled={busy !== null} onClick={() => void setStatus(s)}>
              {t(`cal.status.${s}` as Key)}
            </button>
          ))}
        </div>
      </fieldset>}

      <div className="row">
        {appt.patient_id && <Link className="btn btn-quiet" to={`/patients/${appt.patient_id}`}>
          {t('cal.openKarton')}
        </Link>}
        {appt.status !== 'otkazan' && (
          <Button variant="quiet" onClick={onEdit}>
            {t('cal.edit')}
          </Button>
        )}
      </div>
      {appt.status === 'otkazan' ? (
        <p className="muted">{t(appt.is_private_block ? 'cal.released' : 'cal.status.otkazan')}</p>
      ) : confirming ? (
        <div className="row">
          <Button variant="danger" busy={busy === 'otkazan'} onClick={() => void setStatus('otkazan')}>
            {t(appt.is_private_block ? 'cal.confirmRelease' : 'cal.confirmCancel')}
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <button type="button" className="link-btn danger-link" onClick={() => setConfirming(true)}>
          {t(appt.is_private_block ? 'cal.release' : 'cal.cancel')}
        </button>
      )}
    </aside>
  );
}

/* ---------- Novi termin i izmjena ---------- */

function AppointmentForm({
  clinicId,
  doctors,
  services,
  zone,
  init,
  onSaved,
  onCancel,
}: {
  clinicId: string;
  doctors: CalendarDoctor[];
  services: Service[];
  zone: string;
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
  const [selectedService, setSelectedService] = useState(() => services.find((s) => s.name === init.service)?.id ?? (init.service || !services.length ? 'custom' : ''));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotError, setSlotError] = useState<Key | null>(null);
  const [refreshSlots, setRefreshSlots] = useState(0);
  const provider = doctors.find((d) => d.id === v.doctorId);
  const offerSlots = !v.id && !!provider?.active && validDay(v.day) && (validDuration(v.minutes) || (v.block && Number.isInteger(v.minutes) && v.minutes > 480 && v.minutes <= 720));
  const start = clinicInstant(v.day, v.time, zone);
  const end = start && v.minutes > 0 ? clinicTime(new Date(start.getTime() + v.minutes * 60000), zone) : null;
  const title = t(v.block ? (v.id ? 'cal.editBlock' : 'cal.block') : (v.id ? 'cal.edit' : 'cal.new'));
  useEffect(() => {
    let active = true;
    setSlots(null);
    setSlotError(null);
    if (offerSlots) api.slots(clinicId, v.doctorId, v.day, v.minutes)
      .then((list) => active && setSlots(list)).catch((err) => active && setSlotError(errorKey(err)));
    return () => { active = false; };
  }, [offerSlots, clinicId, v.doctorId, v.day, v.minutes, refreshSlots]);

  useEffect(() => {
    if (v.block || v.patient) return;
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
  }, [query, clinicId, v.patient, v.block]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.block && !v.patient) return setError('err.pickPatient');
    if (!v.doctorId) return setError('err.pickDoctor');
    if (!v.block && !v.service.trim()) return setError('cal.blankService');
    const limit = v.block || (v.id && init.minutes > 480) ? 720 : 480;
    if (!Number.isInteger(v.minutes) || v.minutes < 5 || v.minutes > limit) return setError(v.block ? 'cal.blockDurationError' : 'cal.durationError');
    if (!start) return setError('cal.timeInvalid');
    const finish = new Date(start.getTime() + v.minutes * 60000);
    const input = {
      patient_id: v.block ? null : v.patient!.id,
      is_private_block: v.block,
      doctor_id: v.doctorId,
      starts_at: start.toISOString(),
      ends_at: finish.toISOString(),
      service: v.block ? 'Blokirano vrijeme' : v.service,
      note: v.note,
    };
    setBusy(true);
    try {
      onSaved(v.id ? await api.updateAppointment(v.id, input) : await api.createAppointment(clinicId, input));
    } catch (err) {
      setError(errorKey(err));
      setRefreshSlots((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <aside className="block cal-side" aria-label={title}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <div className="block-head">
          <h2>{title}</h2>
          <button type="button" className="link-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
        {error && <Notice kind="error">{t(error)}</Notice>}

        {!v.id && !init.patient && <div className="cal-views cal-form-mode">
          <button type="button" aria-pressed={!v.block} onClick={() => { setV({ ...v, block: false }); setError(null); }}>{t('cal.new')}</button>
          <button type="button" aria-pressed={v.block} onClick={() => { setV({ ...v, block: true }); setError(null); }}>{t('cal.blocked')}</button>
        </div>}
        {v.block ? <p className="hint">{t('cal.blockHint')}</p> : v.patient ? (
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
        {!v.block && <>
          {!!services.length && <SelectField label={t('appt.service')} value={selectedService} onChange={(e) => {
            const id = e.target.value;
            const chosen = services.find((s) => s.id === id);
            setSelectedService(id);
            setV({ ...v, service: chosen?.name ?? '', minutes: chosen?.duration_min ?? v.minutes });
          }}>
            <option value="">{t('cal.chooseService')}</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {t('services.minutes', { n: s.duration_min })}</option>)}
            <option value="custom">{t('cal.customService')}</option>
          </SelectField>}
          {(!services.length || selectedService === 'custom') && <Field label={t(services.length ? 'cal.serviceName' : 'appt.service')} maxLength={120} value={v.service}
            onChange={(e) => setV({ ...v, service: e.target.value })} />}
        </>}
        <Field label={t('appt.duration')} type="number" min={5} max={v.block ? 720 : 480} step={1}
          hint={!v.block && !!services.length ? t('cal.durationHint') : undefined}
          value={v.minutes || ''} onChange={(e) => setV({ ...v, minutes: Number(e.target.value) })} />
        <div className="grid-2">
          <Field label={t('appt.date')} type="date" value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })} />
          <Field label={t('appt.time')} type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />
        </div>
        {end && <p className="cal-end"><strong>{t('cal.until')}</strong> {end.day === v.day ? end.time : t('cal.endNext', { time: end.time })}</p>}
        {offerSlots && <fieldset className="cal-available">
          <legend>{t('cal.slots')}</legend>
          {slotError ? <Notice kind="error">{t(slotError)}</Notice> : slots === null ? <Loading /> : slots.length === 0 ? <p className="hint">{t('cal.noSlots')}</p> :
            <div className="cal-slot-list">{slots.map((iso) => {
              const time = clinicTime(iso, zone).time;
              return <button key={iso} type="button" aria-pressed={time === v.time} onClick={() => setV({ ...v, time })}>{time}</button>;
            })}</div>}
        </fieldset>}
        <TextField label={t(v.block ? 'cal.blockNote' : 'appt.note')} rows={2} maxLength={1000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        <div className="row">
          <Button type="submit" busy={busy}>
            {t(v.id ? 'appt.saveEdit' : v.block ? 'cal.block' : 'appt.save')}
          </Button>
        </div>
      </form>
    </aside>
  );
}
