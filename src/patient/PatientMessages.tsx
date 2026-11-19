import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { paragraphs } from '../lib/format';
import { api } from '../lib/session';
import type { Doctor, PatientMessage } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { VideoEmbed } from '../components/VideoEmbed';
import { Loading, Notice } from '../components/ui';
import { usePatient } from './PatientApp';

function useMessages(patientId: string | undefined) {
  const [list, setList] = useState<PatientMessage[] | null>(null);
  useEffect(() => {
    if (!patientId) return;
    let alive = true;
    api
      .messages(patientId)
      .then((m) => alive && setList(m))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [patientId]);
  return list;
}

function author(doctors: Doctor[], id: string | null): Doctor | undefined {
  return id ? doctors.find((d) => d.user_id === id) : undefined;
}

/** Na početnoj: nepročitani lični savjeti i poruke doktora. */
export function UnreadMessages() {
  const { t } = useI18n();
  const { patient } = usePatient();
  const list = useMessages(patient?.id);
  const unread = (list ?? []).filter((m) => !m.read_at);
  if (unread.length === 0) return null;
  return (
    <section className="papp-section" aria-label={t('pm.pTitle')}>
      {unread.slice(0, 3).map((m) => (
        <Link key={m.id} to={`/poruke/${m.id}`} className="pcard pcard-action">
          <span className="pcard-kicker">{t(m.kind === 'savjet' ? 'pm.pNewTip' : 'pm.pNewMessage')}</span>
          <strong>{m.title}</strong>
          <span className="text-link">{t('pm.pOpen')}</span>
        </Link>
      ))}
      {unread.length > 3 && (
        <Link className="text-link" to="/moj-karton#poruke">
          {t('pm.pMore', { n: String(unread.length - 3) })}
        </Link>
      )}
    </section>
  );
}

/** U "Moj karton": svi lični savjeti i poruke. */
export function MessagesSection({ patientId }: { patientId: string }) {
  const { t, date } = useI18n();
  const { hash } = useLocation();
  const list = useMessages(patientId);
  useEffect(() => {
    if (list && hash === '#poruke') document.getElementById('poruke')?.scrollIntoView({ block: 'start' });
  }, [list, hash]);
  return (
    <section className="papp-section" id="poruke" aria-labelledby="c-msg">
      <h2 id="c-msg">{t('pm.pTitle')}</h2>
      <p className="hint">{t('pm.pHint')}</p>
      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="muted">{t('pm.pNone')}</p>
      ) : (
        <ul className="post-list">
          {list.map((m) => (
            <li key={m.id}>
              <Link className={`post-card msg-row${m.read_at ? '' : ' msg-unread'}`} to={`/poruke/${m.id}`}>
                <span className="post-card-body">
                  <span className="pcard-kicker">
                    {t(m.kind === 'savjet' ? 'pm.kindTip' : 'pm.kindMessage')} · {date(m.created_at)}
                    {!m.read_at && <span className="msg-dot">{t('pm.pNew')}</span>}
                  </span>
                  <strong>{m.title}</strong>
                  {m.video_url && <span className="meta">{t('pm.withVideo')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Jedan lični savjet ili poruka; otvaranjem se označava pročitanim. */
export function MessageView() {
  const { id = '' } = useParams();
  const { t, date } = useI18n();
  const { doctors, preview } = usePatient();
  const [m, setM] = useState<PatientMessage | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api
      .message(id)
      .then((x) => {
        if (!alive) return;
        setM(x);
        if (x && !x.read_at && !preview) void api.markMessageRead(x.id).catch(() => undefined);
      })
      .catch(() => alive && setM(null));
    return () => {
      alive = false;
    };
  }, [id, preview]);

  const back = (
    <Link className="text-link" to="/moj-karton#poruke">
      {t('pm.pBack')}
    </Link>
  );
  if (m === undefined) return <Loading />;
  if (m === null) {
    return (
      <>
        {back}
        <Notice kind="info">{t('pm.pGone')}</Notice>
      </>
    );
  }
  const d = author(doctors, m.created_by);
  return (
    <article className="article">
      {back}
      <span className="pcard-kicker">{t(m.kind === 'savjet' ? 'pm.pTipFor' : 'pm.pMessageFor')}</span>
      <h1>{m.title}</h1>
      <div className="msg-from">
        {d && <Avatar url={d.avatar_url} name={d.full_name} size={36} />}
        <span className="meta">
          {d ? `${d.full_name} · ` : ''}
          {date(m.created_at)}
        </span>
      </div>
      {m.video_url && <VideoEmbed url={m.video_url} title={m.title} />}
      {paragraphs(m.body).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
      <p className="hint">{t('pm.pPrivate')}</p>
    </article>
  );
}
