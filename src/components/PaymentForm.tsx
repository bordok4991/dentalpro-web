import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { money, parseAmount } from '../lib/format';
import { api, useSession } from '../lib/session';
import { PAYMENT_METHODS, type Patient, type Payment, type PaymentMethod, type TreatmentPlan } from '../lib/types';
import { planTotals } from '../lib/api';
import { Button, Field, Notice, SelectField } from './ui';
import { PatientPicker } from './PatientPicker';

/** Upis uplate. Pacijent je zadan (karton) ili se bira (finansije). */
export function PaymentForm({
  clinicId,
  patient: fixed,
  onSaved,
  onCancel,
}: {
  clinicId: string;
  patient?: Patient;
  onSaved: (p: Payment) => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const currency = current?.clinic.currency ?? 'KM';
  const [patient, setPatient] = useState<Patient | null>(fixed ?? null);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('gotovina');
  const [day, setDay] = useState(todayIso());
  const [planId, setPlanId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    setPlanId('');
    if (!patient) return setPlans([]);
    let alive = true;
    api
      .plans(patient.id)
      .then((ps) => alive && setPlans(ps.filter((p) => p.status === 'prihvacen' || p.status === 'zavrsen')))
      .catch(() => alive && setPlans([]));
    return () => {
      alive = false;
    };
  }, [patient]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) return setError('err.pickPatient');
    const n = parseAmount(amount);
    if (n === null || n <= 0) return setError('err.amount');
    if (!day || day > todayIso()) return setError('err.payDate');
    setBusy(true);
    try {
      onSaved(await api.createPayment(clinicId, { patient_id: patient.id, plan_id: planId || null, amount: n, method, paid_on: day, note }));
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <form className="form-grid rowitem-edit" onSubmit={submit} noValidate aria-label={t('pay.new')}>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {!fixed && <PatientPicker clinicId={clinicId} value={patient} onChange={setPatient} />}
      <div className="grid-2">
        <Field label={t('pay.amount', { currency })} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField label={t('pay.method')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`pay.m.${m}`)}
            </option>
          ))}
        </SelectField>
        <Field label={t('pay.date')} type="date" max={todayIso()} value={day} onChange={(e) => setDay(e.target.value)} />
        {plans.length > 0 && (
          <SelectField label={t('pay.plan')} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{t('pay.noPlan')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {money(planTotals(p).total, currency, locale)}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <Field label={t('pay.note')} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <Button type="submit" busy={busy}>
          {t('pay.save')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Red uplate s mogućnošću storniranja (vlasnik ili ko je upisao). */
export function PaymentRow({ payment, showPatient, onChange }: { payment: Payment; showPatient?: boolean; onChange: (p: Payment) => void }) {
  const { t, date, locale } = useI18n();
  const { current, user } = useSession();
  const currency = current?.clinic.currency ?? 'KM';
  const canVoid = !payment.voided_at && (current?.role === 'owner' || payment.created_by === user?.id);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function doVoid(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) return setError('err.voidReason');
    setBusy(true);
    try {
      onChange(await api.voidPayment(payment.id, reason));
      setVoiding(false);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  const name = payment.patient ? `${payment.patient.last_name} ${payment.patient.first_name}` : '';
  return (
    <li className={`rowitem pay-row${payment.voided_at ? ' pay-void' : ''}`}>
      <div className="rowitem-main">
        <strong className="pay-amount">{money(payment.amount, currency, locale)}</strong>
        <span className="meta">
          {date(payment.paid_on)} · {t(`pay.m.${payment.method}`)}
          {showPatient && name && (
            <>
              {' · '}
              <Link className="text-link" to={`/patients/${payment.patient_id}`}>
                {name}
              </Link>
            </>
          )}
        </span>
        {payment.note && <span className="meta">{payment.note}</span>}
        {payment.voided_at && <span className="meta pay-void-note">{t('pay.voided', { reason: payment.void_reason ?? '' })}</span>}
      </div>
      {canVoid && !voiding && (
        <div className="rowitem-actions">
          <button type="button" className="link-btn" onClick={() => setVoiding(true)}>
            {t('pay.void')}
          </button>
        </div>
      )}
      {voiding && (
        <form className="rowitem-edit" onSubmit={doVoid} noValidate>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <Field label={t('pay.voidReason')} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
          <div className="row">
            <Button type="submit" variant="danger" busy={busy}>
              {t('pay.voidConfirm')}
            </Button>
            <Button variant="quiet" onClick={() => setVoiding(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
