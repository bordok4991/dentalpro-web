import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { money, monthRange, shiftMonth } from '../lib/format';
import { api, useSession } from '../lib/session';
import { PAYMENT_METHODS, type Balance, type Patient, type Payment } from '../lib/types';
import { Button, Loading, Notice } from '../components/ui';
import { PaymentForm, PaymentRow } from '../components/PaymentForm';

type Debt = Balance & { patient: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'card_number'> };

/** Uplate po mjesecima, ukupno po načinu plaćanja i ko još duguje. */
export function Finances() {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const [month, setMonth] = useState(() => monthRange(todayIso()).from);
  const [list, setList] = useState<Payment[] | null>(null);
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);

  const clinicId = current?.clinic.id;
  const currency = current?.clinic.currency ?? 'KM';
  const range = monthRange(month);
  const isCurrent = range.from === monthRange(todayIso()).from;

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setList(null);
    api
      .payments(clinicId, range.from, range.to)
      .then((p) => alive && setList(p))
      .catch((e) => alive && (setError(errorKey(e)), setList([])));
    return () => {
      alive = false;
    };
  }, [clinicId, range.from, range.to]);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    api
      .debts(clinicId)
      .then((d) => alive && setDebts(d))
      .catch(() => alive && setDebts([]));
    return () => {
      alive = false;
    };
  }, [clinicId, list]);

  const totals = useMemo(() => {
    const valid = (list ?? []).filter((p) => !p.voided_at);
    const by = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<string, number>;
    for (const p of valid) by[p.method] += p.amount;
    return { total: valid.reduce((s, p) => s + p.amount, 0), count: valid.length, by };
  }, [list]);

  if (!current || !clinicId) return null;
  const [y, m] = range.from.split('-').map(Number);
  const monthName = t('cal.monthsNominative').split('|')[m - 1];

  return (
    <>
      <header className="page-head page-head-row">
        <h1>{t('fin.title')}</h1>
        <p className="lead">{t('fin.lead')}</p>
        {!adding && (
          <Button
            onClick={() => {
              setAdding(true);
              setSaved(false);
            }}
          >
            {t('pay.new')}
          </Button>
        )}
      </header>

      {error && <Notice kind="error">{t(error)}</Notice>}
      {saved && <Notice kind="ok">{t('pay.saved')}</Notice>}
      {adding && (
        <section className="block">
          <h2>{t('pay.new')}</h2>
          <PaymentForm
            clinicId={clinicId}
            onCancel={() => setAdding(false)}
            onSaved={(p) => {
              setAdding(false);
              setSaved(true);
              if (p.paid_on >= range.from && p.paid_on <= range.to) setList((l) => [p, ...(l ?? [])].sort((a, b) => b.paid_on.localeCompare(a.paid_on)));
              else setMonth(monthRange(p.paid_on).from);
            }}
          />
        </section>
      )}

      <section className="block" aria-labelledby="fin-month">
        <div className="block-head fin-month">
          <h2 id="fin-month">{t('fin.monthTitle', { month: monthName, year: y })}</h2>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('fin.prevMonth')}>
              ‹
            </button>
            {!isCurrent && (
              <button type="button" className="btn btn-quiet" onClick={() => setMonth(monthRange(todayIso()).from)}>
                {t('fin.thisMonth')}
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrent} aria-label={t('fin.nextMonth')}>
              ›
            </button>
          </div>
        </div>

        {list === null ? (
          <Loading />
        ) : (
          <>
            <div className="fin-totals">
              <p className="fin-big">
                <span>{t('fin.received')}</span>
                <strong>{money(totals.total, currency, locale)}</strong>
                <span className="meta">{t('fin.count', { n: totals.count })}</span>
              </p>
              <dl className="fin-methods">
                {PAYMENT_METHODS.map((pm) => (
                  <div key={pm}>
                    <dt>{t(`pay.m.${pm}`)}</dt>
                    <dd>{money(totals.by[pm], currency, locale)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {list.length === 0 ? (
              <p className="muted">{t('fin.none')}</p>
            ) : (
              <ul className="rows">
                {list.map((p) => (
                  <PaymentRow key={p.id} payment={p} showPatient onChange={(n) => setList((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)))} />
                ))}
              </ul>
            )}
          </>
        )}
        <p className="hint">{t('fin.fiscal')}</p>
      </section>

      <section className="block" aria-labelledby="fin-debts">
        <h2 id="fin-debts">{t('fin.debts')}</h2>
        <p className="hint">{t('fin.debtsHint')}</p>
        {debts === null ? (
          <Loading />
        ) : debts.length === 0 ? (
          <p className="muted">{t('fin.noDebts')}</p>
        ) : (
          <ul className="rows">
            {debts.map((d) => (
              <li key={d.patient_id} className="rowitem">
                <div className="rowitem-main">
                  <Link className="text-link" to={`/patients/${d.patient_id}`}>
                    {d.patient.last_name} {d.patient.first_name}
                  </Link>
                  <span className="meta">
                    {t('patients.card', { n: d.patient.card_number })} · {t('fin.chargedPaid', { charged: money(d.charged, currency, locale), paid: money(d.paid, currency, locale) })}
                  </span>
                </div>
                <strong className="fin-debt">{money(d.balance, currency, locale)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Blok u kartonu: stanje računa pacijenta i njegove uplate. */
export function PatientFinance({ patient }: { patient: Patient }) {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const [bal, setBal] = useState<Balance | null | undefined>(undefined);
  const [list, setList] = useState<Payment[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    let alive = true;
    Promise.all([api.balance(patient.id), api.patientPayments(patient.id)])
      .then(([b, p]) => {
        if (!alive) return;
        setBal(b);
        setList(p);
      })
      .catch((e) => alive && (setError(errorKey(e)), setBal(null), setList([])));
    return () => {
      alive = false;
    };
  }, [patient.id]);

  async function reloadBalance() {
    try {
      setBal(await api.balance(patient.id));
    } catch {
      /* stanje se osvježi pri sljedećem otvaranju */
    }
  }

  if (!current) return null;
  return (
    <section className="block" aria-labelledby="k-fin">
      <div className="block-head">
        <h2 id="k-fin">{t('fin.patientTitle')}</h2>
        {!adding && <Button onClick={() => setAdding(true)}>{t('pay.new')}</Button>}
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {bal === undefined ? (
        <Loading />
      ) : (
        <dl className="fin-methods fin-patient">
          <div>
            <dt>{t('fin.charged')}</dt>
            <dd>{money(bal?.charged ?? 0, currency, locale)}</dd>
          </div>
          <div>
            <dt>{t('fin.paid')}</dt>
            <dd>{money(bal?.paid ?? 0, currency, locale)}</dd>
          </div>
          <div className={(bal?.balance ?? 0) > 0 ? 'fin-owes' : undefined}>
            <dt>{(bal?.balance ?? 0) < 0 ? t('fin.credit') : t('fin.balance')}</dt>
            <dd>{money(Math.abs(bal?.balance ?? 0), currency, locale)}</dd>
          </div>
        </dl>
      )}
      <p className="hint">{t('fin.patientHint')}</p>
      {adding && (
        <PaymentForm
          clinicId={current.clinic.id}
          patient={patient}
          onCancel={() => setAdding(false)}
          onSaved={(p) => {
            setAdding(false);
            setList((l) => [p, ...(l ?? [])]);
            void reloadBalance();
          }}
        />
      )}
      {list && list.length > 0 && (
        <ul className="rows">
          {list.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              onChange={(n) => {
                setList((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)));
                void reloadBalance();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
