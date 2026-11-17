import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { addDays, hhmm, money } from '../lib/format';
import { api, useSession } from '../lib/session';
import type { Doctor, MyAppointment, Service } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Button, Loading, Notice, TextField } from '../components/ui';
import { NotLinked, usePatient } from './PatientApp';

/** Dugi datum: "srijeda, 18. novembar" (bez Intl, radi i bez bosanskog u pregledniku). */
export function useLongDate() {
  const { t } = useI18n();
  const days = t('cal.weekdays').split('|');
  const months = t('cal.months').split('|');
  return (iso: string, withYear = false) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso);
    return t(withYear ? 'p.longDateYear' : 'p.longDate', { weekday: days[d.getDay()], day: d.getDate(), month: months[d.getMonth()], year: d.getFullYear() });
  };
}

/** Kartica termina s potvrdom dolaska i otkazivanjem. */
export function AppointmentCard({ appt, highlight }: { appt: MyAppointment; highlight?: boolean }) {
  const { t } = useI18n();
  const { current } = useSession();
  const { reloadAppointments } = usePatient();
  const long = useLongDate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [asking, setAsking] = useState(false);

  const start = new Date(appt.starts_at);
  const future = start.getTime() > Date.now();
  const canCancel = ['zakazan', 'potvrdjen'].includes(appt.status) && start.getTime() - Date.now() > 24 * 3600_000;
  const phone = current?.clinic.phone;

  async function run(kind: 'confirm' | 'cancel') {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'confirm') await api.confirmMyAppointment(appt.id);
      else await api.cancelMyAppointment(appt.id);
      await reloadAppointments();
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(null);
      setAsking(false);
    }
  }

  return (
    <div className={`pcard appt-card${highlight ? ' appt-card-next' : ''}${appt.status === 'otkazan' ? ' appt-card-off' : ''}`}>
      <div className="appt-card-when">
        <span className="appt-card-day">{start.getDate()}</span>
        <span>
          <strong>{long(appt.starts_at)}</strong>
          <span>
            {hhmm(appt.starts_at)}–{hhmm(appt.ends_at)}
          </span>
        </span>
      </div>
      <p className="appt-card-what">
        <strong>{appt.service}</strong>
        {appt.doctor_name && <span className="meta">{appt.doctor_name}</span>}
      </p>
      <span className={`tag appt-st-${appt.status}`}>{t(`p.apptStatus.${appt.status}` as Key)}</span>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {future && (appt.status === 'zakazan' || canCancel) && (
        <div className="row">
          {appt.status === 'zakazan' && (
            <Button busy={busy === 'confirm'} onClick={() => void run('confirm')}>
              {t('p.confirm')}
            </Button>
          )}
          {canCancel && !asking && (
            <Button variant="quiet" onClick={() => setAsking(true)}>
              {t('p.cancel')}
            </Button>
          )}
        </div>
      )}
      {asking && (
        <div className="rowitem-edit">
          <p>{t('p.cancelAsk')}</p>
          <div className="row">
            <Button variant="danger" busy={busy === 'cancel'} onClick={() => void run('cancel')}>
              {t('p.cancelYes')}
            </Button>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              {t('p.cancelNo')}
            </Button>
          </div>
        </div>
      )}
      {future && !canCancel && ['zakazan', 'potvrdjen'].includes(appt.status) && phone && (
        <p className="hint">
          {t('p.cancelByPhone')} <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a>
        </p>
      )}
    </div>
  );
}

