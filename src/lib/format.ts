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

const TITLE = /^((dr|doc|prof|mr|dipl)\.?\s+)+/i;

/** Ime za pozdrav: prva riječ imena, bez titule ("dr Nisveta …" → "Nisveta"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().replace(TITLE, '').split(/\s+/)[0] ?? '';
}

export function initials(name: string): string {
  return name
    .replace(TITLE, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Link za ugrađeni video: YouTube (bez kolačića za praćenje) ili Vimeo.
 * Za druge adrese vraća null, pa se prikazuje običan link.
 */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(\d{6,12})/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

/** Link na video mora biti https adresa. */
export function isVideoLink(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Obrazovanje: jedna stavka po redu; godina (ili raspon) na početku reda ide posebno. */
export function educationItems(text: string | null | undefined): { year: string | null; text: string }[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^((?:19|20)\d{2}(?:\s*[–-]\s*(?:(?:19|20)\d{2}|danas|today))?)\s*[—–:,.-]?\s+(.+)$/i);
      return m ? { year: m[1], text: m[2] } : { year: null, text: l };
    });
}
