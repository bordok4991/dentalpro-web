import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { parseInviteToken } from '../lib/api';
import { api, pendingInvite, useSession } from '../lib/session';
import { Button, Loading, Notice, Wordmark } from '../components/ui';

export function InviteAccept() {
  const { t } = useI18n();
  const { token: raw } = useParams();
  const token = parseInviteToken(raw ?? '');
  const { session, refresh, selectClinic, signOut } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<Key | null>(token ? null : 'err.inviteMissing');
  const started = useRef(false);

  const signedIn = !!session;

  useEffect(() => {
    if (!signedIn || !token || started.current) return;
    started.current = true;
    (async () => {
      try {
        const clinicId = await api.acceptInvite(token);
        pendingInvite.clear();
        selectClinic(clinicId);
        await refresh();
        navigate('/', { replace: true });
      } catch (e) {
        pendingInvite.clear();
        setError(errorKey(e));
      }
    })();
  }, [signedIn, token, refresh, selectClinic, navigate]);

  // Pogrešan nalog: nakon odjave pozivnica ostaje na čekanju za pravi nalog.
  // Ostale greške (iskorištena, istekla, poništena) pozivnicu odbacuju.
  async function signOutFromError() {
    const keep = error === 'err.inviteWrongEmail' && token;
    await signOut();
    if (keep) pendingInvite.set(keep);
    navigate('/login', { replace: true });
  }

  // Bez prijave: zapamti pozivnicu i pošalji na prijavu.
  if (session === null && token && !error) {
    pendingInvite.set(token);
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="solo">
      <Wordmark />
      <section className="panel">
        {error ? (
          <>
            <h1>{t('invite.failedTitle')}</h1>
            <Notice kind="error">{t(error)}</Notice>
            <div className="row">
              <Button onClick={() => navigate('/', { replace: true })}>{t('invite.continue')}</Button>
              {signedIn && (
                <Button variant="quiet" onClick={() => void signOutFromError()}>
                  {t('nav.logout')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <h1>{t('invite.accepting')}</h1>
            <Loading />
          </>
        )}
      </section>
    </div>
  );
}
