import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { parseInviteToken } from '../lib/api';
import { api, useSession } from '../lib/session';
import { Button, Field, LanguageSelect, Notice, Wordmark } from '../components/ui';

/** Prijavljen korisnik koji još nije član nijedne ordinacije. */
export function Welcome() {
  const { t } = useI18n();
  const { profile, refresh, selectClinic, signOut } = useSession();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [doctorName, setDoctorName] = useState(profile?.full_name ?? '');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  const [inviteText, setInviteText] = useState('');
  const [inviteError, setInviteError] = useState<Key | null>(null);

  async function register(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('err.clinicName');
      return;
    }
    setBusy(true);
    try {
      const id = await api.registerClinic({ name: name.trim(), doctorName: doctorName.trim(), city: city.trim(), phone: phone.trim() });
      selectClinic(id);
      await refresh();
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const token = parseInviteToken(inviteText);
    if (!token) {
      setInviteError('welcome.badToken');
      return;
    }
    navigate(`/invite/${token}`);
  }

  const first = profile?.full_name.trim().split(/\s+/)[0];

  return (
    <div className="solo solo-wide">
      <div className="solo-top">
        <Wordmark />
        <LanguageSelect />
      </div>

      <header className="page-head">
        <h1>{first ? t('welcome.title', { name: first }) : t('welcome.titlePlain')}</h1>
        <p className="lead">{t('welcome.lead')}</p>
      </header>

      <div className="split">
        <form className="panel" onSubmit={register}>
          <h2>{t('welcome.registerTitle')}</h2>
          <p className="lead">{t('welcome.registerLead')}</p>
          {error && <Notice kind="error">{t(error)}</Notice>}
          <Field label={t('clinic.name')} required value={name} onChange={(e) => setName(e.target.value)} />
          <Field label={t('clinic.doctorName')} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
          <Field label={t('clinic.city')} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
          <Field label={t('clinic.phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="submit" busy={busy}>
            {t('welcome.submitRegister')}
          </Button>
        </form>

        <form className="panel panel-plain" onSubmit={join}>
          <h2>{t('welcome.joinTitle')}</h2>
          <p className="lead">{t('welcome.joinLead')}</p>
          {inviteError && <Notice kind="error">{t(inviteError)}</Notice>}
          <Field
            label={t('welcome.inviteField')}
            value={inviteText}
            onChange={(e) => {
              setInviteText(e.target.value);
              setInviteError(null);
            }}
          />
          <Button type="submit" variant="quiet">
            {t('welcome.submitJoin')}
          </Button>
        </form>
      </div>

      <button type="button" className="link-btn" onClick={() => void signOut()}>
        {t('nav.logout')}
      </button>
    </div>
  );
}
