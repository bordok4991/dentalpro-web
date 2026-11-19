import { useI18n } from '../lib/i18n';
import { videoEmbedUrl } from '../lib/format';

/** Video iz savjeta: YouTube ili Vimeo u okviru, ostalo kao link. */
export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const { t } = useI18n();
  const src = videoEmbedUrl(url);
  if (!src) {
    return (
      <a className="btn btn-quiet video-link" href={url} target="_blank" rel="noreferrer">
        {t('video.open')}
      </a>
    );
  }
  return (
    <div className="video">
      <iframe
        src={src}
        title={t('video.title', { title })}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
