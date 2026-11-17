import { useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { api } from '../lib/session';
import {
  SURFACE_MARKS,
  TOOTH_CONDITIONS,
  type SurfaceKey,
  type SurfaceMark,
  type ToothCondition,
  type ToothInput,
  type ToothStatus,
} from '../lib/types';
import { Button, Notice, TextField } from './ui';

/* ---------- Oblici zuba (gornji zub; donji se okreće) ---------- */

type Shape = 'I' | 'C' | 'P' | 'M';

const CROWN: Record<Shape, string> = {
  M: 'M5 52 Q5 46 12 46 L28 46 Q35 46 35 52 L35 76 Q35 86 26 86 Q20 83 14 86 Q5 86 5 76 Z',
  P: 'M9 52 Q9 46 15 46 L25 46 Q31 46 31 52 L31 74 Q31 86 20 86 Q9 86 9 74 Z',
  C: 'M10 52 Q10 46 16 46 L24 46 Q30 46 30 52 L30 72 Q27 82 20 88 Q13 82 10 72 Z',
  I: 'M10 50 Q10 46 15 46 L25 46 Q30 46 30 50 L31 84 Q20 87 9 84 Z',
};
const ROOT: Record<Shape, string> = {
  M: 'M7 48 Q5 24 9 8 Q12 5 14 9 Q15 28 18 48 Z M16 48 Q18 26 19 6 Q21 3 23 6 Q24 26 24 48 Z M22 48 Q25 28 27 9 Q29 5 32 8 Q35 24 33 48 Z',
  P: 'M12 48 Q11 22 18 5 Q20 2 22 5 Q29 22 28 48 Z',
  C: 'M13 48 Q12 18 19 2 Q20 0 21 2 Q28 18 27 48 Z',
  I: 'M13 48 Q13 22 19 6 Q20 4 21 6 Q27 22 27 48 Z',
};
const ENDO: Record<Shape, string> = {
  M: 'M11 46 Q10 28 11 12 M20 46 L21 9 M29 46 Q30 28 30 12',
  P: 'M20 46 L20 9',
  C: 'M20 46 L20 5',
  I: 'M20 46 L20 9',
};
const IMPLANT_ROOT = 'M13 48 L13 14 Q13 8 20 6 Q27 8 27 14 L27 48 Z';
const IMPLANT_LINES = 'M12 16 H28 M12 22 H28 M12 28 H28 M12 34 H28 M12 40 H28';

function shapeOf(n: number): Shape {
  const q = Math.floor(n / 10);
  const t = n % 10;
  if (q >= 5) return t <= 2 ? 'I' : t === 3 ? 'C' : 'M';
  return t <= 2 ? 'I' : t === 3 ? 'C' : t <= 5 ? 'P' : 'M';
}

const isUpper = (n: number) => [1, 2, 5, 6].includes(Math.floor(n / 10));

/** Koja površina je gore, dolje, lijevo i desno na šemi (pogled doktora prema pacijentu). */
function layout(n: number) {
  const q = Math.floor(n / 10);
  const mesialRight = [1, 4, 5, 8].includes(q);
  const up = isUpper(n);
  return {
    top: (up ? 'B' : 'L') as SurfaceKey,
    bottom: (up ? 'L' : 'B') as SurfaceKey,
    left: (mesialRight ? 'D' : 'M') as SurfaceKey,
    right: (mesialRight ? 'M' : 'D') as SurfaceKey,
  };
}

const MARK_FILL: Record<SurfaceMark, string> = { karijes: '#E8590C', ispun: '#2A4E7A', plan: 'url(#dp-plan)' };

type ToothLook = Pick<ToothStatus, 'condition' | 'endo' | 'surfaces'>;

function surfaceFill(st: ToothLook | undefined, k: SurfaceKey): string {
  if (!st) return '#FFFFFF';
  if (st.condition === 'nedostaje') return '#EEF2F6';
  const m = st.surfaces?.[k];
  if (m) return MARK_FILL[m];
  if (st.condition === 'krunica' || st.condition === 'implantat') return '#E9C98F';
  return '#FFFFFF';
}

export function toothName(t: (k: Key, v?: Record<string, string | number>) => string, n: number): string {
  const q = Math.floor(n / 10);
  const i = n % 10;
  const name = q >= 5 ? t(`tooth.d${i}` as Key) : t(`tooth.t${i}` as Key);
  const side = t(`tooth.q${((q - 1) % 4) + 1}` as Key);
  return `${name}, ${side}`;
}

/* ---------- Jedan zub ---------- */

function ToothGlyph({ n, st }: { n: number; st?: ToothLook }) {
  const shape = shapeOf(n);
  const missing = st?.condition === 'nedostaje';
  const implant = st?.condition === 'implantat';
  const crowned = st?.condition === 'krunica' || implant;
  const stroke = missing ? '#8796A6' : '#4A5D73';
  const dash = missing ? '3 3' : undefined;
  return (
    <svg viewBox="0 0 40 90" className="tooth-glyph" aria-hidden="true" opacity={missing ? 0.55 : 1}>
      <g transform={isUpper(n) ? undefined : 'translate(0 90) scale(1 -1)'}>
        <path d={implant ? IMPLANT_ROOT : ROOT[shape]} fill={missing ? '#FFFFFF' : implant ? '#C4CDD7' : '#F1F4F7'} stroke={stroke} strokeWidth="1.3" strokeDasharray={dash} />
        <path d={CROWN[shape]} fill={missing ? '#FFFFFF' : crowned ? '#E9C98F' : '#FFFFFF'} stroke={stroke} strokeWidth="1.3" strokeDasharray={dash} />
        {implant && <path d={IMPLANT_LINES} fill="none" stroke="#5A6B7E" strokeWidth="1.4" />}
        {st?.endo && !implant && !missing && <path d={ENDO[shape]} fill="none" stroke="#B42318" strokeWidth="1.8" strokeLinecap="round" />}
      </g>
    </svg>
  );
}

function Surfaces({ n, st }: { n: number; st?: ToothLook }) {
  const L = layout(n);
  return (
    <svg viewBox="0 0 30 30" className="tooth-surfaces" aria-hidden="true" opacity={st?.condition === 'nedostaje' ? 0.45 : 1}>
      <polygon points="1,1 29,1 20,10 10,10" fill={surfaceFill(st, L.top)} />
      <polygon points="29,1 29,29 20,20 20,10" fill={surfaceFill(st, L.right)} />
      <polygon points="1,29 29,29 20,20 10,20" fill={surfaceFill(st, L.bottom)} />
      <polygon points="1,1 10,10 10,20 1,29" fill={surfaceFill(st, L.left)} />
      <rect x="10" y="10" width="10" height="10" fill={surfaceFill(st, 'O')} />
    </svg>
  );
}

/* ---------- Cijela šema ---------- */

const PERMANENT = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];
const DECIDUOUS = [
  [55, 54, 53, 52, 51],
  [61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81],
  [71, 72, 73, 74, 75],
];

