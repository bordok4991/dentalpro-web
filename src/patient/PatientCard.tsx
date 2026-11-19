import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { money } from '../lib/format';
import { itemAmount, planTotals } from '../lib/api';
import { api, useSession } from '../lib/session';
import type { Balance, MyTooth, Payment, SurfaceKey, TreatmentPlan } from '../lib/types';
import { Odontogram } from '../components/Odontogram';
import { Button, Loading, Notice } from '../components/ui';
import { NotLinked, usePatient } from './PatientApp';
import { MessagesSection } from './PatientMessages';

/** Moj karton: stanje zuba, planovi terapije i uplate. Samo za čitanje, osim odgovora na plan. */
export function MyCard() {
  const { t } = useI18n();
  const { current } = useSession();
  const { patient, preview } = usePatient();
  const [teeth, setTeeth] = useState<Map<number, MyTooth> | null>(null);
  const [tooth, setTooth] = useState<number | null>(null);
  const clinicId = current?.clinic.id;

  useEffect(() => {
    if (!clinicId || !patient) return;
    let alive = true;
    (preview ? api.teeth(patient.id) : api.myTeeth(clinicId))
      .then((ts: MyTooth[]) => alive && setTeeth(new Map(ts.map((x) => [x.tooth, { tooth: x.tooth, condition: x.condition, endo: x.endo, surfaces: x.surfaces }]))))
      .catch(() => alive && setTeeth(new Map()));
    return () => {
      alive = false;
    };
  }, [clinicId, patient, preview]);

  if (patient === undefined) return <Loading />;
  if (patient === null) {
    return (
      <>
        <h1>{t('p.cardTitle')}</h1>
        <NotLinked />
      </>
    );
  }

  return (
    <>
      <h1>{t('p.cardTitle')}</h1>
      <p className="muted">
        {patient.first_name} {patient.last_name} · {t('patients.card', { n: patient.card_number })}
      </p>

      <section className="papp-section" aria-labelledby="c-teeth">
        <h2 id="c-teeth">{t('p.teethTitle')}</h2>
        <p className="hint">{t('p.teethHint')}</p>
        {teeth === null ? (
          <Loading />
        ) : (
          <div className="pcard pcard-flush">
            <Odontogram statuses={teeth} counts={new Map()} selected={tooth} onSelect={(n) => setTooth(n === tooth ? null : n)} patientView />
            {tooth != null && <ToothSummary n={tooth} st={teeth.get(tooth)} onClose={() => setTooth(null)} />}
          </div>
        )}
      </section>

      <MessagesSection patientId={patient.id} />
      <PlansSection patientId={patient.id} />
      <PaymentsSection patientId={patient.id} />
    </>
  );
}

