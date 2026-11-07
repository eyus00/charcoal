import { useQueries } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import EpisodeTile, { Chip } from './EpisodeTile';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { toast } from './Toast';
import { actions, getState, percent, watchUrl, type HistoryItem } from '../lib/store';
import { q, type Episode } from '../lib/tmdb';
import { formatRuntime } from '../lib/util';

const mins = (sec: number) => Math.max(1, Math.round(sec / 60));

/** Episode stills/names come from season lists (cached and shared with the details page). */
function useEpisodes(items: HistoryItem[]) {
  const res = useQueries({
    queries: items.map((h) => {
      const t = h.isCompleted && h.nextEpisode ? h.nextEpisode : { season: h.season ?? 1, episode: h.episode ?? 1 };
      return { ...q.season(h.id, t.season), enabled: h.mediaType === 'tv' && h.season !== undefined };
    }),
  });
  return items.map((h, i): Episode | undefined => {
    const t = h.isCompleted && h.nextEpisode ? h.nextEpisode : { episode: h.episode };
    return res[i]?.data?.episodes.find((e) => e.episode_number === t.episode);
  });
}

function ContinueCard({ h, ep }: { h: HistoryItem; ep?: Episode }) {
  const isNext = h.mediaType === 'tv' && h.isCompleted && !!h.nextEpisode;
  const s = isNext ? h.nextEpisode!.season : h.season;
  const e = isNext ? h.nextEpisode!.episode : h.episode;
  const tv = h.mediaType === 'tv' && s !== undefined;
  const p = !isNext ? h.progress : undefined;
  const watched = p && !h.isCompleted ? mins(p.watched) : 0;
  const left = p && !h.isCompleted ? mins(p.duration - p.watched) : 0;
  const runtime = p?.duration ? mins(p.duration) : ep?.runtime;
  const name = ep?.name ?? (isNext ? undefined : h.episodeTitle);
  const still = ep?.still_path;

  return (
    <EpisodeTile
      to={watchUrl(h)}
      type={h.mediaType}
      title={name ? `${h.title} · ${name}` : h.title}
      image={{ path: still ?? h.backdropPath ?? h.posterPath, kind: still ? 'still' : h.backdropPath ? 'backdrop' : 'poster' }}
      progress={watched ? Math.round(percent(h)) : 0}
      topLeft={isNext ? <Chip light>Up next</Chip> : h.isCompleted ? <Chip><Check className="size-3.5" /> Watched</Chip> : null}
      bottomLeft={watched ? <Chip light>{formatRuntime(watched)}</Chip> : null}
      bottomRight={runtime ? <Chip>{formatRuntime(runtime)}</Chip> : null}
      primary={
        tv ? (
          <>
            <span className="text-muted">
              {s === 0 ? 'Special' : `S${s}`} · E{e}
            </span>
            {name ? <> &nbsp;{name}</> : null}
          </>
        ) : (
          h.title
        )
      }
      secondary={tv ? h.title : left ? `${formatRuntime(left)} left` : h.isCompleted ? 'Finished' : 'Movie'}
    >
      <button
        onClick={() => {
          const before = getState().history;
          actions.removeHistory(h.mediaType, h.id);
          toast(`Removed “${h.title}” from your history`, { label: 'Undo', run: () => actions.restore({ history: before }) });
        }}
        aria-label={`Remove ${h.title} from continue watching`}
        title="Remove"
        className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-full bg-black/60 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </EpisodeTile>
  );
}

/** Horizontal row (home on small screens, profile page). */
export default function ContinueWatching({ items, title = 'Continue Watching', className }: { items: HistoryItem[]; title?: string; className?: string }) {
  const eps = useEpisodes(items);
  const { ref, scroll } = useRowScroll();
  if (!items.length) return null;
  return (
    <section className={className}>
      <SectionHeader title={title} action={<RowArrows onScroll={scroll} />} />
      <Scroller label={title} scrollRef={ref}>
        {items.map((h, i) => (
          <ContinueCard key={h.mediaType + h.id} h={h} ep={eps[i]} />
        ))}
      </Scroller>
    </section>
  );
}
