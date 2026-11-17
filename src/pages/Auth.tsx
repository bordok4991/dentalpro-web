import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { pendingInvite } from '../lib/session';
import { FdiChart } from '../components/FdiChart';
import { Button, Field, LanguageSelect, Notice, Wordmark } from '../components/ui';

type Mode = 'login' | 'register' | 'forgot';

function appUrl(path: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
}

export function Auth({ mode }: { mode: Mode }) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const invite = pendingInvite.get();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode !== 'forgot' && password.length < 8) {
      setError('err.weakPassword');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), phone: phone.trim() || null, locale },
            emailRedirectTo: appUrl(invite ? `/invite/${invite}` : '/'),
          },
        });
        if (error) throw error;
        // Kad je potvrda emaila uključena, sesije još nema: korisnik mora otvoriti link.
        if (!data.session) setSentTo(email.trim());
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/reset') });
        if (error) throw error;
        setResetSent(true);
      }
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <Wordmark />
        <p className="auth-tagline">{t('auth.tagline')}</p>
        <FdiChart />
      </aside>

      <main className="auth-main">
        <div className="auth-lang">
          <LanguageSelect />
        </div>

        {sentTo ? (
          <section className="auth-form">
            <h1>{t('auth.checkEmailTitle')}</h1>
            <p className="lead">{t('auth.checkEmail', { email: sentTo })}</p>
            <Link className="btn btn-quiet" to="/login" onClick={() => setSentTo(null)}>
              {t('auth.backToLogin')}
            </Link>
          </section>
        ) : mode === 'forgot' ? (
          <form className="auth-form" onSubmit={submit} noValidate={false}>
            <h1>{t('auth.forgotTitle')}</h1>
            <p className="lead">{t('auth.forgotLead')}</p>
            {resetSent && <Notice kind="ok">{t('auth.resetSent')}</Notice>}
            {error && <Notice kind="error">{t(error)}</Notice>}
            <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" busy={busy}>
              {t('auth.sendReset')}
            </Button>
            <Link className="text-link" to="/login">
              {t('auth.backToLogin')}
            </Link>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <nav className="tabs" aria-label={t('app.name')}>
              <Link to="/login" aria-current={mode === 'login' ? 'page' : undefined} onClick={() => setError(null)}>
                {t('auth.login')}
              </Link>
              <Link to="/register" aria-current={mode === 'register' ? 'page' : undefined} onClick={() => setError(null)}>
                {t('auth.register')}
              </Link>
            </nav>

            {invite && <Notice kind="info">{t('auth.inviteNotice')}</Notice>}
            {error && <Notice kind="error">{t(error)}</Notice>}

            {mode === 'register' && (
              <>
                <Field label={t('auth.fullName')} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <Field label={t('auth.phoneOptional')} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </>
            )}
            <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field
              label={t('auth.password')}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              hint={mode === 'register' ? t('auth.passwordHint') : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" busy={busy}>
              {mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
            </Button>
            {mode === 'login' && (
              <Link className="text-link" to="/forgot">
                {t('auth.forgot')}
              </Link>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
