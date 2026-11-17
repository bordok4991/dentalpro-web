import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { money, parseAmount } from '../lib/format';
import { api, useSession } from '../lib/session';
import type { Service, ServiceInput } from '../lib/types';
import { Button, Field, Loading, Notice } from '../components/ui';

const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180];

/** Cjenovnik: usluge s cijenom i trajanjem. Mijenja vlasnik; ostali vide. */
export function Services() {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const [list, setList] = useState<Service[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [showOff, setShowOff] = useState(false);

  const clinicId = current?.clinic.id;
  const canEdit = current?.role === 'owner';
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    api
      .services(clinicId)
      .then((s) => alive && setList(s))
      .catch((e) => alive && (setError(errorKey(e)), setList([])));
    return () => {
      alive = false;
    };
  }, [clinicId]);

  if (!current || !clinicId) return null;
  const shown = (list ?? []).filter((s) => showOff || s.is_active);
  const offCount = (list ?? []).filter((s) => !s.is_active).length;

  function saved(s: Service) {
    setList((l) => [...(l ?? []).filter((x) => x.id !== s.id), s].sort((a, b) => a.name.localeCompare(b.name, 'bs')));
    setEditing(null);
  }

  return (
    <>
      <header className="page-head page-head-row">
        <h1>{t('services.title')}</h1>
        <p className="lead">{t(canEdit ? 'services.lead' : 'services.leadReadOnly')}</p>
        {canEdit && editing !== 'new' && <Button onClick={() => setEditing('new')}>{t('services.add')}</Button>}
      </header>

      {error && <Notice kind="error">{t(error)}</Notice>}

      <section className="block">
        {editing === 'new' && <ServiceForm clinicId={clinicId} onSaved={saved} onCancel={() => setEditing(null)} />}
        {list === null ? (
          <Loading />
        ) : shown.length === 0 && editing !== 'new' ? (
          <p className="muted">{t(canEdit ? 'services.empty' : 'services.emptyReadOnly')}</p>
        ) : (
          <ul className="rows">
            {shown.map((s) => (
              <li key={s.id} className={`rowitem${s.is_active ? '' : ' rowitem-off'}`}>
                <div className="rowitem-main">
                  <strong>{s.name}</strong>
                  <span className="meta">
                    {t('services.minutes', { n: s.duration_min })}
                    {!s.is_active && ` · ${t('services.inactive')}`}
                    {s.is_active && current.clinic.online_booking && ` · ${t(s.online ? 'services.onlineYes' : 'services.onlineNo')}`}
                  </span>
                </div>
                <div className="rowitem-actions service-price">
                  <strong>{money(s.price, currency, locale)}</strong>
                  {canEdit && editing !== s.id && (
                    <button type="button" className="link-btn" onClick={() => setEditing(s.id)} aria-label={t('services.editNamed', { name: s.name })}>
                      {t('services.edit')}
                    </button>
                  )}
                </div>
                {editing === s.id && <ServiceForm clinicId={clinicId} service={s} onSaved={saved} onCancel={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        )}
        {offCount > 0 && (
          <label className="check">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            {t('services.showInactive', { n: offCount })}
          </label>
        )}
      </section>
    </>
  );
}

function ServiceForm({ clinicId, service, onSaved, onCancel }: { clinicId: string; service?: Service; onSaved: (s: Service) => void; onCancel: () => void }) {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const currency = current?.clinic.currency ?? 'KM';
  const [name, setName] = useState(service?.name ?? '');
  const [price, setPrice] = useState(service ? (locale === 'en' ? service.price.toFixed(2) : service.price.toFixed(2).replace('.', ',')) : '');
  const [minutes, setMinutes] = useState(service?.duration_min ?? 30);
  const [active, setActive] = useState(service?.is_active ?? true);
  const [online, setOnline] = useState(service?.online ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('err.serviceName');
    const p = parseAmount(price);
    if (p === null || p < 0) return setError('err.price');
    const input: ServiceInput = { name, price: p, duration_min: minutes, is_active: active, online };
    setBusy(true);
    try {
      onSaved(await api.saveService(clinicId, input, service?.id));
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <form className="rowitem-edit" onSubmit={submit} noValidate aria-label={service ? t('services.editNamed', { name: service.name }) : t('services.add')}>
      {error && <Notice kind="error">{t(error)}</Notice>}
      <Field label={t('services.name')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus={!service} />
      <div className="grid-2">
        <Field label={t('services.price', { currency })} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <div className="field">
          <label htmlFor={`dur-${service?.id ?? 'new'}`}>{t('services.duration')}</label>
          <select id={`dur-${service?.id ?? 'new'}`} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[...new Set([...DURATIONS, minutes])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                {t('services.minutes', { n: m })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        {t('services.onlineLabel')}
      </label>
      {service && (
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('services.activeLabel')}
        </label>
      )}
      <div className="row">
        <Button type="submit" busy={busy}>
          {t('services.save')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
