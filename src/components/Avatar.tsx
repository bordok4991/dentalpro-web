import { initials } from '../lib/format';

/** Slika osobe ili ordinacije; bez slike prikazuje inicijale. */
export function Avatar({ url, name, size = 48, square }: { url: string | null | undefined; name: string; size?: number; square?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const cls = `avatar${square ? ' avatar-square' : ''}`;
  if (url) return <img className={cls} src={url} alt="" width={size} height={size} style={style} loading="lazy" />;
  return (
    <span className={cls} style={style} aria-hidden="true">
      {initials(name) || '·'}
    </span>
  );
}
