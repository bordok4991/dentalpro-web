import type { Locale } from './types';

/** Iznos u valuti ordinacije: 1.250,00 KM (en: 1,250.00 KM). */
export function money(n: number, currency: string, locale: Locale): string {
  const fixed = (Math.round(Math.abs(n) * 100) / 100).toFixed(2);
  const [int, dec] = fixed.split('.');
  const en = locale === 'en';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, en ? ',' : '.');
  const sign = n < 0 && Number(fixed) !== 0 ? '−' : '';
  return `${sign}${grouped}${en ? '.' : ','}${dec} ${currency}`;
}

/** Broj iz polja za unos: prihvata i zarez i tačku kao decimalni znak. */
export function parseAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Datum (YYYY-MM-DD) po lokalnom vremenu preglednika. */
export function localDay(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Prvi i zadnji dan mjeseca u kojem je dati dan. */
export function monthRange(day: string): { from: string; to: string } {
  const d = new Date(day + 'T12:00:00');
  const from = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
  return { from: localDay(from), to: localDay(to) };
}

export function shiftMonth(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00');
  return localDay(new Date(d.getFullYear(), d.getMonth() + n, 1, 12));
}

/** Tekst s praznim redovima podijeljen u pasuse. */
export function paragraphs(s: string): string[] {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Dijelovi teksta u uglastim zagradama koje treba popuniti prije objave, npr. [postotak]. */
export function placeholders(s: string): string[] {
  return [...s.matchAll(/\[[^\]\n]{1,60}\]/g)].map((m) => m[0]);
}

export function initials(name: string): string {
  return name
    .replace(/^(dr\.?|doc\.?|prof\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
