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
        <ul>
          {services.map((s) => <li key={s.id}>{s.name}</li>)}
        </ul>
        {canBook && <Link to="/zakazi" className="text-link">{t('p.book')}</Link>}
      </div>
    </section>
  );
}

export function ClinicLocation({ photo, name, place, phone }: { photo: string; name: string; place: string; phone: string | null }) {
  const { t } = useI18n();
  return (
    <section className="practice-location" aria-labelledby="practice-location-title">
      <img src={photo} alt={t('p.practiceEntrance')} width={600} height={800} loading="lazy" decoding="async" />
      <div className="practice-location-copy">
        <h3 id="practice-location-title">{t('p.directions')}</h3>
        {place && <p>{place}</p>}
        <a className="text-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, place].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">{t('p.map')}</a>
        {phone && <a className="text-link" href={`tel:${phone.replace(/\s+/g, '')}`}>{t('p.call', { phone })}</a>}
      </div>
    </section>
  );
}
