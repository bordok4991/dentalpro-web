import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Loading, Notice } from '../components/ui';
import { errorKey } from '../lib/errors';
import { money } from '../lib/format';
import { useI18n, type Key } from '../lib/i18n';
import { api, useSession } from '../lib/session';
import type { Service } from '../lib/types';
import { usePatient } from './PatientApp';

export function PatientPriceList() {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const { patient } = usePatient();
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [attempt, setAttempt] = useState(0);
  const clinicId = current?.clinic.id;

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setServices(null);
    setError(null);
    api.services(clinicId)
      .then((items) => { if (alive) setServices(items.filter((service) => service.is_active)); })
      .catch((e) => { if (alive) setError(errorKey(e)); });
    return () => { alive = false; };
  }, [clinicId, attempt]);

  if (!current) return null;
  const clinic = current.clinic;
  return (
    <section className="patient-prices" aria-labelledby="patient-prices-title">
      <header className="patient-prices-header">
        <h1 id="patient-prices-title">{t('services.title')}</h1>
      </header>
      <div className="patient-prices-body">
        {error ? (
          <>
            <Notice kind="error">{t(error)}</Notice>
            <Button onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</Button>
          </>
        ) : services === null ? (
          <Loading />
        ) : services.length === 0 ? (
          <p>{t('services.emptyReadOnly')}</p>
        ) : (
          <ul className="patient-prices-list" role="list">
            {services.map((service) => (
              <li key={service.id}>
                <span className="patient-price-name">{service.name}</span>
                <strong className="patient-price-amount">
                  {service.price > 0 ? money(service.price, clinic.currency, locale) : t('p.priceOnRequest')}
                </strong>
              </li>
            ))}
          </ul>
        )}
        <div className="patient-price-actions">
          {patient && clinic.online_booking && (
            <Link className="practice-primary-action" to="/zakazi">{t('p.book')}</Link>
          )}
          {clinic.phone && (
            <a className="text-link" href={`tel:${clinic.phone.replace(/\s+/g, '')}`}>{t('p.call', { phone: clinic.phone })}</a>
          )}
        </div>
      </div>
    </section>
  );
}
