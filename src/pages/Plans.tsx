import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { addDays, money, parseAmount } from '../lib/format';
import { itemAmount, planTotals } from '../lib/api';
import { api, useSession } from '../lib/session';
import { CLINICAL_ROLES, type Patient, type PlanItem, type PlanItemInput, type PlanStatus, type Service, type TreatmentPlan } from '../lib/types';
import { Button, Field, Loading, Notice, SelectField, TextField } from '../components/ui';
import { ToothSelect } from '../components/ToothSelect';

export function PlanStatusTag({ status }: { status: PlanStatus }) {
  const { t } = useI18n();
  return <span className={`tag plan-st-${status}`}>{t(`plan.status.${status}`)}</span>;
}

/** Blok u kartonu: planovi terapije pacijenta i dugme za novi plan. */
export function PlansBlock({ patient }: { patient: Patient }) {
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const clinical = !!current && CLINICAL_ROLES.includes(current.role);
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    let alive = true;
    api
      .plans(patient.id)
      .then((p) => alive && setPlans(p))
      .catch((e) => alive && (setError(errorKey(e)), setPlans([])));
    return () => {
      alive = false;
    };
  }, [patient.id]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError(null);
    if (!title.trim()) return setError('err.planTitle');
    setBusy(true);
    try {
      const p = await api.createPlan(current.clinic.id, patient.id, title);
      navigate(`/patients/${patient.id}/plans/${p.id}`);
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <section className="block" aria-labelledby="k-plans">
      <div className="block-head">
        <h2 id="k-plans">{t('plan.blockTitle')}</h2>
        {clinical && !adding && !patient.is_archived && <Button onClick={() => setAdding(true)}>{t('plan.new')}</Button>}
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {adding && (
        <form className="rowitem-edit" onSubmit={create} noValidate>
          <Field label={t('plan.title')} hint={t('plan.titleHint')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div className="row">
            <Button type="submit" busy={busy}>
              {t('plan.create')}
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
      {plans === null ? (
        <Loading />
      ) : plans.length === 0 ? (
        !adding && <p className="muted">{t('plan.none')}</p>
      ) : (
        <ul className="rows">
          {plans.map((p) => {
            const tot = planTotals(p);
            return (
              <li key={p.id} className="rowitem">
                <div className="rowitem-main">
                  <Link className="text-link" to={`/patients/${patient.id}/plans/${p.id}`}>
                    {p.title}
                  </Link>
                  <span className="meta">
                    {t('plan.itemsCount', { n: p.items.length })} · {date(p.created_at)}
                    {p.status === 'prihvacen' && ` · ${t('plan.doneOf', { done: p.items.filter((i) => i.done_at).length, n: p.items.length })}`}
                  </span>
                </div>
                <div className="rowitem-actions plan-sum">
                  <strong>{money(tot.total, currency, locale)}</strong>
                  <PlanStatusTag status={p.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Uređivanje plana terapije: stavke, popust, slanje pacijentu, praćenje urađenog. */
export function PlanEditor() {
  const { id = '', planId = '' } = useParams();
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TreatmentPlan | null | undefined>(undefined);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<Key | null>(null);
  const [ok, setOk] = useState<Key | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<string | 'new' | null>(null);

  const clinical = !!current && CLINICAL_ROLES.includes(current.role);
  const currency = current?.clinic.currency ?? 'KM';

  useEffect(() => {
    let alive = true;
    setPlan(undefined);
    Promise.all([api.plan(planId), api.patient(id), current ? api.services(current.clinic.id) : Promise.resolve([])])
      .then(([p, pt, s]) => {
        if (!alive) return;
        setPlan(p && p.patient_id === id ? p : null);
        setPatient(pt);
        setServices(s.filter((x) => x.is_active));
      })
      .catch((e) => alive && (setError(errorKey(e)), setPlan(null)));
    return () => {
      alive = false;
    };
  }, [planId, id, current?.clinic.id]);

  if (!current) return null;
  const back = (
    <p>
      <Link className="text-link" to={`/patients/${id}`}>
        {patient ? t('plan.backTo', { name: `${patient.first_name} ${patient.last_name}` }) : t('karton.back')}
      </Link>
    </p>
  );
  if (plan === undefined) return <Loading />;
  if (plan === null) {
    return (
      <>
        {back}
        <Notice kind="error">{t(error ?? 'plan.notFound')}</Notice>
      </>
    );
  }

  const p = plan;
  const draft = p.status === 'nacrt';
  const tot = planTotals(p);

  async function act(key: string, fn: () => Promise<TreatmentPlan | void>, okKey?: Key) {
    setError(null);
    setOk(null);
    setBusy(key);
    try {
      const next = await fn();
      if (next) setPlan(next);
      if (okKey) setOk(okKey);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (status: PlanStatus, okKey: Key) => act(status, () => api.updatePlan(p.id, { status }), okKey);

  function itemSaved(item: PlanItem) {
    setPlan((cur) => (cur ? { ...cur, items: [...cur.items.filter((i) => i.id !== item.id), item].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)) } : cur));
    setEditItem(null);
  }

  async function removePlan() {
    if (!window.confirm(t('plan.deleteConfirm'))) return;
    await act('delete', async () => {
      await api.deletePlan(p.id);
      navigate(`/patients/${id}`, { replace: true });
    });
  }

  return (
    <>
      {back}
      <header className="page-head plan-head">
        <h1>{p.title}</h1>
        <p className="karton-facts">
          <PlanStatusTag status={p.status} />
          <span className="meta">
            {p.sent_at && t('plan.sentOn', { date: date(p.sent_at) })}
            {p.responded_at && ` · ${t(p.status === 'odbijen' ? 'plan.declinedOn' : 'plan.acceptedOn', { date: date(p.responded_at) })}`}
            {p.responded_at && ` (${t(p.responded_by === patient?.user_id && patient?.user_id ? 'plan.byPatientApp' : 'plan.byClinic')})`}
          </span>
        </p>
      </header>

      {error && <Notice kind="error">{t(error)}</Notice>}
      {ok && <Notice kind="ok">{t(ok)}</Notice>}

      <section className="block" aria-labelledby="plan-items">
        <div className="block-head">
          <h2 id="plan-items">{t('plan.items')}</h2>
          {draft && clinical && editItem !== 'new' && (
            <Button variant="quiet" onClick={() => setEditItem('new')}>
              {t('plan.addItem')}
            </Button>
          )}
        </div>
        {p.status === 'prihvacen' && <p className="hint">{t('plan.markDoneHint')}</p>}
        {p.items.length === 0 && editItem !== 'new' && <p className="muted">{t('plan.noItems')}</p>}
        {p.items.length > 0 && (
          <ul className="rows plan-items">
            {p.items.map((it) => (
              <li key={it.id} className={`rowitem plan-item${it.done_at ? ' plan-item-done' : ''}`}>
                <div className="rowitem-main">
                  {p.status === 'prihvacen' && clinical ? (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!it.done_at}
                        disabled={busy === it.id}
                        onChange={(e) => void act(it.id, async () => itemSaved(await api.setItemDone(it.id, e.target.checked)))}
                      />
                      <span>
                        {it.tooth != null && <span className="tag tag-tooth">{it.tooth}</span>} {it.description}
                      </span>
                    </label>
                  ) : (
                    <strong>
                      {it.tooth != null && <span className="tag tag-tooth">{it.tooth}</span>} {it.description}
                    </strong>
                  )}
                  <span className="meta">
                    {it.qty > 1 && `${it.qty} × ${money(it.unit_price, currency, locale)}`}
                    {it.done_at && `${it.qty > 1 ? ' · ' : ''}${t('plan.doneOn', { date: date(it.done_at) })}`}
                  </span>
                </div>
                <div className="rowitem-actions plan-sum">
                  <strong>{money(itemAmount(it, p.discount_pct), currency, locale)}</strong>
                  {draft && clinical && editItem !== it.id && (
                    <button type="button" className="link-btn" onClick={() => setEditItem(it.id)}>
                      {t('plan.editItem')}
                    </button>
                  )}
                </div>
                {editItem === it.id && (
                  <ItemForm
                    plan={p}
                    item={it}
                    services={services}
                    onSaved={itemSaved}
                    onDeleted={() => {
                      setPlan((cur) => (cur ? { ...cur, items: cur.items.filter((x) => x.id !== it.id) } : cur));
                      setEditItem(null);
                    }}
                    onCancel={() => setEditItem(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {editItem === 'new' && <ItemForm plan={p} services={services} onSaved={itemSaved} onCancel={() => setEditItem(null)} />}

        <dl className="plan-totals">
          {tot.discount > 0 && (
            <>
              <dt>{t('plan.subtotal')}</dt>
              <dd>{money(tot.subtotal, currency, locale)}</dd>
              <dt>{t('plan.discountLine', { pct: formatPct(p.discount_pct, locale) })}</dt>
              <dd>−{money(tot.discount, currency, locale)}</dd>
            </>
          )}
          <dt className="plan-total-label">{t('plan.total')}</dt>
          <dd className="plan-total">{money(tot.total, currency, locale)}</dd>
          {(p.status === 'prihvacen' || p.status === 'zavrsen') && (
            <>
              <dt>{t('plan.doneAmount')}</dt>
              <dd>{money(tot.done, currency, locale)}</dd>
            </>
          )}
        </dl>
      </section>

      {draft && clinical ? (
        <PlanDetailsForm plan={p} onSaved={setPlan} />
      ) : (
        (p.note || p.valid_until) && (
          <section className="block">
            <h2>{t('plan.details')}</h2>
            <dl className="facts">
              {p.valid_until && (
                <>
                  <dt>{t('plan.validUntil')}</dt>
                  <dd>{date(p.valid_until)}</dd>
                </>
              )}
              {p.note && (
                <>
                  <dt>{t('plan.note')}</dt>
                  <dd className="pre">{p.note}</dd>
                </>
              )}
            </dl>
          </section>
        )
      )}

      <section className="block block-accent" aria-labelledby="plan-next">
        <h2 id="plan-next">{t('plan.nextStep')}</h2>
        <p className="lead">{t(`plan.next.${p.status}`)}</p>
        {p.status === 'nacrt' && patient && !patient.user_id && <p className="hint">{t('plan.noAppHint')}</p>}
        <div className="row">
          {clinical && p.status === 'nacrt' && (
            <>
              <Button busy={busy === 'poslan'} disabled={p.items.length === 0} onClick={() => void setStatus('poslan', 'plan.sentOk')}>
                {t('plan.send')}
              </Button>
              <Button variant="quiet" busy={busy === 'prihvacen'} disabled={p.items.length === 0} onClick={() => void setStatus('prihvacen', 'plan.acceptedOk')}>
                {t('plan.acceptInClinic')}
              </Button>
            </>
          )}
          {clinical && p.status === 'poslan' && (
            <>
              <Button busy={busy === 'prihvacen'} onClick={() => void setStatus('prihvacen', 'plan.acceptedOk')}>
                {t('plan.acceptInClinic')}
              </Button>
              <Button variant="quiet" busy={busy === 'odbijen'} onClick={() => void setStatus('odbijen', 'plan.declinedOk')}>
                {t('plan.declineInClinic')}
              </Button>
              <Button variant="quiet" busy={busy === 'nacrt'} onClick={() => void setStatus('nacrt', 'plan.backToDraftOk')}>
                {t('plan.backToDraft')}
              </Button>
            </>
          )}
          {clinical && p.status === 'prihvacen' && (
            <Button busy={busy === 'zavrsen'} onClick={() => void setStatus('zavrsen', 'plan.finishedOk')}>
              {t('plan.finish')}
            </Button>
          )}
          {clinical && p.status === 'zavrsen' && (
            <Button variant="quiet" busy={busy === 'prihvacen'} onClick={() => void setStatus('prihvacen', 'plan.reopenedOk')}>
              {t('plan.reopen')}
            </Button>
          )}
          {clinical && p.status === 'odbijen' && (
            <Button variant="quiet" busy={busy === 'nacrt'} onClick={() => void setStatus('nacrt', 'plan.backToDraftOk')}>
              {t('plan.backToDraft')}
            </Button>
          )}
          {p.items.length > 0 && (
            <Link className="btn btn-quiet" to={`/plans/${p.id}/print`}>
              {t('plan.print')}
            </Link>
          )}
        </div>
        {clinical && draft && (
          <button type="button" className="link-btn danger-link" onClick={() => void removePlan()}>
            {t('plan.delete')}
          </button>
        )}
      </section>
    </>
  );
}

function formatPct(n: number, locale: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
  return locale === 'en' ? s : s.replace('.', ',');
}

function PlanDetailsForm({ plan, onSaved }: { plan: TreatmentPlan; onSaved: (p: TreatmentPlan) => void }) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState(plan.title);
  const [discount, setDiscount] = useState(plan.discount_pct ? formatPct(plan.discount_pct, locale) : '');
  const [validUntil, setValidUntil] = useState(plan.valid_until ?? '');
  const [note, setNote] = useState(plan.note ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) return setMsg({ kind: 'error', key: 'err.planTitle' });
    const d = discount.trim() ? parseAmount(discount) : 0;
    if (d === null || d < 0 || d > 100) return setMsg({ kind: 'error', key: 'err.discount' });
    setBusy(true);
    try {
      onSaved(await api.updatePlan(plan.id, { title, discount_pct: d, valid_until: validUntil || null, note }));
      setMsg({ kind: 'ok', key: 'plan.detailsSaved' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="block" onSubmit={submit} noValidate>
      <h2>{t('plan.details')}</h2>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}
      <Field label={t('plan.title')} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid-2">
        <Field label={t('plan.discount')} hint={t('plan.discountHint')} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <div className="field">
          <label htmlFor="plan-valid">{t('plan.validUntil')}</label>
          <input id="plan-valid" type="date" min={todayIso()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <button type="button" className="link-btn plan-valid-quick" onClick={() => setValidUntil(addDays(todayIso(), 30))}>
            {t('plan.valid30')}
          </button>
        </div>
      </div>
      <TextField label={t('plan.note')} hint={t('plan.noteHint')} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="submit" busy={busy}>
        {t('plan.saveDetails')}
      </Button>
    </form>
  );
}

function ItemForm({
  plan,
  item,
  services,
  onSaved,
  onDeleted,
  onCancel,
}: {
  plan: TreatmentPlan;
  item?: PlanItem;
  services: Service[];
  onSaved: (i: PlanItem) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const { current } = useSession();
  const currency = current?.clinic.currency ?? 'KM';
  const toText = (n: number) => (locale === 'en' ? n.toFixed(2) : n.toFixed(2).replace('.', ','));
  const [serviceId, setServiceId] = useState(item?.service_id ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [tooth, setTooth] = useState<number | null>(item?.tooth ?? null);
  const [qty, setQty] = useState(item?.qty ?? 1);
  const [price, setPrice] = useState(item ? toText(item.unit_price) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  function pickService(sid: string) {
    setServiceId(sid);
    const s = services.find((x) => x.id === sid);
    if (s) {
      setDescription(s.name);
      setPrice(toText(s.price));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError('err.itemDescription');
    const pr = parseAmount(price);
    if (pr === null || pr < 0) return setError('err.price');
    const input: PlanItemInput = { service_id: serviceId || null, tooth, description, unit_price: pr, qty };
    setBusy(true);
    try {
      onSaved(item ? await api.updatePlanItem(item.id, input) : await api.addPlanItem(plan, input, plan.items.length));
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await api.deletePlanItem(item.id);
      onDeleted?.();
    } catch (err) {
      setError(errorKey(err));
      setBusy(false);
    }
  }

  return (
    <form className="rowitem-edit" onSubmit={submit} noValidate aria-label={item ? t('plan.editItem') : t('plan.addItem')}>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {services.length > 0 ? (
        <SelectField label={t('plan.fromPriceList')} value={serviceId} onChange={(e) => pickService(e.target.value)}>
          <option value="">{t('plan.customItem')}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {money(s.price, currency, locale)}
            </option>
          ))}
        </SelectField>
      ) : (
        <p className="hint">
          {t('plan.noPriceList')}{' '}
          <Link className="text-link" to="/services">
            {t('plan.openPriceList')}
          </Link>
        </p>
      )}
      <Field label={t('plan.itemDescription')} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid-3">
        <ToothSelect value={tooth} onChange={setTooth} />
        <Field label={t('plan.qty')} type="number" min={1} max={32} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(32, Number(e.target.value) || 1)))} />
        <Field label={t('plan.unitPrice', { currency })} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="row">
        <Button type="submit" busy={busy}>
          {item ? t('plan.saveItem') : t('plan.addItemSubmit')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        {item && (
          <button type="button" className="link-btn danger-link" onClick={() => void remove()} disabled={busy}>
            {t('plan.removeItem')}
          </button>
        )}
      </div>
    </form>
  );
}
