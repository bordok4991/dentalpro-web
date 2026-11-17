import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { inviteLink } from '../lib/api';
import { api, useSession } from '../lib/session';
import type { Invite, Patient } from '../lib/types';
import { Button, Field, Loading, Notice } from './ui';
import { QrCode } from './QrCode';

/** Blok u kartonu: poziv pacijenta u aplikaciju ili ukidanje pristupa. */
export function PatientAccess({ patient, onChange }: { patient: Patient; onChange: (p: Patient) => void }) {
  const { t, date } = useI18n();
  const { current } = useSession();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [email, setEmail] = useState(patient.email ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (patient.user_id) return setInvite(null);
    let alive = true;
    api
      .patientInvite(patient.id)
      .then((i) => alive && setInvite(i))
      .catch(() => alive && setInvite(null));
    return () => {
      alive = false;
    };
  }, [patient.id, patient.user_id]);

  if (!current) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg({ kind: 'error', key: 'err.email' });
    setBusy(true);
    try {
      setInvite(await api.invitePatient(current.clinic.id, patient.id, email));
      setMsg({ kind: 'ok', key: 'access.created' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!invite) return;
    setBusy(true);
    try {
      await api.revokeInvite(invite.id);
      setInvite(null);
      setMsg(null);
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!window.confirm(t('access.unlinkConfirm'))) return;
    setBusy(true);
    try {
      await api.unlinkPatient(patient.id);
      onChange({ ...patient, user_id: null });
      setMsg({ kind: 'ok', key: 'access.unlinked' });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* preglednik ne dozvoljava; link je vidljiv i može se označiti */
    }
  }

  const link = invite ? inviteLink(invite.token) : '';
  const mail = invite
    ? `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(t('access.mailSubject', { clinic: current.clinic.name }))}&body=${encodeURIComponent(
        t('access.mailBody', { name: patient.first_name, clinic: current.clinic.name, link }),
      )}`
    : '';

  return (
    <section className="block" aria-labelledby="k-access">
      <h2 id="k-access">{t('access.title')}</h2>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}
      {patient.user_id ? (
        <>
          <p>{t('access.active')}</p>
          <p className="hint">{t('access.sees')}</p>
          <button type="button" className="link-btn danger-link" disabled={busy} onClick={() => void unlink()}>
            {t('access.unlink')}
          </button>
        </>
      ) : invite === undefined ? (
        <Loading />
      ) : invite ? (
        <>
          <p>{t('access.pending', { email: invite.email, date: date(invite.expires_at) })}</p>
          <div className="access-share">
            <QrCode text={link} label={t('access.qrLabel')} />
            <div className="form-grid">
              <p className="hint">{t('access.howTo')}</p>
              <div className="copy">
                <input readOnly value={link} aria-label={t('access.link')} onFocus={(e) => e.target.select()} />
                <Button variant="quiet" onClick={() => void copy(link)}>
                  {copied ? t('access.copied') : t('access.copy')}
                </Button>
              </div>
              <div className="row">
                <a className="btn btn-quiet" href={mail}>
                  {t('access.sendMail')}
                </a>
                <button type="button" className="link-btn" disabled={busy} onClick={() => void revoke()}>
                  {t('access.revoke')}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <form className="form-grid" onSubmit={send} noValidate>
          <p className="lead">{t('access.lead')}</p>
          <p className="hint">{t('access.sees')}</p>
          <Field label={t('access.email')} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" busy={busy} disabled={patient.is_archived}>
            {t('access.invite')}
          </Button>
        </form>
      )}
    </section>
  );
}
