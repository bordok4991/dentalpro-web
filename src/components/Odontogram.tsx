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

/* ---------- Oblici zuba (pogled spreda; gornji zub, donji se okreće) ---------- */

/** Krunice: sjekutić, očnjak, pretkutnjak, kutnjak; donji sjekutić je uži. */
type CrownShape = 'I' | 'i' | 'C' | 'P' | 'M';
/** Korijeni: gornji pretkutnjak ima dva vrha, gornji kutnjak tri korijena, donji kutnjak dva. */
type RootShape = 'I' | 'i' | 'C' | 'P' | 'p' | 'M' | 'm';

const CROWN: Record<CrownShape, string> = {
  I: 'M12.5 47 C11.8 56 9.6 66 9.2 76 C9 81.5 10.4 86 14 87 C17.5 87.8 22.5 87.8 26 87 C29.6 86 31 81.5 30.8 76 C30.4 66 28.2 56 27.5 47 C24 45.6 16 45.6 12.5 47 Z',
  i: 'M14.2 47 C13.6 57 12.2 67 12 77 C11.9 82.5 13 86.4 15.8 87 C18.6 87.6 21.4 87.6 24.2 87 C27 86.4 28.1 82.5 28 77 C27.8 67 26.4 57 25.8 47 C23 45.8 17 45.8 14.2 47 Z',
  C: 'M12.6 47 C11.4 55 9.6 63 9.8 70 C10 76 13.2 81.5 17.5 86.5 C18.8 88 21.2 88 22.5 86.5 C26.8 81.5 30 76 30.2 70 C30.4 63 28.6 55 27.4 47 C24 45.6 16 45.6 12.6 47 Z',
  P: 'M12 47 C9.6 54 8.4 62 8.8 69 C9.2 76 12 81 16 84.4 C17.8 86 19 87.6 20 87.6 C21 87.6 22.2 86 24 84.4 C28 81 30.8 76 31.2 69 C31.6 62 30.4 54 28 47 C24 45.4 16 45.4 12 47 Z',
  M: 'M7.5 47.5 C4.6 54 3.6 61 4 68 C4.4 75 6.6 81 10.6 84.2 C12.8 86 15.4 86.4 17.2 85.2 C18.4 84.4 19.2 83.6 20 83.6 C20.8 83.6 21.6 84.4 22.8 85.2 C24.6 86.4 27.2 86 29.4 84.2 C33.4 81 35.6 75 36 68 C36.4 61 35.4 54 32.5 47.5 C25 45.4 15 45.4 7.5 47.5 Z',
};
const ROOT: Record<RootShape, string> = {
  I: 'M12.8 48 C12.4 36 14.6 22 17.6 10 C18.6 6 21.4 6 22.4 10 C25.4 22 27.6 36 27.2 48 Z',
  i: 'M14.6 48 C14.4 36 16.2 22 18.6 9 C19.3 5.5 20.7 5.5 21.4 9 C23.8 22 25.6 36 25.4 48 Z',
  C: 'M13 48 C12.6 34 14.6 18 18 5 C18.8 2 21.2 2 22 5 C25.4 18 27.4 34 27 48 Z',
  P: 'M12.6 48 C12 36 13.4 22 16 11 C16.8 7.6 19 7.6 19.4 11 L20 18 L20.6 11 C21 7.6 23.2 7.6 24 11 C26.6 22 28 36 27.4 48 Z',
  p: 'M13 48 C12.6 34 14.6 20 18 7.5 C18.8 4.6 21.2 4.6 22 7.5 C25.4 20 27.4 34 27 48 Z',
  M: 'M8.4 48 C7 38 7 26 8.8 15 C9.4 11 12 11 12.6 15 C13.6 24 14.8 33 16.6 40 C17.4 30 18 18 18.8 7 C19.2 3.6 20.8 3.6 21.2 7 C22 18 22.6 30 23.4 40 C25.2 33 26.4 24 27.4 15 C28 11 30.6 11 31.2 15 C33 26 33 38 31.6 48 Z',
  m: 'M8.6 48 C7.4 38 7.8 26 10 14 C10.8 10 13.6 10 14.2 14 C15.2 24 16.4 33 17.6 41 C19.2 39.4 20.8 39.4 22.4 41 C23.6 33 24.8 24 25.8 14 C26.4 10 29.2 10 30 14 C32.2 26 32.6 38 31.4 48 Z',
};
const ENDO: Record<RootShape, string> = {
  I: 'M20 46 L20 11',
  i: 'M20 46 L20 10',
  C: 'M20 46 L20 6',
  P: 'M18 46 L17.6 13 M22 46 L22.4 13',
  p: 'M20 46 L20 9',
  M: 'M11 46 C10.4 36 10.4 26 10.8 17 M20 46 L20 9 M29 46 C29.6 36 29.6 26 29.2 17',
  m: 'M12.6 46 C12 36 11.8 26 12 16 M27.4 46 C28 36 28.2 26 28 16',
};
/** Odsjaj na caklini: [cx, cy, rx, ry] */
const GLOSS: Record<CrownShape, [number, number, number, number][]> = {
  I: [[15.2, 64, 2.1, 9]],
  i: [[16.4, 65, 1.7, 8.5]],
  C: [[15.4, 64, 2.1, 8]],
  P: [[14.4, 63, 2.5, 8]],
  M: [[11, 62, 2.8, 8], [24.5, 64, 1.6, 5]],
};
const MOLAR_GROOVE = 'M20 83.6 C19.6 80 20.4 77 20 73.5';
const IMPLANT_BODY = 'M14.2 47 L14.2 15 C14.2 9.6 16.8 6.6 20 6.6 C23.2 6.6 25.8 9.6 25.8 15 L25.8 47 Z';
const IMPLANT_THREADS = 'M13.4 16 L26.6 18 M13.4 21 L26.6 23 M13.4 26 L26.6 28 M13.4 31 L26.6 33 M13.4 36 L26.6 38 M13.4 41 L26.6 43';

