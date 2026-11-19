import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { Wordmark } from './ui';

/** Bijeli ili tamni tekst, zavisno od toga koliko je boja ordinacije svijetla. */
function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#10243A' : '#FFFFFF';
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { memberships, current, selectClinic, signOut, profile } = useSession();
  const { pathname, search } = useLocation();
  const calendar = /^\/calendar\/?$/.test(pathname);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  if (!current) return null;

  const { clinic, role } = current;
  const isStaff = role !== 'patient';
  const brand = {
    '--brand': clinic.primary_color,
    '--brand-ink': inkOn(clinic.primary_color),
    '--accent': clinic.accent_color,
  } as CSSProperties;

  // Na telefonu su u donjoj traci glavne stavke; ostale su pod "Više".
  const links = [
    { to: '/', label: t('nav.overview'), end: true, main: true },
    ...(isStaff
      ? [
          { to: '/calendar', label: t('nav.calendar'), end: false, main: true },
          { to: '/patients', label: t('nav.patients'), end: false, main: true },
          { to: '/finances', label: t('nav.finances'), end: false, main: true },
          { to: '/services', label: t('nav.services'), end: false, main: false },
          { to: '/posts', label: t('nav.posts'), end: false, main: false },
          { to: '/team', label: t('nav.team'), end: false, main: false },
        ]
      : []),
    { to: '/settings', label: t('nav.settings'), end: false, main: false },
  ];
  const moreActive = links.some((l) => !l.main && pathname.startsWith(l.to));

  return (
    <div className={calendar ? 'shell shell-calendar' : 'shell'} style={brand}
      data-wide={calendar && new URLSearchParams(search).get('sirina') === 'puna' || undefined}>
      <header id="practice-menu" className="shell-side">
        {clinic.logo_url ? (
          <span className="shell-logo">
            <img src={clinic.logo_url} alt="" />
            <span className="sr-only">Dental Pro</span>
          </span>
        ) : (
          <Wordmark />
        )}
        <div className="shell-clinic">
          {memberships && memberships.length > 1 ? (
            <select aria-label={t('nav.clinic')} value={clinic.id} onChange={(e) => selectClinic(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.clinic.id} value={m.clinic.id}>
                  {m.clinic.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>{clinic.name}</strong>
          )}
          <span>{t(`role.${role}`)}</span>
        </div>
        <nav className={`shell-nav${more ? ' shell-nav-open' : ''}`} aria-label={t('app.name')}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={l.main ? undefined : 'nav-extra'}>
              {l.label}
            </NavLink>
          ))}
          <button type="button" className={`nav-more${moreActive ? ' active' : ''}`} aria-expanded={more} onClick={() => setMore(!more)}>
            {t('nav.more')}
          </button>
        </nav>
        <div className="shell-foot">
          <span className="shell-user">{profile?.full_name || profile?.email || ''}</span>
          <button type="button" className="link-btn" onClick={() => void signOut()}>
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
