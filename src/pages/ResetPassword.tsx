import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { useSession } from '../lib/session';
import { Button, Field, Notice, Wordmark } from '../components/ui';

/** Otvara se linkom iz emaila; taj link prijavi korisnika, pa ovdje samo upisuje novu lozinku. */
export function ResetPassword() {
  const { t } = useI18n();
  const { session } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('err.weakPassword');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="solo">
      <Wordmark />
      {!session ? (
        <section className="panel">
          <h1>{t('auth.forgotTitle')}</h1>
          <p className="lead">{t('auth.resetNeedsLink')}</p>
          <Link className="btn btn-quiet" to="/login">
            {t('auth.backToLogin')}
          </Link>
        </section>
      ) : done ? (
        <section className="panel">
          <h1>{t('auth.forgotTitle')}</h1>
          <Notice kind="ok">{t('auth.passwordSaved')}</Notice>
          <Button onClick={() => navigate('/', { replace: true })}>{t('invite.continue')}</Button>
        </section>
      ) : (
        <form className="panel" onSubmit={submit}>
          <h1>{t('auth.forgotTitle')}</h1>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <Field
            label={t('auth.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" busy={busy}>
            {t('auth.saveNewPassword')}
          </Button>
        </form>
      )}
    </div>
  );
}
