import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { firstName, paragraphs } from '../lib/format';
import { api, useSession } from '../lib/session';
import type { Doctor, MyAppointment, Patient, Post, PostKind, TreatmentPlan } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Button, Loading, Notice } from '../components/ui';
import { ProfileForm } from '../pages/Settings';
import { Booking, MyAppointments, AppointmentCard } from './PatientBooking';
import { MyCard } from './PatientCard';
import { MessageView, UnreadMessages } from './PatientMessages';
import { VideoEmbed } from '../components/VideoEmbed';
import { ExitPreview } from './PreviewSwitch';

interface PatientData {
  /** undefined dok se učitava; null kad nalog nije povezan s kartonom */
  patient: Patient | null | undefined;
  doctors: Doctor[];
  appointments: MyAppointment[] | null;
  reloadAppointments: () => Promise<void>;
  /** Osoblje gleda aplikaciju kao ovaj pacijent: samo za gledanje, ništa se ne mijenja. */
  preview: boolean;
}

const Ctx = createContext<PatientData | null>(null);

export function usePatient(): PatientData {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePatient izvan PatientApp');
  return v;
}

/** Bijeli ili tamni tekst na boji ordinacije. */
function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#10243A' : '#FFFFFF';
}

/** Objave koje pacijent vidi: osoblje vidi i istekle, pa ih pregled sakrije. */
export function forPatient(posts: Post[], preview: boolean): Post[] {
  if (!preview) return posts;
  const today = todayIso();
  return posts.filter((p) => p.is_published && (!p.valid_until || p.valid_until >= today));
}