function ToothSummary({ n, st, onClose }: { n: number; st?: MyTooth; onClose: () => void }) {
  const { t } = useI18n();
  const marks = Object.entries(st?.surfaces ?? {}) as [SurfaceKey, string][];
  return (
    <div className="tooth-summary" aria-live="polite">
      <div className="block-head">
        <strong>{t('tooth.title', { n })}</strong>
        <button type="button" className="link-btn" onClick={onClose}>
          {t('tooth.close')}
        </button>
      </div>
      <ul className="plain">
        {st && st.condition !== 'zdrav' && <li>{t(`tooth.c.${st.condition}` as Key)}</li>}
        {(!st || (st.condition === 'zdrav' && !st.endo && marks.length === 0)) && <li>{t('tooth.c.zdrav')}</li>}
        {st?.endo && <li>{t('teeth.legend.endo')}</li>}
        {marks.map(([k, m]) => (
          <li key={k}>
            {t(`tooth.mark.${m}` as Key)}: {t(`tooth.s.${k}` as Key).toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlansSection({ patientId }: { patientId: string }) {
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const { hash } = useLocation();
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [asking, setAsking] = useState<{ id: string; accept: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const { preview } = usePatient();
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    let alive = true;
    api
      .plans(patientId)
      .then((p) => alive && setPlans(p.filter((x) => x.status !== 'nacrt')))
      .catch((e) => alive && (setError(errorKey(e)), setPlans([])));
    return () => {
      alive = false;
    };
  }, [patientId]);

  useEffect(() => {
    if (plans && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [plans, hash]);

  async function respond() {
    if (!asking) return;
    if (preview) {
      setAsking(null);
      return setError('pv.noAction');
    }
    setError(null);
    setBusy(true);
    try {
      await api.respondPlan(asking.id, asking.accept);
      setPlans((await api.plans(patientId)).filter((x) => x.status !== 'nacrt'));
      setAsking(null);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="papp-section" aria-labelledby="c-plans">
      <h2 id="c-plans">{t('p.plansTitle')}</h2>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {plans === null ? (
        <Loading />
      ) : plans.length === 0 ? (
        <p className="muted">{t('p.noPlans')}</p>
      ) : (
        plans.map((p) => {
          const tot = planTotals(p);
          const expired = p.status === 'poslan' && p.valid_until != null && p.valid_until < new Date().toISOString().slice(0, 10);
          return (
            <article key={p.id} id={`plan-${p.id}`} className={`pcard plan-card${p.status === 'poslan' ? ' plan-card-open' : ''}`}>
              <div className="block-head">
                <h3>{p.title}</h3>
                <span className={`tag plan-st-${p.status}`}>{t(`p.planStatus.${p.status}` as Key)}</span>
              </div>
              <ul className="plan-lines">
                {p.items.map((i) => (
                  <li key={i.id} className={i.done_at ? 'is-done' : undefined}>
                    <span>
                      {i.tooth != null && <span className="tag tag-tooth">{i.tooth}</span>} {i.description}
                      {i.qty > 1 && <span className="meta"> × {i.qty}</span>}
                      {i.done_at && <span className="meta"> · {t('p.itemDone')}</span>}
                    </span>
                    <span>{money(itemAmount(i, p.discount_pct), currency, locale)}</span>
                  </li>
                ))}
              </ul>
              <p className="plan-card-total">
                {tot.discount > 0 && <span className="meta">{t('p.discountIncluded', { amount: money(tot.discount, currency, locale) })}</span>}
                <span>{t('plan.total')}</span>
                <strong>{money(tot.total, currency, locale)}</strong>
              </p>
              {p.note && <p className="pre muted">{p.note}</p>}
              {p.valid_until && p.status === 'poslan' && <p className="hint">{t('p.offerValid', { date: date(p.valid_until) })}</p>}
              {p.status === 'poslan' && !expired && (
                <>
                  {asking?.id === p.id ? (
                    <div className="rowitem-edit">
                      <p>{t(asking.accept ? 'p.acceptAsk' : 'p.declineAsk')}</p>
                      <div className="row">
                        <Button busy={busy} variant={asking.accept ? 'primary' : 'danger'} onClick={() => void respond()}>
                          {t(asking.accept ? 'p.acceptYes' : 'p.declineYes')}
                        </Button>
                        <Button variant="quiet" onClick={() => setAsking(null)}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <Button onClick={() => setAsking({ id: p.id, accept: true })}>{t('p.accept')}</Button>
                      <Button variant="quiet" onClick={() => setAsking({ id: p.id, accept: false })}>
                        {t('p.decline')}
                      </Button>
                    </div>
                  )}
                  <p className="hint">{t('p.acceptHint')}</p>
                </>
              )}
              {expired && <p className="hint">{t('p.offerExpired')}</p>}
              <Link className="text-link" to={`/plans/${p.id}/print`}>
                {t('p.offerPdf')}
              </Link>
            </article>
          );
        })
      )}
    </section>
  );
}

function PaymentsSection({ patientId }: { patientId: string }) {
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const [bal, setBal] = useState<Balance | null | undefined>(undefined);
  const [list, setList] = useState<Payment[]>([]);
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    let alive = true;
    Promise.all([api.balance(patientId), api.patientPayments(patientId)])
      .then(([b, p]) => {
        if (!alive) return;
        setBal(b);
        setList(p.filter((x) => !x.voided_at));
      })
      .catch(() => alive && setBal(null));
    return () => {
      alive = false;
    };
  }, [patientId]);

  return (
    <section className="papp-section" aria-labelledby="c-pay">
      <h2 id="c-pay">{t('p.paymentsTitle')}</h2>
      {bal === undefined ? (
        <Loading />
      ) : (
        <div className="pcard">
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
              <dt>{(bal?.balance ?? 0) < 0 ? t('fin.credit') : t('p.toPay')}</dt>
              <dd>{money(Math.abs(bal?.balance ?? 0), currency, locale)}</dd>
            </div>
          </dl>
          {list.length > 0 && (
            <ul className="plan-lines">
              {list.map((p) => (
                <li key={p.id}>
                  <span>
                    {date(p.paid_on)} · {t(`pay.m.${p.method}`)}
                  </span>
                  <span>{money(p.amount, currency, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">{t('p.paymentsHint')}</p>
        </div>
      )}
    </section>
  );
}
