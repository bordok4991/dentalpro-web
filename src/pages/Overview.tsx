import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { daysUntil, useI18n } from '../lib/i18n';
import { api, useSession } from '../lib/session';
import type { Clinic } from '../lib/types';

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
        if (alive) setCounts({ members: m.filter((x) => x.is_active).length, invites: i.length, patients: p });
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
  const first = profile?.full_name.trim().split(/\s+/)[0];
  const place = [clinic.address, clinic.city].filter(Boolean).join(', ');
  const hasContact = !!(clinic.doctor_name || place || clinic.phone || clinic.email);

  return (
    <>
      <header className="page-head">
        <h1>{first ? t('overview.hello', { name: first }) : t('overview.helloPlain')}</h1>
        <p className="lead">{t('overview.yourRole', { role: t(`role.${current.role}`) })}</p>
      </header>

      <StatusBanner clinic={clinic} />

      <section className="block">
        <div className="block-head">
          <h2>{t('overview.clinic')}</h2>
          {current.role === 'owner' && (
            <Link className="text-link" to="/settings">
              {t('overview.editClinic')}
            </Link>
          )}
        </div>
        <p className="clinic-name">{clinic.name}</p>
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
