import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/session';
import type { Service } from '../lib/types';

export function ClinicServices({ clinicId, photo, canBook }: { clinicId: string; photo: string; canBook: boolean }) {
  const { t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    let active = true;
    api.services(clinicId)
      .then((items) => {
        if (active) setServices(items.filter((s) => s.is_active && s.online));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [clinicId]);

  if (!services.length) return null;
  return (
    <section className="practice-services" aria-labelledby="practice-services-title">
      <img className="practice-room" src={photo} alt={t('p.treatmentRoom')} width={820} height={1093} loading="lazy" decoding="async" />
      <div className="practice-service-copy">
        <h2 id="practice-services-title">{t('p.practiceServices')}</h2>
        <ul role="list">
          {services.map((s) => <li key={s.id}>{s.name}</li>)}
        </ul>
        {canBook && (
          <Link to="/zakazi" className="practice-service-booking">
            {t('p.book')}<span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
    </section>
  );
}

export function ClinicLocation({ photo, name, place, phone }: { photo?: string | null; name: string; place: string; phone: string | null }) {
  const { t } = useI18n();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, place].filter(Boolean).join(', '))}`;
  return (
    <div className={`practice-location${photo ? ' has-photo' : ''}`}>
      {photo && <img src={photo} alt={t('p.practiceEntrance')} width={600} height={800} loading="lazy" decoding="async" />}
      <div className="practice-location-copy">
        <h2 id="practice-location-title">{t('p.directions')}</h2>
        {place && <address>{place}</address>}
        <div className="practice-location-actions">
          {(place || photo) && (
            <a className="practice-map-action" href={mapsUrl} target="_blank" rel="noreferrer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.4" />
              </svg>
              {t('p.findOnMap')}
            </a>
          )}
          {phone && <a className="practice-call-action" href={`tel:${phone.replace(/\s+/g, '')}`}>{t('p.call', { phone })}</a>}
        </div>
      </div>
    </div>
  );
}