/** Aplikacija za pacijente: prilagođena telefonu, u bojama ordinacije. */
export function PatientApp({ previewId }: { previewId?: string }) {
  const { t } = useI18n();
  const { current, user } = useSession();
  const navigate = useNavigate();
  const preview = !!previewId;
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<MyAppointment[] | null>(null);
  const clinicId = current?.clinic.id;

  const reloadAppointments = useCallback(async () => {
    if (!clinicId) return;
    try {
      setAppointments(previewId ? await api.appointmentsAsPatient(previewId) : await api.myAppointments(clinicId));
    } catch {
      setAppointments([]);
    }
  }, [clinicId, previewId]);

  useEffect(() => {
    if (!clinicId || !user) return;
    let alive = true;
    setPatient(undefined);
    Promise.all([previewId ? api.patient(previewId) : api.myPatient(clinicId, user.id), api.clinicDoctors(clinicId)])
      .then(([p, d]) => {
        if (!alive) return;
        setPatient(p);
        setDoctors(d);
      })
      .catch(() => alive && setPatient(null));
    void reloadAppointments();
    return () => {
      alive = false;
    };
  }, [clinicId, user, previewId, reloadAppointments]);

  const value = useMemo(() => ({ patient, doctors, appointments, reloadAppointments, preview }), [patient, doctors, appointments, reloadAppointments, preview]);
  if (!current) return null;
  const c = current.clinic;
  const brand = { '--brand': c.primary_color, '--brand-ink': inkOn(c.primary_color), '--accent': c.accent_color } as CSSProperties;

  const tabs: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
    { to: '/', label: t('p.nav.home'), icon: <IconHome />, end: true },
    { to: '/termini', label: t('p.nav.appointments'), icon: <IconCalendar /> },
    { to: '/moj-karton', label: t('p.nav.card'), icon: <IconTooth /> },
    { to: '/novosti', label: t('p.nav.news'), icon: <IconNews /> },
    { to: '/profil', label: t('p.nav.profile'), icon: <IconUser /> },
  ];

  return (
    <Ctx.Provider value={value}>
      <div className={`papp${previewId ? ' papp-preview' : ''}`} style={brand}>
        <div className="papp-sticky">
          {previewId && (
            <div className="pv-bar" role="status">
              <span>
                <strong>{t('pv.banner', { name: patient ? `${patient.first_name} ${patient.last_name}` : '…' })}</strong>
                <span>{t('pv.readOnly')}</span>
              </span>
              <button type="button" onClick={() => navigate(`/patients/${previewId}`)}>
                {t('pv.exit')}
              </button>
            </div>
          )}
          <header className="papp-top">
            <Link to="/" className="papp-brand">
              <Avatar url={c.logo_url} name={c.name} size={40} square />
              <span>
                <strong>{c.name}</strong>
                {c.doctor_name && <span>{c.doctor_name}</span>}
              </span>
            </Link>
          </header>
        </div>
        <main className="papp-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/termini" element={<MyAppointments />} />
            <Route path="/zakazi" element={<Booking />} />
            <Route path="/moj-karton" element={<MyCard />} />
            <Route path="/novosti" element={<News />} />
            <Route path="/novosti/:id" element={<Article />} />
            <Route path="/poruke/:id" element={<MessageView />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/kao-pacijent/:id" element={<Navigate to="/" replace />} />
            {previewId && <Route path="/patients/:id" element={<ExitPreview />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <nav className="papp-tabs" aria-label={t('p.nav.label')}>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end}>
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}

export function NotLinked() {
  const { t } = useI18n();
  const { current } = useSession();
  return (
    <Notice kind="info">
      {t('p.notLinked')}
      {current?.clinic.phone && (
        <>
          {' '}
          <a href={`tel:${current.clinic.phone.replace(/\s+/g, '')}`}>{current.clinic.phone}</a>
        </>
      )}
    </Notice>
  );
}

function Home() {
  const { t } = useI18n();
  const { current, profile } = useSession();
  const { patient, appointments, doctors, preview } = usePatient();
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const clinicId = current?.clinic.id;

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    api
      .posts(clinicId, { publishedOnly: true })
      .then((p) => alive && setPosts(forPatient(p, preview).slice(0, 3)))
      .catch(() => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, [clinicId, preview]);

  useEffect(() => {
    if (!patient) return;
    let alive = true;
    api
      .plans(patient.id)
      .then((p) => alive && setPlans(p.filter((x) => x.status === 'poslan')))
      .catch(() => alive && setPlans([]));
    return () => {
      alive = false;
    };
  }, [patient]);

  if (!current) return null;
  const c = current.clinic;
  const first = (patient?.first_name || firstName(profile?.full_name)).trim();
  const next = (appointments ?? [])
    .filter((a) => new Date(a.ends_at).getTime() > Date.now() && ['zakazan', 'potvrdjen', 'stigao', 'u_toku'].includes(a.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const canBook = !!patient && c.online_booking;

  return (
    <>
      <h1 className="papp-hello">{first ? t('p.hello', { name: first }) : t('p.helloPlain')}</h1>
      {patient === null && <NotLinked />}

      <section className="papp-section" aria-labelledby="p-next">
        <h2 id="p-next">{t('p.nextVisit')}</h2>
        {appointments === null ? (
          <Loading />
        ) : next ? (
          <AppointmentCard appt={next} highlight />
        ) : (
          <div className="pcard pcard-empty">
            <p>{t('p.noNext')}</p>
            {canBook ? (
              <Link className="btn btn-primary" to="/zakazi">
                {t('p.book')}
              </Link>
            ) : (
              c.phone && (
                <a className="btn btn-quiet" href={`tel:${c.phone.replace(/\s+/g, '')}`}>
                  {t('p.callToBook')}
                </a>
              )
            )}
          </div>
        )}
        {next && canBook && (
          <Link className="text-link" to="/zakazi">
            {t('p.bookAnother')}
          </Link>
        )}
      </section>

      {patient && <UnreadMessages />}

      {plans.length > 0 && (
        <section className="papp-section">
          {plans.map((p) => (
            <Link key={p.id} to={`/moj-karton#plan-${p.id}`} className="pcard pcard-action">
              <span className="pcard-kicker">{t('p.planWaiting')}</span>
              <strong>{p.title}</strong>
              <span className="text-link">{t('p.planOpen')}</span>
            </Link>
          ))}
        </section>
      )}

      {posts && posts.length > 0 && (
        <section className="papp-section" aria-labelledby="p-news">
          <div className="block-head">
            <h2 id="p-news">{t('p.fromClinic')}</h2>
            <Link className="text-link" to="/novosti">
              {t('p.allNews')}
            </Link>
          </div>
          <ul className="post-list">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ul>
        </section>
      )}

      <ClinicCard doctors={doctors} />
    </>
  );
}

export function ClinicCard({ doctors }: { doctors: Doctor[] }) {
  const { t } = useI18n();
  const { current } = useSession();
  if (!current) return null;
  const c = current.clinic;
  const place = [c.address, c.city].filter(Boolean).join(', ');
  const names = t('cal.weekdays').split('|');
  const order = ['1', '2', '3', '4', '5', '6', '0'] as const;
  const open = order.filter((d) => c.working_hours?.[d]);

  return (
    <section className="papp-section" aria-labelledby="p-clinic">
      <h2 id="p-clinic">{t('p.clinic')}</h2>
      <div className="pcard">
        {doctors.length > 0 && (
          <ul className="doctors">
            {doctors.map((d) => (
              <li key={d.user_id}>
                <Avatar url={d.avatar_url} name={d.full_name} size={56} />
                <span>
                  <strong>{d.full_name}</strong>
                  <span className="meta">{d.specialty || t(d.role === 'owner' ? 'role.doctor' : `role.${d.role}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          {c.phone && (
            <a className="btn btn-primary" href={`tel:${c.phone.replace(/\s+/g, '')}`}>
              {t('p.call', { phone: c.phone })}
            </a>
          )}
          {place && (
            <a className="btn btn-quiet" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${place}`)}`} target="_blank" rel="noreferrer">
              {t('p.map')}
            </a>
          )}
        </div>
        {place && <p className="meta">{place}</p>}
        {open.length > 0 && (
          <dl className="hours-list">
            {open.map((d) => (
              <div key={d}>
                <dt>{names[Number(d)]}</dt>
                <dd>
                  {c.working_hours[d]![0]}–{c.working_hours[d]![1]}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function PostCard({ post }: { post: Post }) {
  const { t, date } = useI18n();
  const first = paragraphs(post.body)[0] ?? '';
  return (
    <li>
      <Link className="post-card" to={`/novosti/${post.id}`}>
        {post.image_url && <img src={post.image_url} alt="" loading="lazy" />}
        <span className="post-card-body">
          <span className="pcard-kicker">{t(post.kind === 'novost' ? 'p.kindNews' : 'p.kindTip')}</span>
          <strong>{post.title}</strong>
          <span className="post-excerpt">{first.length > 140 ? first.slice(0, 137).trimEnd() + '…' : first}</span>
          {post.valid_until && <span className="meta">{t('p.validUntil', { date: date(post.valid_until) })}</span>}
        </span>
      </Link>
    </li>
  );
}

function News() {
  const { t } = useI18n();
  const { current } = useSession();
  const [params, setParams] = useSearchParams();
  const { preview } = usePatient();
  const kind: PostKind = params.get('vrsta') === 'savjet' ? 'savjet' : 'novost';
  const [list, setList] = useState<Post[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const clinicId = current?.clinic.id;

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setList(null);
    api
      .posts(clinicId, { kind, publishedOnly: true })
      .then((p) => alive && setList(forPatient(p, preview)))
      .catch((e) => alive && (setError(errorKey(e)), setList([])));
    return () => {
      alive = false;
    };
  }, [clinicId, kind, preview]);

  return (
    <>
      <h1>{t('p.newsTitle')}</h1>
      <div className="seg-row papp-switch" role="group" aria-label={t('p.newsTitle')}>
        {(['novost', 'savjet'] as PostKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setParams({ vrsta: k }, { replace: true })}>
            {t(k === 'novost' ? 'p.tabNews' : 'p.tabTips')}
          </button>
        ))}
      </div>
      {error && <Notice kind="error">{t(error)}</Notice>}
      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="muted">{t(kind === 'novost' ? 'p.noNews' : 'p.noTips')}</p>
      ) : (
        <ul className="post-list">
          {list.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </ul>
      )}
    </>
  );
}

function Article() {
  const { id = '' } = useParams();
  const { t, date } = useI18n();
  const [post, setPost] = useState<Post | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api
      .post(id)
      .then((p) => alive && setPost(p))
      .catch(() => alive && setPost(null));
    return () => {
      alive = false;
    };
  }, [id]);

  const back = (
    <Link className="text-link" to={`/novosti${post?.kind === 'savjet' ? '?vrsta=savjet' : ''}`}>
      {t('p.backToNews')}
    </Link>
  );
  if (post === undefined) return <Loading />;
  if (post === null) {
    return (
      <>
        {back}
        <Notice kind="info">{t('p.postGone')}</Notice>
      </>
    );
  }
  return (
    <article className="article">
      {back}
      {post.image_url && <img className="article-img" src={post.image_url} alt="" />}
      <span className="pcard-kicker">{t(post.kind === 'novost' ? 'p.kindNews' : 'p.kindTip')}</span>
      <h1>{post.title}</h1>
      <p className="meta">
        {post.published_at && date(post.published_at)}
        {post.valid_until && ` · ${t('p.validUntil', { date: date(post.valid_until) })}`}
      </p>
      {post.video_url && <VideoEmbed url={post.video_url} title={post.title} />}
      {paragraphs(post.body).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </article>
  );
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

function Profile() {
  const { t } = useI18n();
  const { signOut, memberships, current, selectClinic } = useSession();
  const { doctors, preview } = usePatient();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  return (
    <>
      <h1>{t('p.profileTitle')}</h1>
      {preview ? <Notice kind="info">{t('pv.profile')}</Notice> : <ProfileForm withPhoto={false} />}
      {!preview && memberships && memberships.length > 1 && current && (
        <section className="block">
          <h2>{t('nav.clinic')}</h2>
          <select aria-label={t('nav.clinic')} value={current.clinic.id} onChange={(e) => selectClinic(e.target.value)}>
            {memberships.map((m) => (
              <option key={m.clinic.id} value={m.clinic.id}>
                {m.clinic.name}
              </option>
            ))}
          </select>
        </section>
      )}
      {!standalone && (
        <section className="block">
          <h2>{t('p.installTitle')}</h2>
          {install ? (
            <Button onClick={() => void install.prompt().then(() => setInstall(null))}>{t('p.installButton')}</Button>
          ) : (
            <ul className="plain install-steps">
              <li>{t('p.installIos')}</li>
              <li>{t('p.installAndroid')}</li>
            </ul>
          )}
        </section>
      )}
      <section className="block">
        <h2>{t('p.privacyTitle')}</h2>
        <p className="muted">{t('p.privacy')}</p>
      </section>
      <ClinicCard doctors={doctors} />
      {!preview && (
        <p className="papp-logout">
          <Button variant="quiet" onClick={() => void signOut()}>
            {t('nav.logout')}
          </Button>
        </p>
      )}
    </>
  );
}

/* ---------- Ikone (jednostavne linije, boja iz teksta) ---------- */
const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
function IconHome() {
  return (
    <svg {...svg}>
      <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg {...svg}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function IconTooth() {
  return (
    <svg {...svg}>
      <path d="M7.5 3.5c-2.6 0-4 2.1-4 4.6 0 2.2 1 3.6 1.6 5.5.7 2.3.9 7 2.6 7 1.6 0 1.5-4.7 2.7-6 .5-.5 1.7-.5 2.2 0 1.2 1.3 1.1 6 2.7 6 1.7 0 1.9-4.7 2.6-7 .6-1.9 1.6-3.3 1.6-5.5 0-2.5-1.4-4.6-4-4.6-1.8 0-2.6 1-4 1s-2.2-1-4-1z" />
    </svg>
  );
}
function IconNews() {
  return (
    <svg {...svg}>
      <path d="M5 4.5h11a1 1 0 0 1 1 1V19a1.5 1.5 0 0 0 3 0V9h-3" />
      <path d="M5 4.5V19a1.5 1.5 0 0 0 1.5 1.5H18.5M8 8.5h5M8 12h5M8 15.5h3" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5" />
    </svg>
  );
}
