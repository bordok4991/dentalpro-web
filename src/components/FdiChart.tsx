import { useI18n } from '../lib/i18n';

/**
 * Zubna šema po FDI numeraciji: gornji red 18–11 | 21–28, donji 48–41 | 31–38.
 * Ovdje je samo crtež; isti raspored postaje pravi odontogram u modulu dentalnog statusa.
 */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/** Širina crteža; oba reda (406) stanu s malim rubom. */
const W = 420;

/** Širina krune prema vrsti zuba (posljednja cifra FDI broja). */
function width(n: number): number {
  const pos = n % 10;
  if (pos >= 6) return 26; // kutnjaci
  if (pos >= 4) return 20; // pretkutnjaci
  if (pos === 3) return 18; // očnjak
  return 16; // sjekutići
}

function Row({ teeth, y, lower }: { teeth: number[]; y: number; lower?: boolean }) {
  const gap = 4;
  const mid = 14;
  const total = teeth.reduce((s, n) => s + width(n), 0) + gap * (teeth.length - 2) + mid;
  let x = (W - total) / 2;
  return (
    <g>
      {teeth.map((n, i) => {
        const w = width(n);
        const cx = x + w / 2;
        const node = (
          <g key={n}>
            <rect x={x} y={y} width={w} height={34} rx={w > 20 ? 8 : 7} className="fdi-tooth" />
            <text x={cx} y={lower ? y + 52 : y - 9} textAnchor="middle" className="fdi-num">
              {n}
            </text>
          </g>
        );
        x += w + (i === 7 ? mid : gap);
        return node;
      })}
    </g>
  );
}

export function FdiChart() {
  const { t } = useI18n();
  return (
    <figure className="fdi">
      <svg viewBox={`0 0 ${W} 150`} role="img" aria-label={t('fdi.caption')}>
        <line x1={W / 2} y1="6" x2={W / 2} y2="144" className="fdi-axis" />
        <line x1="6" y1="75" x2={W - 6} y2="75" className="fdi-axis" />
        <Row teeth={UPPER} y={30} />
        <Row teeth={LOWER} y={86} lower />
      </svg>
      <figcaption>{t('fdi.caption')}</figcaption>
    </figure>
  );
}
