import { useI18n } from '../lib/i18n';
import { educationItems, paragraphs } from '../lib/format';
import type { Doctor } from '../lib/types';
import { Avatar } from '../components/Avatar';

/** Doktor ima šta pokazati pacijentima: veću sliku, biografiju ili obrazovanje. */
export function hasProfile(d: Doctor): boolean {
  return !!(d.photo_url || d.bio?.trim() || d.education?.trim());
}

/** Predstavljanje doktora: veća slika, kratko o doktoru, obrazovanje i edukacije. */
export function AboutDoctors({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const shown = doctors.filter(hasProfile);
  if (shown.length === 0) return null;
  return (
    <section className="papp-section" aria-labelledby="p-about">
      <h2 id="p-about">{t('p.aboutTitle')}</h2>
      {shown.map((d) => {
        const role = d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`);
        const edu = educationItems(d.education);
        return (
          <article key={d.user_id} className="pcard doc-feature">
            {d.photo_url ? (
              <figure className="doc-photo">
                <img src={d.photo_url} alt={d.full_name} loading="lazy" />
                <figcaption>
                  <strong>{d.full_name}</strong>
                  <span>{role}</span>
                </figcaption>
              </figure>
            ) : (
              <div className="doc-head">
                <Avatar url={d.avatar_url} name={d.full_name} size={88} />
                <span>
                  <strong>{d.full_name}</strong>
                  <span className="meta">{role}</span>
                </span>
              </div>
            )}
            <div className="doc-body">
              {paragraphs(d.bio ?? '').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {edu.length > 0 && (
                <>
                  <h3>{t('p.education')}</h3>
                  <ol className="edu">
                    {edu.map((e, i) => (
                      <li key={i}>
                        {e.year && <span className="edu-year">{e.year}</span>}
                        <span>{e.text}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