export function MyAppointments() {
  const { t } = useI18n();
  const { current } = useSession();
  const { patient, appointments } = usePatient();
  const [showPast, setShowPast] = useState(false);

  if (!current) return null;
  const now = Date.now();
  const upcoming = (appointments ?? [])
    .filter((a) => new Date(a.ends_at).getTime() > now && a.status !== 'otkazan' && a.status !== 'nije_dosao')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (appointments ?? []).filter((a) => !upcoming.includes(a));

  return (
    <>
      <div className="papp-head">
        <h1>{t('p.appointmentsTitle')}</h1>
        {patient && current.clinic.online_booking && (
          <Link className="btn btn-primary" to="/zakazi">
            {t('p.book')}
          </Link>
        )}
      </div>
      {patient === null && <NotLinked />}
      {appointments === null ? (
        <Loading />
      ) : upcoming.length === 0 ? (
        <p className="muted">{t('p.noUpcoming')}</p>
      ) : (
        <div className="papp-stack">
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <section className="papp-section">
          <button type="button" className="link-btn" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
            {showPast ? t('p.hidePast') : t('p.showPast', { n: past.length })}
          </button>
          {showPast && (
            <div className="papp-stack">
              {past.slice(0, 30).map((a) => (
                <AppointmentCard key={a.id} appt={a} />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** Online zakazivanje: usluga → doktor → dan → slobodno vrijeme → potvrda. */
export function Booking() {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const { patient, doctors, reloadAppointments } = usePatient();
  const long = useLongDate();
  const [services, setServices] = useState<Service[] | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [done, setDone] = useState<{ start: string; service: string; doctor: string } | null>(null);
  const clinic = current?.clinic;

  useEffect(() => {
    if (!clinic) return;
    let alive = true;
    api
      .services(clinic.id)
      .then((s) => alive && setServices(s.filter((x) => x.is_active && x.online)))
      .catch((e) => alive && (setError(errorKey(e)), setServices([])));
    return () => {
      alive = false;
    };
  }, [clinic?.id]);

  useEffect(() => {
    if (doctors.length === 1) setDoctor(doctors[0]);
  }, [doctors]);

  // Radni dani u naredne četiri sedmice
  const days = useMemo(() => {
    if (!clinic) return [];
    const out: string[] = [];
    for (let i = 0; i < 28 && out.length < 14; i++) {
      const d = addDays(todayIso(), i);
      const dow = String(new Date(d + 'T12:00:00').getDay()) as keyof typeof clinic.working_hours;
      if (clinic.working_hours?.[dow]) out.push(d);
    }
    return out;
  }, [clinic]);

  useEffect(() => {
    setSlot(null);
    if (!clinic || !service || !doctor || !day) return setSlots(null);
    let alive = true;
    setSlots(null);
    api
      .slots(clinic.id, doctor.user_id, day, service.duration_min)
      .then((s) => alive && setSlots(s))
      .catch((e) => alive && (setError(errorKey(e)), setSlots([])));
    return () => {
      alive = false;
    };
  }, [clinic?.id, service, doctor, day]);

  if (!clinic) return null;
  if (patient === undefined) return <Loading />;

  const back = (
    <Link className="text-link" to="/termini">
      {t('p.backToAppointments')}
    </Link>
  );

  if (patient === null) {
    return (
      <>
        {back}
        <NotLinked />
      </>
    );
  }
  if (!clinic.online_booking) {
    return (
      <>
        {back}
        <Notice kind="info">{t('err.bookingOff')}</Notice>
      </>
    );
  }

  if (done) {
    return (
      <div className="pcard booked">
        <span className="booked-mark" aria-hidden="true">
          ✓
        </span>
        <h1>{t('p.bookedTitle')}</h1>
        <p>
          <strong>{long(done.start)}</strong>, {hhmm(done.start)}
        </p>
        <p>
          {done.service}
          {done.doctor && ` · ${done.doctor}`}
        </p>
        <p className="hint">{t('p.bookedHint')}</p>
        <Link className="btn btn-primary" to="/termini">
          {t('p.toAppointments')}
        </Link>
      </div>
    );
  }

  async function book() {
    if (!clinic || !service || !doctor || !slot) return;
    setError(null);
    setBusy(true);
    try {
      await api.book({ clinicId: clinic.id, doctorId: doctor.user_id, serviceId: service.id, start: slot, note });
      await reloadAppointments();
      setDone({ start: slot, service: service.name, doctor: doctor.full_name });
    } catch (e) {
      const k = errorKey(e);
      setError(k === 'err.overlap' ? 'err.slotTaken' : k);
      // Termin je možda upravo zauzet: osvježi slobodna vremena.
      setSlot(null);
      if (clinic && service && doctor && day) {
        api.slots(clinic.id, doctor.user_id, day, service.duration_min).then(setSlots).catch(() => setSlots([]));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {back}
      <h1>{t('p.bookTitle')}</h1>
      {error && <Notice kind="error">{t(error)}</Notice>}

      <section className="papp-section" aria-labelledby="b-service">
        <h2 id="b-service">{t('p.stepService')}</h2>
        {services === null ? (
          <Loading />
        ) : services.length === 0 ? (
          <p className="muted">{t('p.noServices')}</p>
        ) : (
          <div className="choice-list" role="radiogroup" aria-labelledby="b-service">
            {services.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={service?.id === s.id} className="choice" onClick={() => setService(s)}>
                <strong>{s.name}</strong>
                <span className="meta">
                  {t('services.minutes', { n: s.duration_min })}
                  {s.price > 0 && ` · ${money(s.price, clinic.currency, locale)}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {service && doctors.length > 1 && (
        <section className="papp-section" aria-labelledby="b-doctor">
          <h2 id="b-doctor">{t('p.stepDoctor')}</h2>
          <div className="choice-list" role="radiogroup" aria-labelledby="b-doctor">
            {doctors.map((d) => (
              <button key={d.user_id} type="button" role="radio" aria-checked={doctor?.user_id === d.user_id} className="choice choice-person" onClick={() => setDoctor(d)}>
                <Avatar url={d.avatar_url} name={d.full_name} size={44} />
                <span>
                  <strong>{d.full_name}</strong>
                  <span className="meta">{d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {service && doctor && (
        <section className="papp-section" aria-labelledby="b-day">
          <h2 id="b-day">{t('p.stepDay')}</h2>
          <div className="day-strip" role="radiogroup" aria-labelledby="b-day">
            {days.map((d) => {
              const dt = new Date(d + 'T12:00:00');
              return (
                <button key={d} type="button" role="radio" aria-checked={day === d} aria-label={long(d)} className="day-chip" onClick={() => setDay(d)}>
                  <span>{t('cal.weekdays').split('|')[dt.getDay()].slice(0, 3)}</span>
                  <strong>{dt.getDate()}.</strong>
                  <span>{t('cal.months').split('|')[dt.getMonth()].slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {service && doctor && day && (
        <section className="papp-section" aria-labelledby="b-time">
          <h2 id="b-time">{t('p.stepTime', { day: long(day) })}</h2>
          {slots === null ? (
            <Loading />
          ) : slots.length === 0 ? (
            <p className="muted">{t('p.noSlots')}</p>
          ) : (
            <div className="slot-grid" role="radiogroup" aria-labelledby="b-time">
              {slots.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={slot === s} className="slot" onClick={() => setSlot(s)}>
                  {hhmm(s)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {slot && service && doctor && (
        <section className="papp-section pcard" aria-labelledby="b-confirm">
          <h2 id="b-confirm">{t('p.stepConfirm')}</h2>
          <p>
            <strong>{long(slot)}</strong>, {hhmm(slot)}
            <br />
            {service.name} · {doctor.full_name}
          </p>
          <TextField label={t('p.note')} hint={t('p.noteHint')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button busy={busy} onClick={() => void book()}>
            {t('p.confirmBooking')}
          </Button>
        </section>
      )}
    </>
  );
}
