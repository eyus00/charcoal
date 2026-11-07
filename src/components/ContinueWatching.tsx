import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { Check, Play, X } from 'lucide-react';
import Img from './Img';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { actions, percent, watchUrl, type HistoryItem } from '../lib/store';
import { q, type Episode } from '../lib/tmdb';
import { cx } from '../lib/util';

const fmt = (min: number) => (min < 60 ? `${min}min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}`);

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

function ContinueCard({ h, ep, className, sizes }: { h: HistoryItem; ep?: Episode; className?: string; sizes: string }) {
  const isNext = h.mediaType === 'tv' && h.isCompleted && !!h.nextEpisode;
  const s = isNext ? h.nextEpisode!.season : h.season;
  const e = isNext ? h.nextEpisode!.episode : h.episode;
  const pct = isNext ? 0 : Math.round(percent(h));
  const left = h.progress && !isNext ? Math.max(1, Math.floor((h.progress.duration - h.progress.watched) / 60)) : 0;
  const label = h.mediaType === 'tv' && s !== undefined ? `${s === 0 ? 'SP' : `S${s}`}.E${e}` : left ? fmt(left) : null;
  const still = ep?.still_path;

  return (
    <div className={cx('group relative', className)} role="listitem">
      <Link to={watchUrl(h)} className="relative block overflow-hidden rounded-2xl" title={ep?.name ? `${h.title} · ${ep.name}` : h.title}>
        <Img
          path={still ?? h.backdropPath ?? h.posterPath}
          kind={still ? 'still' : h.backdropPath ? 'backdrop' : 'poster'}
          sizes={sizes}
          alt=""
          className="aspect-[16/8]"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/50" />
        <div className="absolute top-3 right-10 left-3.5 truncate text-sm font-medium">{h.title}</div>
        <span className="absolute bottom-3 left-3 grid size-8 place-items-center rounded-full bg-white/20 backdrop-blur-sm transition group-hover:bg-accent group-hover:text-black">
          <Play className="ml-0.5 size-3.5 fill-current" strokeWidth={0} />
        </span>
        <span className="absolute right-3 bottom-3 flex overflow-hidden rounded-lg bg-black/45 text-xs backdrop-blur-sm">
          {isNext ? (
            <span className="px-2.5 py-1">Up next · {label}</span>
          ) : (
            <>
              {label && <span className="border-r border-white/15 px-2.5 py-1">{label}</span>}
              <span className="flex items-center px-2.5 py-1">{h.isCompleted ? <Check className="size-3.5" /> : `${pct}%`}</span>
            </>
          )}
        </span>
        {pct > 0 && !h.isCompleted && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
      </Link>
      <button
        onClick={() => actions.removeHistory(h.mediaType, h.id)}
        aria-label={`Remove ${h.title} from continue watching`}
        title="Remove"
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Vertical list for the sidebar. */
export function CompactContinueList({ items }: { items: HistoryItem[] }) {
  const eps = useEpisodes(items);
  return (
    <div className="space-y-3" role="list" aria-label="Continue watching">
      {items.map((h, i) => (
        <ContinueCard key={h.mediaType + h.id} h={h} ep={eps[i]} sizes="220px" />
      ))}
    </div>
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
          <ContinueCard key={h.mediaType + h.id} h={h} ep={eps[i]} sizes="300px" className="w-[260px] shrink-0 snap-start sm:w-[300px]" />
        ))}
      </Scroller>
    </section>
  );
}
