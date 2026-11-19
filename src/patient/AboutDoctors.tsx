import { useI18n } from '../lib/i18n';
import { educationItems, paragraphs } from '../lib/format';
import { useSession } from '../lib/session';
import type { Doctor } from '../lib/types';
import { Avatar } from '../components/Avatar';

/** Doktor ima šta pokazati pacijentima: veću sliku, biografiju ili obrazovanje. */
export function hasProfile(d: Doctor): boolean {
  return !!(d.photo_url || d.bio?.trim() || d.education?.trim());
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

/** Predstavljanje doktora: portret, ime, kratko o doktoru, edukacije sa slikom certifikata. */
export function AboutDoctors({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const shown = doctors.filter(hasProfile);
  if (shown.length === 0) return null;
  return (
    <section className="story" aria-labelledby="p-about">
      <h2 id="p-about" className="sr-only">
        {t('p.aboutTitle')}
      </h2>
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
              <h3 id={`doc-${d.user_id}`}>
                <span>{first}</span>
                {rest && <span>{rest}</span>}
              </h3>
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
                <h4 id={`edu-${d.user_id}`}>{t('p.education')}</h4>
                {d.credentials_url && <img className="story-cred-img" src={d.credentials_url} alt={t('p.credentialsPhoto', { name: d.full_name })} loading="lazy" />}
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

/** Ordinacija: slika prostora s imenom, opis, kontakt i radno vrijeme (danas istaknuto). */
export function ClinicStory({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const { current } = useSession();
  if (!current) return null;
  const c = current.clinic;
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const names = t('cal.weekdays').split('|');
  const order = ['1', '2', '3', '4', '5', '6', '0'] as const;
  const open = order.filter((d) => c.working_hours?.[d]);
  const today = String(new Date().getDay());

  return (
    <section className="story-clinic" aria-labelledby="p-clinic">
      {c.cover_url ? (
        <figure className="story-cover">
          <img src={c.cover_url} alt="" loading="lazy" />
          <figcaption>
            <h2 id="p-clinic">{c.name}</h2>
            {place && <p>{place}</p>}
          </figcaption>
        </figure>
      ) : (
        <header className="story-clinic-head">
          <h2 id="p-clinic">{c.name}</h2>
          {place && <p className="meta">{place}</p>}
        </header>
      )}
      {c.about?.trim() && (
        <div className="story-about">
          {paragraphs(c.about).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {doctors.length > 0 && (
        <ul className="doctors">
          {doctors.map((d) => (
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
      <div className="row">
        {c.phone && (
          <a className="btn btn-primary" href={`tel:${c.phone.replace(/\s+/g, '')}`}>
            {t('p.call', { phone: c.phone })}
          </a>
        )}
        {place && (
          <a className="btn btn-quiet" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${place}`)}`} target="_blank" rel="noreferrer">
            {t('p.map')}
          </a>
        )}
      </div>
      {open.length > 0 && (
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
      )}
    </section>
  );
}
