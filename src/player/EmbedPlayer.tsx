import { useEffect, useMemo, useRef } from 'react';
import type { EmbedServer, Target } from '../lib/servers';

interface Props {
  server: EmbedServer;
  target: Target;
  resumeAt: number;
  sandbox: boolean;
  onProgress: (watched: number, duration: number, ended?: boolean) => void;
  /** Called once for servers that can't report progress, so the title still shows up in history. */
  onStarted: () => void;
}

/**
 * Third-party iframe player. VidLink and Videasy post playback events to the
 * parent window; the rest can't be tracked, so we record a "started" entry after 2 min.
 */
export default function EmbedPlayer({ server, target, resumeAt, sandbox, onProgress, onStarted }: Props) {
  // `target` and `resumeAt` are stable per episode (memoized by the Watch page).
  const src = useMemo(() => server.url(target, resumeAt), [server, target, resumeAt]);
  const cb = useRef({ onProgress, onStarted });
  cb.current = { onProgress, onStarted };

  useEffect(() => {
    const matches = (season?: unknown, episode?: unknown) =>
      target.type === 'movie' ||
      season === undefined ||
      episode === undefined ||
      (Number(season) === target.season && Number(episode) === target.episode);

    const onMessage = (e: MessageEvent) => {
      if (e.origin === 'https://vidlink.pro' && e.data?.type === 'PLAYER_EVENT') {
        const d = e.data.data ?? {};
        if (['timeupdate', 'pause', 'ended', 'seeked'].includes(d.event) && d.duration > 0 && matches(d.season, d.episode)) {
          cb.current.onProgress(Number(d.currentTime) || 0, Number(d.duration), d.event === 'ended');
        }
      }
      if (e.origin === 'https://player.videasy.net') {
        let d: Record<string, unknown> | null = null;
        try {
          d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        } catch {
          return;
        }
        if (d && Number(d.duration) > 0 && d.timestamp !== undefined && (!d.type || d.type === target.type) && matches(d.season, d.episode)) {
          cb.current.onProgress(Number(d.timestamp) || 0, Number(d.duration));
        }
      }
    };
    window.addEventListener('message', onMessage);

    const started = server.tracksProgress ? undefined : window.setTimeout(() => cb.current.onStarted(), 120_000);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(started);
    };
  }, [server, target.type, target.id, target.season, target.episode]);

  return (
    <iframe
      key={src + sandbox}
      src={src}
      title={`${server.name} player`}
      className="size-full border-0 bg-black"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="origin"
      {...(sandbox ? { sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation' } : {})}
    />
  );
}
