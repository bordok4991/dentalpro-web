import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { isVideoLink } from '../lib/format';
import { postTemplates } from '../lib/postTemplates';
import { api, useSession } from '../lib/session';
import type { MessageKind, Patient, PatientMessage, Post } from '../lib/types';
import { Button, Field, Loading, Notice, TextField } from './ui';

/**
 * Blok u kartonu: lični savjeti i poruke doktora koje vidi samo ovaj pacijent.
 * Savjet se može napisati ili preuzeti iz savjeta ordinacije pa prilagoditi.
 */
export function PatientMessages({ patient }: { patient: Patient }) {
  const { t, date, locale } = useI18n();
  const { current, user } = useSession();
  const [list, setList] = useState<PatientMessage[] | null>(null);
  const [tips, setTips] = useState<Post[]>([]);
  const [writing, setWriting] = useState(false);
  const [kind, setKind] = useState<MessageKind>('savjet');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [video, setVideo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .messages(patient.id)
      .then((m) => alive && setList(m))
      .catch((e) => alive && (setMsg({ kind: 'error', key: errorKey(e) }), setList([])));
    if (current) {
      api
        .posts(current.clinic.id, { kind: 'savjet', publishedOnly: true })
        .then((p) => alive && setTips(p))
        .catch(() => alive && setTips([]));
    }
    return () => {
      alive = false;
    };
  }, [patient.id, current?.clinic.id]);

  if (!current) return null;
  const templates = postTemplates(locale, 'savjet');

  function pick(value: string) {
    if (!value) return;
    const [src, id] = value.split(':');
    if (src === 'post') {
      const p = tips.find((x) => x.id === id);
      if (p) {
        setTitle(p.title);
        setBody(p.body);
        setVideo(p.video_url ?? '');
      }
    } else {
      const tp = templates.find((x) => x.id === id);
      if (tp) {
        setTitle(tp.title);
        setBody(tp.body);
      }
    }
    setKind('savjet');
  }

  function reset() {
    setWriting(false);
    setKind('savjet');
    setTitle('');
    setBody('');
    setVideo('');
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setMsg(null);
    if (!title.trim() || !body.trim()) return setMsg({ kind: 'error', key: 'err.postEmpty' });
    if (video.trim() && !isVideoLink(video)) return setMsg({ kind: 'error', key: 'err.videoLink' });
    setBusy(true);
    try {
      const m = await api.sendMessage(current.clinic.id, patient.id, { kind, title, body, video_url: video });
      setList((l) => [m, ...(l ?? [])]);
      setMsg({ kind: 'ok', key: patient.user_id ? 'pm.sent' : 'pm.sentNoApp' });
      reset();
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: PatientMessage) {
    if (!window.confirm(t('pm.deleteConfirm'))) return;
    try {
      await api.deleteMessage(m.id);
      setList((l) => (l ?? []).filter((x) => x.id !== m.id));
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    }
  }

  return (
    <section className="block" aria-labelledby="k-pm">
      <div className="block-head">
        <h2 id="k-pm">{t('pm.title')}</h2>
        {!writing && !patient.is_archived && <Button onClick={() => setWriting(true)}>{t('pm.new')}</Button>}
      </div>
      <p className="hint">{t('pm.lead')}</p>
      {msg && <Notice kind={msg.kind}>{t(msg.key)}</Notice>}

      {writing && (
        <form className="rowitem-edit" onSubmit={send} noValidate aria-label={t('pm.new')}>
          <fieldset className="seg">
            <legend>{t('pm.kind')}</legend>
            <div className="seg-row">
              {(['savjet', 'poruka'] as MessageKind[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {t(k === 'savjet' ? 'pm.kindTip' : 'pm.kindMessage')}
                </button>
              ))}
            </div>
          </fieldset>
          {kind === 'savjet' && (
            <div className="field">
              <label htmlFor="pm-from">{t('pm.from')}</label>
              <select id="pm-from" defaultValue="" onChange={(e) => pick(e.target.value)}>
                <option value="">{t('pm.fromNone')}</option>
                {tips.length > 0 && (
                  <optgroup label={t('pm.fromPosts')}>
                    {tips.map((p) => (
                      <option key={p.id} value={`post:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={t('pm.fromTemplates')}>
                  {templates.map((tp) => (
                    <option key={tp.id} value={`tpl:${tp.id}`}>
                      {tp.title}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="hint">{t('pm.fromHint')}</p>
            </div>
          )}
          <Field label={t('pm.fieldTitle')} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          <TextField label={t('pm.fieldBody')} hint={t('posts.bodyHint')} rows={8} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Field label={t('video.field')} hint={t('video.hint')} type="url" inputMode="url" value={video} onChange={(e) => setVideo(e.target.value)} />
          {!patient.user_id && <p className="hint">{t('pm.noAppHint')}</p>}
          <div className="row">
            <Button type="submit" busy={busy}>
              {t('pm.send')}
            </Button>
            <Button variant="quiet" onClick={reset}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        !writing && <p className="muted">{t('pm.none')}</p>
      ) : (
        <ul className="rows">
          {list.map((m) => (
            <li key={m.id} className="rowitem">
              <div className="rowitem-main">
                <strong>{m.title}</strong>
                <span className="meta">
                  {t(m.kind === 'savjet' ? 'pm.kindTip' : 'pm.kindMessage')} · {date(m.created_at)}
                  {m.video_url && ` · ${t('pm.withVideo')}`}
                </span>
              </div>
              <div className="rowitem-actions plan-sum">
                <span className={`tag ${m.read_at ? 'post-st-live' : 'post-st-draft'}`}>{m.read_at ? t('pm.readOn', { date: date(m.read_at) }) : t('pm.unread')}</span>
                {(current.role === 'owner' || m.created_by === user?.id) && (
                  <button type="button" className="link-btn" onClick={() => void remove(m)}>
                    {t('pm.delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
