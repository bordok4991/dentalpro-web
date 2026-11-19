import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { educationItems, paragraphs } from '../lib/format';
import { useSession } from '../lib/session';
import type { Doctor } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { ClinicLocation } from './ClinicPhotos';

/** Doktor ima šta pokazati pacijentima: veću sliku, biografiju ili obrazovanje. */
function hasProfile(d: Doctor): boolean {
  return !!(d.photo_url || d.bio?.trim() || d.education?.trim() || d.credentials_url);
}

/** "dr Nisveta Bešlija Hasanagić" → ["dr Nisveta", "Bešlija Hasanagić"] */
function nameLines(full: string): [string, string | null] {
  const m = full.trim().match(/^((?:(?:dr|doc|prof|mr|dipl)\.?\s+)*)(\S+)\s+(.+)$/i);
  if (!m) return [full.trim(), null];
  return [`${m[1]}${m[2]}`.trim(), m[3]];
}

function Seal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="cred-seal">
      <circle cx="12" cy="9.5" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="9.5" r="3.4" fill="currentColor" opacity="0.28" />
      <path d="M8.6 14.6 7.2 21.5l4.8-2.4 4.8 2.4-1.4-6.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function CredentialsPhoto({ src, name }: { src: string; name: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [zoomed, setZoomed] = useState(false);
  const alt = t('p.credentialsPhoto', { name });

  return (
    <>
      <button type="button" className="cred-preview" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <img src={src} alt={alt} loading="lazy" decoding="async" />
        <span>{t('p.viewCredentials')} <span aria-hidden="true">⤢</span></span>
      </button>
      <dialog ref={dialog} className="cred-dialog" aria-labelledby={titleId} onClose={() => setZoomed(false)}>
        <header>
          <h2 id={titleId}>{t('p.education')}</h2>
          <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>{t('p.closePhoto')}</button>
        </header>
        <div className="cred-viewport" tabIndex={0} role="region" aria-label={alt}>
          <img className={zoomed ? 'is-zoomed' : undefined} src={src} alt={alt} loading="lazy" />
        </div>
        <button type="button" className="btn btn-quiet cred-zoom" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
          {t(zoomed ? 'p.fitPhoto' : 'p.zoomPhoto')}
        </button>
      </dialog>
    </>
  );
}

/** Predstavljanje doktora: portret, ime, kratko o doktoru, edukacije sa slikom certifikata. */
function AboutDoctors({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const shown = doctors.filter(hasProfile);
  if (shown.length === 0) return null;
  return (
    <section className="story" aria-label={t('p.careTeam')}>
      {shown.map((d) => {
        const role = d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`);
        const edu = educationItems(d.education);
        const [first, rest] = nameLines(d.full_name);
        return (
          <article key={d.user_id} className={`story-doc${d.photo_url ? ' story-doc-photo' : ''}`} aria-labelledby={`doc-${d.user_id}`}>
            {d.photo_url ? (
              <figure className="story-hero">
                <img src={d.photo_url} alt={d.full_name} />
              </figure>
            ) : (
              <Avatar url={d.avatar_url} name={d.full_name} size={96} />
            )}
            <header className="story-name">
              <h2 id={`doc-${d.user_id}`}>
                <span>{first}</span>
                {rest && <span>{rest}</span>}
              </h2>
              <p>{role}</p>
            </header>
            {d.bio?.trim() && (
              <div className="story-bio">
                {paragraphs(d.bio).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {(edu.length > 0 || d.credentials_url) && (
              <section className="story-cred" aria-labelledby={`edu-${d.user_id}`}>
                <h3 id={`edu-${d.user_id}`}>{t('p.education')}</h3>
                {d.credentials_url && <CredentialsPhoto src={d.credentials_url} name={d.full_name} />}
                {edu.length > 0 && (
                  <ul className="cred-list">
                    {edu.map((e, i) => (
                      <li key={i}>
                        <Seal />
                        <span className="cred-text">
                          <span className="cred-title">{e.title}</span>
                          {e.detail && <span className="cred-detail">{e.detail}</span>}
                        </span>
                        {e.year && <span className="cred-year">{e.year}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function AboutPractice({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const { current } = useSession();
  const otherDoctors = doctors.filter((d) => !hasProfile(d));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  if (!current) return null;
  const c = current.clinic;
  return (
    <>
      <h1 className="sr-only">{t('p.aboutTitle')}</h1>
      <AboutDoctors doctors={doctors} />
      <section className="practice-intro" aria-labelledby="about-clinic-name">
        {c.cover_url && (
          <figure className="practice-intro-photo">
            <img src={c.cover_url} alt="" decoding="async" />
          </figure>
        )}
        <div className="practice-intro-copy">
          <h2 id="about-clinic-name">{c.name}</h2>
          {c.city && <p className="practice-intro-place">{c.city}</p>}
          {paragraphs(c.about ?? '').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </section>
      {otherDoctors.length > 0 && (
        <ul className="doctors" aria-label={t('p.careTeam')}>
          {otherDoctors.map((d) => (
            <li key={d.user_id}>
              <Avatar url={d.avatar_url} name={d.full_name} size={56} />
              <span>
                <strong>{d.full_name}</strong>
                <span className="meta">{d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ClinicContact hoursOpen />
    </>
  );
}

/** Kako do nas: slika ulaza, adresa, karta i poziv, radno vrijeme (u sažetku piše današnje). */
export function ClinicContact({ hoursOpen = false }: { hoursOpen?: boolean }) {
  const { t } = useI18n();
  const { current } = useSession();
  if (!current) return null;
  const c = current.clinic;
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const names = t('cal.weekdays').split('|');
  const order = ['1', '2', '3', '4', '5', '6', '0'] as const;
  const open = order.filter((d) => c.working_hours?.[d]);
  const today = String(new Date().getDay());
  const todayHours = c.working_hours?.[today as (typeof order)[number]];
  if (!place && !c.phone && !c.entrance_photo_url && !open.length) return null;

  return (
    <section className="practice-visit" aria-labelledby="practice-location-title">
      <ClinicLocation photo={c.entrance_photo_url} name={c.name} place={place} phone={c.phone} />
      {open.length > 0 && (
        <details className="practice-hours" open={hoursOpen}>
          <summary>
            <span>{t('p.openingHours')}</span>
            <span className="hours-today">{todayHours ? t('p.todayHours', { from: todayHours[0], to: todayHours[1] }) : t('p.todayClosed')}</span>
          </summary>
          <dl className="story-hours">
            {open.map((d) => (
              <div key={d} className={d === today ? 'is-today' : undefined}>
                <dt>
                  <span className="day-name">{names[Number(d)]}</span>
                  {d === today && <span className="today-chip">{t('p.today')}</span>}
                </dt>
                <dd>
                  {c.working_hours[d]![0]}–{c.working_hours[d]![1]}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
