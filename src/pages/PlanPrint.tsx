import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { money } from '../lib/format';
import { planTotals } from '../lib/api';
import { api, useSession } from '../lib/session';
import type { Patient, TreatmentPlan } from '../lib/types';
import { Loading, Notice } from '../components/ui';

/**
 * Ponuda za štampu. "Sačuvaj kao PDF" je ugrađen u dijalog za štampu
 * svakog preglednika, pa nema posebnog generatora PDF-a.
 */
export function PlanPrint() {
  const { planId = '' } = useParams();
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const [plan, setPlan] = useState<TreatmentPlan | null | undefined>(undefined);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .plan(planId)
      .then(async (p) => {
        if (!alive) return;
        setPlan(p);
        if (p) setPatient(await api.patient(p.patient_id));
      })
      .catch((e) => alive && (setError(errorKey(e)), setPlan(null)));
    return () => {
      alive = false;
    };
  }, [planId]);

  useEffect(() => {
    if (plan && patient) document.title = `${t('print.docTitle')} – ${patient.last_name} ${patient.first_name}`;
    return () => {
      document.title = 'Dental Pro';
    };
  }, [plan, patient, t]);

  if (!current) return null;
  const isPatient = current.role === 'patient';
  const backTo = isPatient ? '/moj-karton' : plan ? `/patients/${plan.patient_id}/plans/${plan.id}` : '/patients';

  if (plan === undefined) return <div className="print-page"><Loading /></div>;
  if (plan === null) {
    return (
      <div className="print-page">
        <Notice kind="error">{t(error ?? 'plan.notFound')}</Notice>
        <Link className="text-link" to={backTo}>
          {t('print.back')}
        </Link>
      </div>
    );
  }

  const c = current.clinic;
  const tot = planTotals(plan);
  const cur = c.currency;
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const issued = plan.sent_at ?? plan.created_at;

  return (
    <div className="print-page">
      <div className="print-actions no-print">
        <Link className="text-link" to={backTo}>
          {t('print.back')}
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          {t('print.print')}
        </button>
        <p className="hint">{t('print.pdfHint')}</p>
      </div>

      <article className="print-doc" aria-label={t('print.docTitle')}>
        <header className="print-head">
          <div className="print-clinic">
            {c.logo_url && <img src={c.logo_url} alt="" className="print-logo" />}
            <div>
              <strong>{c.name}</strong>
              {c.doctor_name && <span>{c.doctor_name}</span>}
              {place && <span>{place}</span>}
              {(c.phone || c.email) && <span>{[c.phone, c.email].filter(Boolean).join(' · ')}</span>}
            </div>
          </div>
          <div className="print-meta">
            <h1>{t('print.docTitle')}</h1>
            <span>{t('print.date', { date: date(issued) })}</span>
            {plan.valid_until && <span>{t('print.validUntil', { date: date(plan.valid_until) })}</span>}
          </div>
        </header>

        {patient && (
          <p className="print-patient">
            <span>{t('print.patient')}</span>
            <strong>
              {patient.first_name} {patient.last_name}
            </strong>
            <span>
              {t('patients.card', { n: patient.card_number })}
              {patient.date_of_birth && ` · ${t('print.born', { date: date(patient.date_of_birth) })}`}
            </span>
          </p>
        )}

        <h2 className="print-title">{plan.title}</h2>

        <table className="print-table">
          <thead>
            <tr>
              <th scope="col">{t('print.tooth')}</th>
              <th scope="col">{t('print.service')}</th>
              <th scope="col" className="num">
                {t('print.qty')}
              </th>
              <th scope="col" className="num">
                {t('print.price')}
              </th>
              <th scope="col" className="num">
                {t('print.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.items.map((i) => (
              <tr key={i.id}>
                <td>{i.tooth ?? ''}</td>
                <td>{i.description}</td>
                <td className="num">{i.qty}</td>
                <td className="num">{money(i.unit_price, cur, locale)}</td>
                <td className="num">{money(i.unit_price * i.qty, cur, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {tot.discount > 0 && (
              <>
                <tr>
                  <th scope="row" colSpan={4}>
                    {t('plan.subtotal')}
                  </th>
                  <td className="num">{money(tot.subtotal, cur, locale)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={4}>
                    {t('plan.discountLine', { pct: String(plan.discount_pct).replace('.', locale === 'en' ? '.' : ',') })}
                  </th>
                  <td className="num">−{money(tot.discount, cur, locale)}</td>
                </tr>
              </>
            )}
            <tr className="print-total">
              <th scope="row" colSpan={4}>
                {t('plan.total')}
              </th>
              <td className="num">{money(tot.total, cur, locale)}</td>
            </tr>
          </tfoot>
        </table>

        {plan.note && <p className="print-note">{plan.note}</p>}

        {(plan.status === 'prihvacen' || plan.status === 'zavrsen') && plan.responded_at && (
          <p className="print-accepted">{t('print.accepted', { date: date(plan.responded_at) })}</p>
        )}

        <p className="print-fine">{t('print.fine')}</p>

        <div className="print-sign">
          <span>{t('print.signPatient')}</span>
          <span>{t('print.signDoctor')}</span>
        </div>
      </article>
    </div>
  );
}
