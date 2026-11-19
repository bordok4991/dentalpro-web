import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { todayIso, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { isVideoLink, placeholders } from '../lib/format';
import { postTemplates } from '../lib/postTemplates';
import { api, useSession } from '../lib/session';
import type { Post, PostKind } from '../lib/types';
import { Button, Field, Loading, Notice, TextField } from '../components/ui';
import { ImageUpload } from '../components/ImageUpload';
import { VideoEmbed } from '../components/VideoEmbed';

const WRITERS = ['owner', 'doctor', 'specialist'];

export function postState(p: Post): 'draft' | 'live' | 'expired' {
  if (!p.is_published) return 'draft';
  if (p.valid_until && p.valid_until < todayIso()) return 'expired';
  return 'live';
}

/** Novosti (popusti, najave) i savjeti doktora koje pacijenti čitaju u aplikaciji. */
export function Posts() {
  const { t, date, locale } = useI18n();
  const { current } = useSession();
  const [params, setParams] = useSearchParams();
  const kind: PostKind = params.get('vrsta') === 'savjet' ? 'savjet' : 'novost';
  const [list, setList] = useState<Post[] | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const clinicId = current?.clinic.id;
  const canWrite = !!current && WRITERS.includes(current.role);

  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    setList(null);
    api
      .posts(clinicId, { kind })
      .then((p) => alive && setList(p))
      .catch((e) => alive && (setError(errorKey(e)), setList([])));
    return () => {
      alive = false;
    };
  }, [clinicId, kind]);

  if (!current) return null;
  const templates = postTemplates(locale, kind);

  return (
    <>
      <header className="page-head">
        <h1>{t('posts.title')}</h1>
        <p className="lead">{t('posts.lead')}</p>
      </header>

      <nav className="tabs" aria-label={t('posts.title')}>
        {(['novost', 'savjet'] as PostKind[]).map((k) => (
          <a
            key={k}
            href={`?vrsta=${k}`}
            aria-current={k === kind ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setParams({ vrsta: k });
            }}
          >
            {t(k === 'novost' ? 'posts.news' : 'posts.tips')}
          </a>
        ))}
      </nav>

      {error && <Notice kind="error">{t(error)}</Notice>}

      {canWrite && (
        <section className="block">
          <div className="block-head">
            <h2>{t(kind === 'novost' ? 'posts.newNews' : 'posts.newTip')}</h2>
            <Link className="btn btn-primary" to={`/posts/new?vrsta=${kind}`}>
              {t('posts.writeEmpty')}
            </Link>
          </div>
          <p className="hint">{t('posts.templatesHint')}</p>
          <ul className="template-list">
            {templates.map((tp) => (
              <li key={tp.id}>
                <Link to={`/posts/new?vrsta=${kind}&predlozak=${tp.id}`}>{tp.title.replace(/\[[^\]]*\]/g, '…')}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block" aria-label={t(kind === 'novost' ? 'posts.news' : 'posts.tips')}>
        {list === null ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="muted">{t(kind === 'novost' ? 'posts.noNews' : 'posts.noTips')}</p>
        ) : (
          <ul className="rows">
            {list.map((p) => {
              const st = postState(p);
              return (
                <li key={p.id} className={`rowitem${st === 'live' ? '' : ' rowitem-off'}`}>
                  <div className="rowitem-main">
                    <Link className="text-link" to={`/posts/${p.id}`}>
                      {p.title}
                    </Link>
                    <span className="meta">
                      {st === 'draft'
                        ? t('posts.draftSaved', { date: date(p.updated_at) })
                        : t('posts.publishedOn', { date: date(p.published_at ?? p.updated_at) })}
                      {p.valid_until && ` · ${t('posts.until', { date: date(p.valid_until) })}`}
                    </span>
                  </div>
                  <span className={`tag post-st-${st}`}>{t(`posts.state.${st}`)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/** Pisanje i uređivanje objave. */
export function PostEditor() {
  const { id = 'new' } = useParams();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const { current, user } = useSession();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [post, setPost] = useState<Post | null | undefined>(isNew ? null : undefined);
  const [kind, setKind] = useState<PostKind>(params.get('vrsta') === 'savjet' ? 'savjet' : 'novost');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; key: Key; vars?: Record<string, string> } | null>(null);
  const canWrite = !!current && WRITERS.includes(current.role);
  const canDelete = !!current && !!post && (current.role === 'owner' || post.created_by === user?.id);

  useEffect(() => {
    if (isNew) {
      const tp = postTemplates(locale, kind).find((x) => x.id === params.get('predlozak'));
      if (tp) {
        setTitle(tp.title);
        setBody(tp.body);
      }
      return;
    }
    let alive = true;
    api
      .post(id)
      .then((p) => {
        if (!alive) return;
        setPost(p);
        if (p) {
          setKind(p.kind);
          setTitle(p.title);
          setBody(p.body);
          setImage(p.image_url);
          setVideo(p.video_url ?? '');
          setValidUntil(p.valid_until ?? '');
        }
      })
      .catch((e) => alive && (setMsg({ kind: 'error', key: errorKey(e) }), setPost(null)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!current) return null;
  const back = (
    <p>
      <Link className="text-link" to={`/posts?vrsta=${kind}`}>
        {t('posts.back')}
      </Link>
    </p>
  );
  if (post === undefined) return <Loading />;
  if (!isNew && post === null) {
    return (
      <>
        {back}
        <Notice kind="error">{t(msg?.key ?? 'posts.notFound')}</Notice>
      </>
    );
  }

  const published = !!post?.is_published;

  async function save(publish: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!current) return;
    setMsg(null);
    if (!title.trim() || !body.trim()) return setMsg({ kind: 'error', key: 'err.postEmpty' });
    if (video.trim() && !isVideoLink(video)) return setMsg({ kind: 'error', key: 'err.videoLink' });
    if (publish) {
      const open = [...placeholders(title), ...placeholders(body)];
      if (open.length) return setMsg({ kind: 'error', key: 'err.placeholders', vars: { list: [...new Set(open)].join(', ') } });
    }
    setBusy(publish ? 'publish' : 'save');
    try {
      const saved = await api.savePost(
        current.clinic.id,
        { kind, title, body, image_url: image, video_url: video, valid_until: validUntil || null, is_published: publish },
        post?.id,
      );
      setPost(saved);
      setMsg({ kind: 'ok', key: publish ? (published ? 'posts.updatedLive' : 'posts.publishedOk') : published ? 'posts.unpublishedOk' : 'posts.draftOk' });
      if (isNew) navigate(`/posts/${saved.id}`, { replace: true });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!post || !window.confirm(t('posts.deleteConfirm'))) return;
    setBusy('delete');
    try {
      await api.deletePost(post.id);
      navigate(`/posts?vrsta=${kind}`, { replace: true });
    } catch (err) {
      setMsg({ kind: 'error', key: errorKey(err) });
      setBusy(null);
    }
  }

  const editable = canWrite;
  return (
    <>
      {back}
      <header className="page-head">
        <h1>{isNew ? t(kind === 'novost' ? 'posts.newNews' : 'posts.newTip') : title || t('posts.untitled')}</h1>
        {post && <span className={`tag post-st-${postState(post)}`}>{t(`posts.state.${postState(post)}`)}</span>}
      </header>
      {msg && <Notice kind={msg.kind}>{t(msg.key, msg.vars)}</Notice>}
      {!editable && <Notice kind="info">{t('posts.readOnly')}</Notice>}

      <form className="block" onSubmit={(e) => void save(published, e)} noValidate>
        {isNew && (
          <fieldset className="seg">
            <legend>{t('posts.kind')}</legend>
            <div className="seg-row">
              {(['novost', 'savjet'] as PostKind[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {t(k === 'novost' ? 'posts.kindNews' : 'posts.kindTip')}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label={t('posts.fieldTitle')} value={title} maxLength={140} readOnly={!editable} onChange={(e) => setTitle(e.target.value)} />
        <TextField label={t('posts.fieldBody')} hint={t('posts.bodyHint')} rows={12} maxLength={8000} readOnly={!editable} value={body} onChange={(e) => setBody(e.target.value)} />
        {kind === 'novost' && (
          <div className="field">
            <label htmlFor="post-until">{t('posts.validUntil')}</label>
            <input id="post-until" type="date" min={todayIso()} readOnly={!editable} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-describedby="post-until-hint" />
            <p className="hint" id="post-until-hint">
              {t('posts.validUntilHint')}
            </p>
          </div>
        )}
        <Field
          label={t('video.field')}
          hint={t('video.hint')}
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          readOnly={!editable}
          value={video}
          onChange={(e) => setVideo(e.target.value)}
        />
        {video.trim() && isVideoLink(video) && <VideoEmbed url={video.trim()} title={title} />}
        {editable && (
          <ImageUpload
            label={t('posts.image')}
            hint={t('posts.imageHint')}
            url={image}
            name={title}
            folder={`clinics/${current.clinic.id}/posts`}
            kind="cover"
            onChange={async (u) => setImage(u)}
          />
        )}
        {editable && (
          <div className="row">
            {published ? (
              <>
                <Button type="submit" busy={busy === 'publish'}>
                  {t('posts.saveLive')}
                </Button>
                <Button variant="quiet" busy={busy === 'save'} onClick={() => void save(false)}>
                  {t('posts.unpublish')}
                </Button>
              </>
            ) : (
              <>
                <Button busy={busy === 'publish'} onClick={() => void save(true)}>
                  {t('posts.publish')}
                </Button>
                <Button type="submit" variant="quiet" busy={busy === 'save'}>
                  {t('posts.saveDraft')}
                </Button>
              </>
            )}
          </div>
        )}
        {editable && canDelete && (
          <button type="button" className="link-btn danger-link" disabled={busy === 'delete'} onClick={() => void remove()}>
            {t('posts.delete')}
          </button>
        )}
      </form>
    </>
  );
}
