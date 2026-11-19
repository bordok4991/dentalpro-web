import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { daysUntil, useI18n } from '../lib/i18n';
import { api, useSession } from '../lib/session';
import type { Appointment, Clinic, Doctor } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { firstName, hhmm, localDay } from '../lib/format';
import type { Key } from '../lib/i18n';

export function StatusBanner({ clinic }: { clinic: Clinic }) {
  const { t, days, date } = useI18n();
  if (clinic.status === 'active') {
    return (
      <p className="status status-active">
        <strong>{t('status.active')}</strong>
      </p>
    );
  }
  if (clinic.status === 'suspended') {
    return (
      <p className="status status-suspended" role="alert">
        <strong>{t('status.suspended')}</strong>
        <span>{t('status.suspendedLead')}</span>
      </p>
    );
  }
  const ends = clinic.trial_ends_at;
  const over = ends ? new Date(ends).getTime() < Date.now() : false;
  return (
    <p className={`status ${over ? 'status-suspended' : 'status-trial'}`}>
      <strong>{t('status.trial')}</strong>
      {ends && <span>{over ? t('status.trialOver', { date: date(ends) }) : t('status.trialLeft', { date: date(ends), days: days(daysUntil(ends)) })}</span>}
    </p>
  );
}

export function Overview() {
  const { t } = useI18n();
  const { profile, current } = useSession();
  const [counts, setCounts] = useState<{ members: number; invites: number; patients: number } | null>(null);

  const clinicId = current?.clinic.id;
  const role = current?.role;
  const isStaff = role !== 'patient';

  useEffect(() => {
    if (!clinicId || !isStaff) return;
    let alive = true;
    setCounts(null);
    Promise.all([api.members(clinicId), role === 'owner' ? api.invites(clinicId) : Promise.resolve([]), api.patientCount(clinicId)])
      .then(([m, i, p]) => {
        if (alive) setCounts({ members: m.filter((x) => x.is_active && x.role !== 'patient').length, invites: i.length, patients: p });
      })
      .catch(() => {
        /* brojevi su pomoćni; pregled radi i bez njih */
      });
    return () => {
      alive = false;
    };
  }, [clinicId, role, isStaff]);

  if (!current) return null;
  const { clinic } = current;
  const first = firstName(profile?.full_name);
  const place = [clinic.address, clinic.city].filter(Boolean).join(', ');
  const hasContact = !!(clinic.doctor_name || place || clinic.phone || clinic.email);

  return (
    <>
      <header className="page-head">
        <h1>{first ? t('overview.hello', { name: first }) : t('overview.helloPlain')}</h1>
        <p className="lead">{t('overview.yourRole', { role: t(`role.${current.role}`) })}</p>
      </header>

      <StatusBanner clinic={clinic} />

      {isStaff && <TodayBlock clinicId={clinic.id} />}
      {isStaff && clinic.online_booking && <OnlineBlock clinicId={clinic.id} />}

      <section className="block">
        <div className="block-head">
          <h2>{t('overview.clinic')}</h2>
          {current.role === 'owner' && (
            <Link className="text-link" to="/settings">
              {t('overview.editClinic')}
            </Link>
          )}
        </div>
        <div className="clinic-id">
          {clinic.logo_url && <Avatar url={clinic.logo_url} name={clinic.name} size={56} square />}
          <p className="clinic-name">{clinic.name}</p>
        </div>
        {hasContact ? (
          <dl className="facts">
            {clinic.doctor_name && (
              <>
                <dt>{t('clinic.doctorName')}</dt>
                <dd>{clinic.doctor_name}</dd>
              </>
            )}
            {place && (
              <>
                <dt>{t('clinic.address')}</dt>
                <dd>{place}</dd>
              </>
            )}
            {clinic.phone && (
              <>
                <dt>{t('clinic.phone')}</dt>
                <dd>
                  <a href={`tel:${clinic.phone.replace(/\s+/g, '')}`}>{clinic.phone}</a>
                </dd>
              </>
            )}
            {clinic.email && (
              <>
                <dt>{t('clinic.email')}</dt>
                <dd>
                  <a href={`mailto:${clinic.email}`}>{clinic.email}</a>
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="muted">{t('overview.noContact')}</p>
        )}
        <DoctorsRow clinicId={clinic.id} />
      </section>

      {isStaff && (
        <section className="block">
          <div className="block-head">
            <h2>{t('overview.patients')}</h2>
            <Link className="text-link" to="/patients">
              {t('overview.openPatients')}
            </Link>
          </div>
          <p>{counts ? t('overview.patientCount', { n: counts.patients }) : t('common.loading')}</p>
        </section>
      )}

      {isStaff && (
        <section className="block">
          <div className="block-head">
            <h2>{t('overview.team')}</h2>
            <Link className="text-link" to="/team">
              {t('overview.openTeam')}
            </Link>
          </div>
          {counts ? (
            <ul className="plain">
              <li>{t('overview.activeMembers', { n: counts.members })}</li>
              {current.role === 'owner' && <li>{t('overview.pendingInvites', { n: counts.invites })}</li>}
            </ul>
          ) : (
            <p className="muted">{t('common.loading')}</p>
          )}
        </section>
      )}
    </>
  );
}

function TodayBlock({ clinicId }: { clinicId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<Appointment[] | null>(null);

  useEffect(() => {
    let alive = true;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    api
      .appointments(clinicId, from.toISOString(), to.toISOString())
      .then((r) => alive && setList(r.filter((a) => !a.is_private_block && a.status !== 'otkazan')))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [clinicId]);

  const time = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const left = (list ?? []).filter((a) => new Date(a.ends_at).getTime() > Date.now() && a.status !== 'zavrsen' && a.status !== 'nije_dosao');

  return (
    <section className="block">
      <div className="block-head">
        <h2>{t('overview.today')}</h2>
        <Link className="text-link" to="/calendar">
          {t('overview.openCalendar')}
        </Link>
      </div>
      {list === null ? (
        <p>{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <p className="muted">{t('overview.noToday')}</p>
      ) : (
        <>
          <p>{t('overview.todayCount', { n: list.length })}</p>
          {left.length > 0 && (
            <ul className="rows appt-rows">
              {left.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link className="appt-row" to={`/patients/${a.patient_id}`}>
                    <strong>{time(a.starts_at)}</strong>
                    <span>{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : ''}</span>
                    <span>{a.service}</span>
                    <span className="muted">{a.doctor?.full_name}</span>
                    <span className={`tag appt-st-${a.status}`}>{t(`cal.status.${a.status}` as Key)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Doktori ordinacije sa slikama (slika se postavlja u Postavkama). */
export function DoctorsRow({ clinicId }: { clinicId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<Doctor[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .clinicDoctors(clinicId)
      .then((d) => alive && setList(d))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [clinicId]);
  if (list.length === 0) return null;
  return (
    <ul className="doctors" aria-label={t('overview.doctors')}>
      {list.map((d) => (
        <li key={d.user_id}>
          <Avatar url={d.avatar_url} name={d.full_name} size={56} />
          <span>
            <strong>{d.full_name}</strong>
            <span className="meta">{d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Termini koje su pacijenti sami zakazali u zadnjih 7 dana. */
function OnlineBlock({ clinicId }: { clinicId: string }) {
  const { t, date } = useI18n();
  const [list, setList] = useState<Appointment[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .recentOnline(clinicId)
      .then((r) => alive && setList(r))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [clinicId]);
  if (!list || list.length === 0) return null;
  return (
    <section className="block block-accent">
      <div className="block-head">
        <h2>{t('overview.online')}</h2>
        <Link className="text-link" to="/calendar">
          {t('overview.openCalendar')}
        </Link>
      </div>
      <ul className="rows appt-rows">
        {list.map((a) => (
          <li key={a.id}>
            <Link className="appt-row" to={`/calendar?dan=${localDay(a.starts_at)}`}>
              <strong>{date(a.starts_at)}</strong>
              <span>{hhmm(a.starts_at)}</span>
              <span>{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : ''}</span>
              <span>{a.service}</span>
              <span className={`tag appt-st-${a.status}`}>{t(`cal.status.${a.status}` as Key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