function shapeOf(n: number): { crown: CrownShape; root: RootShape } {
  const q = Math.floor(n / 10);
  const t = n % 10;
  const up = isUpper(n);
  if (t <= 2) return up ? { crown: 'I', root: 'I' } : { crown: 'i', root: 'i' };
  if (t === 3) return { crown: 'C', root: 'C' };
  if (q < 5 && t <= 5) return { crown: 'P', root: up ? 'P' : 'p' };
  return { crown: 'M', root: up ? 'M' : 'm' };
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
  const { crown, root } = shapeOf(n);
  const missing = st?.condition === 'nedostaje';
  const implant = st?.condition === 'implantat';
  const crowned = st?.condition === 'krunica' || implant;
  if (missing) {
    return (
      <svg viewBox="0 0 40 90" className="tooth-glyph tooth-glyph-missing" aria-hidden="true">
        <g transform={isUpper(n) ? undefined : 'translate(0 90) scale(1 -1)'} fill="none" stroke="#97A4B2" strokeWidth="1" strokeDasharray="2.5 2.5">
          <path d={ROOT[root]} />
          <path d={CROWN[crown]} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 90" className="tooth-glyph" aria-hidden="true">
      <g transform={isUpper(n) ? undefined : 'translate(0 90) scale(1 -1)'}>
        {implant ? (
          <>
            <path d={IMPLANT_BODY} fill="url(#dp-ti)" stroke="#56626F" strokeWidth="0.9" />
            <path d={IMPLANT_THREADS} stroke="#56626F" strokeWidth="0.9" strokeLinecap="round" opacity="0.75" />
          </>
        ) : (
          <>
            <path d={ROOT[root]} fill="url(#dp-root)" stroke="#9A8566" strokeWidth="0.9" />
            <path d={ROOT[root]} fill="url(#dp-root-v)" />
            {st?.endo && <path d={ENDO[root]} fill="none" stroke="#C0392B" strokeWidth="1.7" strokeLinecap="round" />}
          </>
        )}
        <path d={CROWN[crown]} fill={crowned ? 'url(#dp-gold)' : 'url(#dp-enamel)'} stroke={crowned ? '#93682A' : '#9C8B74'} strokeWidth="0.9" />
        {!crowned && <path d={CROWN[crown]} fill="url(#dp-crown-v)" />}
        {crown === 'M' && <path d={MOLAR_GROOVE} fill="none" stroke={crowned ? '#A97B33' : '#B3A38B'} strokeWidth="0.7" strokeLinecap="round" opacity="0.8" />}
        {GLOSS[crown].map(([cx, cy, rx, ry], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#dp-gloss)" opacity={i === 0 ? 0.9 : 0.6} />
        ))}
      </g>
    </svg>
  );
}

/** Prelivi za zube (caklina, korijen, krunica, implantat, odsjaj); jednom po stranici. */
function ToothDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <pattern id="dp-plan" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#E7F7F4" />
          <rect width="2.5" height="5" fill="#14B8A6" />
        </pattern>
        <linearGradient id="dp-enamel" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#D8CEBC" />
          <stop offset="0.2" stopColor="#F6F1E7" />
          <stop offset="0.45" stopColor="#FFFFFF" />
          <stop offset="0.72" stopColor="#F3EDE2" />
          <stop offset="1" stopColor="#CBBFA9" />
        </linearGradient>
        <linearGradient id="dp-crown-v" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9C7F55" stopOpacity="0.28" />
          <stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.78" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#9DB6CF" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="dp-root" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#D2BD96" />
          <stop offset="0.38" stopColor="#F3E9D3" />
          <stop offset="0.6" stopColor="#EEE2C8" />
          <stop offset="1" stopColor="#C7AF85" />
        </linearGradient>
        <linearGradient id="dp-root-v" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8F6E3E" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dp-gold" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#A57631" />
          <stop offset="0.25" stopColor="#E9C886" />
          <stop offset="0.48" stopColor="#FFF4D8" />
          <stop offset="0.72" stopColor="#E0B567" />
          <stop offset="1" stopColor="#9C6D2B" />
        </linearGradient>
        <linearGradient id="dp-ti" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6F7B89" />
          <stop offset="0.35" stopColor="#E7ECF1" />
          <stop offset="0.55" stopColor="#C5CDD6" />
          <stop offset="1" stopColor="#5F6B79" />
        </linearGradient>
        <radialGradient id="dp-gloss">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
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
      <ToothDefs />
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
          <li><i style={{ background: 'linear-gradient(90deg, #A57631, #FFF4D8 48%, #9C6D2B)' }} />{t('teeth.legend.krunica')}</li>
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
  const incisal = ['I', 'i', 'C'].includes(shapeOf(tooth).crown);
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
