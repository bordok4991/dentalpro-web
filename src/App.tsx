import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useI18n } from './lib/i18n';
import { errorKey } from './lib/errors';
import { pendingInvite, useSession } from './lib/session';
import { Shell } from './components/Shell';
import { Button, Loading, Notice } from './components/ui';
import { Auth } from './pages/Auth';
import { ResetPassword } from './pages/ResetPassword';
import { Welcome } from './pages/Welcome';
import { InviteAccept } from './pages/InviteAccept';
import { Overview } from './pages/Overview';
import { Team } from './pages/Team';
import { Settings } from './pages/Settings';
import { PatientNew, Patients } from './pages/Patients';
import { Karton } from './pages/Karton';

export function App() {
  const { session } = useSession();
  if (session === undefined) return <Splash />;

  return (
    <Routes>
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      {session ? (
        <Route path="*" element={<SignedIn />} />
      ) : (
        <>
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/forgot" element={<Auth mode="forgot" />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      )}
    </Routes>
  );
}

function Splash() {
  return (
    <div className="splash">
      <Loading />
    </div>
  );
}

function SignedIn() {
  const { t } = useI18n();
  const { memberships, current, loadError, refresh } = useSession();
  const { pathname } = useLocation();

  // Pozivnica otvorena prije prijave: prihvati je odmah nakon prijave.
  const invite = pendingInvite.get();
  if (invite) return <Navigate to={`/invite/${invite}`} replace />;
  // Nakon prijave adresa ne ostaje na stranici za prijavu.
  if (['/login', '/register', '/forgot'].includes(pathname)) return <Navigate to="/" replace />;

  if (loadError) {
    return (
      <div className="splash">
        <Notice kind="error">{t(errorKey(loadError))}</Notice>
        <Button onClick={() => void refresh()}>{t('common.retry')}</Button>
      </div>
    );
  }
  if (memberships === null) return <Splash />;
  if (!current) return <Welcome />;

  const isStaff = current.role !== 'patient';
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Overview />} />
        {isStaff && <Route path="/team" element={<Team />} />}
        {isStaff && <Route path="/patients" element={<Patients />} />}
        {isStaff && <Route path="/patients/new" element={<PatientNew />} />}
        {isStaff && <Route path="/patients/:id" element={<Karton />} />}
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