export function Odontogram({
  statuses,
  counts,
  selected,
  onSelect,
  patientView,
}: {
  statuses: Map<number, ToothLook>;
  counts: Map<number, number>;
  selected: number | null;
  onSelect: (n: number) => void;
  /** Pacijent: bez oznake zapisa u kartonu. */
  patientView?: boolean;
}) {
  const { t } = useI18n();
  const hasDeciduous = [...statuses.keys(), ...counts.keys()].some((n) => n >= 51);
  const [deciduous, setDeciduous] = useState(hasDeciduous);

  function describe(n: number): string {
    const st = statuses.get(n);
    const parts: string[] = [];
    if (st && st.condition !== 'zdrav') parts.push(t(`tooth.c.${st.condition}` as Key));
    if (st?.endo) parts.push(t('teeth.legend.endo'));
    for (const [k, m] of Object.entries(st?.surfaces ?? {})) parts.push(`${t(`tooth.mark.${m}` as Key)} ${k}`);
    const c = counts.get(n) ?? 0;
    if (c) parts.push(t('tooth.state.entries', { n: c }));
    return `${t('tooth.title', { n })}: ${parts.length ? parts.join(', ') : t('tooth.state.zdrav')}`;
  }

  function tooth(n: number) {
    const st = statuses.get(n);
    const c = counts.get(n) ?? 0;
    const planned = Object.values(st?.surfaces ?? {}).includes('plan');
    const num = (
      <span className="tooth-num">
        {n}
        {planned && <span className="tooth-plan" aria-hidden="true" />}
      </span>
    );
    return (
      <button key={n} type="button" className="tooth" aria-pressed={selected === n} aria-label={describe(n)} onClick={() => onSelect(n)}>
        {isUpper(n) ? (
          <>
            {num}
            <ToothGlyph n={n} st={st} />
            <Surfaces n={n} st={st} />
          </>
        ) : (
          <>
            <Surfaces n={n} st={st} />
            <ToothGlyph n={n} st={st} />
            {num}
          </>
        )}
        {c > 0 && <span className="tooth-count">{c}</span>}
      </button>
    );
  }

  function jaw(quads: number[][], label: string) {
    return (
      <div className="jaw" role="group" aria-label={label}>
        <div className="quad" style={{ ['--n' as string]: quads[0].length }}>
          {quads[0].map(tooth)}
        </div>
        <div className="quad" style={{ ['--n' as string]: quads[1].length }}>
          {quads[1].map(tooth)}
        </div>
      </div>
    );
  }

  return (
    <div className="odontogram">
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <pattern id="dp-plan" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#E7F7F4" />
            <rect width="2.5" height="5" fill="#14B8A6" />
          </pattern>
        </defs>
      </svg>
      <div className="odo-scroll">
        <div className="odo-inner">
          <div className="odo-sides" aria-hidden="true">
            <span>{t('tooth.q1')}</span>
            <span>{t('tooth.q2')}</span>
          </div>
          {jaw(PERMANENT.slice(0, 2), t('karton.upper'))}
          <div className="odo-occlusal" aria-hidden="true" />
          {jaw(PERMANENT.slice(2), t('karton.lower'))}
          {deciduous && (
            <div className="odo-deciduous">
              {jaw(DECIDUOUS.slice(0, 2), `${t('karton.upper')}, ${t('entry.deciduous')}`)}
              <div className="odo-occlusal" aria-hidden="true" />
              {jaw(DECIDUOUS.slice(2), `${t('karton.lower')}, ${t('entry.deciduous')}`)}
            </div>
          )}
        </div>
      </div>
      <div className="odo-foot">
        <ul className="odo-legend" aria-label={t('karton.teeth')}>
          <li><i style={{ background: MARK_FILL.karijes }} />{t('teeth.legend.karijes')}</li>
          <li><i style={{ background: MARK_FILL.ispun }} />{t('teeth.legend.ispun')}</li>
          <li><i className="lg-plan" />{t('teeth.legend.plan')}</li>
          <li><i style={{ background: '#E9C98F' }} />{t('teeth.legend.krunica')}</li>
          <li><i className="lg-endo" />{t('teeth.legend.endo')}</li>
          <li><i className="lg-missing" />{t('teeth.legend.nedostaje')}</li>
          {!patientView && <li><i className="lg-count">2</i>{t('teeth.legend.entries')}</li>}
        </ul>
        <button type="button" className="link-btn" aria-expanded={deciduous} onClick={() => setDeciduous((d) => !d)}>
          {deciduous ? t('karton.hideDeciduous') : t('karton.showDeciduous')}
        </button>
      </div>
    </div>
  );
}

