import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useI18n } from '../lib/i18n';
import { LOCALES, type Locale } from '../lib/types';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p className="hint" id={`${fid}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export function TextField({ label, hint, id, rows = 3, ...rest }: TextProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <textarea id={fid} rows={rows} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p className="hint" id={`${fid}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function SelectField({ label, id, children, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <select id={fid} {...rest}>
        {children}
      </select>
    </div>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet' | 'danger';
  busy?: boolean;
}

export function Button({ variant = 'primary', busy, disabled, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button type={type} className={`btn btn-${variant}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}

export function Notice({ kind, children, id }: { kind: 'error' | 'ok' | 'info'; children: ReactNode; id?: string }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'} id={id}>
      {children}
    </p>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p className="loading" role="status">
      {t('common.loading')}
    </p>
  );
}

export function LanguageSelect({ onChange }: { onChange?: (l: Locale) => void }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <select
      className="lang-select"
      aria-label={t('settings.language')}
      value={locale}
      onChange={(e) => {
        const l = e.target.value as Locale;
        setLocale(l);
        onChange?.(l);
      }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {t(`lang.${l}`)}
        </option>
      ))}
    </select>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-dot" aria-hidden="true" />
      Dental Pro
    </span>
  );
}
