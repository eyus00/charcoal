import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import type { AnimeMedia } from '@charcoal/provider-sdk';
import { watchableEpisodes, type AnimeDetails } from '@charcoal/content';
import { btn } from '../components/Button';
import Segmented from '../components/Segmented';
import { Tip } from '../components/Tip';
import Player from '../player/Player';
import { useAnimeEntry } from '../lib/anilist';
import { getShelf, openedEpisode, recordEpisode, resumePoint } from '../lib/animeShelf';
import type { AnimeAudio } from '../lib/anime';
import { useEntrySources } from '../lib/resolver';
import { actions, useStore } from '../lib/store';
import { cx, useKeys, useTitle } from '../lib/util';

/** No TMDB identity: no skip segments, no history entry, nothing to scrobble. */
const NO_TITLE = { type: 'movie', id: 0 } as const;
const AUDIO: { key: AnimeAudio; label: string }[] = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
];

/**
 * An episode of an AniList entry that TMDB doesn't list, in Charcoal's player. The anime
 * providers are asked by the entry's AniList / MAL id and its names. There is no embedded player
 * to fall back to (those are addressed by TMDB id), so "nothing found" is said in words.
 */
export default function AnimeWatch() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const entry = useAnimeEntry(Number.isInteger(id) && id > 0 ? id : 0);
  const leave = useLeave(id);
  useTitle(entry.data?.title ?? 'Anime');

  if (entry.isPending && id > 0) return <Waiting text="Loading…" onClose={leave} />;
  if (entry.error) return <Message title="Couldn’t load this anime" body="AniList didn’t answer. Try again in a moment." retry={() => entry.refetch()} back="/anime" />;
  const a = entry.data;
  const count = a ? watchableEpisodes(a) : 0;
  const ep = Number(params.get('ep') ?? 1);
  if (!a || !Number.isInteger(ep) || ep < 1 || ep > Math.max(1, count)) return <Message title="Can’t play this" body="This anime or episode doesn’t exist." back="/anime" />;
  if (count === 0) return <Message title="Not out yet" body="This anime hasn’t started airing." back={`/anime/title/${a.id}`} />;
  return <Episode key={`${a.id}-${ep}`} a={a} ep={ep} count={count} onClose={leave} />;
}

/** Close returns to wherever the player was opened from; opened directly, to the entry's page. */
function useLeave(id: number) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate(id > 0 ? `/anime/title/${id}` : '/anime')), [location.key, navigate, id]);
}