/* ---------- Upis stanja jednog zuba ---------- */

type Brush = SurfaceMark | 'none';

export function ToothEditor({
  clinicId,
  patientId,
  tooth,
  status,
  onSaved,
  onClose,
}: {
  clinicId: string;
  patientId: string;
  tooth: number;
  status?: ToothStatus;
  onSaved: (s: ToothStatus) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<ToothInput>({
    condition: status?.condition ?? 'zdrav',
    endo: status?.endo ?? false,
    surfaces: { ...(status?.surfaces ?? {}) },
    note: status?.note ?? null,
  });
  const [brush, setBrush] = useState<Brush>('karijes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [saved, setSaved] = useState(false);
  const L = layout(tooth);
  const incisal = shapeOf(tooth) === 'I' || shapeOf(tooth) === 'C';
  const missing = v.condition === 'nedostaje';
  const preview: ToothStatus = { patient_id: patientId, clinic_id: clinicId, tooth, updated_at: '', ...v };

  function change(patch: Partial<ToothInput>) {
    setV((p) => ({ ...p, ...patch }));
    setSaved(false);
  }

  function paint(k: SurfaceKey) {
    const next = { ...v.surfaces };
    if (brush === 'none') delete next[k];
    else next[k] = brush;
    change({ surfaces: next });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onSaved(await api.saveTooth(clinicId, patientId, tooth, v));
      setSaved(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  function surfaceButton(k: SurfaceKey) {
    const m = v.surfaces[k];
    const label = k === 'O' && incisal ? t('tooth.s.I') : t(`tooth.s.${k}` as Key);
    return (
      <button type="button" className="surf-btn" disabled={missing} onClick={() => paint(k)} aria-label={`${label}: ${m ? t(`tooth.mark.${m}` as Key) : t('tooth.mark.none')}`}>
        <svg width="16" height="16" aria-hidden="true">
          <rect width="16" height="16" rx="4" fill={m ? MARK_FILL[m] : '#FFFFFF'} stroke="#8A9BB0" />
        </svg>
        <span>
          <b>{k === 'O' && incisal ? 'I' : k}</b>
          <small>{m ? t(`tooth.mark.${m}` as Key) : t('tooth.mark.none')}</small>
        </span>
      </button>
    );
  }

  return (
    <form className="tooth-editor" onSubmit={submit}>
      <div className="tooth-editor-head">
        <div>
          <p className="muted">{toothName(t, tooth)}</p>
          <h3>{t('tooth.title', { n: tooth })}</h3>
        </div>
        <div className="tooth-editor-preview" aria-hidden="true">
          <ToothGlyph n={tooth} st={preview} />
          <Surfaces n={tooth} st={preview} />
        </div>
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}

      <fieldset className="seg">
        <legend>{t('tooth.condition')}</legend>
        <div className="seg-row">
          {TOOTH_CONDITIONS.map((c: ToothCondition) => (
            <button key={c} type="button" aria-pressed={v.condition === c} onClick={() => change({ condition: c })}>
              {t(`tooth.c.${c}` as Key)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={v.endo && !missing} disabled={missing} onChange={(e) => change({ endo: e.target.checked })} />
        {t('tooth.endo')}
      </label>

      <fieldset className="seg">
        <legend>{t('tooth.surfaces')}</legend>
        {missing ? (
          <p className="hint">{t('tooth.noSurfaces')}</p>
        ) : (
          <>
            <p className="hint">{t('tooth.surfacesHint')}</p>
            <div className="seg-row">
              {[...SURFACE_MARKS, 'none' as const].map((b) => (
                <button key={b} type="button" aria-pressed={brush === b} onClick={() => setBrush(b)}>
                  <svg width="12" height="12" aria-hidden="true">
                    <rect width="12" height="12" rx="3" fill={b === 'none' ? '#FFFFFF' : MARK_FILL[b]} stroke="#8A9BB0" />
                  </svg>
                  {t(`tooth.mark.${b}` as Key)}
                </button>
              ))}
            </div>
            <div className="surf-cross">
              <span />
              {surfaceButton(L.top)}
              <span />
              {surfaceButton(L.left)}
              {surfaceButton('O')}
              {surfaceButton(L.right)}
              <span />
              {surfaceButton(L.bottom)}
              <span />
            </div>
          </>
        )}
      </fieldset>

      <TextField label={t('tooth.note')} rows={2} value={v.note ?? ''} onChange={(e) => change({ note: e.target.value })} />

      <div className="row">
        <Button type="submit" busy={busy}>
          {t('tooth.save')}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t('tooth.close')}
        </Button>
      </div>
      {saved && <Notice kind="ok">{t('tooth.saved')}</Notice>}
    </form>
  );
}
