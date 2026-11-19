import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { educationItems, paragraphs } from '../lib/format';
import { useSession } from '../lib/session';
import type { Doctor } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { ClinicLocation } from './ClinicPhotos';

function hasProfile(d: Doctor): boolean {
  return !!(d.photo_url || d.bio?.trim() || d.education?.trim() || d.credentials_url);
}

function nameLines(full: string): [string, string | null] {
  const m = full.trim().match(/^((?:(?:dr|doc|prof|mr|dipl)\.?\s+)*)(\S+)\s+(.+)$/i);
  return m ? [(m[1] + m[2]).trim(), m[3]] : [full.trim(), null];
}

function CredentialsPhoto({ src, name }: { src: string; name: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const id = useId();
  const alt = t('p.credentialsPhoto', { name });

  function reset() {
    setZoomed(false);
    viewport.current?.scrollTo(0, 0);
  }

  return <div className="about-gallery">
    <button type="button" className="cred-preview" aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()}>
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      <span className="cred-caption">{t('p.viewCredentials')} <span aria-hidden="true">↗</span></span>
    </button>
    <dialog id={id} ref={dialog} className="cred-dialog" aria-labelledby={id + '-title'} onClose={reset}
      onClick={(e) => {
        if (e.target !== dialog.current) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.current?.close();
      }}>
      <header>
        <div><h2 id={id + '-title'}>{t('p.credentialGallery')}</h2><p>{name}</p></div>
        <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>{t('p.closePhoto')}</button>
      </header>
      <div ref={viewport} className="cred-viewport" tabIndex={0} role="region" aria-label={alt}>
        <img className={zoomed ? 'is-zoomed' : undefined} src={src} alt={alt} loading="lazy" />
      </div>
      <button type="button" className="btn btn-quiet cred-zoom" aria-pressed={zoomed} onClick={() => zoomed ? reset() : setZoomed(true)}>
        {t(zoomed ? 'p.fitPhoto' : 'p.zoomPhoto')}
      </button>
    </dialog>
  </div>;
}

function DoctorProfile({ doctor: d, canBook, priority }: { doctor: Doctor; canBook: boolean; priority: boolean }) {
  const { t } = useI18n();
  const edu = educationItems(d.education);
  const [first, rest] = nameLines(d.full_name);
  const hasEducation = !!(edu.length || d.credentials_url);
  const role = d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`);
  const eduId = 'edu-' + d.user_id;
  return <article className={'story-doc' + (d.photo_url ? ' story-doc-photo' : '')} aria-labelledby={'doc-' + d.user_id}>
    <div className="about-portrait">
      {d.photo_url && <figure className="story-hero">
        <img src={d.photo_url} alt={d.full_name} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" />
      </figure>}
      <div className="about-profile-copy">
        {!d.photo_url && <Avatar url={d.avatar_url} name={d.full_name} size={76} />}
        <header className="story-name">
          <p>{role}</p>
          <h2 id={'doc-' + d.user_id}><span>{first}</span>{rest && <>{' '}<span>{rest}</span></>}</h2>
        </header>
        {d.bio?.trim() && <div className="story-bio">{paragraphs(d.bio).map((p, i) => <p key={i}>{p}</p>)}</div>}
        {(canBook || hasEducation) && <div className="about-profile-actions">
          {canBook && <Link className="about-book" to={'/zakazi?doktor=' + encodeURIComponent(d.user_id)}>{t('p.book')} <span aria-hidden="true">↗</span></Link>}
          {hasEducation && <a className="about-jump" href={'#' + eduId}>{t('p.trainingLink')} <span aria-hidden="true">↓</span></a>}
        </div>}
      </div>
    </div>
    {hasEducation && <section tabIndex={-1} id={eduId} className="story-cred" aria-labelledby={eduId + '-title'}>
      <h3 id={eduId + '-title'}>{t('p.education')}</h3>
      <div className={'about-qualifications' + (edu.length && d.credentials_url ? ' has-gallery' : '')}>
        {edu.length > 0 && <ul className="cred-list">
          {edu.map((e, i) => <li key={i}>
            <span className="cred-text"><strong className="cred-title">{e.title}</strong>{e.detail && <span className="cred-detail">{e.detail}</span>}</span>
            {e.year && <span className="cred-year">{e.year}</span>}
          </li>)}
        </ul>}
        {d.credentials_url && <CredentialsPhoto src={d.credentials_url} name={d.full_name} />}
      </div>
    </section>}
  </article>;
}

export function AboutPractice({ doctors, canBook }: { doctors: Doctor[]; canBook: boolean }) {
  const { t } = useI18n();
  const { current } = useSession();
  useEffect(() => { if (!window.location.hash) window.scrollTo(0, 0); }, []);
  if (!current) return null;
  const c = current.clinic;
  const shown = doctors.filter(hasProfile);
  const others = doctors.filter((d) => !hasProfile(d));
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const introPhoto = shown.length ? c.services_photo_url : c.cover_url || c.services_photo_url;
  const clinicInfo = <section id="o-ordinaciji" tabIndex={-1} className={'practice-intro' + (introPhoto ? ' has-image' : '')} aria-labelledby="about-clinic-name">
    {introPhoto && <img className="about-practice-photo" src={introPhoto} alt={t('p.clinic')} loading={shown.length ? 'lazy' : 'eager'} decoding="async" />}
    <div className="practice-intro-copy">
      <h2 id="about-clinic-name">{c.name}</h2>
      {paragraphs(c.about ?? '').map((p, i) => <p key={i}>{p}</p>)}
      {(place || c.phone) && <address className="about-contact">
        {place && <span>{place}</span>}
        {c.phone && <a href={'tel:' + c.phone.replace(/\s+/g, '')}>{c.phone}</a>}
      </address>}
    </div>
  </section>;

  return <div className="about-edition">
    <header className="about-mast"><h1>{t('p.aboutTitle')}</h1>
      {shown.length > 0 && <a href="#o-ordinaciji">{t('p.clinic')}{c.city && ' · ' + c.city} <span aria-hidden="true">↓</span></a>}
    </header>
    {!shown.length && clinicInfo}
    {shown.length > 0 && <section className="story" aria-label={t('p.careTeam')}>
      {shown.map((d, i) => <DoctorProfile key={d.user_id} doctor={d} priority={i === 0}
        canBook={canBook && ['owner', 'doctor', 'specialist'].includes(d.role)} />)}
    </section>}
    {others.length > 0 && <section className="about-team">
      <h2>{t('p.careTeam')}</h2>
      <ul className="doctors">
        {others.map((d) => <li key={d.user_id}><Avatar url={d.avatar_url} name={d.full_name} size={52} />
          <span><strong>{d.full_name}</strong><span className="meta">{d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`)}</span></span>
        </li>)}
      </ul>
    </section>}
    {shown.length > 0 && clinicInfo}
  </div>;
}

export function ClinicContact() {
  const { t } = useI18n();
  const { current } = useSession();
  if (!current) return null;
  const c = current.clinic;
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const names = t('cal.weekdays').split('|');
  const order = ['1', '2', '3', '4', '5', '6', '0'] as const;
  const open = order.filter((d) => c.working_hours?.[d]);
  const today = String(new Date().getDay());
  if (!place && !c.phone && !c.entrance_photo_url && !open.length) return null;

  return (
    <section className="practice-visit" aria-labelledby="practice-location-title">
      <ClinicLocation photo={c.entrance_photo_url} name={c.name} place={place} phone={c.phone} />
      {open.length > 0 && (
        <details className="practice-hours">
          <summary>{t('p.openingHours')}</summary>
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