function Episode({ a, ep, count, onClose }: { a: AnimeDetails; ep: number; count: number; onClose: () => void }) {
  const navigate = useNavigate();
  const audio = useStore((s) => s.settings.animeAudio);
  const media = useMemo<AnimeMedia>(
    () => ({
      kind: 'anime',
      ids: { anilist: String(a.id), ...(a.mal ? { mal: String(a.mal) } : {}) },
      title: a.title,
      // The names anime sites list it under: romanised first, then Japanese, then AniList's synonyms.
      altTitles: [...new Set([a.romaji, a.native, ...a.synonyms].filter((n): n is string => !!n && n !== a.title))],
      episode: ep,
      audio,
      ...(a.year ? { year: a.year } : {}),
      ...(a.duration ? { runtime: a.duration } : {}),
      originalLanguage: 'ja',
    }),
    [a, ep, audio],
  );
  const found = useEntrySources(media);
  const [gaveUp, setGaveUp] = useState(false);
  const about = useMemo(() => ({ id: a.id, title: a.title, cover: a.cover, film: a.kind === 'film', episodes: count }), [a, count]);
  // Where this episode was left, read once (progress updates must not restart playback).
  const resumeAt = useMemo(() => {
    const kept = getShelf().find((e) => e.id === a.id);
    return kept?.episode === ep ? resumePoint(kept).at : 0;
  }, [a.id, ep]);
  useEffect(() => openedEpisode(about, ep), [about, ep]);
  const record = useCallback((watched: number, duration: number, ended?: boolean) => recordEpisode(about, ep, watched, duration, ended), [about, ep]);
  useEffect(() => setGaveUp(false), [found.generation]);

  const go = useCallback((n: number) => navigate(`/anime/watch/${a.id}?ep=${n}`, { replace: true }), [a.id, navigate]);
  const film = a.kind === 'film';
  const subtitle = film ? undefined : `Episode ${ep}`;
  useKeys({
    Escape: () => !document.fullscreenElement && !document.querySelector('[aria-expanded="true"]') && onClose(),
    ...(ep > 1 ? { P: () => go(ep - 1) } : {}),
  });

  const header = (info: ReactNode | null) => (
    <div className="flex items-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-3 md:px-5">
      <div className="min-w-0 px-1">
        {info ?? (
          <div className="leading-snug">
            <Link to={`/anime/title/${a.id}`} className="block truncate text-base font-semibold transition-colors hover:text-white md:text-lg">
              {a.title}
            </Link>
            {subtitle && <div className="truncate text-sm text-white/80">{subtitle}</div>}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <Segmented compact value={audio} options={AUDIO} onChange={(v) => actions.updateSettings({ animeAudio: v })} label="Anime audio" />
        <CloseButton onClose={onClose} />
      </div>
    </div>
  );

  if (found.error || gaveUp) {
    return (
      <Message
        title={gaveUp ? 'The sources found wouldn’t play' : 'No source found for this episode'}
        body={`None of the anime sources had ${film ? 'this film' : `episode ${ep}`} ${audio === 'dub' ? 'dubbed' : 'with subtitles'}. Try ${audio === 'dub' ? 'Sub' : 'Dub'}, or again later.`}
        retry={() => {
          setGaveUp(false);
          found.refetch();
        }}
        back={`/anime/title/${a.id}`}
        extra={<Segmented value={audio} options={AUDIO} onChange={(v) => actions.updateSettings({ animeAudio: v })} label="Anime audio" />}
      />
    );
  }
  if (!found.data) return <Waiting text="Finding sources…" onClose={onClose} />;
  return (
    <div className="fixed inset-0 flex flex-col bg-black" data-testid="anime-watch">
      <Player
        data={found.data}
        media={NO_TITLE}
        title={a.title}
        subtitle={subtitle}
        overview={a.description}
        poster={a.cover}
        resumeAt={resumeAt}
        audioLang={audio === 'sub' ? 'ja' : undefined}
        header={header}
        prev={film ? undefined : ep > 1 ? { label: `Episode ${ep - 1}`, go: () => go(ep - 1) } : null}
        next={film ? undefined : ep < count ? { label: `Episode ${ep + 1}`, go: () => go(ep + 1) } : null}
        onProgress={record}
        searching={found.searching}
        refreshing={found.refreshing}
        generation={found.generation}
        onRefresh={found.refetch}
        onExhausted={() => setGaveUp(true)}
      />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label="Close player (Esc)" onClick={onClose} className={cx(btn({ variant: 'secondary', icon: true }), 'group/tip relative')}>
      <X className="size-5" />
      <Tip label="Close player" keys="Esc" side="bottom" align="end" />
    </button>
  );
}

function Waiting({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-black" role="status">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 md:right-5">
        <CloseButton onClose={onClose} />
      </div>
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="font-medium">{text}</p>
      </div>
    </div>
  );
}

function Message({ title, body, retry, back, extra }: { title: string; body: string; retry?: () => void; back: string; extra?: ReactNode }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg p-6 text-center" data-testid="anime-message">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="text-pretty text-muted">{body}</p>
        {extra && <div className="flex justify-center pt-1">{extra}</div>}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {retry && (
            <button onClick={retry} className={btn()}>
              Try again
            </button>
          )}
          <Link to={back} className={btn({ variant: 'primary' })}>
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
