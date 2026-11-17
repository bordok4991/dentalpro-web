import { useId, useRef, useState } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { imageName } from '../lib/api';
import { resizeImage } from '../lib/image';
import { api } from '../lib/session';
import { Avatar } from './Avatar';

/**
 * Izbor slike s uređaja: smanji je, postavi u Storage i javi novi link.
 * Spremanje linka u profil ili ordinaciju radi pozivalac (onChange).
 */
export function ImageUpload({
  label,
  hint,
  url,
  name,
  folder,
  kind,
  onChange,
}: {
  label: string;
  hint?: string;
  url: string | null;
  name: string;
  /** npr. users/<id> ili clinics/<id>/logo */
  folder: string;
  kind: 'photo' | 'logo' | 'cover';
  onChange: (url: string | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const png = kind === 'logo';
      const blob = await resizeImage(file, kind === 'cover' ? 1400 : 600, png ? 'image/png' : 'image/jpeg');
      const link = await api.uploadImage(`${folder}/${imageName(png ? 'png' : 'jpg')}`, blob);
      await onChange(link);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg === 'IMAGE_TYPE' ? 'err.imageType' : msg === 'IMAGE_SIZE' ? 'err.imageSize' : errorKey(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await onChange(null);
    } catch (e) {
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`upload upload-${kind}`}>
      {kind === 'cover' ? (
        url ? <img className="upload-cover" src={url} alt="" /> : null
      ) : (
        <Avatar url={url} name={name} size={kind === 'logo' ? 64 : 72} square={kind === 'logo'} />
      )}
      <div className="upload-body">
        <label htmlFor={id} className="upload-label">
          {label}
        </label>
        {hint && <p className="hint">{hint}</p>}
        <div className="row">
          <input
            ref={input}
            id={id}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={busy}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button type="button" className="btn btn-quiet" disabled={busy} aria-busy={busy || undefined} onClick={() => input.current?.click()}>
            {busy ? t('upload.busy') : url ? t('upload.change') : t('upload.choose')}
          </button>
          {url && !busy && (
            <button type="button" className="link-btn" onClick={() => void remove()}>
              {t('upload.remove')}
            </button>
          )}
        </div>
        {error && (
          <p className="notice notice-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </div>
  );
}
